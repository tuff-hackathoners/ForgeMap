import { Router } from "express";
import { sendMessage, TimeoutError, LLMError } from "../lib/backboard.js";

const router = Router();

/** Maximum character length for the idea field to prevent abuse. */
const MAX_IDEA_LENGTH = 2000;

/**
 * Builds the prompt sent to Claude for initial project generation.
 * Kept as its own function so it can be edited/tested independently
 * of the route handling logic below.
 */
function buildProjectGenerationPrompt({ idea, budget, skill_level, deadline, tools_available }) {
  return `You are a project planning assistant for "Physical Git," an app that helps people build physical projects (robotics, electronics, 3D printing, DIY builds).

A user wants to build: "${idea}"

Constraints:
- Budget: ${budget ? `$${budget}` : "not specified"}
- Skill level: ${skill_level || "not specified"}
- Deadline: ${deadline || "not specified"}
- Tools already available: ${tools_available?.length ? tools_available.join(", ") : "none specified, assume basic hand tools only"}

Generate a complete project plan as a single JSON object. Do NOT wrap the output in markdown code fences or add any text outside the JSON. Respond with this exact structure:

{
  "project_overview": { "title": string, "description": string },
  "materials": [{ "name": string, "quantity": string, "estimated_price": number }],
  "tools": [string],
  "budget": { "estimated_total": number, "currency": "USD" },
  "roadmap": [
    {
      "id": "task_1",
      "title": string,
      "description": string,
      "status": "not_started",
      "depends_on": [string]
    }
  ],
  "instructions": [
    { "task_id": "task_1", "steps": [string] }
  ]
}

Rules:
- Task ids must be "task_1", "task_2", etc., in a sensible build order.
- "depends_on" must only reference earlier task ids that are genuine prerequisites — don't invent unnecessary dependencies.
- Every roadmap task's status must be "not_started".
- Keep the roadmap to 4-8 major tasks — not overly granular, not too vague.
- If a budget was given, keep total estimated materials cost at or under it. If no budget was given, aim for a reasonable low-cost build.
- instructions must cover every task_id present in roadmap, in the same order.
- Respect the stated skill level — don't assume tools or techniques a beginner wouldn't have.
- Output ONLY the JSON object, nothing else.`;
}

/**
 * POST /generate-project
 *
 * Generates a full project plan (overview, materials, roadmap, instructions)
 * from a user's idea description via Backboard → Claude.
 *
 * @requestBody {object} JSON
 * @field {string}   idea             - Required. The project idea description (max 2000 chars).
 * @field {number}   [budget]         - Optional. Budget cap in USD.
 * @field {string}   [skill_level]    - Optional. One of "beginner", "intermediate", "advanced".
 * @field {string}   [deadline]       - Optional. Target completion date or timeframe.
 * @field {string[]} [tools_available] - Optional. List of tools the user already owns.
 *
 * @response 200 {object} Project plan shape:
 *   { project_overview, materials, tools, budget, roadmap, instructions }
 * @response 400 {object} { error: string } — invalid or missing input
 * @response 500 {object} { error: string } — AI generation failure
 * @response 502 {object} { error: string } — LLM provider returned an error
 * @response 504 {object} { error: string } — request to LLM timed out
 */
router.post("/generate-project", async (req, res) => {
  const { idea, budget, skill_level, deadline, tools_available } = req.body ?? {};

  // --- Validation ---
  if (!idea || typeof idea !== "string") {
    return res.status(400).json({ error: "idea is required and must be a non-empty string" });
  }

  if (idea.length > MAX_IDEA_LENGTH) {
    return res.status(400).json({ error: `idea must be ${MAX_IDEA_LENGTH} characters or fewer` });
  }

  if (budget !== undefined && (typeof budget !== "number" || budget < 0)) {
    return res.status(400).json({ error: "budget must be a non-negative number when provided" });
  }

  const validSkillLevels = ["beginner", "intermediate", "advanced"];
  if (skill_level !== undefined && !validSkillLevels.includes(skill_level)) {
    return res.status(400).json({ error: `skill_level must be one of: ${validSkillLevels.join(", ")}` });
  }

  if (deadline !== undefined && typeof deadline !== "string") {
    return res.status(400).json({ error: "deadline must be a string when provided" });
  }

  if (tools_available !== undefined && !Array.isArray(tools_available)) {
    return res.status(400).json({ error: "tools_available must be an array of strings when provided" });
  }

  try {
    const prompt = buildProjectGenerationPrompt({ idea, budget, skill_level, deadline, tools_available });

    const result = await sendMessage({
      prompt,
      routeName: "generate-project"
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-project failed:", err);

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
