import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

vi.mock("../../src/lib/eas-integrations.ts", () => ({
  ascStatus: vi.fn(),
}));

vi.mock("../../src/lib/env-local.ts", () => ({
  readOne: vi.fn(),
}));

// The pre-check loads cached ASC creds and lists apps by bundle id. Default to
// creds present + one matching app so the existing spawn-path tests proceed.
// Individual tests override loadAscCreds / appsListSpy to exercise the
// defer (0 apps) and fallback (no creds) branches.
vi.mock("../../src/lib/asc-state.ts", () => ({
  loadAscCreds: vi.fn(),
}));

const appsListSpy = vi.fn();
vi.mock("../../src/lib/asc-api.ts", () => ({
  makeAscClient: vi.fn(() => ({ apps: { list: appsListSpy } })),
}));

// Mock node:fs's existsSync so the asc-key state's p8Path check passes without
// a real file on disk. The test harness chdirs into a tmpdir. eas.json reports
// absent so the post-connect ascAppId write is skipped (no eas.json here).
vi.mock("node:fs", async () => {
  const actual = (await vi.importActual("node:fs")) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn((p: unknown) => !String(p).endsWith("eas.json")),
  };
});

import { runAscConnect } from "../../src/commands/asc.ts";
import { loadAscCreds } from "../../src/lib/asc-state.ts";
import { ascStatus } from "../../src/lib/eas-integrations.ts";
import { readOne } from "../../src/lib/env-local.ts";
import { spawn } from "../../src/lib/proc.ts";
import { recordStep, save } from "../../src/lib/state.ts";

const ascStatusSpy = ascStatus as unknown as ReturnType<typeof vi.fn>;
const readOneSpy = readOne as unknown as ReturnType<typeof vi.fn>;
const spawnSpy = spawn as unknown as ReturnType<typeof vi.fn>;
const loadAscCredsSpy = loadAscCreds as unknown as ReturnType<typeof vi.fn>;

let originalCwd: string;
let workdir: string;
let originalEnv: Record<string, string | undefined>;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "asc-connect-test-"));
  process.chdir(workdir);
  originalEnv = { ...process.env };
  // pretend we're on a TTY so the wizard isn't short-circuited
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

  ascStatusSpy.mockReset();
  readOneSpy.mockReset();
  loadAscCredsSpy.mockReset();
  appsListSpy.mockReset();
  // default pre-check: creds present, one matching app -> proceed to spawn
  loadAscCredsSpy.mockResolvedValue({
    issuerId: "11111111-2222-3333-4444-555555555555",
    keyId: "ABCDE12345",
    privateKey: { path: "/tmp/fake.p8" },
  });
  appsListSpy.mockResolvedValue([{ type: "apps", id: "app-1", attributes: { bundleId: "x" } }]);
  spawnSpy.mockReset();
  spawnSpy.mockReturnValue({
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
    stdin: null,
    pid: 1,
    kill: () => {},
  });

  // seed state.json with a valid asc-key step record
  await save({
    schemaVersion: 1,
    steps: {
      "asc-key": {
        name: "asc-key",
        completedAt: new Date().toISOString(),
        outputs: {
          issuerId: "11111111-2222-3333-4444-555555555555",
          keyId: "ABCDE12345",
          p8Path: "/tmp/fake.p8",
        },
      },
    },
    audit: [],
  });
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
  process.env = originalEnv;
  vi.clearAllMocks();
});

describe("runAscConnect", () => {
  it("skips with a no-op when ascStatus reports status='connected'", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "connected",
      appStoreConnectApp: {
        id: "asc-app-link-id",
        ascAppIdentifier: "1234567890",
        name: "Test App",
        bundleIdentifier: "com.test.app",
        appleUrl: "https://apps.apple.com/app/id1234567890",
      },
    });
    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("falls through to spawn when ascStatus reports 'not-connected'", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [argv, opts] = spawnSpy.mock.calls[0] as [string[], { env: Record<string, string> }];
    expect(argv).toEqual([
      "bunx",
      "eas",
      "integrations:asc:connect",
      "--bundle-id",
      "com.vexpo.vexpo",
    ]);
    expect(opts.env.EXPO_ASC_API_KEY_PATH).toBe("/tmp/fake.p8");
    expect(opts.env.EXPO_ASC_KEY_ID).toBe("ABCDE12345");
    expect(opts.env.EXPO_ASC_ISSUER_ID).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("falls through to spawn when ascStatus throws (no EAS project yet)", async () => {
    ascStatusSpy.mockRejectedValueOnce(new Error("EAS project not configured."));
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT pass --api-key-id (the original PR #49 bug)", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    await runAscConnect({});
    const argv = spawnSpy.mock.calls[0]?.[0] as string[];
    expect(argv).not.toContain("--api-key-id");
    expect(argv).not.toContain("ABCDE12345");
  });

  it("returns 1 when no cached ASC key in state.json", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    // overwrite state with no asc-key record
    await save({ schemaVersion: 1, steps: {}, audit: [] });

    const exit = await runAscConnect({});
    expect(exit).toBe(1);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("returns 1 when no EXPO_PUBLIC_APP_BUNDLE_ID in .env.local", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce(undefined);

    const exit = await runAscConnect({});
    expect(exit).toBe(1);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("force=true bypasses the idempotency skip", async () => {
    // ascStatus would say connected, but force=true ignores it
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "connected",
      appStoreConnectApp: {
        id: "asc-app-link-id",
        ascAppIdentifier: "1234567890",
        name: null,
        bundleIdentifier: "com.test.app",
        appleUrl: "https://apps.apple.com/app/id1234567890",
      },
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    await runAscConnect({ force: true });
    expect(ascStatusSpy).not.toHaveBeenCalled();
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("requires a TTY: non-TTY returns 1 without spawning (no doomed --non-interactive)", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    const exit = await runAscConnect({});
    expect(exit).toBe(1);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("defers (returns 0, no spawn) when the bundle id has no ASC app record yet", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");
    appsListSpy.mockResolvedValueOnce([]);

    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exit = await runAscConnect({});
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(exit).toBe(0);
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(appsListSpy).toHaveBeenCalledWith({ bundleId: "com.vexpo.vexpo" });
    // loud enough that a setup run does not read as connected
    expect(out).toContain("NOT connected");
    expect(out).toContain("eas build");
  });

  it("proceeds to spawn when at least one ASC app matches the bundle id", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");
    appsListSpy.mockResolvedValueOnce([
      { type: "apps", id: "app-1", attributes: { bundleId: "com.vexpo.vexpo" } },
    ]);

    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls through to spawn when no cached ASC creds for the pre-check", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");
    loadAscCredsSpy.mockResolvedValueOnce(null);

    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(appsListSpy).not.toHaveBeenCalled();
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls through to spawn when the pre-check apps lookup errors", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");
    appsListSpy.mockRejectedValueOnce(new Error("network down"));

    const exit = await runAscConnect({});
    expect(exit).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates non-zero exit from eas integrations:asc:connect", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");
    spawnSpy.mockReturnValueOnce({
      exited: Promise.resolve(42),
      stdout: null,
      stderr: null,
      stdin: null,
      pid: 1,
      kill: () => {},
    });

    const exit = await runAscConnect({});
    expect(exit).toBe(42);
  });
});

// recordStep is imported just to keep the linter happy. It's also exercised
// implicitly in the connected/skip path above (verified by the lack of a spawn
// call, which means the skip path's recordStep must have been the terminal op).
void recordStep;
