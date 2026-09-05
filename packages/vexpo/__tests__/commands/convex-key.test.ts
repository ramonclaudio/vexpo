import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the two modules that reach the network are stubbed. The env files are
// real files in a temp project, so `readEnvFile` and its parser run for real.
vi.mock("../../src/lib/convex-management.ts", () => ({ mintProdDeployKey: vi.fn() }));
vi.mock("../../src/lib/eas-project.ts", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("pid"),
  envList: vi.fn(),
  envCreate: vi.fn().mockResolvedValue(undefined),
  envUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { runConvexKey } from "../../src/commands/env/convex-key.ts";
import { mintProdDeployKey } from "../../src/lib/convex-management.ts";
import { envCreate, envList } from "../../src/lib/eas-project.ts";

const mintProdSpy = mintProdDeployKey as unknown as ReturnType<typeof vi.fn>;
const envListSpy = envList as unknown as ReturnType<typeof vi.fn>;
const envCreateSpy = envCreate as unknown as ReturnType<typeof vi.fn>;

let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  process.chdir(await mkdtemp(path.join(tmpdir(), "convex-key-")));
  await writeFile(
    ".env.local",
    "CONVEX_DEPLOY_KEY=dev:merry-otter-1|x\nCONVEX_DEPLOYMENT=dev:merry-otter-1\n",
  );
  await writeFile(".env.prod", "CONVEX_DEPLOYMENT=prod:lucky-fox-1\n");
  vi.clearAllMocks();
  envListSpy.mockResolvedValue(new Map());
  mintProdSpy.mockResolvedValue({ key: "prod:lucky-fox-1|eyMINT", deployment: "lucky-fox-1" });
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.clearAllMocks();
});

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

  // The old fake answered every path, so nothing reached the missing-file case.
  // `mintProdDeployKey` resolves the project's prod deployment from any
  // deployment in it, so the dev selector is a usable fallback here.
  it("mints from the dev selector when there is no prod env file", async () => {
    await rm(".env.prod");
    await runConvexKey({ mint: true });
    expect(mintProdSpy).toHaveBeenCalledWith("merry-otter-1", "convex-key");
  });

  it("does not mint when neither env file names a deployment", async () => {
    await rm(".env.prod");
    await writeFile(".env.local", "CONVEX_DEPLOY_KEY=dev:merry-otter-1|x\n");
    await runConvexKey({ mint: true });
    expect(mintProdSpy).not.toHaveBeenCalled();
  });
});
