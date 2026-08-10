import { Router } from "express";
import multer from "multer";
import { mockProgressAnalysis } from "../mocks/mockResponses.js";

const router = Router();

// Keep the file in memory — we pass the buffer straight to Backboard,
// we never write to disk ourselves (backend owns storage/).
const upload = multer({ storage: multer.memoryStorage() });

const BACKBOARD_BASE = "https://app.backboard.io/api";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 20; // ~40s max wait for indexing

/**
 * Builds the prompt sent to Claude for progress analysis, once the
 * uploaded image is indexed and available to the assistant as context.
 */
function buildProgressAnalysisPrompt({ project_state, roadmap, user_note }) {
  return `You are a progress-analysis assistant for "Physical Git," an app that tracks physical build projects through photos.

An image showing the current state of the build has just been uploaded and is available to you as context — look at it carefully.

Previous project state:
${JSON.stringify(project_state, null, 2)}

Current roadmap (each task has an id, status, and depends_on):
${JSON.stringify(roadmap, null, 2)}

${user_note ? `User's note about this update: "${user_note}"` : "No additional user note was provided."}

Compare what you see in the image against the previous project state and roadmap. Respond with ONLY valid JSON, no markdown code fences:

{
  "detected_changes": { "added": [string], "removed": [string], "changed": [string] },
  "completed_tasks": [string],
  "remaining_tasks": [string],
  "problems": [string],
  "summary": string,
  "next_step": {
    "task_id": string (the highest-priority unblocked task to work on next),
    "reason": string (why this is next — reference what was just completed),
    "svg_guide": string (SVG with viewBox="0 0 200 150" showing what this next step looks like when DONE — a simple engineering sketch with dimension labels and key features),
    "openscad_code": string or null (if CAD/3D-printing project: valid OpenSCAD under 15 lines; otherwise null for physical builds)
  }
}

Rules:
- "completed_tasks" and "remaining_tasks" must only contain task ids from the provided roadmap.
- Only mark a task completed if the image gives clear evidence it's done.
- "problems": only concrete visible issues, or empty array.
- "summary": 1-3 sentences describing visible progress.
- "next_step": pick the single most important unblocked task. svg_guide = a 2D diagram of what this step looks like when finished (part shape, dimensions, spatial relationships). For CAD projects include openscad_code; for physical builds set it to null.
- svg_guide: keep it simple — outline shapes, dimension text labels, key feature callouts. viewBox="0 0 200 150".`;
}

/**
 * POST /analyze-progress
 *
 * Accepts a progress photo and current project context, returns an analysis
 * of what changed, what's complete, and any problems detected.
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

  const user_note = req.body.user_note || null;
  const imageBuffer = req.file.buffer;
  const imageMimeType = req.file.mimetype || "image/jpeg";

  try {
    // Step 1: create a throwaway assistant to own this image upload.
    const assistantResponse = await fetch(`${BACKBOARD_BASE}/assistants`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Physical Git Progress Analyzer",
        system_prompt: "You analyze photos of in-progress physical builds and report structured progress data."
      })
    });

    if (!assistantResponse.ok) {
      throw new Error(`Backboard assistant creation returned status ${assistantResponse.status}`);
    }

    const assistant = await assistantResponse.json();
    const assistantId = assistant.assistant_id;

    // Step 2: upload the image to that assistant as a document.
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: imageMimeType }), "progress.jpg");

    const uploadResponse = await fetch(`${BACKBOARD_BASE}/assistants/${assistantId}/documents`, {
      method: "POST",
      headers: { "X-API-Key": process.env.BACKBOARD_API_KEY },
      body: form
    });

    if (!uploadResponse.ok) {
      throw new Error(`Backboard document upload returned status ${uploadResponse.status}`);
    }

    const document = await uploadResponse.json();

    // Step 3: poll until the image is indexed and ready to use as context.
    let indexed = false;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const statusResponse = await fetch(`${BACKBOARD_BASE}/documents/${document.document_id}/status`, {
        headers: { "X-API-Key": process.env.BACKBOARD_API_KEY }
      });
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
      throw new Error("Image did not finish indexing in time");
    }

    // Step 4: ask the assistant to analyze the now-indexed image.
    const prompt = buildProgressAnalysisPrompt({ project_state, roadmap, user_note });

    const messageResponse = await fetch(`${BACKBOARD_BASE}/threads/messages`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: prompt,
        assistant_id: assistantId,
        llm_provider: "anthropic",
        model_name: process.env.AI_MODEL || "claude-sonnet-5",
        stream: false
      })
    });

    if (!messageResponse.ok) {
      throw new Error(`Backboard API returned status ${messageResponse.status}`);
    }

    const data = await messageResponse.json();

    if (!data.content || data.content.startsWith("LLM Error")) {
      console.error("Backboard LLM error:", data.content);
      return res.status(502).json({ error: "LLM provider returned an error" });
    }

    // Strip markdown code fences if the model wraps the JSON
    let rawContent = data.content.trim();
    if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const result = JSON.parse(rawContent);

    return res.status(200).json(result);
  } catch (err) {
    console.error("analyze-progress failed:", err);
    return res.status(500).json({ error: "AI analysis failed" });
  }
});

export default router;
