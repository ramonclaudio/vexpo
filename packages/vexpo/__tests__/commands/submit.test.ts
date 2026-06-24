import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/commands/asc.ts", () => ({
  ascKeyEnv: vi.fn(),
  ensureAscAppId: vi.fn(),
}));

vi.mock("../../src/lib/eas-cli.ts", () => ({
  easSpawn: vi.fn(),
}));

vi.mock("../../src/lib/env-local.ts", () => ({
  readOne: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = (await vi.importActual("node:fs")) as Record<string, unknown>;
  return { ...actual, existsSync: vi.fn(() => true) };
});

import { ascKeyEnv, ensureAscAppId } from "../../src/commands/asc.ts";
import { runSubmit } from "../../src/commands/submit.ts";
import { easSpawn } from "../../src/lib/eas-cli.ts";
import { readOne } from "../../src/lib/env-local.ts";

const ascKeyEnvSpy = ascKeyEnv as unknown as ReturnType<typeof vi.fn>;
const ensureAscAppIdSpy = ensureAscAppId as unknown as ReturnType<typeof vi.fn>;
const easSpawnSpy = easSpawn as unknown as ReturnType<typeof vi.fn>;
const readOneSpy = readOne as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  ascKeyEnvSpy.mockReset();
  ensureAscAppIdSpy.mockReset();
  easSpawnSpy.mockReset();
  readOneSpy.mockReset();
  ascKeyEnvSpy.mockResolvedValue({
    EXPO_ASC_API_KEY_PATH: "/tmp/fake.p8",
    EXPO_ASC_KEY_ID: "ABCDE12345",
    EXPO_ASC_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
  });
  readOneSpy.mockResolvedValue("com.vexpo.vexpo");
  ensureAscAppIdSpy.mockResolvedValue("1234567890");
  easSpawnSpy.mockResolvedValue(0);
});

afterEach(() => vi.clearAllMocks());

describe("runSubmit", () => {
  it("submits the latest build non-interactively with the cached key env", async () => {
    const exit = await runSubmit({});
    expect(exit).toBe(0);
    const [args, opts] = easSpawnSpy.mock.calls[0] as [string[], { env: Record<string, string> }];
    expect(args).toEqual([
      "submit",
      "-p",
      "ios",
      "--profile",
      "testflight",
      "--non-interactive",
      "--latest",
    ]);
    expect(opts.env.EXPO_ASC_KEY_ID).toBe("ABCDE12345");
    expect(opts.env.EXPO_ASC_API_KEY_PATH).toBe("/tmp/fake.p8");
    // process.env is forwarded too (PATH etc.), not replaced
    expect(opts.env.PATH ?? opts.env.Path).toBeDefined();
  });

  it("honors --profile and --id (specific build, no --latest)", async () => {
    const exit = await runSubmit({ profile: "production", id: "build-123" });
    expect(exit).toBe(0);
    const [args] = easSpawnSpy.mock.calls[0] as [string[]];
    expect(args).toEqual([
      "submit",
      "-p",
      "ios",
      "--profile",
      "production",
      "--non-interactive",
      "--id",
      "build-123",
    ]);
    expect(args).not.toContain("--latest");
  });

  it("returns 1 without a cached ASC key, never spawns", async () => {
    ascKeyEnvSpy.mockResolvedValueOnce(null);
    const exit = await runSubmit({});
    expect(exit).toBe(1);
    expect(easSpawnSpy).not.toHaveBeenCalled();
  });

  it("returns 1 when no ASC app record exists yet, never spawns", async () => {
    ensureAscAppIdSpy.mockResolvedValueOnce(null);
    const exit = await runSubmit({});
    expect(exit).toBe(1);
    expect(easSpawnSpy).not.toHaveBeenCalled();
  });

  it("propagates a non-zero eas submit exit", async () => {
    easSpawnSpy.mockResolvedValueOnce(7);
    const exit = await runSubmit({});
    expect(exit).toBe(7);
  });
});
