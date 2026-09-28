// @ts-check

/** Checksum inputs, keyed to the sdkman-state request field they fill. */
const CHECKSUM_FIELDS = {
  "checksum-md5": "md5sum",
  "checksum-sha-256": "sha256sum",
  "checksum-sha-512": "sha512sum",
};

/**
 * The `POST /versions` request body.
 *
 * @typedef {object} Payload
 * @property {string} candidate
 * @property {string} version
 * @property {string} platform
 * @property {string} url
 * @property {string} [md5sum]
 * @property {string} [sha256sum]
 * @property {string} [sha512sum]
 * @property {string[]} [tags]
 * @property {false} [visible]
 */

/**
 * Splits the `tags` input on commas and newlines, so users can write either
 * `latest, 3.x` or a YAML block list. Entries are trimmed and empties dropped.
 *
 * @param {string} value
 * @returns {string[]}
 */
function parseTags(value) {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * Maps validated inputs to the `POST /versions` body. Optional fields are
 * omitted rather than sent empty: `tags` replaces the version's tag set, so
 * an empty array would wipe tags assigned by other means, and omitting
 * `visible` lets the server apply its default (`true`).
 *
 * @param {import("./inputs").Inputs} inputs the result of `readInputs`
 * @returns {Payload}
 */
function buildPayload(inputs) {
  /** @type {Payload} */
  const payload = {
    candidate: inputs.candidate.trim(),
    version: inputs.version.trim(),
    platform: inputs.platform,
    url: inputs.url.trim(),
  };

  for (const [name, field] of Object.entries(CHECKSUM_FIELDS)) {
    const checksum = (inputs[name] ?? "").trim();
    if (checksum !== "") {
      payload[/** @type {"md5sum" | "sha256sum" | "sha512sum"} */ (field)] =
        checksum;
    }
  }

  const tags = parseTags(inputs.tags ?? "");
  if (tags.length > 0) payload.tags = tags;

  if (inputs.visible === "false") payload.visible = false;

  return payload;
}

module.exports = { parseTags, buildPayload };
