import { Router } from "express";
import { mockProjectGeneration } from "../mocks/mockResponses.js";

const router = Router();

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

Generate a complete project plan. Respond with ONLY valid JSON, no markdown code fences, no explanation before or after — just the raw JSON object, matching this exact shape:

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
- Every roadmap task's status starts as "not_started".
- Keep the roadmap to 4-8 major tasks — not overly granular, not too vague.
- If a budget was given, keep total estimated materials cost at or under it. If no budget was given, aim for a reasonable low-cost build.
- instructions must cover every task_id present in roadmap, in the same order.
- Respect the stated skill level — don't assume tools or techniques a beginner wouldn't have.`;
}

/**
 * POST /generate-project
 *
 * Generates a full project plan (overview, materials, roadmap, instructions)
 * from a user's idea description.
 *
 * @requestBody {object} JSON
 * @field {string}   idea             - Required. The project idea description.
 * @field {number}   [budget]         - Optional. Budget cap in USD.
 * @field {string}   [skill_level]    - Optional. One of "beginner", "intermediate", "advanced".
 * @field {string}   [deadline]       - Optional. Target completion date or timeframe.
 * @field {string[]} [tools_available] - Optional. List of tools the user already owns.
 *
 * @response 200 {object} mockProjectGeneration shape:
 *   { project_overview, materials, tools, budget, roadmap, instructions }
 * @response 400 {object} { error: string } — invalid or missing input
 * @response 500 {object} { error: string } — AI generation failure
 */
router.post("/generate-project", async (req, res) => {
  const { idea, budget, skill_level, deadline, tools_available } = req.body ?? {};

  // --- Validation ---
  if (!idea || typeof idea !== "string") {
    return res.status(400).json({ error: "idea is required and must be a non-empty string" });
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

    const backboardResponse = await fetch("https://app.backboard.io/api/threads/messages", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: prompt,
        llm_provider: "anthropic",
        model_name: "claude-sonnet-5",
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

    const result = JSON.parse(data.content);

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-project failed:", err);
    return res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;