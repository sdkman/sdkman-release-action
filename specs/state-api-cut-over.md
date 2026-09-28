# Cut Over to the sdkman-state API

The action currently publishes releases by POSTing to the legacy Vendor API (`https://vendors.sdkman.io/release`) using `Consumer-Key` / `Consumer-Token` headers. SDKMAN! is moving version state to the new **sdkman-state** service (`https://state.sdkman.io`), which has a different authentication model, endpoint, platform vocabulary and payload shape.

This change makes v1 of the action publish exclusively to sdkman-state. It is a hard cut-over: the legacy code path is removed. Existing users are unaffected until they upgrade, because `@v0.1.0` continues to target the legacy API for as long as it exists.

## Goals

- Publish a candidate version to sdkman-state from a GitHub workflow.
- Give users upgrading from v0 an explicit, actionable failure instead of silent behaviour changes.
- Fail the workflow step on every unsuccessful publish (the current action does not).
- Introduce a test suite and CI for the action's logic.
- Move to the Node 24 Actions runtime.

## Non-goals

- Supporting the legacy Vendor API in v1, or switching between backends.
- Exposing the `distribution` field (Java distributions are published by Foojay DISCO, not this action). Can be added later without a breaking change.
- Tag-only operations (`POST /versions/tags`, `DELETE /versions/tags`) or version deletion.
- Declaring action outputs.
- Converting to TypeScript.

## Behaviour

A single run performs the following steps in order. Any failure calls `core.setFailed` with a descriptive message and stops the run; no further requests are made.

1. **Reject legacy inputs.** If any of `consumer-key`, `consumer-token`, `checksum-sha-1`, `checksum-sha-224` or `checksum-sha-384` is non-empty, fail (see [Legacy inputs](#legacy-inputs)). This runs *before* required-input checks, so a user who bumps to `@v1` without changing their workflow sees the migration message rather than a generic `Input required: email`.
2. **Read and validate inputs** (see [Local validation](#local-validation)).
3. **Mask secrets.** `core.setSecret(password)`.
4. **Log in.** `POST {backend}/login` with `{"email", "password"}`. On success, read `token` from the response body and immediately `core.setSecret(token)`.
5. **Publish.** `POST {backend}/versions` with `Authorization: Bearer <token>` and the payload described in [Request mapping](#request-mapping).
6. **Report.** On `204 No Content`, log a one-line success summary: `Released <candidate> <version> (<platform>) to <backend>`.

The action logs in exactly once per run. The token is valid for 10 minutes (sdkman-state default), far longer than a single publish needs, so there is no refresh logic.

`POST /versions` is an idempotent upsert on `(candidate, version, distribution, platform)`: re-running a job for the same release overwrites the URL, checksums and visibility rather than failing. This is the expected behaviour and makes re-runs and retries safe.

## Inputs

| Input              | Required | Default                   | Notes                                                                    |
|--------------------|----------|---------------------------|--------------------------------------------------------------------------|
| `email`            | yes      |                           | sdkman-state vendor account email                                        |
| `password`         | yes      |                           | sdkman-state vendor account password; masked in logs                     |
| `candidate`        | yes      |                           | Must already be registered in sdkman-state and authorised for the vendor |
| `version`          | yes      |                           |                                                                          |
| `url`              | yes      |                           | Download URL; the API requires `https://`                                |
| `platform`         | no       | `UNIVERSAL`               | One of the [supported platforms](#platforms)                             |
| `checksum-md5`     | no       |                           | Hex, 32 chars                                                            |
| `checksum-sha-256` | no       |                           | Hex, 64 chars                                                            |
| `checksum-sha-512` | no       |                           | Hex, 128 chars                                                           |
| `tags`             | no       |                           | Comma- and/or newline-separated list, e.g. `lts` or `latest, 3.x`        |
| `visible`          | no       | `true`                    | `true` / `false`                                                         |
| `backend`          | no       | `https://state.sdkman.io` | Trailing `/` is stripped. `http://` is permitted (local testing)         |

### Legacy inputs

The following inputs remain declared in `action.yml`, marked `deprecationMessage`, so that GitHub does not silently discard them. If set, the action fails:

| Input                                                     | Failure message (summary)                                                                                                   |
|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `consumer-key`, `consumer-token`                          | v1 publishes to sdkman-state and authenticates with `email` / `password`; link to the README migration section.             |
| `checksum-sha-1`, `checksum-sha-224`, `checksum-sha-384`  | sdkman-state does not support `<algorithm>`; supported checksums are `checksum-md5`, `checksum-sha-256`, `checksum-sha-512`. |

All offending inputs are reported in one message rather than one at a time. These declarations are removed in v2.

### Platforms

The action accepts sdkman-state's platform identifiers only, matched exactly (case-sensitive):

`UNIVERSAL`, `LINUX_X64`, `LINUX_X32`, `LINUX_ARM64`, `LINUX_ARM32HF`, `LINUX_ARM32SF`, `MAC_X64`, `MAC_ARM64`, `WINDOWS_X64`

Legacy identifiers are not translated. The README documents the mapping:

| v0 (legacy)   | v1 (sdkman-state)                      |
|---------------|----------------------------------------|
| `UNIVERSAL`   | `UNIVERSAL`                            |
| `LINUX_64`    | `LINUX_X64`                            |
| `LINUX_32`    | `LINUX_X32`                            |
| `LINUX_ARM64` | `LINUX_ARM64`                          |
| `LINUX_ARM32` | `LINUX_ARM32HF` or `LINUX_ARM32SF`     |
| `MAC_OSX`     | `MAC_X64`                              |
| `MAC_ARM64`   | `MAC_ARM64`                            |
| `WINDOWS_64`  | `WINDOWS_X64`                          |
| `WINDOWS_32`  | *(not supported)*                      |

### Local validation

Local validation is deliberately light, to avoid drifting from the server's rules:

- `email`, `password`, `candidate`, `version` and `url` are non-empty after trimming.
- `platform` is one of the supported platforms. On failure, the message lists the valid values and points to the README mapping table.
- `visible`, when set, is `true` or `false` (case-insensitive).

Everything else — URL scheme, checksum format, tag format, candidate registration, semver rules — is left to the API, whose `400` response is reported field by field (see [Error handling](#error-handling)).

## Request mapping

### Login

```
POST {backend}/login
Content-Type: application/json
Accept: application/json

{"email": "<email>", "password": "<password>"}
```

Success: `200` with `{"token": "<jwt>"}`.

### Publish

```
POST {backend}/versions
Authorization: Bearer <jwt>
Content-Type: application/json
```

| Input              | Request field | Rule                                                                        |
|--------------------|---------------|-----------------------------------------------------------------------------|
| `candidate`        | `candidate`   | trimmed                                                                     |
| `version`          | `version`     | trimmed                                                                     |
| `platform`         | `platform`    | always sent                                                                 |
| `url`              | `url`         | trimmed                                                                     |
| `checksum-md5`     | `md5sum`      | omitted when empty                                                          |
| `checksum-sha-256` | `sha256sum`   | omitted when empty                                                          |
| `checksum-sha-512` | `sha512sum`   | omitted when empty                                                          |
| `tags`             | `tags`        | split on `,` and newlines, trimmed, empties dropped; **omitted** if no tags |
| `visible`          | `visible`     | sent as `false` only when the input is `false`; otherwise omitted           |

Omitting `tags` is essential: sending `tags` *replaces* the version's tag set, so an empty array would wipe tags that were assigned by other means. Omitting `visible` lets the server apply its default (`true`).

Example:

```json
{
  "candidate": "gradle",
  "version": "9.1.0",
  "platform": "UNIVERSAL",
  "url": "https://services.gradle.org/distributions/gradle-9.1.0-bin.zip",
  "sha256sum": "a1b2…",
  "tags": ["lts"]
}
```

Success: `204 No Content`.

## Error handling

Every non-success outcome fails the step via `core.setFailed`. Unhandled promise rejections must not be possible: the entry point awaits the run and catches everything.

| Call       | Response                  | Message                                                                                                   |
|------------|---------------------------|-----------------------------------------------------------------------------------------------------------|
| `/login`   | `401`                     | Login failed: invalid email or password.                                                                  |
| `/login`   | `429` (after retries)     | Login rate limited by sdkman-state; try again later.                                                      |
| `/versions`| `400`                     | `Release rejected by sdkman-state:` followed by one line per entry in `failures[]`: `- <field>: <message>` |
| `/versions`| `401`                     | Token rejected by sdkman-state (unexpected immediately after login).                                      |
| `/versions`| `403`                     | Vendor `<email>` is not authorised to publish `<candidate>`.                                              |
| either     | other `4xx`               | `<call> failed: HTTP <status>` plus the `message` field of the body, if present.                          |
| either     | `5xx` (after retries)     | `<call> failed: HTTP <status>` plus the `message` field of the body, if present.                          |
| either     | network error (after retries) | `<call> failed: <error message>`                                                                      |

Response bodies are parsed defensively: an empty or non-JSON body must not mask the status code. The token and password must never appear in any message.

### Retries

Both `/login` and `/versions` are retried on transient failures:

- **Retried:** network errors, `429`, and `5xx`.
- **Not retried:** `400`, `401`, `403`, and any other `4xx`.
- **Attempts:** at most 3 in total per call.
- **Backoff:** exponential, 1 s then 2 s. If the response carries `Retry-After` (delta-seconds or HTTP-date), wait that long instead, capped at 30 s.
- Each retry logs a `core.info` line with the attempt number, status or error, and wait time.

Retry delays are injectable so tests do not sleep.

## Implementation

### Structure

- `src/index.js` — entry point: calls `run()` and ensures any thrown error ends in `core.setFailed`. This is the ncc entry (`package.json` `main` already names it).
- `src/main.js` — `run({ core, fetch, sleep })`, orchestrating the steps above. Dependencies are passed in so tests can supply `@actions/core` stubs and control time.
- Pure helpers (input parsing, payload building, error formatting, retry) in small modules under `src/`, each unit-tested.
- Plain JavaScript (CommonJS) with JSDoc types and `// @ts-check`.

### Dependencies

- Remove `axios` and the unused `@actions/github`.
- Use Node's built-in `fetch`.
- Dev: `jest`, `nock` (v14+, which intercepts `fetch`).

### Runtime

- `action.yml`: `runs.using: node24`.
- `.node-version`: current Node 24 LTS.
- `package.json` `engines.node`: `>=24`.

### Metadata

- `package.json`: `version` → `1.0.0`; `homepage` / `bugs` → `github.com/sdkman/sdkman-release-action`; `license` → `Apache-2.0` (matching `LICENSE`).
- `action.yml`: remove the `## TODO: ADD THE OUTPUTS ?` comment.
- Authorship fields and `CODEOWNERS` are unchanged.

## Testing

### Unit tests (Jest)

`npm test` runs Jest. HTTP is intercepted with nock; `nock.disableNetConnect()` ensures no test reaches the network.

Required coverage:

- **Legacy inputs:** each of the five legacy inputs fails with its message; multiple offenders reported together; checked before required inputs.
- **Validation:** each required input missing/blank; invalid platform lists valid values; invalid `visible`.
- **Payload:** checksum field mapping and omission; tag parsing (commas, newlines, whitespace, empties, none → omitted); `visible` omitted by default and `false` when set; backend trailing slash stripped.
- **Happy path:** login then publish in order, bearer token sent, `204` treated as success, success summary logged.
- **Secrets:** `setSecret` called for password and token.
- **Errors:** every row of the error table, including `400` with multiple failures and non-JSON bodies.
- **Retries:** `429`/`5xx`/network retried up to 3 attempts; `Retry-After` honoured and capped; `4xx` not retried; success on a later attempt.
- **Entry point:** a thrown error results in `setFailed`, not an unhandled rejection.

### CI

A new `.github/workflows/ci.yml` runs on pull requests and pushes to `main`: `npm ci` then `npm test`, on the Node version from `.node-version`. The existing `check-dist.yml` is unchanged apart from inheriting the new Node version.

### End-to-end verification (manual, before tagging)

Against a local sdkman-state (`http://localhost:8080`), with an admin, a registered candidate and a vendor authorised for it provisioned. Run the bundled `dist/index.js` with `INPUT_*` environment variables and `backend=http://localhost:8080`. Record results as a checklist in the PR:

- [ ] Vendor publishes a new version → step succeeds; `GET /versions/{candidate}/{version}` returns it.
- [ ] Same release re-run → succeeds (upsert); changed checksum is reflected.
- [ ] `tags: lts` → candidate default reflects the version in `GET /candidates`.
- [ ] `visible: false` → version is hidden.
- [ ] Candidate not authorised for the vendor → fails with the 403 message.
- [ ] Wrong password → fails with the login 401 message.
- [ ] Invalid URL / checksum → fails listing the API's field failures.
- [ ] `consumer-key` set → fails with the migration message, no HTTP calls made.
- [ ] Neither password nor token appears unmasked in the log.

## Documentation

`README.md` is updated to:

- Describe sdkman-state and the new prerequisites: a vendor account (email and password) issued by the SDKMAN! team, with the candidate registered and authorised for that account.
- Replace the inputs table, platform list and examples; examples use `@v1` and secrets `SDKMAN_EMAIL` / `SDKMAN_PASSWORD`.
- Explain `tags` (including `lts` for the default version and replace semantics) and `visible`.
- Add a **Migrating from v0** section: credential change, platform mapping table, removed checksum algorithms, stricter `https://` URL requirement, and that the step now fails on any unsuccessful publish.

`CLAUDE.md` is updated to reflect the new structure, test command and runtime.

## Release

- Tag `v1.0.0` and create/move the floating `v1` tag to the same commit.
- `v0.1.0` is left untouched for legacy users.

## Delivery

One pull request from `feature/cut-over-to-state-api`, as a sequence of atomic commits so that each step is reviewable in isolation:

1. This spec.
2. Node 24 runtime, Jest + nock harness, `npm test`, `ci.yml`.
3. Refactor into `index.js` / `main.js` with injected dependencies (behaviour unchanged, covered by tests).
4. sdkman-state client: login, publish, retries, error handling.
5. Inputs and `action.yml`: new inputs, legacy input rejection, local validation.
6. README and migration guide; `CLAUDE.md`.
7. Metadata (`package.json` URLs, license, version).
8. Rebuilt `dist/`.

`dist/` is rebuilt only in the final commit, so intermediate commits may fail `check-dist`; the PR as a whole must pass.
