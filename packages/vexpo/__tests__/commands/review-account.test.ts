import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));
vi.mock("../../src/lib/proc.ts", () => ({
  spawn: vi.fn(() => ({
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
    stdin: null,
    pid: 1,
    kill: () => {},
  })),
  streamText: vi.fn().mockResolvedValue(""),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      apple: { review: { demoUsername: "review@example.com", demoPassword: "pw123456" } },
    }),
  ),
}));

import { runReviewAccount } from "../../src/commands/review-account.ts";
import { spawn } from "../../src/lib/proc.ts";
import { readFile } from "node:fs/promises";

const spawnSpy = spawn as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("runReviewAccount", () => {
  it("runs admin:createReviewAccount with no --component-function and a single spawn", async () => {
    const exit = await runReviewAccount({});
    expect(exit).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const argv = spawnSpy.mock.calls[0][0] as string[];
    expect(argv.slice(0, 4)).toEqual(["bunx", "convex", "run", "admin:createReviewAccount"]);
    expect(argv).not.toContain("--component-function");
    expect(JSON.parse(argv[4])).toMatchObject({
      email: "review@example.com",
      password: "pw123456",
    });
  });

  it("returns 1 (no spawn) when email/password are missing", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("{}");
    const exit = await runReviewAccount({});
    expect(exit).toBe(1);
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
