import express from "express";
import dotenv from "dotenv";
import generateProjectRoute from "./routes/generateProject.js";
import analyzeProgressRoute from "./routes/analyzeProgress.js";
import nextStepsRoute from "./routes/nextSteps.js";
import generateDocsRoute from "./routes/generateDocs.js";
import generateDrawingsRoute from "./routes/generateDrawings.js";

dotenv.config();

if (!process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API_KEY === "your_key_here") {
  console.warn("⚠️  BACKBOARD_API_KEY is not set — AI routes will fail. Add it to .env");
}

const app = express();
const PORT = process.env.PORT || 5000;

// analyzeProgress handles its own multipart parsing (multer),
// everything else is plain JSON.
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use(generateProjectRoute);
app.use(analyzeProgressRoute);
app.use(nextStepsRoute);
app.use(generateDocsRoute);
app.use(generateDrawingsRoute);

// Catch malformed JSON bodies from express.json() middleware.
// Without this, a client sending invalid JSON gets a raw SyntaxError leak.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body contains invalid JSON" });
  }
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`AI service listening on :${PORT}`);
  // Warmup: fire a lightweight request to Backboard so the connection is hot
  // for the first real user request. This eliminates cold-start latency.
  warmupBackboard();
});

async function warmupBackboard() {
  try {
    const start = Date.now();
    const res = await fetch("https://app.backboard.io/api/threads/messages", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.BACKBOARD_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "Reply with only: ok",
        llm_provider: "anthropic",
        model_name: process.env.AI_MODEL || "claude-sonnet-5",
        stream: false
      })
    });
    const elapsed = Date.now() - start;
    if (res.ok) {
      console.log(`  ✓ Backboard warmed up in ${elapsed}ms`);
    } else {
      console.warn(`  ⚠ Backboard warmup returned ${res.status} (${elapsed}ms)`);
    }
  } catch (err) {
    console.warn(`  ⚠ Backboard warmup failed: ${err.message}`);
  }
}
