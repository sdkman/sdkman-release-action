const nock = require("nock");
const { run } = require("../src/main");

const BACKEND = "https://state.example.test";
const EMAIL = "vendor@example.com";
const PASSWORD = "s3cret-passw0rd";
const TOKEN = "jwt-t0ken-value";

const VALID_INPUTS = {
  email: EMAIL,
  password: PASSWORD,
  candidate: "gradle",
  version: "9.1.0",
  url: "https://example.test/gradle-9.1.0-bin.zip",
  platform: "UNIVERSAL",
  backend: `${BACKEND}/`,
};

// Records every `core` call in one list, so tests can assert ordering
// across secrets, logs and HTTP requests.
function stubCore(inputs, calls = []) {
  return {
    calls,
    getInput: (name) => inputs[name] ?? "",
    setSecret: jest.fn((secret) => calls.push(["setSecret", secret])),
    info: jest.fn((message) => calls.push(["info", message])),
  };
}

function deps(inputs = VALID_INPUTS, calls = []) {
  return {
    core: stubCore(inputs, calls),
    fetch,
    sleep: jest.fn(async () => {}),
  };
}

describe("run", () => {
  it("logs in, publishes with the bearer token and logs the summary", async () => {
    const calls = [];
    const loginScope = nock(BACKEND)
      .post("/login", { email: EMAIL, password: PASSWORD })
      .reply(200, () => {
        calls.push(["request", "/login"]);
        return { token: TOKEN };
      });
    const publishScope = nock(BACKEND, {
      reqheaders: { authorization: `Bearer ${TOKEN}` },
    })
      .post("/versions", {
        candidate: "gradle",
        version: "9.1.0",
        platform: "UNIVERSAL",
        url: "https://example.test/gradle-9.1.0-bin.zip",
      })
      .reply(204, () => {
        calls.push(["request", "/versions"]);
      });

    await run(deps(VALID_INPUTS, calls));

    expect(loginScope.isDone()).toBe(true);
    expect(publishScope.isDone()).toBe(true);
    expect(calls).toEqual([
      ["setSecret", PASSWORD],
      ["request", "/login"],
      ["setSecret", TOKEN],
      ["request", "/versions"],
      ["info", `Released gradle 9.1.0 (UNIVERSAL) to ${BACKEND}`],
    ]);
  });

  it("sends the built payload with tags, checksums and visible", async () => {
    nock(BACKEND).post("/login").reply(200, { token: TOKEN });
    const scope = nock(BACKEND)
      .post("/versions", {
        candidate: "gradle",
        version: "9.1.0",
        platform: "LINUX_X64",
        url: "https://example.test/gradle-9.1.0-bin.zip",
        sha256sum: "abc123",
        tags: ["stable", "9.x"],
        visible: false,
      })
      .reply(204);

    await run(
      deps({
        ...VALID_INPUTS,
        platform: "LINUX_X64",
        "checksum-sha-256": "abc123",
        tags: "stable, 9.x",
        visible: "FALSE",
      }),
    );

    expect(scope.isDone()).toBe(true);
  });

  it("logs retries through core.info", async () => {
    nock(BACKEND).post("/login").reply(503).post("/login").reply(200, {
      token: TOKEN,
    });
    nock(BACKEND).post("/versions").reply(204);
    const d = deps();

    await run(d);

    expect(d.sleep).toHaveBeenCalledTimes(1);
    expect(d.core.info).toHaveBeenCalledTimes(2);
    expect(d.core.info.mock.calls[0][0]).toContain("Login");
  });

  it("rejects legacy inputs before checking required inputs", async () => {
    const d = deps({ "consumer-key": "legacy-key" });

    const error = await run(d).catch((e) => e);

    expect(error.message).toContain("consumer-key");
    expect(error.message).not.toContain("Missing required inputs");
    expect(error.message).not.toContain("legacy-key");
    expect(d.core.setSecret).toHaveBeenCalledWith("legacy-key");
  });

  it("fails on invalid inputs without any request", async () => {
    const d = deps({ ...VALID_INPUTS, email: " " });

    await expect(run(d)).rejects.toThrow("Missing required inputs: email");
    expect(d.core.setSecret).not.toHaveBeenCalled();
  });

  it("stops after a failed login without publishing", async () => {
    nock(BACKEND).post("/login").reply(401);
    const d = deps();

    await expect(run(d)).rejects.toThrow(
      "Login failed: invalid email or password.",
    );
    expect(d.core.setSecret).toHaveBeenCalledTimes(1);
    expect(d.core.info).not.toHaveBeenCalled();
  });

  it("propagates a publish failure without the summary", async () => {
    nock(BACKEND).post("/login").reply(200, { token: TOKEN });
    nock(BACKEND).post("/versions").reply(403);
    const d = deps();

    await expect(run(d)).rejects.toThrow(
      `Vendor ${EMAIL} is not authorised to publish gradle.`,
    );
    expect(d.core.info).not.toHaveBeenCalled();
  });
});
