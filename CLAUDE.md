# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A JavaScript GitHub Action (`runs.using: node20`) that publishes a candidate version to SDKMAN! by POSTing to the Vendor API's `/release` endpoint. The Node version is pinned in `.node-version` (20.x).

## Commands

- `npm ci` — install dependencies
- `npm run bundle` — format everything with Prettier, then build `dist/` with ncc. **Run this before every commit that touches `src/` or dependencies.**
- `npm run package` — build `dist/` only (no formatting)
- `npm run package:watch` — rebuild on change
- `npm run format:write` — Prettier over the whole repo

There is no test suite or linter configured.

## Architecture

- `src/main.js` is the entire action. It reads the inputs declared in `action.yml` via `@actions/core`, maps the optional `checksum-*` inputs to a `checksums` object keyed by algorithm name (`MD5`, `SHA-1`, `SHA-224`, …), and sends `{candidate, version, platform, url, checksums}` to `${backend}/release` with `Consumer-Key` / `Consumer-Token` headers using axios.
- `action.yml` is the public contract: inputs, defaults (`platform: UNIVERSAL`, `backend: https://vendors.sdkman.io`), and the entry point `dist/index.js`. When adding or renaming an input, update `action.yml`, `src/main.js`, and the inputs table in `README.md` together.
- `dist/` is **committed build output** (ncc bundle of `src/main.js` plus source map and `licenses.md`). GitHub runs `dist/index.js` directly, so source changes do nothing until `dist/` is rebuilt and committed.

## CI

`.github/workflows/check-dist.yml` runs `npm ci && npm run bundle` on PRs and pushes to `main`, then fails if `dist/` differs from what's committed. If that check fails, rebuild with `npm run bundle` and commit the result.
