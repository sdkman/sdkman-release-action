// @ts-check

const { readBody } = require("./http");
const { withRetry } = require("./retry");

/**
 * Builds the generic failure message for a status the call does not map.
 *
 * @param {string} label names the call, e.g. `Login`
 * @param {number} status the HTTP status
 * @param {import("./http").Body} body the parsed response body
 * @returns {string}
 */
function formatFailure(label, status, body) {
  const message = body.json?.message;
  const suffix =
    typeof message === "string" && message !== "" ? ` ${message}` : "";
  return `${label} failed: HTTP ${status}${suffix}`;
}

/**
 * Describes a thrown network error. Node's `fetch` throws a bare
 * `fetch failed` and keeps the useful detail in `cause`.
 *
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause ? `${error.message} (${cause})` : error.message;
}

/**
 * Logs in to sdkman-state and returns the bearer token.
 *
 * @param {object} options
 * @param {typeof globalThis.fetch} options.fetch
 * @param {(ms: number) => Promise<void>} options.sleep injected so tests do not wait
 * @param {(message: string) => void} options.info logs each retry
 * @param {string} options.backend base URL without a trailing slash
 * @param {string} options.email
 * @param {string} options.password
 * @returns {Promise<string>} the token
 */
async function login({ fetch, sleep, info, backend, email, password }) {
  /** @type {Response} */
  let response;
  try {
    response = await withRetry(
      () =>
        fetch(`${backend}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email, password }),
          // A redirect is a failure, and following it could replay the
          // credentials to another host.
          redirect: "manual",
        }),
      { sleep, info, label: "Login" },
    );
  } catch (error) {
    throw new Error(`Login failed: ${describeError(error)}`);
  }

  const body = await readBody(response);
  if (response.status === 200) {
    const token = body.json?.token;
    if (typeof token !== "string" || token === "") {
      throw new Error("Login failed: response has no token");
    }
    return token;
  }
  if (response.status === 401) {
    throw new Error("Login failed: invalid email or password.");
  }
  if (response.status === 429) {
    throw new Error("Login rate limited by sdkman-state; try again later.");
  }
  throw new Error(formatFailure("Login", response.status, body));
}

module.exports = { formatFailure, login };
