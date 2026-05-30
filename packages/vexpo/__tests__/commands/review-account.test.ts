import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));
vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      apple: { review: { demoUsername: "review@example.com", demoPassword: "pw123456" } },
    }),
  ),
}));

import { runReviewAccount } from "../../src/commands/review-account.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("runReviewAccount", () => {
  it("runs admin:createReviewAccount with no --component-function via a single run()", async () => {
    const exit = await runReviewAccount({});
    expect(exit).toBe(0);
    expect(runSpy).toHaveBeenCalledTimes(1);
    const argv = runSpy.mock.calls[0][0] as string[];
    expect(argv.slice(0, 4)).toEqual(["bunx", "convex", "run", "admin:createReviewAccount"]);
    expect(argv).not.toContain("--component-function");
    expect(JSON.parse(argv[4])).toMatchObject({
      email: "review@example.com",
      password: "pw123456",
    });
  });

  it("returns 1 (no run) when email/password are missing", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("{}");
    const exit = await runReviewAccount({});
    expect(exit).toBe(1);
    expect(runSpy).not.toHaveBeenCalled();
  });
});
