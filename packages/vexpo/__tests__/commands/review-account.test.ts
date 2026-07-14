import { readFile, writeFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));
vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));
vi.mock("../../src/lib/fs.ts", () => ({ fileExists: vi.fn(async () => false) }));
vi.mock("../../src/lib/env-files.ts", () => ({ readEnvFile: vi.fn(async () => new Map()) }));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { runReviewAccount } from "../../src/commands/review-account.ts";
import { readEnvFile } from "../../src/lib/env-files.ts";
import { fileExists } from "../../src/lib/fs.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;
const readFileSpy = readFile as unknown as ReturnType<typeof vi.fn>;
const writeFileSpy = writeFile as unknown as ReturnType<typeof vi.fn>;
const fileExistsSpy = fileExists as unknown as ReturnType<typeof vi.fn>;
const readEnvFileSpy = readEnvFile as unknown as ReturnType<typeof vi.fn>;

function config(demoPassword: string) {
  return JSON.stringify({
    apple: { review: { demoUsername: "review@example.com", demoPassword } },
  });
}

const seedCalls = () =>
  runSpy.mock.calls.filter((c) => (c[0] as string[]).includes("admin:createReviewAccount"));

beforeEach(() => {
  vi.clearAllMocks();
  runSpy.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  readFileSpy.mockResolvedValue(config("pw123456"));
  fileExistsSpy.mockResolvedValue(false);
  readEnvFileSpy.mockResolvedValue(new Map());
});

afterEach(() => vi.clearAllMocks());

describe("runReviewAccount", () => {
  it("seeds via a single convex run with reset so an existing account converges", async () => {
    expect(await runReviewAccount({})).toBe(0);
    const calls = seedCalls();
    expect(calls).toHaveLength(1);
    const argv = calls[0]![0] as string[];
    expect(argv.slice(0, 4)).toEqual(["bunx", "convex", "run", "admin:createReviewAccount"]);
    expect(argv).not.toContain("--component-function");
    expect(argv).not.toContain("--env-file");
    expect(JSON.parse(argv[4] as string)).toMatchObject({
      email: "review@example.com",
      password: "pw123456",
      reset: true,
    });
  });

  it("generates a real password instead of seeding the placeholder, and writes it back", async () => {
    readFileSpy.mockResolvedValueOnce(config("REPLACE_BEFORE_SUBMIT"));

    expect(await runReviewAccount({})).toBe(0);

    const payload = JSON.parse(seedCalls()[0]![0][4] as string) as { password: string };
    expect(payload.password).not.toBe("REPLACE_BEFORE_SUBMIT");
    expect(payload.password.length).toBeGreaterThanOrEqual(10);

    const written = JSON.parse(writeFileSpy.mock.calls[0]![1] as string) as {
      apple: { review: { demoPassword: string } };
    };
    expect(written.apple.review.demoPassword).toBe(payload.password);
  });

  it("does not rewrite store.config.json when the seeded creds already match", async () => {
    expect(await runReviewAccount({})).toBe(0);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it("also seeds prod through a prod-scoped env file", async () => {
    fileExistsSpy.mockImplementation(async (f: string) => f === ".env.prod");
    readEnvFileSpy.mockResolvedValue(new Map([["CONVEX_DEPLOY_KEY", "prod:brave-otter-42|tok"]]));

    expect(await runReviewAccount({})).toBe(0);

    const calls = seedCalls();
    expect(calls).toHaveLength(2);
    const prodArgv = calls[1]![0] as string[];
    expect(prodArgv).toContain("--env-file");
    expect(prodArgv).toContain(".env.prod");
  });

  it("skips prod when .env.prod is not prod-scoped (the dev key would win)", async () => {
    fileExistsSpy.mockImplementation(async (f: string) => f === ".env.prod");
    readEnvFileSpy.mockResolvedValue(new Map([["CONVEX_DEPLOYMENT", "dev:quick-fox-123"]]));

    expect(await runReviewAccount({})).toBe(0);
    expect(seedCalls()).toHaveLength(1);
  });

  it("returns 1 (no seed) when no email can be resolved", async () => {
    readFileSpy.mockResolvedValueOnce("{}");
    expect(await runReviewAccount({})).toBe(1);
    expect(seedCalls()).toHaveLength(0);
  });
});
