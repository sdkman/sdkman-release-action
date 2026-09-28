const nock = require("nock");
const { formatFailure, login, publish } = require("../src/client");

const BACKEND = "https://state.example.test";
const EMAIL = "vendor@example.com";
const PASSWORD = "s3cret-passw0rd";
const TOKEN = "jwt-t0ken-value";
const PAYLOAD = {
  candidate: "gradle",
  version: "9.1.0",
  platform: "UNIVERSAL",
  url: "https://example.test/gradle-9.1.0-bin.zip",
};

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

function publishOptions() {
  return {
    fetch,
    sleep: jest.fn(async () => {}),
    info: jest.fn(),
    backend: BACKEND,
    token: TOKEN,
    payload: PAYLOAD,
    email: EMAIL,
  };
}

// Runs `publish` and returns the error message, asserting the token never
// leaks into it.
async function publishFailure(opts = publishOptions()) {
  const error = await publish(opts).then(
    () => {
      throw new Error("publish unexpectedly succeeded");
    },
    (e) => e,
  );
  expect(error.message).not.toContain(TOKEN);
  return error.message;
}

describe("publish", () => {
  it("posts the payload as JSON with the bearer token", async () => {
    const scope = nock(BACKEND, {
      reqheaders: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
    })
      .post("/versions", PAYLOAD)
      .reply(204);

    await expect(publish(publishOptions())).resolves.toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  it("lists each field failure of a 400 without retrying", async () => {
    nock(BACKEND)
      .post("/versions")
      .reply(400, {
        failures: [
          { field: "url", message: "must use https" },
          { field: "sha256sum", message: "must be 64 hex characters" },
        ],
      });
    const opts = publishOptions();

    expect(await publishFailure(opts)).toBe(
      [
        "Release rejected by sdkman-state:",
        "- url: must use https",
        "- sha256sum: must be 64 hex characters",
      ].join("\n"),
    );
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it.each([
    ["no failures", { message: "Invalid request" }],
    ["empty failures", { failures: [], message: "Invalid request" }],
  ])("appends the body message to a 400 with %s", async (_, body) => {
    nock(BACKEND).post("/versions").reply(400, body);

    expect(await publishFailure()).toBe(
      "Release rejected by sdkman-state: Invalid request",
    );
  });

  it("appends the raw body to a non-JSON 400", async () => {
    nock(BACKEND).post("/versions").reply(400, "<html>Bad Request</html>");

    expect(await publishFailure()).toBe(
      "Release rejected by sdkman-state: HTTP 400 <html>Bad Request</html>",
    );
  });

  it("truncates the raw body of a 400 to 500 chars", async () => {
    nock(BACKEND).post("/versions").reply(400, "x".repeat(600));

    expect(await publishFailure()).toBe(
      `Release rejected by sdkman-state: HTTP 400 ${"x".repeat(500)}`,
    );
  });

  it("reports only the status for an empty 400", async () => {
    nock(BACKEND).post("/versions").reply(400);

    expect(await publishFailure()).toBe(
      "Release rejected by sdkman-state: HTTP 400",
    );
  });

  it("fails a 401 without retrying", async () => {
    nock(BACKEND).post("/versions").reply(401);
    const opts = publishOptions();

    expect(await publishFailure(opts)).toBe(
      "Token rejected by sdkman-state (unexpected immediately after login).",
    );
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it("fails a 403 naming the vendor and candidate", async () => {
    nock(BACKEND).post("/versions").reply(403, { message: "Forbidden" });
    const opts = publishOptions();

    expect(await publishFailure(opts)).toBe(
      `Vendor ${EMAIL} is not authorised to publish gradle.`,
    );
    expect(opts.sleep).not.toHaveBeenCalled();
  });

  it("fails a 5xx after 3 attempts with the body message", async () => {
    nock(BACKEND)
      .post("/versions")
      .times(3)
      .reply(500, { message: "Candidate registry unavailable" });
    const opts = publishOptions();

    expect(await publishFailure(opts)).toBe(
      "Publish failed: HTTP 500 Candidate registry unavailable",
    );
    expect(opts.sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("fails a 429 after 3 attempts", async () => {
    nock(BACKEND).post("/versions").times(3).reply(429);
    const opts = publishOptions();

    expect(await publishFailure(opts)).toBe("Publish failed: HTTP 429");
    expect(opts.sleep).toHaveBeenCalledTimes(2);
  });

  it("succeeds when a later attempt succeeds", async () => {
    nock(BACKEND).post("/versions").reply(503).post("/versions").reply(204);
    const opts = publishOptions();

    await expect(publish(opts)).resolves.toBeUndefined();
    expect(opts.info).toHaveBeenCalledWith(
      "Publish attempt 1 of 3 failed (HTTP 503); retrying in 1000 ms",
    );
  });

  // Following a redirect could replay the token to another host, and the
  // contract defines only 204 as success.
  it("fails a 302 without following it", async () => {
    nock(BACKEND)
      .post("/versions")
      .reply(302, "", { Location: "https://elsewhere.example.test/versions" });

    expect(await publishFailure()).toBe("Publish failed: HTTP 302");
  });

  it.each([200, 201, 404, 409])(
    "fails any other status %i with the generic message",
    async (status) => {
      nock(BACKEND).post("/versions").reply(status);

      expect(await publishFailure()).toBe(`Publish failed: HTTP ${status}`);
    },
  );

  it("appends the body message to a generic failure", async () => {
    nock(BACKEND).post("/versions").reply(404, { message: "Not found" });

    expect(await publishFailure()).toBe("Publish failed: HTTP 404 Not found");
  });

  it("fails a network error after 3 attempts", async () => {
    nock(BACKEND).post("/versions").times(3).replyWithError("socket hang up");
    const opts = publishOptions();

    const message = await publishFailure(opts);

    expect(message).toMatch(/^Publish failed: .*socket hang up/);
    expect(opts.sleep).toHaveBeenCalledTimes(2);
  });

  it("maps a thrown non-fetch error to its message", async () => {
    const opts = {
      ...publishOptions(),
      fetch: jest.fn(async () => {
        throw new Error("boom");
      }),
    };

    expect(await publishFailure(opts)).toBe("Publish failed: boom");
    expect(opts.fetch).toHaveBeenCalledTimes(3);
    expect(opts.fetch.mock.calls[0][1].redirect).toBe("manual");
  });
});
