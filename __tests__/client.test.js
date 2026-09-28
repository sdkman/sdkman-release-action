const nock = require("nock");
const { formatFailure, login } = require("../src/client");

const BACKEND = "https://state.example.test";
const EMAIL = "vendor@example.com";
const PASSWORD = "s3cret-passw0rd";

function options() {
  return {
    fetch,
    sleep: jest.fn(async () => {}),
    info: jest.fn(),
    backend: BACKEND,
    email: EMAIL,
    password: PASSWORD,
  };
}

// Runs `login` and returns the error message, asserting the password never
// leaks into it.
async function loginFailure(opts = options()) {
  const error = await login(opts).then(
    () => {
      throw new Error("login unexpectedly succeeded");
    },
    (e) => e,
  );
  expect(error.message).not.toContain(PASSWORD);
  return error.message;
}

describe("formatFailure", () => {
  it("appends the body message when present", () => {
    expect(
      formatFailure("Publish", 502, {
        text: '{"message":"Bad gateway"}',
        json: { message: "Bad gateway" },
      }),
    ).toBe("Publish failed: HTTP 502 Bad gateway");
  });

  it("reports only the status without a message", () => {
    expect(formatFailure("Login", 418, { text: "", json: undefined })).toBe(
      "Login failed: HTTP 418",
    );
    expect(
      formatFailure("Login", 500, { text: "{}", json: { message: 42 } }),
    ).toBe("Login failed: HTTP 500");
  });
});

describe("login", () => {
  it("posts the credentials as JSON and returns the token", async () => {
    const scope = nock(BACKEND, {
      reqheaders: {
        "content-type": "application/json",
        accept: "application/json",
      },
    })
      .post("/login", { email: EMAIL, password: PASSWORD })
      .reply(200, { token: "jwt-token" });

    await expect(login(options())).resolves.toBe("jwt-token");
    expect(scope.isDone()).toBe(true);
  });

  it.each([
    ["an empty token", { token: "" }],
    ["no token", {}],
    ["a non-string token", { token: 42 }],
  ])("fails a 200 with %s", async (_, body) => {
    nock(BACKEND).post("/login").reply(200, body);

    expect(await loginFailure()).toBe("Login failed: response has no token");
  });

  it("fails a 200 with a non-JSON body", async () => {
    nock(BACKEND).post("/login").reply(200, "<html>ok</html>");

    expect(await loginFailure()).toBe("Login failed: response has no token");
  });

  it("fails a 401 without retrying", async () => {
    nock(BACKEND).post("/login").reply(401, { message: "Unauthorized" });
    const opts = options();

    expect(await loginFailure(opts)).toBe(
      "Login failed: invalid email or password.",
    );
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it("fails a 429 after 3 attempts", async () => {
    nock(BACKEND).post("/login").times(3).reply(429);
    const opts = options();

    expect(await loginFailure(opts)).toBe(
      "Login rate limited by sdkman-state; try again later.",
    );
    expect(opts.sleep).toHaveBeenCalledTimes(2);
  });

  it("fails a 5xx after 3 attempts with the body message", async () => {
    nock(BACKEND)
      .post("/login")
      .times(3)
      .reply(503, { message: "Service unavailable" });
    const opts = options();

    expect(await loginFailure(opts)).toBe(
      "Login failed: HTTP 503 Service unavailable",
    );
    expect(opts.sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("succeeds when a later attempt succeeds", async () => {
    nock(BACKEND).post("/login").reply(502).post("/login").reply(200, {
      token: "jwt-token",
    });
    const opts = options();

    await expect(login(opts)).resolves.toBe("jwt-token");
    expect(opts.info).toHaveBeenCalledWith(
      "Login attempt 1 of 3 failed (HTTP 502); retrying in 1000 ms",
    );
  });

  // Following a redirect could replay the credentials to another host, and
  // the contract defines only 200 as success.
  it("fails a 302 without following it", async () => {
    nock(BACKEND)
      .post("/login")
      .reply(302, "", { Location: "https://elsewhere.example.test/login" });

    expect(await loginFailure()).toBe("Login failed: HTTP 302");
  });

  it.each([201, 204, 400, 404])(
    "fails any other status %i with the generic message",
    async (status) => {
      nock(BACKEND).post("/login").reply(status);

      expect(await loginFailure()).toBe(`Login failed: HTTP ${status}`);
    },
  );

  it("appends the body message to a generic failure", async () => {
    nock(BACKEND).post("/login").reply(400, { message: "Malformed request" });

    expect(await loginFailure()).toBe(
      "Login failed: HTTP 400 Malformed request",
    );
  });

  it("fails a network error after 3 attempts", async () => {
    nock(BACKEND).post("/login").times(3).replyWithError("connection reset");
    const opts = options();

    const message = await loginFailure(opts);

    expect(message).toMatch(/^Login failed: .*connection reset/);
    expect(opts.sleep).toHaveBeenCalledTimes(2);
  });

  it("maps a thrown non-fetch error to its message", async () => {
    const opts = {
      ...options(),
      fetch: jest.fn(async () => {
        throw new Error("boom");
      }),
    };

    expect(await loginFailure(opts)).toBe("Login failed: boom");
    expect(opts.fetch).toHaveBeenCalledTimes(3);
    expect(opts.fetch.mock.calls[0][1].redirect).toBe("manual");
  });
});
