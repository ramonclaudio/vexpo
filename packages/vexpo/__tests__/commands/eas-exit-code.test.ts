import { readFile, writeFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTmpCwd } from "../helpers/tmp-cwd.ts";

// Only the two modules that shell out to eas-cli are stubbed. `env-files`,
// `fs`, `state` and `output` run for real against the temp project below, so
// the real ROUTING table decides which keys reach EAS.
vi.mock("../../src/lib/eas-cli.ts", () => ({ easSpawn: vi.fn().mockResolvedValue(0) }));
vi.mock("../../src/lib/eas-project.ts", () => ({
  checkCli: vi.fn().mockResolvedValue({ ok: true, version: "1.0.0" }),
  whoami: vi.fn().mockResolvedValue("ray"),
  resolveProjectId: vi.fn().mockResolvedValue("proj-123"),
  init: vi.fn(),
  ensureChannels: vi.fn().mockResolvedValue([]),
  ensureBranches: vi.fn().mockResolvedValue([]),
  envPush: vi.fn(),
}));

import { runEas } from "../../src/commands/eas.ts";
import { envPush } from "../../src/lib/eas-project.ts";

const envPushSpy = vi.mocked(envPush);

useTmpCwd("eas-exit-code-");

beforeEach(() => {
  vi.clearAllMocks();
});

const CONVEX_URL = "EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud\n";
const SERVER_SECRET = "BETTER_AUTH_SECRET=not-for-eas\n";

describe("runEas exit code", () => {
  it("exits nonzero when the development env push fails", async () => {
    await writeFile(".env.local", CONVEX_URL);
    envPushSpy.mockRejectedValue(new Error("eas env:push failed"));
    await expect(runEas({})).resolves.toBe(1);
  });

  it("exits nonzero when the prod env push fails", async () => {
    await writeFile(".env.prod", CONVEX_URL);
    envPushSpy.mockRejectedValue(new Error("eas env:push failed"));
    await expect(runEas({ withProd: true })).resolves.toBe(1);
  });

  it("exits zero when pushes succeed", async () => {
    await writeFile(".env.local", CONVEX_URL);
    envPushSpy.mockResolvedValue(undefined);
    await expect(runEas({})).resolves.toBe(0);
  });

  it("exits zero and pushes nothing when .env.local is missing", async () => {
    await expect(runEas({})).resolves.toBe(0);
    expect(envPushSpy).not.toHaveBeenCalled();
  });

  // The real ROUTING table is what keeps server secrets out of EAS. With it
  // mocked to a single key this test could not fail.
  it("does not push a Convex-routed secret to EAS", async () => {
    await writeFile(".env.local", SERVER_SECRET);
    envPushSpy.mockResolvedValue(undefined);
    await expect(runEas({})).resolves.toBe(0);
    expect(envPushSpy).not.toHaveBeenCalled();
  });

  it("pushes only the EAS-routed key when the file holds both", async () => {
    await writeFile(".env.local", CONVEX_URL + SERVER_SECRET);
    // The temp file is deleted as soon as the push returns, so read it here.
    let pushed = "";
    envPushSpy.mockImplementation(async (opts: { path: string }) => {
      pushed = await readFile(opts.path, "utf8");
    });
    await expect(runEas({})).resolves.toBe(0);
    expect(pushed).toContain("EXPO_PUBLIC_CONVEX_URL=");
    expect(pushed).not.toContain("BETTER_AUTH_SECRET");
  });
});
