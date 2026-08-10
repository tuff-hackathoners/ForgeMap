import { Router } from "express";
import { sendMessage, TimeoutError, LLMError } from "../lib/backboard.js";

const router = Router();

/** Maximum number of roadmap items to accept before rejecting as too large. */
const MAX_ROADMAP_ITEMS = 200;

/**
 * Builds the prompt sent to Claude for next-step recommendations.
 * Kept as its own function so it can be edited/tested independently
 * of the route handling logic below.
 */
function buildNextStepsPrompt({ project_state, roadmap }) {
  return `You are a project assistant for "Physical Git," an app that helps people build physical projects. A user is partway through building something, and you need to recommend what they should work on next based on their roadmap and current progress.

Current project state:
${JSON.stringify(project_state, null, 2)}

Current roadmap (each task has an id, status, and depends_on listing prerequisite task ids):
${JSON.stringify(roadmap, null, 2)}

Analyze the roadmap and recommend the next actionable tasks. Respond with a single JSON object — no markdown code fences, no text outside the JSON:

{
  "next_steps": [
    {
      "task_id": string,
      "reason": string,
      "priority": number
    }
  ]
}

Rules:
- Only recommend tasks whose status is "not_started" or "in_progress" — never recommend a completed task.
- Only recommend a task if ALL tasks in its depends_on array have status "completed". If any dependency is incomplete, that task is blocked and must not appear.
- "reason" must explain WHY this task is actionable now, referencing the specific completed dependency (e.g. "the encoder is installed, so odometry calibration can begin") — not a generic restatement of the task title.
- "priority" is a 1-based rank (1 = most urgent). Rank tasks that unblock the most downstream work higher.
- Return 1–4 tasks. If nothing is currently unblocked, return an empty next_steps array.
- Do not invent tasks that aren't in the provided roadmap.
- Output ONLY the JSON object, nothing else.`;
}

/**
 * POST /next-steps
 *
 * Given the current project state and roadmap (with dependency info),
 * returns a prioritized list of recommended next tasks.
 *
 * @requestBody {object} JSON
 * @field {object}   project_state - Required. Current project state object.
 * @field {object[]} roadmap       - Required. Array of roadmap task objects
 *   (each item includes depends_on, so dependency reasoning happens in the prompt).
 *
 * @response 200 {object} shape:
 *   { next_steps: [{ task_id, reason, priority }] }
 * @response 400 {object} { error: string } — invalid or missing input
 * @response 500 {object} { error: string } — AI generation failure
 * @response 502 {object} { error: string } — LLM provider returned an error
 * @response 504 {object} { error: string } — request to LLM timed out
 */
router.post("/next-steps", async (req, res) => {
  const { project_state, roadmap } = req.body ?? {};

  // --- Validation ---
  if (!project_state || typeof project_state !== "object" || Array.isArray(project_state)) {
    return res.status(400).json({ error: "project_state is required and must be a JSON object" });
  }

  if (!Array.isArray(roadmap)) {
    return res.status(400).json({ error: "roadmap is required and must be an array" });
  }

  if (roadmap.length === 0) {
    return res.status(400).json({ error: "roadmap must contain at least one task" });
  }

  if (roadmap.length > MAX_ROADMAP_ITEMS) {
    return res.status(400).json({ error: `roadmap exceeds maximum of ${MAX_ROADMAP_ITEMS} items` });
  }

  try {
    const prompt = buildNextStepsPrompt({ project_state, roadmap });

    const result = await sendMessage({
      prompt,
      routeName: "next-steps"
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("next-steps failed:", err);

    if (err instanceof TimeoutError) {
      return res.status(504).json({ error: "AI request timed out — please try again" });
    }
    if (err instanceof LLMError) {
      return res.status(502).json({ error: "LLM provider returned an error" });
    }
    return res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
