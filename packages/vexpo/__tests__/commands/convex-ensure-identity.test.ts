import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/convex-env.ts", () => ({ envSet: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/env-local.ts", () => ({ ensureLine: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/app.ts", () => ({
  appleTeamIdFallback: vi.fn().mockResolvedValue(null),
  bundleIdFallback: vi.fn().mockResolvedValue(null),
  pkgName: vi.fn().mockResolvedValue("app"),
  scheme: vi.fn().mockResolvedValue("app"),
}));

import { ensureIdentity } from "../../src/commands/convex.ts";
import { envSet } from "../../src/lib/convex-env.ts";
import { ensureLine } from "../../src/lib/env-local.ts";

const envSetSpy = envSet as unknown as ReturnType<typeof vi.fn>;
const ensureLineSpy = ensureLine as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
});

afterEach(() => vi.clearAllMocks());

describe("ensureIdentity", () => {
  it("syncs the existing .env.local bundle id to Convex without rewriting the env line", async () => {
    await ensureIdentity(new Map([["EXPO_PUBLIC_APP_BUNDLE_ID", "com.acme.foobar"]]));

    // pushes the value that actually lives in .env.local
    expect(envSetSpy).toHaveBeenCalledWith("APP_BUNDLE_ID", "com.acme.foobar");
    // does not overwrite the env line it just read
    const bundleWrite = ensureLineSpy.mock.calls.find((c) => c[0] === "EXPO_PUBLIC_APP_BUNDLE_ID");
    expect(bundleWrite).toBeUndefined();
  });

  it("does not push APP_BUNDLE_ID when none is set and non-TTY skips the prompt", async () => {
    await ensureIdentity(new Map());
    const bundlePush = envSetSpy.mock.calls.find((c) => c[0] === "APP_BUNDLE_ID");
    expect(bundlePush).toBeUndefined();
  });
});
