import { Router } from "express";
import { mockNextSteps } from "../mocks/mockResponses.js";

const router = Router();

/**
 * Builds the prompt sent to Claude for next-step recommendations.
 * Kept as its own function so it can be edited/tested independently
 * of the route handling logic below.
 */
function buildNextStepsPrompt({ project_state, roadmap }) {
  return `You are a project assistant for "Physical Git," an app that helps people build physical projects. A user is partway through building something, and you need to recommend what they should work on next.

Current project state:
${JSON.stringify(project_state, null, 2)}

Current roadmap (each task has an id, status, and depends_on listing prerequisite task ids):
${JSON.stringify(roadmap, null, 2)}

Analyze the roadmap and recommend the next tasks the user should work on. Respond with ONLY valid JSON, no markdown code fences, no explanation before or after — just the raw JSON object, matching this exact shape:

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
- Only recommend tasks whose status is "not_started" or "in_progress" — never recommend a task that's already "completed".
- Only recommend a task if every task listed in its depends_on array has status "completed". If a task's dependencies aren't done yet, it is NOT ready and should not appear in next_steps.
- "reason" must explain WHY this task is actionable now, referencing the specific dependency that was completed (e.g. "the encoder is installed, so odometry calibration can begin") — not a generic restatement of the task title.
- "priority" is a number starting at 1 (most urgent). Rank tasks that unblock the most other future work higher.
- Return between 1 and 4 recommended tasks. If nothing is currently unblocked, return an empty next_steps array.
- Do not invent tasks that aren't in the provided roadmap.`;
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

  try {
    const prompt = buildNextStepsPrompt({ project_state, roadmap });

    const backboardResponse = await fetch("https://app.backboard.io/api/threads/messages", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: prompt,
        llm_provider: "anthropic",
        model_name: process.env.AI_MODEL || "claude-sonnet-5",
        stream: false
      })
    });

    if (!backboardResponse.ok) {
      throw new Error(`Backboard API returned status ${backboardResponse.status}`);
    }

    const data = await backboardResponse.json();

    // Backboard sometimes returns HTTP 200 with an error message buried in
    // `content` instead of a real error status (e.g. unsupported model,
    // rate limit). Catch that case explicitly before trying to parse it as JSON.
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
    console.error("next-steps failed:", err);
    return res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
