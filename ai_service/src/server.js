import express from "express";
import dotenv from "dotenv";
import generateProjectRoute from "./routes/generateProject.js";
import analyzeProgressRoute from "./routes/analyzeProgress.js";
import nextStepsRoute from "./routes/nextSteps.js";
import generateDocsRoute from "./routes/generateDocs.js";

dotenv.config();

if (!process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_API_KEY === "your_key_here") {
  console.warn("⚠️  BACKBOARD_API_KEY is not set — AI routes will fail. Add it to .env");
}

const app = express();
const PORT = process.env.PORT || 5000;

// Limit JSON body size to 2MB — prevents accidentally sending absurdly large
// payloads (e.g. full commit histories with embedded images) that would waste
// Backboard API credits and potentially OOM the process.
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use(generateProjectRoute);
app.use(analyzeProgressRoute);
app.use(nextStepsRoute);
app.use(generateDocsRoute);

// Catch malformed JSON bodies from express.json() middleware.
// Without this, a client sending invalid JSON gets a raw SyntaxError leak.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body contains invalid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(400).json({ error: "Request body is too large (max 2MB)" });
  }
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error" });
});

// Catch-all for unhandled promise rejections at the process level.
// Prevents the server from crashing on an unhandled async error that
// somehow escapes the route-level try/catch.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

app.listen(PORT, () => {
  console.log(`AI service listening on :${PORT}`);
});
