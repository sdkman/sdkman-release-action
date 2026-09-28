describe("test harness", () => {
  // Matching nock's message proves the setup file blocked the request, rather
  // than an incidental DNS failure for the .invalid TLD.
  it("blocks real network access from fetch", async () => {
    await expect(fetch("https://example.invalid")).rejects.toThrow(
      /Disallowed net connect/,
    );
  });
});
