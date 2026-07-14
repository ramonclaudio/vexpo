/**
 * eas-cli 21's `integrations:convex:connect` writes only CONVEX_DEPLOY_KEY to
 * .env.local (no CONVEX_DEPLOYMENT line), so adopt must recover the deployment
 * ref from the key instead of bailing with "nothing to adopt".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/commands/convex.ts", () => ({ runConvex: vi.fn().mockResolvedValue(0) }));
vi.mock("../../src/commands/better-auth.ts", () => ({
  runBetterAuth: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../src/lib/convex-management.ts", () => ({
  listProjectDeployments: vi.fn().mockResolvedValue(null),
  deploymentsOfType: vi.fn().mockReturnValue([]),
  describeDeployment: vi.fn().mockReturnValue(""),
}));
vi.mock("../../src/lib/eas-project.ts", () => ({
  envList: vi.fn().mockResolvedValue(null),
  resolveProjectId: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../src/lib/env-local.ts", () => ({
  readAll: vi.fn(),
  ensureLine: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/convex-env.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/convex-env.ts")>()),
  envMap: vi.fn().mockResolvedValue(new Map()),
}));

import { runAdopt } from "../../src/commands/adopt.ts";
import { ensureLine, readAll } from "../../src/lib/env-local.ts";

const readAllSpy = readAll as unknown as ReturnType<typeof vi.fn>;
const ensureLineSpy = ensureLine as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAdopt deployment resolution", () => {
  it("derives and persists CONVEX_DEPLOYMENT from the integration's deploy key", async () => {
    readAllSpy.mockResolvedValue(
      new Map([["CONVEX_DEPLOY_KEY", "dev:quick-fox-123|eyJ2MiI6IjAxIn0="]]),
    );
    expect(await runAdopt({ skipDevSteps: true })).toBe(0);
    expect(ensureLineSpy).toHaveBeenCalledWith("CONVEX_DEPLOYMENT", "dev:quick-fox-123");
  });

  it("adopts an existing CONVEX_DEPLOYMENT line without rewriting it", async () => {
    readAllSpy.mockResolvedValue(new Map([["CONVEX_DEPLOYMENT", "dev:quick-fox-12"]]));
    expect(await runAdopt({ skipDevSteps: true })).toBe(0);
    expect(ensureLineSpy).not.toHaveBeenCalled();
  });

  it("bails when .env.local has neither a deployment nor a deploy key", async () => {
    readAllSpy.mockResolvedValue(new Map());
    expect(await runAdopt({ skipDevSteps: true })).toBe(1);
  });

  it("does not adopt from a project-scoped key, which names no deployment", async () => {
    readAllSpy.mockResolvedValue(new Map([["CONVEX_DEPLOY_KEY", "project:acme:my-app|token"]]));
    expect(await runAdopt({ skipDevSteps: true })).toBe(1);
    expect(ensureLineSpy).not.toHaveBeenCalled();
  });
});
