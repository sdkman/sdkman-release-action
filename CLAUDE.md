# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A JavaScript GitHub Action (`runs.using: node24`) that publishes a candidate version to SDKMAN! through the sdkman-state API: it logs in with a vendor email and password at `/login`, then POSTs the version to `/versions` with the returned bearer token. The Node version is pinned in `.node-version` (24.x).

## Commands

- `npm ci` — install dependencies
- `npm test` — run the Jest suite in `__tests__/` (HTTP is intercepted with nock; `__tests__/setup.js` disables real network access)
- `npm run bundle` — format everything with Prettier, then build `dist/` with ncc. **Run this before every commit that touches `src/` or dependencies.**
- `npm run package` — build `dist/` only (no formatting)
- `npm run package:watch` — rebuild on change
- `npm run format:write` — Prettier over the whole repo

There is no linter configured.

## Architecture

Plain JavaScript (CommonJS) with JSDoc types and `// @ts-check`. The runtime has no dependencies beyond `@actions/core`; HTTP uses Node's built-in `fetch`.

- `src/index.js` is the entry point. It calls `run` with the real `@actions/core`, `fetch` and a `setTimeout`-based `sleep`, and turns any thrown error into `core.setFailed`.
- `src/main.js` exports `run({ core, fetch, sleep })`, which orchestrates one release: reject legacy inputs, read and validate inputs, mask the password, log in, mask the token, build the payload, publish, and log a summary. Every failure throws. Dependencies are injected so tests can stub `core` and skip retry waits.
- Helper modules, each unit-tested in `__tests__/`:
  - `src/inputs.js` — `checkLegacyInputs` (fails on v0 inputs with a link to the README's `## Migrating from v0`), `readInputs` (required inputs, `PLATFORMS`, `visible`, backend trailing slash).
  - `src/payload.js` — `parseTags` and `buildPayload`, which maps inputs to the `/versions` body and omits unset checksums, tags and `visible`.
  - `src/client.js` — `login` and `publish` against the backend, with error formatting for each failure mode.
  - `src/retry.js` — `withRetry` (up to 3 attempts on network errors, `429` and `5xx`) and `parseRetryAfter`.
  - `src/http.js` — `readBody`, which reads a response body without ever throwing.
- `action.yml` is the public contract: inputs, defaults (`backend: https://state.sdkman.io`), deprecated legacy inputs, and the entry point `dist/index.js`. When adding or renaming an input, update `action.yml`, `src/inputs.js`, and the inputs table in `README.md` together.
- `dist/` is **committed build output** (ncc bundle of `src/index.js` plus source map and `licenses.md`). GitHub runs `dist/index.js` directly, so source changes do nothing until `dist/` is rebuilt and committed.

## CI

`.github/workflows/ci.yml` runs `npm ci && npm test` on PRs and pushes to `main`, on the Node version from `.node-version`.

`.github/workflows/check-dist.yml` runs `npm ci && npm run bundle` on PRs and pushes to `main`, then fails if `dist/` differs from what's committed. If that check fails, rebuild with `npm run bundle` and commit the result.
