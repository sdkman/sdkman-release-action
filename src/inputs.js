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

module.exports = { checkLegacyInputs };
