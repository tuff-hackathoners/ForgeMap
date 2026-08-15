import { Router } from "express";
import { mockProjectGeneration } from "../mocks/mockResponses.js";

const router = Router();

/**
 * Builds the prompt sent to Claude for initial project generation.
 * Kept as its own function so it can be edited/tested independently
 * of the route handling logic below.
 */
function buildProjectGenerationPrompt({ idea, budget, skill_level, deadline, tools_available }) {
  // Detect if this is a CAD/design project vs a physical build
  const ideaLower = idea.toLowerCase();
  const isCAD = /\b(cad|fusion\s*360|freecad|solidworks|onshape|3d\s*model|3d\s*design|parametric|stl|step\s*file)\b/.test(ideaLower);

  if (isCAD) {
    return buildCADPrompt({ idea, budget, skill_level, deadline, tools_available });
  }
  return buildPhysicalBuildPrompt({ idea, budget, skill_level, deadline, tools_available });
}

function buildCADPrompt({ idea, budget, skill_level, deadline, tools_available }) {
  return `You are an expert CAD/mechanical engineer. Generate a modeling plan.

CONTEXT:
- Project: "${idea}"
- Budget: ${budget ? `$${budget}` : "flexible"}
- Skill: ${skill_level || "beginner"}
- CAD tools: ${tools_available?.length ? tools_available.join(", ") : "Fusion 360 or FreeCAD"}

Return ONLY valid JSON (no markdown fences). Do NOT include any SVG or OpenSCAD code — those will be generated separately.

{
  "project_overview": { "title": string, "description": string (part count, manufacturing, joint types) },
  "assembly_drawing": null,
  "materials": [{ "name": string, "quantity": string, "estimated_price": number }],
  "tools": [string],
  "budget": { "estimated_total": number, "currency": "USD" },
  "roadmap": [
    {
      "id": "task_N",
      "title": string ("Model the [part name]" or "Assemble..." or "Export..."),
      "description": string (exact dims, features, tolerances, how it mates to other parts),
      "openscad_code": null,
      "svg_profile": null,
      "visual_guide": string (describe what the CAD viewport should show),
      "tips": [string, string] (CAD-specific tips),
      "status": "not_started",
      "depends_on": [string]
    }
  ],
  "instructions": [
    { "task_id": "task_N", "steps": [string] (CAD operations), "caution": string }
  ]
}

RULES:
- 5-6 tasks: 3-4 parts + 1 assembly + 1 export
- Descriptions must include exact dimensions, wall thicknesses, hole sizes with tolerances, and joint/mating features
- Independent parts have no dependencies (can be modeled in parallel)
- Include tolerances: +0.2mm on bolt clearance holes, -0.1mm on press-fits
- The mechanism must be MECHANICALLY CORRECT for the requested DOF
- Budget = manufacturing materials only
- Keep response concise — NO SVG strings, NO OpenSCAD code in this response`;
}

function buildPhysicalBuildPrompt({ idea, budget, skill_level, deadline, tools_available }) {
  return `You are an expert project planner for physical builds. Generate a structured build plan.

CONTEXT:
- Project: "${idea}"
- Budget: ${budget ? `$${budget}` : "flexible"}
- Skill: ${skill_level || "beginner"}
- Deadline: ${deadline || "none"}
- Tools available: ${tools_available?.length ? tools_available.join(", ") : "basic hand tools"}

PRINCIPLES:
- Choose materials appropriate to the project SCALE: small desktop items (phone holders, gadgets, brackets, mounts) → prefer 3D printing (FDM/PLA). Medium/large items (furniture, shelves, structures) → wood or metal. Only suggest wood for small projects if the user specifically asks for it.
- Default to MECHANICAL construction unless user explicitly says electronics/Arduino/code
- Roadmap tasks should represent meaningful BUILD MILESTONES, not micro-steps
- Each task results in something you can photograph to prove it's done
- Dependencies must reflect real physical constraints (can't attach parts before cutting them)
- visual_guide = what a PHOTO of the completed step would show — specific enough to verify
- instructions = actionable steps a ${skill_level || "beginner"} can follow without Googling
- tips = the non-obvious thing that would make a first-timer fail without knowing it

EXAMPLE of quality output for "Build a simple birdhouse":
{"roadmap":[{"id":"task_1","title":"Cut panels to size","description":"Cut the 6 boards: front/back (6x8in), sides (5x8in), floor (4x6in), roof (7x8in)","visual_guide":"6 rectangular pine boards laid out and labeled, all edges straight with no splinters, matching dimensions written on each in pencil","tips":["Clamp board hanging off table edge so saw doesn't bind","Mark waste side with X so you don't cut the wrong piece"],"status":"not_started","depends_on":[]},{"id":"task_2","title":"Drill entry hole and ventilation","description":"Drill 1.5in entry hole centered 2in from top of front panel, and two 1/4in drain holes in floor","visual_guide":"Front panel with clean circular hole (no tear-out) centered horizontally, 2in below top edge. Floor piece with two small holes near corners","tips":["Back the wood with scrap when drilling to prevent blowout on exit side","Use a spade bit, not a twist bit, for the large hole — cleaner edge"],"status":"not_started","depends_on":["task_1"]}]}

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "project_overview": { "title": string, "description": string (2-3 sentences, what it is and why it's cool) },
  "materials": [{ "name": string, "quantity": string, "estimated_price": number }],
  "tools": [string],
  "budget": { "estimated_total": number, "currency": "USD" },
  "roadmap": [
    {
      "id": "task_N",
      "title": string (action verb + what),
      "description": string (specific dimensions/quantities, not vague),
      "visual_guide": string (what a PHOTO would show when done — verifiable),
      "tips": [string, string] (non-obvious failure points),
      "status": "not_started",
      "depends_on": [string] (real physical dependencies only)
    }
  ],
  "instructions": [
    { "task_id": "task_N", "steps": [string] (4-6 specific steps), "caution": string (safety note or "None") }
  ]
}

QUALITY RULES:
- 5-6 tasks that each produce a photographable milestone
- Descriptions must include specific measurements, quantities, or positions
- visual_guide must be concrete enough that someone could check their work against it
- Tips must be things a ${skill_level || "beginner"} would NOT already know
- Dependencies form a DAG, not just a linear chain (parallel work where possible)
- Total material cost must stay ${budget ? `at or under $${budget}` : "reasonable"}`;
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

    // Fix common LLM JSON issues: trailing commas
    rawContent = rawContent.replace(/,\s*([}\]])/g, '$1'); // trailing commas

    let result;
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      // Log the area around the error position for debugging
      const match = parseErr.message?.match(/position (\d+)/);
      const pos = match ? parseInt(match[1]) : 0;
      console.error("JSON parse failed at position", pos);
      console.error("Context around error:", JSON.stringify(rawContent.substring(Math.max(0, pos - 50), pos + 50)));
      console.error("Full content length:", rawContent.length);
      throw parseErr;
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-project failed:", err);
    return res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
