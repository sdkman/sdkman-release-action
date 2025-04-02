# SDKMAN! Release Action

![GitHub release (latest by date)](https://img.shields.io/github/v/release/sdkman/sdkman-release-action)
![GitHub](https://img.shields.io/github/license/sdkman/sdkman-release-action)

A GitHub Action to release your SDK to [SDKMAN!](https://sdkman.io) directly from your GitHub workflow.

## What is SDKMAN!?

[SDKMAN!](https://sdkman.io) is a tool for managing parallel versions of multiple Software Development Kits on most Unix-based systems. It provides a convenient Command Line Interface (CLI) and API for installing, switching, removing, and listing candidates.

## About this Action

This GitHub Action simplifies the process of releasing new candidate versions to SDKMAN! by integrating directly with your GitHub workflow. Instead of manually using the Vendor API, Gradle plugin, or Maven plugin, you can automate the release process as part of your CI/CD pipeline.

## Prerequisites

Before using this action, you need to:

1. Complete the [SDKMAN! Vendor Onboarding Process](https://github.com/sdkman/sdkman-cli/wiki/Vendor-onboarding-process)
2. Obtain your Consumer Key and Consumer Token from the SDKMAN! team
3. Have your release artifacts publicly accessible via URL

## Usage

Add the following step to your GitHub workflow:

```yaml
- name: Release to SDKMAN!
  uses: sdkman/sdkman-release-action@v0.1.0
  with:
    CONSUMER-KEY: ${{ secrets.SDKMAN_CONSUMER_KEY }}
    CONSUMER-TOKEN: ${{ secrets.SDKMAN_CONSUMER_TOKEN }}
    CANDIDATE: your-candidate-name
    VERSION: 1.0.0
    URL: https://example.com/path/to/your-candidate-1.0.0.zip
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `CONSUMER-KEY` | Your SDKMAN! consumer key | Yes | - |
| `CONSUMER-TOKEN` | Your SDKMAN! consumer token | Yes | - |
| `CANDIDATE` | The candidate name (e.g., java, scala, kotlin) | Yes | - |
| `VERSION` | The version to release | Yes | - |
| `URL` | The URL where the binary can be downloaded from | Yes | - |
| `PLATFORM` | The platform this binary is for | No | `UNIVERSAL` |
| `CHECKSUM-MD5` | MD5 checksum of the binary | No | - |
| `CHECKSUM-SHA-1` | SHA-1 checksum of the binary | No | - |
| `CHECKSUM-SHA-224` | SHA-224 checksum of the binary | No | - |
| `CHECKSUM-SHA-256` | SHA-256 checksum of the binary | No | - |
| `CHECKSUM-SHA-384` | SHA-384 checksum of the binary | No | - |
| `CHECKSUM-SHA-512` | SHA-512 checksum of the binary | No | - |
| `BACKEND` | The SDKMAN! vendor API endpoint | No | `https://vendors.sdkman.io` |

## Platform Values

The `PLATFORM` input can be one of the following values:

- `UNIVERSAL` (default): Platform-independent distribution
- `LINUX_64`
- `LINUX_32`
- `LINUX_ARM64`
- `LINUX_ARM32`
- `MAC_OSX`
- `MAC_ARM64`
- `WINDOWS_64`
- `WINDOWS_32`

## Example Workflows

### Basic Example

```yaml
- name: Release to SDKMAN!
  uses: sdkman/sdkman-release-action@v0.1.0
  with:
    CONSUMER-KEY: ${{ secrets.SDKMAN_CONSUMER_KEY }}
    CONSUMER-TOKEN: ${{ secrets.SDKMAN_CONSUMER_TOKEN }}
    CANDIDATE: my-tool
    VERSION: ${{ github.event.release.tag_name }}
    URL: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
```

### With Checksums

```yaml
- name: Release to SDKMAN! with checksums
  uses: sdkman/sdkman-release-action@v0.1.0
  with:
    CONSUMER-KEY: ${{ secrets.SDKMAN_CONSUMER_KEY }}
    CONSUMER-TOKEN: ${{ secrets.SDKMAN_CONSUMER_TOKEN }}
    CANDIDATE: my-tool
    VERSION: ${{ github.event.release.tag_name }}
    URL: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-${{ github.event.release.tag_name }}.zip
    CHECKSUM-MD5: ${{ env.MD5 }}
    CHECKSUM-SHA-256: ${{ env.SHA256 }}
```

### Platform-Specific Release

```yaml
- name: Release platform-specific version to SDKMAN!
  uses: sdkman/sdkman-release-action@v0.1.0
  with:
    CONSUMER-KEY: ${{ secrets.SDKMAN_CONSUMER_KEY }}
    CONSUMER-TOKEN: ${{ secrets.SDKMAN_CONSUMER_TOKEN }}
    CANDIDATE: my-tool
    VERSION: ${{ github.event.release.tag_name }}
    URL: https://github.com/myorg/my-tool/releases/download/${{ github.event.release.tag_name }}/my-tool-linux-x64-${{ github.event.release.tag_name }}.zip
    PLATFORM: LINUX_64
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Issues

If you encounter any problems or have suggestions, please [open an issue](https://github.com/sdkman/sdkman-release-action/issues/new).
