import { Router } from "express";
import { sendMessage, TimeoutError, LLMError } from "../lib/backboard.js";

const router = Router();

/** Maximum number of commits to accept before rejecting as too large. */
const MAX_COMMITS = 500;
/** Maximum number of roadmap items to accept. */
const MAX_ROADMAP_ITEMS = 200;

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

Using this full history, produce a complete final project document as a single JSON object. Do NOT wrap the output in markdown code fences or add any text outside the JSON. Use this exact structure:

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
- "design_decisions" and "problems_encountered" must be drawn from what actually appears in the commit history — do not invent decisions or problems that aren't reflected in the data. Return an empty array if none are evident.
- "reproduction_instructions" should be a clean, step-by-step guide another person could follow, derived from the roadmap and commit history — not a verbatim copy of original task descriptions.
- "actual_cost" should be the sum of materials_used actual_price values where inferable; otherwise use the best available estimate.
- "commit_history" must be passed through verbatim from the input — do not summarize, reorder, or drop entries.
- Output ONLY the JSON object, nothing else.`;
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
 * @response 504 {object} { error: string } — request to LLM timed out
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

  if (commits.length > MAX_COMMITS) {
    return res.status(400).json({ error: `commits exceeds maximum of ${MAX_COMMITS} entries` });
  }

  if (original_roadmap !== undefined && !Array.isArray(original_roadmap)) {
    return res.status(400).json({ error: "original_roadmap must be an array when provided" });
  }

  if (original_roadmap && original_roadmap.length > MAX_ROADMAP_ITEMS) {
    return res.status(400).json({ error: `original_roadmap exceeds maximum of ${MAX_ROADMAP_ITEMS} items` });
  }

  if (final_roadmap !== undefined && !Array.isArray(final_roadmap)) {
    return res.status(400).json({ error: "final_roadmap must be an array when provided" });
  }

  if (final_roadmap && final_roadmap.length > MAX_ROADMAP_ITEMS) {
    return res.status(400).json({ error: `final_roadmap exceeds maximum of ${MAX_ROADMAP_ITEMS} items` });
  }

  try {
    const prompt = buildFinalDocsPrompt({ project, commits, original_roadmap, final_roadmap });

    // Docs generation can be large — give it a longer timeout (60s).
    const result = await sendMessage({
      prompt,
      timeoutMs: 60_000,
      routeName: "generate-docs"
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-docs failed:", err);

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
