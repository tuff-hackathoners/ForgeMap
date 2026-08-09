import { Router } from "express";
import { mockFinalDocs } from "../mocks/mockResponses.js";

const router = Router();

/**
 * Builds the prompt sent to Claude for final project documentation.
 * Kept as its own function so it can be edited/tested independently
 * of the route handling logic below.
 */
function buildFinalDocsPrompt({ project, commits, original_roadmap, final_roadmap }) {
  return `You are a documentation assistant for "Physical Git," an app that turns a completed physical build's history into a polished final write-up.

Project:
${JSON.stringify(project, null, 2)}

Full commit history (chronological progress snapshots, each with detected changes, notes, and roadmap impact):
${JSON.stringify(commits, null, 2)}

Original roadmap (as first generated):
${JSON.stringify(original_roadmap ?? [], null, 2)}

Final roadmap (state at completion):
${JSON.stringify(final_roadmap ?? [], null, 2)}

Using this full history, write a complete final project document. Respond with ONLY valid JSON, no markdown code fences, no explanation before or after — just the raw JSON object, matching this exact shape:

{
  "project_overview": string,
  "final_result": { "description": string },
  "materials_used": [{ "name": string, "quantity": string, "actual_price": number }],
  "actual_cost": number,
  "tools_used": [string],
  "original_roadmap": [ /* same shape as the roadmap provided above */ ],
  "final_roadmap": [ /* same shape as the roadmap provided above */ ],
  "commit_history": [ /* pass through the commits provided above, unchanged */ ],
  "design_decisions": [
    { "change": string, "reason": string, "decision": string, "consequence": string }
  ],
  "problems_encountered": [
    { "problem": string, "solution": string }
  ],
  "final_specifications": { "dimensions": string, "capabilities": string },
  "reproduction_instructions": [string]
}

Rules:
- "project_overview" and "final_result" should be written in clear, plain English suitable for someone who never saw the build in person.
- "design_decisions" and "problems_encountered" must be drawn from what actually appears in the commit history — do not invent decisions or problems that aren't reflected in the commits or notes provided. If none are evident, return an empty array for that field.
- "reproduction_instructions" should be a clean, step-by-step version of the build process that another person could follow, derived from the roadmap and commit history — not a verbatim copy of the original task descriptions.
- "actual_cost" should be calculated from materials_used if individual prices are inferable from the commit history; otherwise use the most reasonable estimate available and note any assumption inside "final_specifications" if relevant.
- Pass "commit_history" through unchanged from what was provided — do not summarize or drop entries.`;
}

/**
 * POST /generate-docs
 *
 * Generates final project documentation once the user marks the project complete.
 * Includes overview, materials, cost breakdown, design decisions, and reproduction steps.
 *
 * @requestBody {object} JSON
 * @field {object}   project          - Required. The project object (title, description, etc.).
 * @field {object[]} commits          - Required. Array of commit/progress-snapshot objects.
 * @field {object[]} [original_roadmap] - Optional. The roadmap as originally generated.
 * @field {object[]} [final_roadmap]    - Optional. The roadmap at project completion.
 *
 * @response 200 {object} shape:
 *   { project_overview, final_result, materials_used, actual_cost, tools_used,
 *     original_roadmap, final_roadmap, commit_history, design_decisions,
 *     problems_encountered, final_specifications, reproduction_instructions }
 * @response 400 {object} { error: string } — invalid or missing input
 * @response 500 {object} { error: string } — AI generation failure
 * @response 502 {object} { error: string } — LLM provider returned an error
 */
router.post("/generate-docs", async (req, res) => {
  const { project, commits, original_roadmap, final_roadmap } = req.body ?? {};

  // --- Validation ---
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return res.status(400).json({ error: "project is required and must be a JSON object" });
  }

  if (!Array.isArray(commits)) {
    return res.status(400).json({ error: "commits is required and must be an array" });
  }

  if (commits.length === 0) {
    return res.status(400).json({ error: "commits must contain at least one entry" });
  }

  if (original_roadmap !== undefined && !Array.isArray(original_roadmap)) {
    return res.status(400).json({ error: "original_roadmap must be an array when provided" });
  }

  if (final_roadmap !== undefined && !Array.isArray(final_roadmap)) {
    return res.status(400).json({ error: "final_roadmap must be an array when provided" });
  }

  try {
    const prompt = buildFinalDocsPrompt({ project, commits, original_roadmap, final_roadmap });

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

    if (!data.content || data.content.startsWith("LLM Error")) {
      console.error("Backboard LLM error:", data.content);
      return res.status(502).json({ error: "LLM provider returned an error" });
    }

    const result = JSON.parse(data.content);

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-docs failed:", err);
    return res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;