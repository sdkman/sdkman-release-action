// @ts-check

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];
const MAX_WAIT_MS = 30000;

/**
 * Parses a `Retry-After` header value into a wait in milliseconds.
 *
 * @param {string | null | undefined} value delta-seconds or an HTTP-date
 * @param {number} [now] current time in epoch milliseconds, used for HTTP-dates
 * @returns {number | undefined} the wait, or `undefined` when absent or invalid
 */
function parseRetryAfter(value, now = Date.now()) {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  // Every HTTP-date form starts with a day name; without this check
  // `Date.parse` would read values such as "-5" as a year.
  if (!/^[A-Za-z]/.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  // A date in the past means "retry now", not a negative wait.
  return Math.max(0, date - now);
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function isRetryableStatus(response) {
  return response.status === 429 || response.status >= 500;
}

/**
 * Calls `attempt` up to three times, retrying on thrown errors, `429` and
 * `5xx`. Any other response, including every other `4xx`, is returned at once.
 *
 * @param {() => Promise<Response>} attempt performs one request
 * @param {object} options
 * @param {(ms: number) => Promise<void>} options.sleep injected so tests do not wait
 * @param {(message: string) => void} options.info logs each retry
 * @param {string} options.label names the call in log lines, e.g. `Login`
 * @returns {Promise<Response>} the last response
 */
async function withRetry(attempt, { sleep, info, label }) {
  for (let number = 1; ; number++) {
    /** @type {Response | undefined} */
    let response;
    /** @type {unknown} */
    let error;
    try {
      response = await attempt();
    } catch (e) {
      error = e;
    }

    const retryable = response === undefined || isRetryableStatus(response);
    if (!retryable || number >= MAX_ATTEMPTS) {
      if (response === undefined) throw error;
      return response;
    }

    const retryAfter = response
      ? parseRetryAfter(response.headers.get("retry-after"))
      : undefined;
    const wait = Math.min(retryAfter ?? BACKOFF_MS[number - 1], MAX_WAIT_MS);
    const reason = response
      ? `HTTP ${response.status}`
      : error instanceof Error
        ? error.message
        : String(error);
    info(
      `${label} attempt ${number} of ${MAX_ATTEMPTS} failed (${reason}); retrying in ${wait} ms`,
    );
    await sleep(wait);
  }
}

module.exports = { parseRetryAfter, withRetry };
