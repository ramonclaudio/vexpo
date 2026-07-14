import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Orchestration test for `runSetup` (the `vexpo lite` / `vexpo full` engine).
// We mock the 13 `run*` step modules + the probe's lib deps so the test asserts
// WHICH steps run (and in what order) for lite vs full, without touching any
// external service. `--force` makes `shouldRun` return "missing" before any
// live-check (setup.ts:193), so the probe is side-effect-free here.

const h = vi.hoisted(() => {
  const calls: string[] = [];
  const r = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      return 0;
    });
  return {
    calls,
    runAccounts: r("accounts"),
    runRebrand: r("rebrand"),
    runConvex: r("convex"),
    runBetterAuth: r("better-auth"),
    runResend: r("resend"),
    runReviewAccount: r("review-account"),
    runEas: r("eas"),
    runAppleCredentials: r("apple-credentials"),
    runAscKey: r("asc-key"),
    runEasRotationSecrets: r("eas-rotation-secrets"),
    runAppleJwt: r("apple-jwt"),
    runServicesId: r("services-id"),
    runAscConnect: r("asc-connect"),
  };
});

vi.mock("../../src/commands/accounts.ts", () => ({ runAccounts: h.runAccounts }));
vi.mock("../../src/commands/rebrand.ts", () => ({ runRebrand: h.runRebrand }));
vi.mock("../../src/commands/convex.ts", () => ({ runConvex: h.runConvex }));
vi.mock("../../src/commands/better-auth.ts", () => ({ runBetterAuth: h.runBetterAuth }));
vi.mock("../../src/commands/resend.ts", () => ({ runResend: h.runResend }));
vi.mock("../../src/commands/review-account.ts", () => ({ runReviewAccount: h.runReviewAccount }));
vi.mock("../../src/commands/eas.ts", () => ({ runEas: h.runEas }));
vi.mock("../../src/commands/apple/credentials.ts", () => ({
  runAppleCredentials: h.runAppleCredentials,
}));
vi.mock("../../src/commands/apple/asc-key.ts", () => ({ runAscKey: h.runAscKey }));
vi.mock("../../src/commands/apple/eas-rotation-secrets.ts", () => ({
  runEasRotationSecrets: h.runEasRotationSecrets,
}));
vi.mock("../../src/commands/apple/jwt.ts", () => ({ runAppleJwt: h.runAppleJwt }));
vi.mock("../../src/commands/apple/services-id.ts", () => ({ runServicesId: h.runServicesId }));
vi.mock("../../src/commands/asc.ts", () => ({ runAscConnect: h.runAscConnect }));

// Probe + prerequisite lib deps: benign values so the probe reports "missing"
// and nothing shells out. `access` resolves so node_modules reads as present
// (skips the install step); `proc` no-ops so xcode/expo-doctor checks are inert.
vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn(async () => ({ code: 1, stdout: "", stderr: "" })),
  spawn: vi.fn(() => ({
    exited: Promise.resolve(1),
    stdout: null,
    stderr: null,
    stdin: null,
    pid: 1,
    kill: () => {},
  })),
}));
vi.mock("../../src/lib/convex-env.ts", () => ({
  envMap: vi.fn(async () => new Map()),
  isLoggedIn: vi.fn(async () => false),
  version: vi.fn(async () => null),
}));
vi.mock("../../src/lib/eas-project.ts", () => ({
  envList: vi.fn(async () => new Map()),
  resolveProjectId: vi.fn(async () => null),
  version: vi.fn(async () => null),
  whoami: vi.fn(async () => "tester"),
}));
vi.mock("../../src/lib/env-local.ts", () => ({
  ENV_FILE: ".env.local",
  readAll: vi.fn(async () => new Map()),
  readOne: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/pkg-manager.ts", () => ({
  currentRuntime: () => "node",
  currentRuntimeVersion: () => "1.0.0",
  detectPackageManager: () => "npm",
  installCmdFor: () => ["npm", "install"],
  dlx: () => "npx",
}));
vi.mock("../../src/lib/state.ts", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  // setup imports `load as loadState`, so the export to override is `load`.
  load: vi.fn(async () => ({ schemaVersion: 1, steps: {}, audit: [] })),
  checkConcurrentRun: vi.fn(() => ({ active: false })),
  clearAll: vi.fn(async () => {}),
  isStepFresh: vi.fn(() => false),
  recordStep: vi.fn(async () => {}),
  appendAudit: vi.fn(async () => {}),
}));
vi.mock("../../src/lib/output.ts", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  askYesNo: vi.fn(async () => true),
}));
vi.mock("node:fs/promises", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  access: vi.fn(async () => {}),
}));

import { computeScope, runSetup } from "../../src/commands/setup.ts";

beforeEach(() => {
  h.calls.length = 0;
  vi.clearAllMocks();
  // maybeRunStep skips without a TTY; pretend we have one so prompts "answer" yes.
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
});

afterEach(() => vi.clearAllMocks());

describe("computeScope", () => {
  it("lite runs nothing but Convex/Better Auth (no accounts without --new)", () => {
    expect(computeScope({ lite: true })).toEqual({
      accounts: false,
      rebrand: false,
      resend: false,
      eas: false,
      apple: false,
      reviewAccount: false,
    });
  });

  it("lite --new adds the accounts walkthrough only", () => {
    expect(computeScope({ lite: true, isNew: true })).toEqual({
      accounts: true,
      rebrand: false,
      resend: false,
      eas: false,
      apple: false,
      reviewAccount: false,
    });
  });

  it("full enables rebrand, resend, eas, apple, review-account", () => {
    expect(computeScope({ lite: false })).toEqual({
      accounts: false,
      rebrand: true,
      resend: true,
      eas: true,
      apple: true,
      reviewAccount: true,
    });
  });

  it("full --new also enables accounts", () => {
    expect(computeScope({ lite: false, isNew: true }).accounts).toBe(true);
  });

  it("full --skip-rebrand drops rebrand, keeps the rest", () => {
    const scope = computeScope({ lite: false, skipRebrand: true });
    expect(scope.rebrand).toBe(false);
    expect(scope.resend).toBe(true);
    expect(scope.apple).toBe(true);
  });
});

describe("runSetup execution (--force, mocked steps)", () => {
  it("lite runs only convex + better-auth", async () => {
    const code = await runSetup({ lite: true, force: true });
    expect(code).toBe(0);
    expect(h.calls).toEqual(["convex", "better-auth"]);
    expect(h.runResend).not.toHaveBeenCalled();
    expect(h.runEas).not.toHaveBeenCalled();
    expect(h.runAscKey).not.toHaveBeenCalled();
    expect(h.runRebrand).not.toHaveBeenCalled();
  });

  it("lite --new prepends the accounts walkthrough", async () => {
    const code = await runSetup({ lite: true, isNew: true, force: true });
    expect(code).toBe(0);
    expect(h.calls).toEqual(["accounts", "convex", "better-auth"]);
  });

  it("full runs every phase in dependency order", async () => {
    const code = await runSetup({ lite: false, force: true });
    expect(code).toBe(0);
    expect(h.calls).toEqual([
      "rebrand",
      "convex",
      "better-auth",
      "resend",
      "review-account",
      "eas",
      "asc-key",
      "apple-credentials",
      "asc-connect",
      "services-id",
      "apple-jwt",
      "eas-rotation-secrets",
    ]);
  });

  it("full --skip-rebrand omits rebrand only", async () => {
    await runSetup({ lite: false, skipRebrand: true, force: true });
    expect(h.runRebrand).not.toHaveBeenCalled();
    expect(h.calls[0]).toBe("convex");
    expect(h.calls).toContain("resend");
    expect(h.calls).toContain("apple-jwt");
  });

  it("a failing step stops the run and returns 1", async () => {
    h.runConvex.mockImplementationOnce(async () => {
      throw new Error("convex boom");
    });
    const code = await runSetup({ lite: false, force: true });
    expect(code).toBe(1);
    // convex failed early; nothing after it ran
    expect(h.runBetterAuth).not.toHaveBeenCalled();
    expect(h.runEas).not.toHaveBeenCalled();
  });
});

describe("runSetup read-only modes never run a step", () => {
  it("--plan short-circuits with no step calls", async () => {
    const code = await runSetup({ lite: false, plan: true });
    expect(code).toBe(0);
    expect(h.calls).toEqual([]);
  });

  it("--dry-run short-circuits with no step calls", async () => {
    const code = await runSetup({ lite: false, dryRun: true });
    expect(code).toBe(0);
    expect(h.calls).toEqual([]);
  });
});
