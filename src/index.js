// @ts-check

const core = require("@actions/core");
const { run } = require("./main");

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `run` throws on every failure; this is the single place that turns an
// error into a failed step, so nothing escapes as an unhandled rejection.
run({ core, fetch: globalThis.fetch, sleep }).catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
