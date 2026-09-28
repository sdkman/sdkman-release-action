jest.mock("@actions/core", () => ({ setFailed: jest.fn() }));
jest.mock("../src/main", () => ({ run: jest.fn() }));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

// Requiring the entry point is what starts the run, so each test loads it in
// a fresh module registry, after stubbing `run` in that same registry.
const loadEntryPoint = (stubRun) => {
  let modules;
  jest.isolateModules(() => {
    const core = require("@actions/core");
    const { run } = require("../src/main");
    stubRun(run);
    require("../src/index");
    modules = { core, run };
  });
  return modules;
};

test("passes a run error message to core.setFailed", async () => {
  const { core } = loadEntryPoint((run) =>
    run.mockRejectedValue(
      new Error("Login failed: invalid email or password."),
    ),
  );
  await flushPromises();

  expect(core.setFailed).toHaveBeenCalledTimes(1);
  expect(core.setFailed).toHaveBeenCalledWith(
    "Login failed: invalid email or password.",
  );
});

test("does not call core.setFailed when run succeeds", async () => {
  const { core } = loadEntryPoint((run) => run.mockResolvedValue(undefined));
  await flushPromises();

  expect(core.setFailed).not.toHaveBeenCalled();
});

test("calls run with core, the global fetch and a working sleep", async () => {
  const { core, run } = loadEntryPoint((run) =>
    run.mockResolvedValue(undefined),
  );
  await flushPromises();

  expect(run).toHaveBeenCalledTimes(1);
  const [{ core: passedCore, fetch, sleep }] = run.mock.calls[0];
  expect(passedCore).toBe(core);
  expect(fetch).toBe(globalThis.fetch);
  await expect(sleep(1)).resolves.toBeUndefined();
});
