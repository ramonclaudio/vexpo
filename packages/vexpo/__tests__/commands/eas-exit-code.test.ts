import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/eas-cli.ts", () => ({ easSpawn: vi.fn().mockResolvedValue(0) }));
vi.mock("../../src/lib/eas-env.ts", () => ({
  checkCli: vi.fn().mockResolvedValue({ ok: true, version: "1.0.0" }),
  whoami: vi.fn().mockResolvedValue("ray"),
  resolveProjectId: vi.fn().mockResolvedValue("proj-123"),
  init: vi.fn(),
  ensureChannels: vi.fn().mockResolvedValue([]),
  ensureBranches: vi.fn().mockResolvedValue([]),
  envPush: vi.fn(),
}));
vi.mock("../../src/lib/env-files.ts", () => ({
  ROUTING: { EXPO_PUBLIC_CONVEX_URL: { routes: () => [{ type: "eas" }] } },
  readEnvFile: vi.fn().mockResolvedValue(new Map([["EXPO_PUBLIC_CONVEX_URL", "https://x"]])),
}));
vi.mock("../../src/lib/fs.ts", () => ({ fileExists: vi.fn() }));
vi.mock("../../src/lib/state.ts", () => ({ recordStep: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/output.ts", async () => ({
  ...(await vi.importActual("../../src/lib/output.ts")),
  bad: vi.fn(),
  ok: vi.fn(),
  nop: vi.fn(),
  note: vi.fn(),
  yep: vi.fn(),
  line: vi.fn(),
  section: vi.fn(),
  askYesNo: vi.fn().mockResolvedValue(true),
}));

import { runEas } from "../../src/commands/eas.ts";
import { envPush } from "../../src/lib/eas-env.ts";
import { fileExists } from "../../src/lib/fs.ts";

const envPushSpy = envPush as unknown as ReturnType<typeof vi.fn>;
const fileExistsSpy = fileExists as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runEas exit code", () => {
  it("exits nonzero when the development env push fails", async () => {
    fileExistsSpy.mockResolvedValue(true);
    envPushSpy.mockRejectedValue(new Error("eas env:push failed"));
    const exit = await runEas({});
    expect(exit).toBe(1);
  });

  it("exits nonzero when the prod env push fails", async () => {
    // .env.local absent, .env.prod present so only the --with-prod path runs.
    fileExistsSpy.mockImplementation((p: string) => Promise.resolve(p === ".env.prod"));
    envPushSpy.mockRejectedValue(new Error("eas env:push failed"));
    const exit = await runEas({ withProd: true });
    expect(exit).toBe(1);
  });

  it("exits zero when pushes succeed", async () => {
    fileExistsSpy.mockResolvedValue(true);
    envPushSpy.mockResolvedValue(undefined);
    const exit = await runEas({});
    expect(exit).toBe(0);
  });
});
