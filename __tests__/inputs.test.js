const { checkLegacyInputs } = require("../src/inputs");

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
