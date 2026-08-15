import { Router } from "express";
import multer from "multer";
import { mockProgressAnalysis } from "../mocks/mockResponses.js";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

const BACKBOARD_BASE = "https://app.backboard.io/api";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 25; // ~37s max wait

/**
 * Builds a concise but thorough prompt for progress analysis.
 * Optimized for token efficiency while preserving output quality.
 */
function buildProgressAnalysisPrompt({ project_state, roadmap, user_note }) {
  // Only include relevant state fields to reduce prompt size
  const compactState = JSON.stringify(project_state);
  const compactRoadmap = JSON.stringify(roadmap);

  return `You are a build-progress analyst for physical/DIY projects. An image of the current build state is available — examine it carefully.

PROJECT STATE: ${compactState}

ROADMAP: ${compactRoadmap}

${user_note ? `USER NOTE: "${user_note}"` : ""}

Analyze the image vs. the plan. Return ONLY valid JSON (no code fences):

{"detected_changes":{"added":[string],"removed":[string],"changed":[string]},"completed_tasks":[string],"remaining_tasks":[string],"problems":[string],"summary":string,"feedback":{"overall_assessment":string,"issues":[{"description":string,"severity":"critical"|"warning"|"suggestion","fix":string}],"positive_notes":[string],"alignment_score":number},"next_step":{"task_id":string,"reason":string,"svg_guide":string,"openscad_code":string|null}}

RULES:
1. completed_tasks/remaining_tasks: use only task IDs from the roadmap
2. Only mark tasks complete with clear visual evidence
3. problems: concrete visible issues only, or []
4. summary: 1-3 sentences of visible progress
5. feedback.issues: be SPECIFIC — exact placement, orientation, measurement errors. Tell the user precisely what to fix and how. If nothing wrong, leave issues empty and score high
6. feedback.positive_notes: always include at least one encouraging note
7. feedback.alignment_score: 1-10 (plan adherence)
8. next_step.task_id: highest-priority unblocked task
9. next_step.svg_guide: simple SVG (viewBox="0 0 200 150") showing the finished next step — outlines, dimensions, labels. No fills
10. next_step.openscad_code: only for CAD/3D projects (max 15 lines), otherwise null`;
}

/**
 * POST /analyze-progress
 *
 * Accepts a progress photo + project context, returns structured analysis
 * with feedback on correctness and next steps.
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
    // Step 1: Create assistant
    const assistant = await backboardPost("/assistants", {
      name: "ForgeMap Progress Analyzer",
      system_prompt: "You analyze photos of in-progress physical builds. Return structured JSON only."
    });
    const assistantId = assistant.assistant_id;

    // Step 2: Upload image
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: imageMimeType }), "progress.jpg");

    const uploadResponse = await fetch(`${BACKBOARD_BASE}/assistants/${assistantId}/documents`, {
      method: "POST",
      headers: { "X-API-Key": process.env.BACKBOARD_API_KEY },
      body: form
    });

    if (!uploadResponse.ok) {
      throw new Error(`Document upload failed: ${uploadResponse.status}`);
    }

    const document = await uploadResponse.json();

    // Step 3: Poll for indexing (with exponential-ish backoff)
    await waitForIndexing(document.document_id);

    // Step 4: Get analysis from LLM
    const prompt = buildProgressAnalysisPrompt({ project_state, roadmap, user_note });

    const data = await backboardPost("/threads/messages", {
      content: prompt,
      assistant_id: assistantId,
      llm_provider: "anthropic",
      model_name: process.env.AI_MODEL || "claude-sonnet-5",
      stream: false
    });

    if (!data.content || data.content.startsWith("LLM Error")) {
      console.error("Backboard LLM error:", data.content);
      return res.status(502).json({ error: "LLM provider returned an error" });
    }

    // Strip markdown code fences if present
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

// ─── Helpers ───

async function backboardPost(path, body) {
  const response = await fetch(`${BACKBOARD_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.BACKBOARD_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Backboard ${path} returned ${response.status}`);
  }

  return response.json();
}

async function waitForIndexing(documentId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const statusResponse = await fetch(`${BACKBOARD_BASE}/documents/${documentId}/status`, {
      headers: { "X-API-Key": process.env.BACKBOARD_API_KEY }
    });
    const statusData = await statusResponse.json();

    if (statusData.status === "indexed") return;
    if (statusData.status === "error") {
      throw new Error(`Document indexing failed: ${statusData.status_message || "unknown"}`);
    }

    // Slightly faster initial polls, slower later
    const delay = attempt < 5 ? POLL_INTERVAL_MS : POLL_INTERVAL_MS * 1.5;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error("Image did not finish indexing in time");
}

export default router;
