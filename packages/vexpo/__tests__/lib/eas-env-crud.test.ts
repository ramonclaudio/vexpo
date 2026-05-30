import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));
vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));

import { envCreate, envUpdate } from "../../src/lib/eas-env.ts";
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
