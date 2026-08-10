/**
 * Shared Backboard API helper.
 *
 * Encapsulates the repeated fetch → error-check → parse-JSON flow used by
 * generateProject, nextSteps, and generateDocs. Provides:
 *   - Configurable timeout via AbortController (default 30s)
 *   - Retry with exponential backoff for transient failures (network errors, 5xx)
 *   - Detection of Backboard's "LLM Error" content pattern (non-retryable)
 *   - Automatic stripping of markdown code fences before JSON.parse
 *
 * analyzeProgress has a multi-step flow (upload → poll → ask) so it uses
 * the lower-level helpers (fetchWithTimeout, parseBackboardContent) directly
 * rather than the high-level sendMessage wrapper.
 */

const BACKBOARD_BASE = "https://app.backboard.io/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Fetch wrapper that adds an AbortController timeout.
 * Throws a descriptive error if the request times out.
 *
 * @param {string} url
 * @param {RequestInit} options - Standard fetch options
 * @param {number} [timeoutMs] - Timeout in milliseconds (default 30s)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Custom error class for timeout failures, so callers can distinguish
 * timeouts from other errors and return appropriate HTTP status codes.
 */
export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Custom error class for non-retryable LLM errors returned by Backboard
 * inside a 200 response (e.g. "LLM Error: Model not supported").
 */
export class LLMError extends Error {
  constructor(message) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Strips markdown code fences from LLM output if present, then JSON.parse's it.
 * Logs a warning when the fallback fence-stripping path is used.
 *
 * @param {string} content - Raw text content from Backboard response
 * @param {string} routeName - Route identifier for log context
 * @returns {object} Parsed JSON
 * @throws {SyntaxError} if content isn't valid JSON even after stripping fences
 */
export function parseBackboardContent(content, routeName = "unknown") {
  let raw = content.trim();

  // Try parsing as-is first (happy path).
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    // Fallback: strip markdown code fences and retry.
    if (raw.startsWith("```")) {
      console.warn(`[${routeName}] Claude wrapped response in code fences — stripping before parse`);
      raw = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      return JSON.parse(raw); // Let this throw if it's still invalid
    }
    // Not a fence issue — rethrow the original parse error.
    throw firstErr;
  }
}

/**
 * Determines whether a fetch failure is transient and worth retrying.
 * Retries on: network errors, 5xx from Backboard, timeouts.
 * Does NOT retry: 4xx, LLM content errors, JSON parse failures.
 */
function isRetryable(err, response) {
  // Network-level failures (no response at all)
  if (!response && err && err.name !== "TimeoutError") return true;
  // Timeouts are retryable
  if (err?.name === "TimeoutError") return true;
  // 5xx from Backboard itself
  if (response && response.status >= 500) return true;
  return false;
}

/**
 * High-level helper: send a prompt to Backboard and return parsed JSON.
 *
 * Handles the full lifecycle:
 *   1. POST to /threads/messages with retry + timeout
 *   2. Detect "LLM Error" content (non-retryable → throws LLMError)
 *   3. Strip code fences if needed
 *   4. JSON.parse and return
 *
 * @param {object} opts
 * @param {string} opts.prompt - The full prompt text
 * @param {string} [opts.assistantId] - Optional Backboard assistant_id
 * @param {string} [opts.threadId] - Optional Backboard thread_id for conversation continuity
 * @param {number} [opts.timeoutMs] - Per-request timeout (default 30s)
 * @param {string} [opts.routeName] - For log messages (e.g. "generate-project")
 * @returns {Promise<object>} Parsed JSON response from Claude
 * @throws {LLMError} if Backboard returns an LLM-layer error
 * @throws {TimeoutError} if all attempts time out
 * @throws {Error} for other failures after retries exhausted
 */
export async function sendMessage({
  prompt,
  assistantId,
  threadId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  routeName = "unknown"
}) {
  const body = {
    content: prompt,
    llm_provider: "anthropic",
    model_name: "claude-sonnet-5",
    stream: false
  };
  if (assistantId) body.assistant_id = assistantId;
  if (threadId) body.thread_id = threadId;

  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoff));
    }

    let response;
    try {
      response = await fetchWithTimeout(
        `${BACKBOARD_BASE}/threads/messages`,
        {
          method: "POST",
          headers: {
            "X-API-Key": process.env.BACKBOARD_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        },
        timeoutMs
      );
    } catch (err) {
      lastErr = err;
      if (isRetryable(err, null)) {
        console.warn(`[${routeName}] Attempt ${attempt + 1} failed (${err.message}), retrying...`);
        continue;
      }
      throw err;
    }

    // 5xx from Backboard — retryable
    if (response.status >= 500) {
      lastErr = new Error(`Backboard API returned status ${response.status}`);
      console.warn(`[${routeName}] Attempt ${attempt + 1} got ${response.status}, retrying...`);
      continue;
    }

    // 4xx from Backboard — not retryable
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Backboard API returned ${response.status}: ${errText}`);
    }

    // 200 — check for LLM Error in content
    const data = await response.json();

    if (!data.content || data.content.startsWith("LLM Error")) {
      throw new LLMError(data.content || "Empty content returned from LLM");
    }

    // Parse JSON (with code-fence fallback)
    return parseBackboardContent(data.content, routeName);
  }

  // All retries exhausted
  throw lastErr || new Error("Backboard request failed after all retries");
}

export { BACKBOARD_BASE, DEFAULT_TIMEOUT_MS };
