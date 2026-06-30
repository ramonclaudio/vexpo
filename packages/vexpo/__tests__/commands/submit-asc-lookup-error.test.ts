import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the REAL asc.ts so the resolveAscApp -> ensureAscAppId -> submit path
// runs end to end. Only the lowest layers are mocked: cached creds present (so
// ascKeyEnv passes) and an apps.list that throws (a transient ASC lookup error).
vi.mock("../../src/lib/asc-state.ts", () => ({
  loadAscCreds: vi.fn(),
}));

const appsListSpy = vi.fn();
vi.mock("../../src/lib/asc-api.ts", () => ({
  makeAscClient: vi.fn(() => ({ apps: { list: appsListSpy } })),
}));

vi.mock("../../src/lib/eas-cli.ts", () => ({
  easSpawn: vi.fn(),
}));

vi.mock("../../src/lib/env-local.ts", () => ({
  readAll: vi.fn(),
  requireBundleId: vi.fn(),
}));

const easJsonContent = { value: "{}" };
vi.mock("node:fs", async () => {
  const actual = (await vi.importActual("node:fs")) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => easJsonContent.value),
  };
});

import { runSubmit } from "../../src/commands/submit.ts";
import { loadAscCreds } from "../../src/lib/asc-state.ts";
import { easSpawn } from "../../src/lib/eas-cli.ts";
import { readAll, requireBundleId } from "../../src/lib/env-local.ts";

const loadAscCredsSpy = loadAscCreds as unknown as ReturnType<typeof vi.fn>;
const easSpawnSpy = easSpawn as unknown as ReturnType<typeof vi.fn>;
const readAllSpy = readAll as unknown as ReturnType<typeof vi.fn>;
const requireBundleIdSpy = requireBundleId as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  loadAscCredsSpy.mockReset();
  appsListSpy.mockReset();
  easSpawnSpy.mockReset();
  readAllSpy.mockReset();
  requireBundleIdSpy.mockReset();

  loadAscCredsSpy.mockResolvedValue({
    issuerId: "11111111-2222-3333-4444-555555555555",
    keyId: "ABCDE12345",
    privateKey: { path: "/tmp/fake.p8" },
  });
  // the ASC apps lookup itself fails (network / API down), NOT a zero-apps result
  appsListSpy.mockRejectedValue(new Error("ASC network down"));
  requireBundleIdSpy.mockResolvedValue("com.vexpo.vexpo");
  readAllSpy.mockResolvedValue(new Map([["EXPO_PUBLIC_APP_BUNDLE_ID", "com.vexpo.vexpo"]]));
  easSpawnSpy.mockResolvedValue(0);
  easJsonContent.value = "{}";
});

afterEach(() => vi.clearAllMocks());

describe("runSubmit on a transient ASC lookup error", () => {
  it("surfaces the real error, not the misleading 'no app record' guidance", async () => {
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exit = await runSubmit({});
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(exit).toBe(1);
    expect(easSpawnSpy).not.toHaveBeenCalled();
    // the creds are proven present, so this can only be a lookup failure
    expect(out).not.toContain("no App Store Connect app record");
    expect(out).toContain("ASC network down");
  });

  it("proceeds when eas.json already carries ascAppId for the profile", async () => {
    easJsonContent.value = JSON.stringify({
      submit: { testflight: { ios: { ascAppId: "1234567890" } } },
    });
    const exit = await runSubmit({});
    expect(exit).toBe(0);
    expect(easSpawnSpy).toHaveBeenCalledTimes(1);
  });
});
