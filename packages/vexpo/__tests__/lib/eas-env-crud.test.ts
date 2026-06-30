import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));
vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));

import { ensureChannels, envCreate, envUpdate } from "../../src/lib/eas-project.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  runSpy.mockReset();
  runSpy.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
});

describe("envUpdate argv", () => {
  it("identifies the variable by --variable-environment, never plain --environment", async () => {
    await envUpdate("CONVEX_DEPLOY_KEY", "prod:x|y", "secret", ["production"]);
    const argv = runSpy.mock.calls[0]![0] as string[];
    expect(argv).toContain("env:update");
    const n = argv.indexOf("--variable-name");
    expect(argv[n + 1]).toBe("CONVEX_DEPLOY_KEY");
    const e = argv.indexOf("--variable-environment");
    expect(e).toBeGreaterThan(-1);
    expect(argv[e + 1]).toBe("production");
    // plain --environment would rewrite the var's env links — must not be sent.
    expect(argv).not.toContain("--environment");
    expect(argv).toContain("--non-interactive");
  });

  it("forwards --type for file secrets", async () => {
    await envUpdate("APPLE_P8_PRIVATE_KEY", "/AuthKey.p8", "secret", ["production"], {
      type: "file",
    });
    const argv = runSpy.mock.calls[0]![0] as string[];
    const t = argv.indexOf("--type");
    expect(argv[t + 1]).toBe("file");
  });
});

describe("envCreate argv", () => {
  it("uses --name + --environment + --non-interactive", async () => {
    await envCreate("EXPO_PUBLIC_CONVEX_URL", "https://x.convex.cloud", "plaintext", [
      "development",
    ]);
    const argv = runSpy.mock.calls[0]![0] as string[];
    expect(argv).toContain("env:create");
    const n = argv.indexOf("--name");
    expect(argv[n + 1]).toBe("EXPO_PUBLIC_CONVEX_URL");
    const e = argv.indexOf("--environment");
    expect(argv[e + 1]).toBe("development");
    expect(argv).toContain("--non-interactive");
  });
});

describe("ensureChannels", () => {
  const list = (names: string[]) => ({
    code: 0,
    stdout: JSON.stringify({ currentPage: names.map((name) => ({ name })) }),
    stderr: "",
  });

  it("skips channels already present and returns only the created ones", async () => {
    runSpy.mockResolvedValueOnce(list(["development", "preview"]));
    runSpy.mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });
    const created = await ensureChannels(["development", "preview", "production"]);
    expect(created).toEqual(["production"]);
    expect(runSpy.mock.calls[1]![0]).toContain("channel:create");
  });

  it("throws on a real create failure instead of reporting success", async () => {
    runSpy.mockResolvedValueOnce(list([]));
    runSpy.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "network down" });
    await expect(ensureChannels(["development"])).rejects.toThrow(
      /channel:create development failed/,
    );
  });

  it("throws when the channel list itself fails", async () => {
    runSpy.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "not logged in" });
    await expect(ensureChannels(["development"])).rejects.toThrow(/channel:list failed/);
  });
});
