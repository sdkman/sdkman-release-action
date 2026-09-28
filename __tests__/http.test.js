const { readBody } = require("../src/http");

describe("readBody", () => {
  it("parses a JSON object body", async () => {
    const body = '{"message":"bad","failures":[]}';
    const response = new Response(body, { status: 400 });

    await expect(readBody(response)).resolves.toEqual({
      text: body,
      json: { message: "bad", failures: [] },
    });
  });

  it("returns empty text and no json for an empty body", async () => {
    await expect(
      readBody(new Response(null, { status: 204 })),
    ).resolves.toEqual({ text: "", json: undefined });
    await expect(readBody(new Response("", { status: 500 }))).resolves.toEqual({
      text: "",
      json: undefined,
    });
  });

  it("returns the raw text and no json for a non-JSON body", async () => {
    const body = "<html>Bad Gateway</html>";

    await expect(
      readBody(new Response(body, { status: 502 })),
    ).resolves.toEqual({ text: body, json: undefined });
  });

  // A bare JSON scalar has no `message` or `failures` to read, so callers
  // treat it like a non-JSON body.
  it("returns no json for a JSON scalar body", async () => {
    await expect(readBody(new Response("null"))).resolves.toEqual({
      text: "null",
      json: undefined,
    });
    await expect(readBody(new Response('"oops"'))).resolves.toEqual({
      text: '"oops"',
      json: undefined,
    });
  });

  // A body that fails mid-stream must not mask the status code either.
  it("returns empty text when the body cannot be read", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("socket hang up"));
      },
    });

    await expect(
      readBody(new Response(stream, { status: 503 })),
    ).resolves.toEqual({ text: "", json: undefined });
  });
});
