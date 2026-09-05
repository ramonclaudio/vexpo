import { readFile, rm, writeFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTmpCwd } from "../helpers/tmp-cwd.ts";

// Only the `convex run` shell-out is stubbed. store.config.json and the env
// files are real files in the temp project, so the read, the rewrite and the
// prod-scope check all run against what the command actually wrote.
vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));
vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));

import { runReviewAccount } from "../../src/commands/review-account.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

const storeConfig = (demoPassword: string) =>
  JSON.stringify({ apple: { review: { demoUsername: "review@example.com", demoPassword } } });

const seedCalls = () =>
  runSpy.mock.calls.filter((c) => (c[0] as string[]).includes("admin:createReviewAccount"));

const readStoreConfig = async () =>
  JSON.parse(await readFile("store.config.json", "utf8")) as {
    apple: { review: { demoPassword: string } };
  };

useTmpCwd("review-account-");

beforeEach(async () => {
  await writeFile("store.config.json", storeConfig("pw123456"));
  vi.clearAllMocks();
  runSpy.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
});

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
    await writeFile("store.config.json", storeConfig("REPLACE_BEFORE_SUBMIT"));

    expect(await runReviewAccount({})).toBe(0);

    const payload = JSON.parse(seedCalls()[0]![0][4] as string) as { password: string };
    expect(payload.password).not.toBe("REPLACE_BEFORE_SUBMIT");
    expect(payload.password.length).toBeGreaterThanOrEqual(10);
    expect((await readStoreConfig()).apple.review.demoPassword).toBe(payload.password);
  });

  it("leaves store.config.json byte-identical when the seeded creds already match", async () => {
    const before = await readFile("store.config.json", "utf8");
    expect(await runReviewAccount({})).toBe(0);
    expect(await readFile("store.config.json", "utf8")).toBe(before);
  });

  it("also seeds prod through a prod-scoped env file", async () => {
    await writeFile(".env.prod", "CONVEX_DEPLOY_KEY=prod:brave-otter-42|tok\n");

    expect(await runReviewAccount({})).toBe(0);

    const calls = seedCalls();
    expect(calls).toHaveLength(2);
    const prodArgv = calls[1]![0] as string[];
    expect(prodArgv).toContain("--env-file");
    expect(prodArgv).toContain(".env.prod");
  });

  it("skips prod when .env.prod is not prod-scoped (the dev key would win)", async () => {
    await writeFile(".env.prod", "CONVEX_DEPLOYMENT=dev:quick-fox-123\n");

    expect(await runReviewAccount({})).toBe(0);
    expect(seedCalls()).toHaveLength(1);
  });

  it("returns 1 (no seed) when no email can be resolved", async () => {
    await writeFile("store.config.json", "{}");
    expect(await runReviewAccount({})).toBe(1);
    expect(seedCalls()).toHaveLength(0);
  });

  // The old test mocked node:fs/promises wholesale, so a missing or malformed
  // file was unreachable and the command threw a raw ENOENT instead of exiting.
  it("returns 1 when store.config.json is missing entirely", async () => {
    await rm("store.config.json");
    expect(await runReviewAccount({})).toBe(1);
    expect(seedCalls()).toHaveLength(0);
  });

  it("returns 1 when store.config.json is not valid JSON", async () => {
    await writeFile("store.config.json", "{ not json");
    expect(await runReviewAccount({})).toBe(1);
    expect(seedCalls()).toHaveLength(0);
  });
});
