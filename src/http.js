// @ts-check

/**
 * @typedef {object} Body
 * @property {string} text the raw body, or `""` when it cannot be read
 * @property {Record<string, unknown> | undefined} json the parsed JSON object,
 *   or `undefined` when the body is empty, not JSON, or not an object
 */

/**
 * Reads a response body without ever throwing, so that an empty or malformed
 * body cannot mask the status code in the caller's error message.
 *
 * @param {Response} response
 * @returns {Promise<Body>}
 */
async function readBody(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return { text, json: undefined };
  }
  let json;
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object") json = parsed;
  } catch {
    json = undefined;
  }
  return { text, json };
}

module.exports = { readBody };
