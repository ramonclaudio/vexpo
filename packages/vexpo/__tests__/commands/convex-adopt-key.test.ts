/**
 * `vexpo lite` after `eas integrations:convex:connect`: .env.local holds only
 * CONVEX_DEPLOY_KEY, and runConvex must connect to the key's deployment
 * instead of provisioning a fresh project (an EAS-managed team rejects the
 * create with "is managed by oauth:...", or a login prompt kills non-TTY runs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("../../src/lib/env-local.ts", () => ({
  readAll: vi.fn(async () => new Map(store)),
  ensureLine: vi.fn(async (key: string, value: string) => {
    if (!store.has(key)) store.set(key, value);
  }),
  removeLines: vi.fn(async (keys: readonly string[]) => {
    for (const k of keys) store.delete(k);
  }),
}));
vi.mock("../../src/lib/proc.ts", () => ({
  spawn: vi.fn(() => ({ exited: Promise.resolve(0) })),
}));
vi.mock("../../src/lib/convex-management.ts", () => ({
  checkToken: vi.fn().mockResolvedValue("valid"),
}));
vi.mock("../../src/lib/state.ts", () => ({ recordStep: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/app.ts", () => ({
  appleTeamIdFallback: vi.fn().mockResolvedValue(null),
  bundleIdFallback: vi.fn().mockResolvedValue(null),
  pkgName: vi.fn().mockResolvedValue("app"),
  scheme: vi.fn().mockResolvedValue("app"),
}));
vi.mock("../../src/lib/convex-env.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/convex-env.ts")>()),
  envSet: vi.fn().mockResolvedValue(undefined),
}));

import { runConvex } from "../../src/commands/convex.ts";
import { ensureLine } from "../../src/lib/env-local.ts";
import { spawn } from "../../src/lib/proc.ts";

const spawnSpy = spawn as unknown as ReturnType<typeof vi.fn>;
const ensureLineSpy = ensureLine as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
});

afterEach(() => {
  delete process.env.CONVEX_DEPLOYMENT;
});

describe("runConvex with an integration-provisioned deployment", () => {
  it("connects to the deploy key's deployment instead of provisioning", async () => {
    store.set("CONVEX_DEPLOY_KEY", "dev:quick-fox-123|eyJ2MiI6IjAxIn0=");
    store.set("EXPO_PUBLIC_CONVEX_URL", "https://quick-fox-123.convex.cloud");

    expect(await runConvex({})).toBe(0);
    expect(ensureLineSpy).toHaveBeenCalledWith("CONVEX_DEPLOYMENT", "dev:quick-fox-123");
    const devArgs = spawnSpy.mock.calls[0]?.[0] as string[];
    expect(devArgs).toContain("dev");
    expect(devArgs).not.toContain("--configure");
  });

  it("still provisions when .env.local has neither a deployment nor a key", async () => {
    await runConvex({});
    const devArgs = spawnSpy.mock.calls[0]?.[0] as string[];
    expect(devArgs).toContain("--configure");
  });
});
