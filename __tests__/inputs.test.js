const { checkLegacyInputs, readInputs, PLATFORMS } = require("../src/inputs");

// Distinctive values so a leak into the message is easy to detect.
const LEGACY = {
  "consumer-key": "legacy-key-value",
  "consumer-token": "legacy-token-value",
  "checksum-sha-1": "sha1-value",
  "checksum-sha-224": "sha224-value",
  "checksum-sha-384": "sha384-value",
};

// Mimics `@actions/core`: an unset input reads as "".
function stubCore(inputs = {}) {
  return {
    getInput: jest.fn((name) => inputs[name] ?? ""),
    setSecret: jest.fn(),
  };
}

// Runs `checkLegacyInputs` and returns the error message, asserting that no
// input value ever leaks into it.
function legacyFailure(inputs) {
  let error;
  try {
    checkLegacyInputs(stubCore(inputs));
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(Error);
  for (const value of Object.values(inputs)) {
    expect(error.message).not.toContain(value);
  }
  return error.message;
}

describe("checkLegacyInputs", () => {
  it("passes when no legacy input is set", () => {
    const core = stubCore({ email: "vendor@example.com", "checksum-md5": "x" });

    expect(() => checkLegacyInputs(core)).not.toThrow();
    expect(core.setSecret).not.toHaveBeenCalled();
  });

  it.each(["consumer-key", "consumer-token"])(
    "rejects %s with the credential migration message",
    (name) => {
      const message = legacyFailure({ [name]: LEGACY[name] });

      expect(message).toContain(name);
      expect(message).toContain(
        "v1 publishes to sdkman-state and authenticates with email and password",
      );
      expect(message).toContain(
        "https://github.com/sdkman/sdkman-release-action#migrating-from-v0",
      );
    },
  );

  it.each([
    ["checksum-sha-1", "SHA-1"],
    ["checksum-sha-224", "SHA-224"],
    ["checksum-sha-384", "SHA-384"],
  ])("rejects %s as an unsupported algorithm", (name, algorithm) => {
    const message = legacyFailure({ [name]: LEGACY[name] });

    expect(message).toContain(
      `- ${name}: sdkman-state does not support ${algorithm}; ` +
        "supported checksums are checksum-md5, checksum-sha-256, checksum-sha-512",
    );
    expect(message).not.toContain("migrating-from-v0");
  });

  it("reports every offender in one message", () => {
    const message = legacyFailure(LEGACY);

    expect(message).toContain("- consumer-key, consumer-token: v1 publishes");
    expect(message).toContain("does not support SHA-1");
    expect(message).toContain("does not support SHA-224");
    expect(message).toContain("does not support SHA-384");
  });

  // The values would otherwise print unmasked in the failure log.
  it("masks non-empty credentials before failing", () => {
    const core = stubCore({
      "consumer-key": LEGACY["consumer-key"],
      "checksum-sha-1": LEGACY["checksum-sha-1"],
    });

    expect(() => checkLegacyInputs(core)).toThrow();
    expect(core.setSecret).toHaveBeenCalledTimes(1);
    expect(core.setSecret).toHaveBeenCalledWith(LEGACY["consumer-key"]);
  });

  it("does not name inputs that are absent", () => {
    const message = legacyFailure({
      "checksum-sha-384": LEGACY["checksum-sha-384"],
    });

    expect(message).not.toContain("consumer-key");
    expect(message).not.toContain("consumer-token");
    expect(message).not.toContain("checksum-sha-1:");
    expect(message).not.toContain("checksum-sha-224");
  });
});

// The smallest input set that passes validation.
const REQUIRED = {
  email: "vendor@example.com",
  password: "s3cret-password",
  candidate: "gradle",
  version: "9.1.0",
  url: "https://example.com/gradle-9.1.0-bin.zip",
};

function readFailure(inputs) {
  expect(() => readInputs(stubCore(inputs))).toThrow(Error);
  try {
    readInputs(stubCore(inputs));
  } catch (e) {
    return e.message;
  }
}

describe("readInputs", () => {
  it("returns every v1 input keyed by name", () => {
    const inputs = {
      ...REQUIRED,
      platform: "LINUX_X64",
      "checksum-md5": "md5",
      "checksum-sha-256": "sha256",
      "checksum-sha-512": "sha512",
      tags: "lts, 3.x",
      visible: "false",
      backend: "http://localhost:8080",
    };

    expect(readInputs(stubCore(inputs))).toEqual(inputs);
  });

  it.each(["email", "password", "candidate", "version", "url"])(
    "rejects a missing %s",
    (name) => {
      const message = readFailure({ ...REQUIRED, [name]: "" });

      expect(message).toBe(`Missing required inputs: ${name}`);
    },
  );

  it("rejects a whitespace-only required input", () => {
    const message = readFailure({ ...REQUIRED, version: "  \n " });

    expect(message).toBe("Missing required inputs: version");
  });

  it("names every missing required input together", () => {
    const message = readFailure({});

    expect(message).toBe(
      "Missing required inputs: email, password, candidate, version, url",
    );
  });

  // The password must not leak even when another input is invalid.
  it("never echoes the password", () => {
    const message = readFailure({ ...REQUIRED, candidate: "" });

    expect(message).not.toContain(REQUIRED.password);
  });

  it("lists the nine sdkman-state platforms", () => {
    expect(PLATFORMS).toEqual([
      "UNIVERSAL",
      "LINUX_X64",
      "LINUX_X32",
      "LINUX_ARM64",
      "LINUX_ARM32HF",
      "LINUX_ARM32SF",
      "MAC_X64",
      "MAC_ARM64",
      "WINDOWS_X64",
    ]);
  });

  it.each(PLATFORMS)("accepts platform %s", (platform) => {
    expect(readInputs(stubCore({ ...REQUIRED, platform })).platform).toBe(
      platform,
    );
  });

  it.each(["LINUX_64", "MAC_OSX", "linux_x64", "WINDOWS_32"])(
    "rejects platform %s with the valid values and mapping link",
    (platform) => {
      const message = readFailure({ ...REQUIRED, platform });

      expect(message).toContain(`Invalid platform "${platform}"`);
      expect(message).toContain(PLATFORMS.join(", "));
      expect(message).toContain(
        "https://github.com/sdkman/sdkman-release-action#migrating-from-v0",
      );
    },
  );

  it("defaults a blank platform and backend", () => {
    const inputs = readInputs(stubCore(REQUIRED));

    expect(inputs.platform).toBe("UNIVERSAL");
    expect(inputs.backend).toBe("https://state.sdkman.io");
  });

  it.each([
    ["true", "true"],
    ["false", "false"],
    ["FALSE", "false"],
    ["True", "true"],
    ["", ""],
  ])("accepts visible %j as %j", (visible, expected) => {
    expect(readInputs(stubCore({ ...REQUIRED, visible })).visible).toBe(
      expected,
    );
  });

  it.each(["yes", "0", "hidden"])("rejects visible %j", (visible) => {
    const message = readFailure({ ...REQUIRED, visible });

    expect(message).toBe(
      `Invalid visible "${visible}"; expected true or false`,
    );
  });

  it.each([
    ["https://state.sdkman.io/", "https://state.sdkman.io"],
    ["http://localhost:8080/", "http://localhost:8080"],
    ["http://localhost:8080//", "http://localhost:8080/"],
    ["http://localhost:8080", "http://localhost:8080"],
  ])("strips one trailing slash from backend %s", (backend, expected) => {
    expect(readInputs(stubCore({ ...REQUIRED, backend })).backend).toBe(
      expected,
    );
  });
});
