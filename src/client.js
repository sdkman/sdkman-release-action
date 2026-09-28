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

/** Longest raw body quoted in a `400` message without `failures[]` or `message`. */
const RAW_BODY_LIMIT = 500;

/**
 * Builds the message for a `/versions` `400`, listing each field failure.
 *
 * @param {import("./http").Body} body the parsed response body
 * @returns {string}
 */
function formatRejection(body) {
  const heading = "Release rejected by sdkman-state:";
  const failures = body.json?.failures;
  if (Array.isArray(failures) && failures.length > 0) {
    const lines = failures.map(
      (failure) => `- ${failure?.field}: ${failure?.message}`,
    );
    return [heading, ...lines].join("\n");
  }
  const message = body.json?.message;
  if (typeof message === "string" && message !== "") {
    return `${heading} ${message}`;
  }
  const raw = body.text.slice(0, RAW_BODY_LIMIT);
  return raw ? `${heading} HTTP 400 ${raw}` : `${heading} HTTP 400`;
}

/**
 * Publishes a version to sdkman-state.
 *
 * @param {object} options
 * @param {typeof globalThis.fetch} options.fetch
 * @param {(ms: number) => Promise<void>} options.sleep injected so tests do not wait
 * @param {(message: string) => void} options.info logs each retry
 * @param {string} options.backend base URL without a trailing slash
 * @param {string} options.token the bearer token from `login`
 * @param {{ candidate: string } & Record<string, unknown>} options.payload the `/versions` request body
 * @param {string} options.email the vendor, named when not authorised
 * @returns {Promise<void>}
 */
async function publish({ fetch, sleep, info, backend, token, payload, email }) {
  /** @type {Response} */
  let response;
  try {
    response = await withRetry(
      () =>
        fetch(`${backend}/versions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          // A redirect is a failure, and following it could replay the
          // token to another host.
          redirect: "manual",
        }),
      { sleep, info, label: "Publish" },
    );
  } catch (error) {
    throw new Error(`Publish failed: ${describeError(error)}`);
  }

  if (response.status === 204) return;

  const body = await readBody(response);
  if (response.status === 400) {
    throw new Error(formatRejection(body));
  }
  if (response.status === 401) {
    throw new Error(
      "Token rejected by sdkman-state (unexpected immediately after login).",
    );
  }
  if (response.status === 403) {
    throw new Error(
      `Vendor ${email} is not authorised to publish ${payload.candidate}.`,
    );
  }
  throw new Error(formatFailure("Publish", response.status, body));
}

module.exports = { formatFailure, login, publish };
