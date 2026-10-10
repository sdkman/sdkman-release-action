# SDKMAN! Release Action

![GitHub release (latest by date)](https://img.shields.io/github/v/release/sdkman/sdkman-release-action)
![GitHub](https://img.shields.io/github/license/sdkman/sdkman-release-action)

A GitHub Action to release your SDK to [SDKMAN!](https://sdkman.io) directly from your GitHub workflow.

## What is SDKMAN!?

[SDKMAN!](https://sdkman.io) is a tool for managing parallel versions of multiple Software Development Kits on most Unix-based systems. It provides a convenient Command Line Interface (CLI) and API for installing, switching, removing, and listing candidates.

## About this Action

This GitHub Action simplifies the process of releasing new candidate versions to SDKMAN! by integrating directly with your GitHub workflow. Instead of manually using the Vendor API, Gradle plugin, or Maven plugin, you can automate the release process as part of your CI/CD pipeline.

## Prerequisites

This action publishes to **sdkman-state** (`https://state.sdkman.io`), the SDKMAN! service that holds candidate version state. Before using it, you need:

1. An sdkman-state vendor account (email and password), issued by the SDKMAN! team. See the [SDKMAN! Vendor Onboarding Process](https://github.com/sdkman/sdkman-cli/wiki/Vendor-onboarding-process).
2. Your candidate registered in sdkman-state and authorised for your vendor account.
3. Your release artifacts publicly accessible via an `https://` URL.

Store the account credentials as repository secrets, for example `SDKMAN_EMAIL` and `SDKMAN_PASSWORD`.

## Usage

Add the following step to your GitHub workflow:

```yaml
- name: Release to SDKMAN!
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: your-candidate-name
    version: 1.0.0
    url: https://example.com/path/to/your-candidate-1.0.0.zip
```

The action logs in to sdkman-state, then publishes the version. The step fails with a descriptive message on any unsuccessful login or publish.

Publishing is an upsert on candidate, version and platform: re-running a job for the same release overwrites its URL, checksums and visibility instead of failing.

## Inputs

| Input              | Required | Default                   | Notes                                                                    |
| ------------------ | -------- | ------------------------- | ------------------------------------------------------------------------ |
| `email`            | yes      |                           | sdkman-state vendor account email                                        |
| `password`         | yes      |                           | sdkman-state vendor account password; masked in logs                     |
| `candidate`        | yes      |                           | Must already be registered in sdkman-state and authorised for the vendor |
| `version`          | yes      |                           |                                                                          |
| `url`              | yes      |                           | Download URL; the API requires `https://`                                |
| `platform`         | no       | `UNIVERSAL`               | One of the [supported platforms](#platforms)                             |
| `checksum-md5`     | no       |                           | Hex, 32 chars                                                            |
| `checksum-sha-256` | no       |                           | Hex, 64 chars                                                            |
| `checksum-sha-512` | no       |                           | Hex, 128 chars                                                           |
| `tags`             | no       |                           | Comma- and/or newline-separated list, e.g. `stable` or `latest, 3.x`     |
| `visible`          | no       | `true`                    | `true` / `false`                                                         |
| `backend`          | no       | `https://state.sdkman.io` | Trailing `/` is stripped. `http://` is permitted (local testing)         |

## Platforms

The `platform` input accepts sdkman-state's platform identifiers only, matched exactly (case-sensitive):

- `UNIVERSAL` (default): platform-independent distribution
- `LINUX_X64`
- `LINUX_X32`
- `LINUX_ARM64`
- `LINUX_ARM32HF`
- `LINUX_ARM32SF`
- `MAC_X64`
- `MAC_ARM64`
- `WINDOWS_X64`

The v0 identifiers are not translated. See the [platform mapping](#migrating-from-v0) if you are upgrading.

## Tags and visibility

`tags` assigns tags to the version. Separate tags with commas, newlines or both. Surrounding whitespace and empty entries are ignored.

- The `stable` tag makes the version the candidate's default version.
- The `latest` tag marks the candidate's newest, bleeding-edge release. Every candidate should tag each new release `latest`, including pre-releases and release candidates, so users can always find the newest version.
- A release that is both the newest and the default gets both tags: `stable, latest`. A pre-release gets `latest` only, so the default stays on the last stable release.
- Sending tags **replaces** the version's whole tag set. When `tags` is empty or not set, the action sends no tags, so tags assigned by other means stay in place.

`visible` controls whether users can see the version. Set it to `false` to publish a hidden version. When `visible` is not set, sdkman-state applies its default (`true`).

## Example Workflows

### Basic Example

```yaml
- name: Release to SDKMAN!
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: my-tool
    version: ${{ github.event.release.tag_name }}
    url: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
```

### With Checksums

```yaml
- name: Release to SDKMAN! with checksums
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: my-tool
    version: ${{ github.event.release.tag_name }}
    url: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
    checksum-md5: ${{ env.MD5 }}
    checksum-sha-256: ${{ env.SHA256 }}
```

### Platform-Specific Release

```yaml
- name: Release platform-specific version to SDKMAN!
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: my-tool
    version: ${{ github.event.release.tag_name }}
    url: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-linux-x64-${{ github.event.release.tag_name }}.zip
    platform: LINUX_X64
```

### Tagged Default Version

```yaml
- name: Release to SDKMAN! as the default version
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: my-tool
    version: ${{ github.event.release.tag_name }}
    url: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
    tags: |
      stable
      latest
```

### Pre-release

A pre-release is tagged `latest` but not `stable`, so it is the newest version without becoming the default.

```yaml
- name: Release pre-release to SDKMAN!
  if: github.event.release.prerelease
  uses: sdkman/sdkman-release-action@v1
  with:
    email: ${{ secrets.SDKMAN_EMAIL }}
    password: ${{ secrets.SDKMAN_PASSWORD }}
    candidate: my-tool
    version: ${{ github.event.release.tag_name }}
    url: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
    tags: latest
```

## Migrating from v0

v1 publishes to sdkman-state instead of the legacy Vendor API. Workflows written for v0 fail on v1 until you update them.

### Not ready to migrate?

v0 keeps publishing to the legacy Vendor API for as long as that API exists. Pin the floating `v0` tag to stay on it:

```yaml
uses: sdkman/sdkman-release-action@v0
```

### Credentials

v1 authenticates with an sdkman-state vendor account `email` and `password` instead of `consumer-key` and `consumer-token`. Ask the SDKMAN! team for an account, store it as the `SDKMAN_EMAIL` and `SDKMAN_PASSWORD` secrets, then replace the two legacy inputs:

```yaml
email: ${{ secrets.SDKMAN_EMAIL }}
password: ${{ secrets.SDKMAN_PASSWORD }}
```

The step fails if `consumer-key` or `consumer-token` is still set.

### Platforms

sdkman-state uses different platform identifiers. v1 does not translate the v0 identifiers, so update the `platform` input:

| v0 (legacy)   | v1 (sdkman-state)                  |
| ------------- | ---------------------------------- |
| `UNIVERSAL`   | `UNIVERSAL`                        |
| `LINUX_64`    | `LINUX_X64`                        |
| `LINUX_32`    | `LINUX_X32`                        |
| `LINUX_ARM64` | `LINUX_ARM64`                      |
| `LINUX_ARM32` | `LINUX_ARM32HF` or `LINUX_ARM32SF` |
| `MAC_OSX`     | `MAC_X64`                          |
| `MAC_ARM64`   | `MAC_ARM64`                        |
| `WINDOWS_64`  | `WINDOWS_X64`                      |
| `WINDOWS_32`  | _(not supported)_                  |

### Removed checksum algorithms

sdkman-state supports MD5, SHA-256 and SHA-512 only. Remove `checksum-sha-1`, `checksum-sha-224` and `checksum-sha-384`, and use `checksum-md5`, `checksum-sha-256` or `checksum-sha-512` instead. The step fails if a removed checksum input is set.

### Download URLs

sdkman-state requires the `url` to use `https://`. An `http://` download URL is rejected.

### Failures

v1 fails the step on any unsuccessful publish, including responses that v0 let through. A failed login, a rejected release or an unauthorised candidate now stops the workflow with a descriptive message.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Issues

If you encounter any problems or have suggestions, please [open an issue](https://github.com/sdkman/sdkman-release-action/issues/new).
