import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/convex-management.ts", () => ({ mintProdDeployKey: vi.fn() }));
vi.mock("../../src/lib/eas-project.ts", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("pid"),
  envList: vi.fn(),
  envCreate: vi.fn().mockResolvedValue(undefined),
  envUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/env-files.ts", () => ({ readEnvFile: vi.fn() }));
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual("node:fs/promises")),
  access: vi.fn().mockResolvedValue(undefined),
}));

import { runConvexKey } from "../../src/commands/env/convex-key.ts";
import { mintProdDeployKey } from "../../src/lib/convex-management.ts";
import { envCreate, envList } from "../../src/lib/eas-project.ts";
import { readEnvFile } from "../../src/lib/env-files.ts";

const mintProdSpy = mintProdDeployKey as unknown as ReturnType<typeof vi.fn>;
const envListSpy = envList as unknown as ReturnType<typeof vi.fn>;
const envCreateSpy = envCreate as unknown as ReturnType<typeof vi.fn>;
const readEnvFileSpy = readEnvFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // .env.local has the dev key + selector; .env.prod has only the selector (no secret key).
  readEnvFileSpy.mockImplementation((p: string) =>
    Promise.resolve(
      p.includes("prod")
        ? new Map([["CONVEX_DEPLOYMENT", "prod:lucky-fox-1"]])
        : new Map([
            ["CONVEX_DEPLOY_KEY", "dev:merry-otter-1|x"],
            ["CONVEX_DEPLOYMENT", "dev:merry-otter-1"],
          ]),
    ),
  );
  envListSpy.mockResolvedValue(new Map());
  mintProdSpy.mockResolvedValue({ key: "prod:lucky-fox-1|eyMINT", deployment: "lucky-fox-1" });
});

afterEach(() => vi.clearAllMocks());

describe("runConvexKey --mint", () => {
  it("mints the prod key and sets it on EAS production when EAS lacks one", async () => {
    const exit = await runConvexKey({ mint: true });
    expect(exit).toBe(0);
    expect(mintProdSpy).toHaveBeenCalledWith("lucky-fox-1", "convex-key");
    const keyCall = envCreateSpy.mock.calls.find(
      (c) => c[0] === "CONVEX_DEPLOY_KEY" && (c[3] as string[]).includes("production"),
    );
    expect(keyCall![1]).toBe("prod:lucky-fox-1|eyMINT");
    expect(keyCall![2]).toBe("secret");
  });

  it("does not mint when EAS production already holds CONVEX_DEPLOY_KEY", async () => {
    envListSpy.mockImplementation((env: string) =>
      Promise.resolve(
        env === "production" ? new Map([["CONVEX_DEPLOY_KEY", "prod:existing|x"]]) : new Map(),
      ),
    );
    await runConvexKey({ mint: true });
    expect(mintProdSpy).not.toHaveBeenCalled();
  });

  it("without --mint, never mints", async () => {
    await runConvexKey({});
    expect(mintProdSpy).not.toHaveBeenCalled();
  });
});
