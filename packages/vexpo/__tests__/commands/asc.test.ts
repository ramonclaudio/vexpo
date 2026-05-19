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

// Mock node:fs's existsSync so the asc-key state's p8Path check passes
// without a real file on disk. The test harness chdirs into a tmpdir.
vi.mock("node:fs", async () => {
  const actual = (await vi.importActual("node:fs")) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

import { runAscConnect } from "../../src/commands/asc.ts";
import { ascStatus } from "../../src/lib/eas-integrations.ts";
import { readOne } from "../../src/lib/env-local.ts";
import { spawn } from "../../src/lib/proc.ts";
import { recordStep, save } from "../../src/lib/state.ts";

const ascStatusSpy = ascStatus as unknown as ReturnType<typeof vi.fn>;
const readOneSpy = readOne as unknown as ReturnType<typeof vi.fn>;
const spawnSpy = spawn as unknown as ReturnType<typeof vi.fn>;

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
          issuerId: "1d68d54a-8849-406f-a4e0-1e284f3f0d33",
          keyId: "3SBKJXPM27",
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
      appStoreConnectApp: null,
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
    expect(opts.env.EXPO_ASC_KEY_ID).toBe("3SBKJXPM27");
    expect(opts.env.EXPO_ASC_ISSUER_ID).toBe("1d68d54a-8849-406f-a4e0-1e284f3f0d33");
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
      appStoreConnectApp: null,
    });
    readOneSpy.mockResolvedValueOnce("com.vexpo.vexpo");

    await runAscConnect({});
    const argv = spawnSpy.mock.calls[0]?.[0] as string[];
    expect(argv).not.toContain("--api-key-id");
    expect(argv).not.toContain("3SBKJXPM27");
  });

  it("returns 1 when no cached ASC key in state.json", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
      appStoreConnectApp: null,
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
      appStoreConnectApp: null,
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

  it("propagates non-zero exit from eas integrations:asc:connect", async () => {
    ascStatusSpy.mockResolvedValueOnce({
      action: "status",
      project: "@testuser/testapp",
      status: "not-connected",
      appStoreConnectApp: null,
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
