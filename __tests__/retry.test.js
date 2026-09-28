const { parseRetryAfter, withRetry } = require("../src/retry");

const respond = (status, headers = {}) =>
  new Response(null, { status, headers });

// Feeds `withRetry` a fixed sequence of outcomes: a status code, a Response,
// or an Error to throw.
function sequence(...outcomes) {
  const attempt = jest.fn(async () => {
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return typeof next === "number" ? respond(next) : next;
  });
  return attempt;
}

function options() {
  return {
    sleep: jest.fn(async () => {}),
    info: jest.fn(),
    label: "Publish",
  };
}

describe("parseRetryAfter", () => {
  const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");

  it("converts delta-seconds to milliseconds", () => {
    expect(parseRetryAfter("5", now)).toBe(5000);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
  });

  it("converts an HTTP-date to the milliseconds until then", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:12 GMT", now)).toBe(12000);
  });

  it("treats an HTTP-date in the past as no wait", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:27:00 GMT", now)).toBe(0);
  });

  it("returns undefined when the header is absent or invalid", () => {
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter("", now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter("-5", now)).toBeUndefined();
  });
});

describe("withRetry", () => {
  it("returns a success at once without sleeping", async () => {
    const attempt = sequence(204);
    const opts = options();

    const response = await withRetry(attempt, opts);

    expect(response.status).toBe(204);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(opts.sleep).not.toHaveBeenCalled();
    expect(opts.info).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 422])(
    "does not retry a %i, which a retry cannot fix",
    async (status) => {
      const attempt = sequence(status);
      const opts = options();

      const response = await withRetry(attempt, opts);

      expect(response.status).toBe(status);
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(opts.sleep).not.toHaveBeenCalled();
    },
  );

  it.each([429, 500, 502, 503])("retries a %i", async (status) => {
    const attempt = sequence(status, 204);
    const opts = options();

    const response = await withRetry(attempt, opts);

    expect(response.status).toBe(204);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error", async () => {
    const attempt = sequence(new Error("socket hang up"), 204);
    const opts = options();

    const response = await withRetry(attempt, opts);

    expect(response.status).toBe(204);
    expect(opts.info).toHaveBeenCalledWith(
      "Publish attempt 1 of 3 failed (socket hang up); retrying in 1000 ms",
    );
  });

  it("succeeds on the last attempt after two failures", async () => {
    const attempt = sequence(503, new Error("ECONNRESET"), 204);
    const opts = options();

    const response = await withRetry(attempt, opts);

    expect(response.status).toBe(204);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("backs off 1000 ms then 2000 ms and makes at most 3 attempts", async () => {
    const attempt = sequence(500, 502, 503);
    const opts = options();

    const response = await withRetry(attempt, opts);

    expect(response.status).toBe(503);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(opts.sleep.mock.calls).toEqual([[1000], [2000]]);
  });

  it("logs the label, attempt number, status and wait before each retry", async () => {
    const attempt = sequence(500, 429, 204);
    const opts = options();

    await withRetry(attempt, opts);

    expect(opts.info.mock.calls).toEqual([
      ["Publish attempt 1 of 3 failed (HTTP 500); retrying in 1000 ms"],
      ["Publish attempt 2 of 3 failed (HTTP 429); retrying in 2000 ms"],
    ]);
  });

  it("rethrows the last error when the last attempt throws", async () => {
    const attempt = sequence(503, 503, new Error("ETIMEDOUT"));
    const opts = options();

    await expect(withRetry(attempt, opts)).rejects.toThrow("ETIMEDOUT");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("waits for a delta-seconds Retry-After instead of the backoff", async () => {
    const attempt = sequence(respond(429, { "Retry-After": "7" }), 204);
    const opts = options();

    await withRetry(attempt, opts);

    expect(opts.sleep).toHaveBeenCalledWith(7000);
  });

  it("waits for an HTTP-date Retry-After instead of the backoff", async () => {
    const at = new Date(Date.now() + 60 * 60 * 1000).toUTCString();
    const attempt = sequence(respond(503, { "Retry-After": at }), 204);
    const opts = options();

    await withRetry(attempt, opts);

    // An hour away, so the 30 s cap applies regardless of clock drift in the test.
    expect(opts.sleep).toHaveBeenCalledWith(30000);
  });

  it("caps a long Retry-After at 30000 ms", async () => {
    const attempt = sequence(respond(429, { "Retry-After": "120" }), 204);
    const opts = options();

    await withRetry(attempt, opts);

    expect(opts.sleep).toHaveBeenCalledWith(30000);
  });

  it("falls back to the backoff when Retry-After is invalid", async () => {
    const attempt = sequence(respond(503, { "Retry-After": "later" }), 204);
    const opts = options();

    await withRetry(attempt, opts);

    expect(opts.sleep).toHaveBeenCalledWith(1000);
  });
});
