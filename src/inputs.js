// @ts-check

/**
 * The subset of `@actions/core` the input helpers use.
 *
 * @typedef {object} Core
 * @property {(name: string) => string} getInput
 * @property {(secret: string) => void} setSecret
 */

const CREDENTIAL_INPUTS = ["consumer-key", "consumer-token"];

/** Legacy checksum inputs, keyed to the algorithm sdkman-state lacks. */
const CHECKSUM_INPUTS = {
  "checksum-sha-1": "SHA-1",
  "checksum-sha-224": "SHA-224",
  "checksum-sha-384": "SHA-384",
};

const MIGRATION_URL =
  "https://github.com/sdkman/sdkman-release-action#migrating-from-v0";

const SUPPORTED_CHECKSUMS = "checksum-md5, checksum-sha-256, checksum-sha-512";

/** The platform identifiers sdkman-state accepts, matched case-sensitively. */
const PLATFORMS = [
  "UNIVERSAL",
  "LINUX_X64",
  "LINUX_X32",
  "LINUX_ARM64",
  "LINUX_ARM32HF",
  "LINUX_ARM32SF",
  "MAC_X64",
  "MAC_ARM64",
  "WINDOWS_X64",
];

const REQUIRED_INPUTS = ["email", "password", "candidate", "version", "url"];

const OPTIONAL_INPUTS = [
  "platform",
  "checksum-md5",
  "checksum-sha-256",
  "checksum-sha-512",
  "tags",
  "visible",
  "backend",
];

/** Mirrors the `action.yml` defaults, for runs that bypass them. */
const DEFAULTS = {
  platform: "UNIVERSAL",
  backend: "https://state.sdkman.io",
};

/**
 * The v1 inputs, keyed by input name. `visible` is lower-cased; `backend`
 * has one trailing `/` stripped.
 *
 * @typedef {Record<string, string>} Inputs
 */

/**
 * Fails fast on inputs that only v0 understood, so a user who bumps to `@v1`
 * without changing their workflow sees the migration message rather than a
 * generic missing-input error. Every offender is reported in one message,
 * by name only: the credential values are masked first and never echoed.
 *
 * @param {Core} core
 * @returns {void}
 * @throws {Error} when any legacy input is non-empty
 */
function checkLegacyInputs(core) {
  const credentials = CREDENTIAL_INPUTS.filter((name) => {
    const value = core.getInput(name);
    if (value === "") return false;
    core.setSecret(value);
    return true;
  });
  const checksums = Object.entries(CHECKSUM_INPUTS).filter(
    ([name]) => core.getInput(name) !== "",
  );

  const lines = [];
  if (credentials.length > 0) {
    lines.push(
      `- ${credentials.join(", ")}: v1 publishes to sdkman-state and ` +
        `authenticates with email and password. See ${MIGRATION_URL}`,
    );
  }
  for (const [name, algorithm] of checksums) {
    lines.push(
      `- ${name}: sdkman-state does not support ${algorithm}; ` +
        `supported checksums are ${SUPPORTED_CHECKSUMS}`,
    );
  }
  if (lines.length === 0) return;

  throw new Error(["Unsupported legacy inputs are set:", ...lines].join("\n"));
}

/**
 * Reads every v1 input and applies the deliberately light local validation:
 * required inputs are non-blank, `platform` is an sdkman-state identifier
 * and `visible` is a boolean. Everything else is left to the API, so the
 * rules cannot drift from the server's.
 *
 * @param {Core} core
 * @returns {Inputs}
 * @throws {Error} when an input fails validation
 */
function readInputs(core) {
  /** @type {Inputs} */
  const inputs = {};
  for (const name of [...REQUIRED_INPUTS, ...OPTIONAL_INPUTS]) {
    inputs[name] = core.getInput(name);
  }

  const missing = REQUIRED_INPUTS.filter((name) => inputs[name].trim() === "");
  if (missing.length > 0) {
    throw new Error(`Missing required inputs: ${missing.join(", ")}`);
  }

  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (inputs[name].trim() === "") inputs[name] = value;
  }

  if (!PLATFORMS.includes(inputs.platform)) {
    throw new Error(
      `Invalid platform "${inputs.platform}"; valid platforms are ` +
        `${PLATFORMS.join(", ")}. For v0 platform names see ${MIGRATION_URL}`,
    );
  }

  if (inputs.visible !== "") {
    const visible = inputs.visible.trim().toLowerCase();
    if (visible !== "true" && visible !== "false") {
      throw new Error(
        `Invalid visible "${inputs.visible}"; expected true or false`,
      );
    }
    inputs.visible = visible;
  }

  inputs.backend = inputs.backend.replace(/\/$/, "");
  return inputs;
}

module.exports = { checkLegacyInputs, readInputs, PLATFORMS };
