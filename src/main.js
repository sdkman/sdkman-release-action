// @ts-check

const { login, publish } = require("./client");
const { checkLegacyInputs, readInputs } = require("./inputs");
const { buildPayload } = require("./payload");

/**
 * The subset of `@actions/core` that `run` uses.
 *
 * @typedef {import("./inputs").Core & { info: (message: string) => void }} Core
 */

/**
 * Publishes one candidate version to sdkman-state: rejects legacy inputs,
 * validates the rest, logs in once and publishes. Any failure throws; the
 * entry point turns it into `core.setFailed`. Dependencies are injected so
 * tests can stub `core` and skip retry waits.
 *
 * @param {object} deps
 * @param {Core} deps.core
 * @param {typeof globalThis.fetch} deps.fetch
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @returns {Promise<void>}
 */
async function run({ core, fetch, sleep }) {
  // Before required-input checks, so a user who bumps to `@v1` without
  // changing their workflow sees the migration message.
  checkLegacyInputs(core);
  const inputs = readInputs(core);
  const { backend, email, password } = inputs;
  const info = core.info;

  core.setSecret(password);
  const token = await login({ fetch, sleep, info, backend, email, password });
  core.setSecret(token);

  const payload = buildPayload(inputs);
  await publish({ fetch, sleep, info, backend, token, payload, email });

  core.info(
    `Released ${payload.candidate} ${payload.version} (${payload.platform}) to ${backend}`,
  );
}

module.exports = { run };
