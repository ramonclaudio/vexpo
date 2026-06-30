import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/convex-env.ts", () => ({
  envMap: vi.fn(),
  envSetFromFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/eas-env.ts", () => ({
  envList: vi.fn(),
  envPush: vi.fn().mockResolvedValue(undefined),
  resolveProjectId: vi.fn(),
}));

import { applyPlan, type FilePlan } from "../../src/commands/env/push.ts";
import { envSetFromFile } from "../../src/lib/convex-env.ts";
import { buildPlan, type EnvSource } from "../../src/lib/env-files.ts";

const setFromFileSpy = envSetFromFile as unknown as ReturnType<typeof vi.fn>;

function convexUpdatePlan(): FilePlan {
  const source: EnvSource = {
    path: ".env.local",
    channel: "dev",
    entries: new Map([["BETTER_AUTH_SECRET", "new-secret-value"]]),
  };
  const [entry] = buildPlan([source]);
  const destination = entry.destinations.find((d) => d.type === "convex")!;
  return {
    sourceFile: source.path,
    channel: "dev",
    rows: [{ entry, resolved: [{ destination, current: "old-secret", status: "update" }] }],
  };
}

beforeEach(() => {
  setFromFileSpy.mockReset();
  setFromFileSpy.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyPlan convex overwrite", () => {
  // The plan + interactive confirm already gate overwrites, so the convex
  // --from-file batch must pass --force to overwrite, matching the EAS path.
  // Otherwise re-pushing a changed secret fails the whole convex batch in CI
  // and on a TTY-confirmed run.
  it("forces the convex --from-file batch", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await applyPlan(convexUpdatePlan());
    expect(setFromFileSpy).toHaveBeenCalledTimes(1);
    const force = setFromFileSpy.mock.calls[0]?.[2]?.force;
    expect(force).toBe(true);
  });
});
