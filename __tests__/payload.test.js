const { parseTags, buildPayload } = require("../src/payload");

// The shape `readInputs` returns once validation has passed.
function inputs(overrides = {}) {
  return {
    email: "vendor@example.com",
    password: "secret",
    candidate: "gradle",
    version: "9.1.0",
    url: "https://example.com/gradle-9.1.0-bin.zip",
    platform: "UNIVERSAL",
    "checksum-md5": "",
    "checksum-sha-256": "",
    "checksum-sha-512": "",
    tags: "",
    visible: "",
    backend: "https://state.sdkman.io",
    ...overrides,
  };
}

describe("parseTags", () => {
  it("splits on commas", () => {
    expect(parseTags("latest,3.x")).toEqual(["latest", "3.x"]);
  });

  it("splits on newlines", () => {
    expect(parseTags("latest\n3.x\n")).toEqual(["latest", "3.x"]);
  });

  it("splits on a mix of commas and newlines", () => {
    expect(parseTags("lts, latest\n3.x")).toEqual(["lts", "latest", "3.x"]);
  });

  it("trims whitespace around each tag", () => {
    expect(parseTags("  lts ,\t latest  \r\n  3.x ")).toEqual([
      "lts",
      "latest",
      "3.x",
    ]);
  });

  it("drops empty entries", () => {
    expect(parseTags(",lts,, ,\n\n latest ,")).toEqual(["lts", "latest"]);
  });

  it("returns no tags for an empty or blank value", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags(" , \n ")).toEqual([]);
  });
});

describe("buildPayload", () => {
  it("sends only the always-present fields by default", () => {
    expect(buildPayload(inputs())).toEqual({
      candidate: "gradle",
      version: "9.1.0",
      platform: "UNIVERSAL",
      url: "https://example.com/gradle-9.1.0-bin.zip",
    });
  });

  it("trims candidate, version and url", () => {
    const payload = buildPayload(
      inputs({
        candidate: " gradle\n",
        version: "\t9.1.0 ",
        url: " https://example.com/g.zip\n",
      }),
    );
    expect(payload).toMatchObject({
      candidate: "gradle",
      version: "9.1.0",
      url: "https://example.com/g.zip",
    });
  });

  it("always sends platform", () => {
    expect(buildPayload(inputs({ platform: "LINUX_X64" })).platform).toBe(
      "LINUX_X64",
    );
  });

  it("maps each checksum input to its request field", () => {
    const payload = buildPayload(
      inputs({
        "checksum-md5": "a".repeat(32),
        "checksum-sha-256": "b".repeat(64),
        "checksum-sha-512": "c".repeat(128),
      }),
    );
    expect(payload).toMatchObject({
      md5sum: "a".repeat(32),
      sha256sum: "b".repeat(64),
      sha512sum: "c".repeat(128),
    });
  });

  it.each([
    ["checksum-md5", "md5sum"],
    ["checksum-sha-256", "sha256sum"],
    ["checksum-sha-512", "sha512sum"],
  ])("sends %s alone as %s and omits the others", (input, field) => {
    const payload = buildPayload(inputs({ [input]: "abc123" }));
    expect(payload[field]).toBe("abc123");
    for (const other of ["md5sum", "sha256sum", "sha512sum"]) {
      if (other !== field) expect(payload).not.toHaveProperty(other);
    }
  });

  it("omits a checksum whose input is blank", () => {
    const payload = buildPayload(inputs({ "checksum-sha-256": "  \n" }));
    expect(payload).not.toHaveProperty("sha256sum");
  });

  it("sends parsed tags", () => {
    expect(buildPayload(inputs({ tags: "lts, latest\n3.x" })).tags).toEqual([
      "lts",
      "latest",
      "3.x",
    ]);
  });

  // Sending `tags` replaces the version's tag set, so an empty array would
  // wipe tags assigned by other means.
  it.each([[""], [" , \n "]])("omits tags when %j yields none", (tags) => {
    expect(buildPayload(inputs({ tags }))).not.toHaveProperty("tags");
  });

  it("sends visible false when the input is false", () => {
    expect(buildPayload(inputs({ visible: "false" })).visible).toBe(false);
  });

  // Omitting `visible` lets the server apply its default (`true`).
  it.each([[""], ["true"]])("omits visible when the input is %j", (visible) => {
    expect(buildPayload(inputs({ visible }))).not.toHaveProperty("visible");
  });

  it("never sends credentials or the backend", () => {
    const payload = buildPayload(inputs());
    for (const key of ["email", "password", "backend"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
