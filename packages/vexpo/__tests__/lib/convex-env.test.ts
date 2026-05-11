import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { envSet, envSetFromFile } from "../../src/lib/convex-env.ts";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));

vi.mock("../../src/lib/pkg-manager.ts", () => ({
  dlx: () => "bunx",
}));

import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  runSpy.mockReset();
  runSpy.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
});

afterEach(() => {
  delete process.env.CONVEX_DEPLOYMENT;
});

describe("envSetFromFile", () => {
  it("appends --force when opts.force is true", async () => {
    await envSetFromFile("/tmp/env.txt", undefined, { force: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--force");
    expect(argv).toContain("--from-file");
    expect(argv).toContain("/tmp/env.txt");
  });

  it("omits --force when opts.force is false or absent", async () => {
    await envSetFromFile("/tmp/env.txt");
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).not.toContain("--force");
  });

  it("targets prod via --prod when target.prod is set", async () => {
    await envSetFromFile("/tmp/env.txt", { prod: true }, { force: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--prod");
    expect(argv).not.toContain("--deployment");
  });

  it("targets a named deployment via --deployment", async () => {
    await envSetFromFile("/tmp/env.txt", { deployment: "happy-frog-12" });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--deployment");
    expect(argv).toContain("happy-frog-12");
  });

  it("strips dev:/prod: prefix from CONVEX_DEPLOYMENT env var", async () => {
    process.env.CONVEX_DEPLOYMENT = "dev:happy-frog-12";
    await envSetFromFile("/tmp/env.txt");
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    const idx = argv.indexOf("--deployment");
    expect(idx).toBeGreaterThan(-1);
    expect(argv[idx + 1]).toBe("happy-frog-12");
  });

  it("throws with stderr tail when convex CLI fails", async () => {
    runSpy.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "Use --force to overwrite existing values.",
    });
    await expect(envSetFromFile("/tmp/env.txt")).rejects.toThrow(
      /Use --force to overwrite existing values/,
    );
  });
});

describe("envSet", () => {
  it("calls convex env set with name + value + target", async () => {
    await envSet("APPLE_TEAM_ID", "ABCDE12345", { prod: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("env");
    expect(argv).toContain("set");
    expect(argv).toContain("--prod");
    expect(argv).toContain("APPLE_TEAM_ID");
    expect(argv).toContain("ABCDE12345");
  });
});
