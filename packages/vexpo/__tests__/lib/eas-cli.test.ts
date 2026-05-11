import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "{}", stderr: "" }),
  spawn: vi.fn(() => ({
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
    stdin: null,
    pid: 1,
    kill: () => {},
  })),
}));

vi.mock("../../src/lib/pkg-manager.ts", () => ({
  dlx: () => "bunx",
}));

import { easJson, easSpawn, easText } from "../../src/lib/eas-cli.ts";
import { run, spawn } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;
const spawnSpy = spawn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  runSpy.mockReset();
  spawnSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("easJson", () => {
  it("appends --json and --non-interactive when not present", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: '{"ok":true}', stderr: "" });
    await easJson(["build:list"]);
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual(["bunx", "eas", "build:list", "--json", "--non-interactive"]);
  });

  it("does not duplicate --json or --non-interactive", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "[]", stderr: "" });
    await easJson(["build:list", "--json", "--non-interactive"]);
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    const jsonCount = argv.filter((a) => a === "--json").length;
    const niCount = argv.filter((a) => a === "--non-interactive").length;
    expect(jsonCount).toBe(1);
    expect(niCount).toBe(1);
  });

  it("parses stdout as JSON", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: '[{"id":"abc"}]', stderr: "" });
    const data = await easJson<Array<{ id: string }>>(["build:list"]);
    expect(data).toEqual([{ id: "abc" }]);
  });

  it("throws on non-zero exit with stderr tail", async () => {
    runSpy.mockResolvedValue({ code: 1, stdout: "", stderr: "first line\nfinal error" });
    await expect(easJson(["build:list"])).rejects.toThrow(/final error/);
  });

  it("throws on invalid JSON output", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "not json", stderr: "" });
    await expect(easJson(["build:list"])).rejects.toThrow(/non-JSON/);
  });

  it("compacts undefined / null / false from argv", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "{}", stderr: "" });
    await easJson(["build:list", undefined, null, false, "--limit", 10]);
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual([
      "bunx",
      "eas",
      "build:list",
      "--limit",
      "10",
      "--json",
      "--non-interactive",
    ]);
  });
});

describe("easSpawn", () => {
  it("forwards argv to spawn with stdio inherit", async () => {
    spawnSpy.mockReturnValueOnce({
      exited: Promise.resolve(0),
      stdout: null,
      stderr: null,
      stdin: null,
      pid: 1,
      kill: () => {},
    });
    const code = await easSpawn(["build", "--platform", "ios"]);
    expect(code).toBe(0);
    const args = spawnSpy.mock.calls[0];
    expect(args[0]).toEqual(["bunx", "eas", "build", "--platform", "ios"]);
    expect(args[1]).toMatchObject({ stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  });
});

describe("easText", () => {
  it("returns raw stdout/stderr/code from run", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "hello", stderr: "" });
    const result = await easText(["whoami"]);
    expect(result).toEqual({ code: 0, stdout: "hello", stderr: "" });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual(["bunx", "eas", "whoami"]);
  });
});
