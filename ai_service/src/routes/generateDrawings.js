import { Router } from "express";

const router = Router();

function buildDrawingPrompt({ project_title, roadmap }) {
  return `You are an expert CAD engineer generating technical SVG drawings for a project called "${project_title}".

Here is the project's roadmap (parts and assembly):
${JSON.stringify(roadmap, null, 2)}

Generate TWO SVG drawings. Respond with ONLY valid JSON (no markdown fences):

{
  "assembly_drawing": string (full assembly SVG),
  "first_task_svg": string (cross-section SVG of the first part),
  "first_task_openscad": string (OpenSCAD code for the first part)
}

ASSEMBLY DRAWING SVG REQUIREMENTS:
- viewBox='0 0 400 350'. Use SINGLE QUOTES for all SVG attributes.
- NO background rects, NO white fills. Dark theme: text fill='#ddd'.
- Draw the actual mechanism in 3/4 isometric view using proper shapes (rect, ellipse, polygon).
- Parts filled with muted colors (#5a6a7a, #6a7a8a, #7a8a9a) with #333 stroke.
- Each joint: dashed arc arrow showing rotation (red=pan, green=tilt, blue=roll).
- Numbered colored squares (12x12) next to each part: #e53935, #43a047, #1e88e5, #fb8c00.
- LEGEND at y=265-340: two columns, 20px spacing. Colored square + number + "Part — dim".
- Must be MECHANICALLY CORRECT for the project's DOF.

FIRST TASK SVG PROFILE:
- viewBox='0 0 200 150'. Single quotes. ISOMETRIC VIEW of the first part (not a flat cross-section).
- ALL content (shapes AND text) must fit INSIDE the viewBox (x: 5-195, y: 5-145). Nothing outside bounds.
- Draw the part in 3/4 isometric view showing its 3D form (top face + front face + side face visible).
- Fills: #5a6a7a solid, #1a2030 holes, #333 stroke.
- Dimension annotations: fill='#ddd', font-size='9'. Keep text inside the box with 10px margin from edges.

FIRST TASK OPENSCAD:
- Valid, self-contained OpenSCAD. Under 15 lines. Basic primitives only.
- Must match the first task's dimensions from the roadmap.`;
}

router.post("/generate-drawings", async (req, res) => {
  const { project_title, roadmap } = req.body ?? {};

  if (!project_title || !Array.isArray(roadmap)) {
    return res.status(400).json({ error: "project_title and roadmap are required" });
  }

  try {
    const prompt = buildDrawingPrompt({ project_title, roadmap });

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

    if (!data.content || data.content.startsWith("LLM Error")) {
      console.error("Backboard LLM error:", data.content);
      return res.status(502).json({ error: "LLM provider returned an error" });
    }

    let rawContent = data.content.trim();
    if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    rawContent = rawContent.replace(/,\s*([}\]])/g, '$1');

    let result;
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("Drawing JSON parse failed:", parseErr.message);
      throw parseErr;
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("generate-drawings failed:", err.message || err);
    return res.status(500).json({ error: "Drawing generation failed" });
  }
});

export default router;
