import { Router } from "express";
import multer from "multer";
import {
  fetchWithTimeout,
  parseBackboardContent,
  TimeoutError,
  LLMError,
  BACKBOARD_BASE
} from "../lib/backboard.js";

const router = Router();

// Keep the file in memory — we pass the buffer straight to Backboard,
// we never write to disk ourselves (backend owns storage/).
const upload = multer({ storage: multer.memoryStorage() });

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // ~60s max wait for indexing
const UPLOAD_TIMEOUT_MS = 15_000;
const MESSAGE_TIMEOUT_MS = 45_000;
const MAX_ROADMAP_ITEMS = 200;

/**
 * Lazily-created assistant that persists across requests for the lifetime
 * of this server process. Avoids creating a new Backboard assistant on
 * every single /analyze-progress call.
 */
let cachedAssistantId = null;

/**
 * Returns the assistant_id to use for progress analysis, creating one
 * on first call and caching it for subsequent requests.
 */
async function getOrCreateAssistant() {
  if (cachedAssistantId) return cachedAssistantId;

  const response = await fetchWithTimeout(
    `${BACKBOARD_BASE}/assistants`,
    {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Physical Git Progress Analyzer",
        system_prompt: "You analyze photos of in-progress physical builds and report structured progress data as JSON."
      })
    },
    UPLOAD_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Backboard assistant creation returned ${response.status}: ${text}`);
  }

  const assistant = await response.json();
  cachedAssistantId = assistant.assistant_id;
  console.log(`[analyze-progress] Created reusable assistant: ${cachedAssistantId}`);
  return cachedAssistantId;
}

/**
 * Builds the prompt sent to Claude for progress analysis, once the
 * uploaded image is indexed and available to the assistant as context.
 */
function buildProgressAnalysisPrompt({ project_state, roadmap, user_note }) {
  return `You are a progress-analysis assistant for "Physical Git," an app that tracks physical build projects through photos.

An image showing the current state of the build has been uploaded and is available to you as context — examine it carefully before responding.

Previous project state:
${JSON.stringify(project_state, null, 2)}

Current roadmap (each task has an id, status, and depends_on):
${JSON.stringify(roadmap, null, 2)}

${user_note ? `User's note about this update: "${user_note}"` : "No additional user note was provided."}

Compare what you see in the image against the previous project state and roadmap. Respond with a single JSON object — no markdown code fences, no text outside the JSON:

{
  "detected_changes": {
    "added": [string],
    "removed": [string],
    "changed": [string]
  },
  "completed_tasks": [string],
  "remaining_tasks": [string],
  "problems": [string],
  "summary": string
}

Rules:
- "completed_tasks" and "remaining_tasks" must only contain task ids that exist in the provided roadmap.
- Only mark a task as completed if the image gives clear visual evidence it's done — do not guess or assume.
- "problems" should list only concrete, visible issues (e.g. loose joint, misaligned part) — return an empty array if nothing looks wrong.
- "summary" should be 1-3 plain-English sentences describing visible progress, suitable for showing directly to the user.
- If the image doesn't clearly show progress on any roadmap task, return empty arrays for completed_tasks and detected_changes fields.
- Output ONLY the JSON object, nothing else.`;
}

/**
 * POST /analyze-progress
 *
 * Accepts a progress photo and current project context, returns an analysis
 * of what changed, what's complete, and any problems detected.
 *
 * Flow: create/reuse assistant → upload image → poll until indexed → send
 * analysis prompt → parse and return JSON.
 *
 * @requestBody multipart/form-data
 * @field {file}   image         - Required. The progress photo (buffer kept in memory).
 * @field {string} project_state - Required. JSON string of current project_state object.
 * @field {string} roadmap       - Required. JSON string of current roadmap array.
 * @field {string} [user_note]   - Optional. Free-text note from the user.
 *
 * @response 200 {object} shape:
 *   { detected_changes, completed_tasks, remaining_tasks, problems, summary }
 * @response 400 {object} { error: string } — missing file or invalid fields
 * @response 500 {object} { error: string } — AI analysis failure
 * @response 502 {object} { error: string } — LLM provider returned an error
 * @response 504 {object} { error: string } — request to LLM timed out
 */
router.post("/analyze-progress", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "image file is required" });
  }

  const rawProjectState = req.body?.project_state;
  const rawRoadmap = req.body?.roadmap;

  if (!rawProjectState || !rawRoadmap) {
    return res.status(400).json({ error: "project_state and roadmap fields are required" });
  }

  let project_state, roadmap;
  try {
    project_state = JSON.parse(rawProjectState);
  } catch {
    return res.status(400).json({ error: "project_state must be a valid JSON string" });
  }

  try {
    roadmap = JSON.parse(rawRoadmap);
  } catch {
    return res.status(400).json({ error: "roadmap must be a valid JSON string" });
  }

  if (typeof project_state !== "object" || project_state === null || Array.isArray(project_state)) {
    return res.status(400).json({ error: "project_state must be a JSON object" });
  }

  if (!Array.isArray(roadmap)) {
    return res.status(400).json({ error: "roadmap must be a JSON array" });
  }

  if (roadmap.length > MAX_ROADMAP_ITEMS) {
    return res.status(400).json({ error: `roadmap exceeds maximum of ${MAX_ROADMAP_ITEMS} items` });
  }

  const user_note = req.body.user_note || null;
  const imageBuffer = req.file.buffer;
  const imageMimeType = req.file.mimetype || "image/jpeg";

  try {
    // Step 1: get or create the reusable assistant.
    const assistantId = await getOrCreateAssistant();

    // Step 2: upload the image to that assistant as a document.
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: imageMimeType }), "progress.jpg");

    const uploadResponse = await fetchWithTimeout(
      `${BACKBOARD_BASE}/assistants/${assistantId}/documents`,
      {
        method: "POST",
        headers: { "X-API-Key": process.env.BACKBOARD_API_KEY },
        body: form
      },
      UPLOAD_TIMEOUT_MS
    );

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text().catch(() => "");
      throw new Error(`Backboard document upload returned ${uploadResponse.status}: ${text}`);
    }

    const document = await uploadResponse.json();

    // Step 3: poll until the image is indexed and ready to use as context.
    let indexed = false;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const statusResponse = await fetchWithTimeout(
        `${BACKBOARD_BASE}/documents/${document.document_id}/status`,
        { headers: { "X-API-Key": process.env.BACKBOARD_API_KEY } },
        10_000
      );
      const statusData = await statusResponse.json();

      if (statusData.status === "indexed") {
        indexed = true;
        break;
      }
      if (statusData.status === "error") {
        throw new Error(`Document indexing failed: ${statusData.status_message || "unknown error"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!indexed) {
      throw new TimeoutError("Image did not finish indexing within the allowed time");
    }

    // Step 4: ask the assistant to analyze the now-indexed image.
    const prompt = buildProgressAnalysisPrompt({ project_state, roadmap, user_note });

    const messageResponse = await fetchWithTimeout(
      `${BACKBOARD_BASE}/threads/messages`,
      {
        method: "POST",
        headers: {
          "X-API-Key": process.env.BACKBOARD_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: prompt,
          assistant_id: assistantId,
          llm_provider: "anthropic",
          model_name: "claude-sonnet-5",
          stream: false
        })
      },
      MESSAGE_TIMEOUT_MS
    );

    if (!messageResponse.ok) {
      const text = await messageResponse.text().catch(() => "");
      throw new Error(`Backboard API returned ${messageResponse.status}: ${text}`);
    }

    const data = await messageResponse.json();

    if (!data.content || data.content.startsWith("LLM Error")) {
      throw new LLMError(data.content || "Empty content returned from LLM");
    }

    const result = parseBackboardContent(data.content, "analyze-progress");

    return res.status(200).json(result);
  } catch (err) {
    console.error("analyze-progress failed:", err);

    // If assistant creation failed (possibly deleted externally), reset cache so
    // next request will create a fresh one.
    if (err.message?.includes("assistant")) {
      cachedAssistantId = null;
    }

    if (err instanceof TimeoutError) {
      return res.status(504).json({ error: "AI request timed out — please try again" });
    }
    if (err instanceof LLMError) {
      return res.status(502).json({ error: "LLM provider returned an error" });
    }
    return res.status(500).json({ error: "AI analysis failed" });
  }
});

export default router;
