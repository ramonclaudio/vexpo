import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/eas-env.ts", () => ({
  envList: vi.fn(),
  envCreate: vi.fn().mockResolvedValue(undefined),
  envUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/convex-management.ts", () => ({
  mintDeployKey: vi.fn(),
  resolveProdDeployment: vi.fn(),
}));
vi.mock("../../src/lib/convex-env.ts", () => ({
  deploymentSlug: (v?: string) => (v ? v.replace(/^(dev|prod|preview):/, "") : undefined),
}));
vi.mock("../../src/lib/env-local.ts", () => ({ readOne: vi.fn() }));
vi.mock("../../src/lib/state.ts", () => ({
  load: vi.fn().mockResolvedValue({ steps: {}, audit: [] }),
  lookupCachedPath: vi.fn().mockResolvedValue(null),
}));
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual("node:fs/promises")),
  access: vi.fn().mockResolvedValue(undefined),
}));

import { runEasRotationSecrets } from "../../src/commands/apple/eas-rotation-secrets.ts";
import { mintDeployKey, resolveProdDeployment } from "../../src/lib/convex-management.ts";
import { envCreate, envList } from "../../src/lib/eas-env.ts";
import { readOne } from "../../src/lib/env-local.ts";

const envListSpy = envList as unknown as ReturnType<typeof vi.fn>;
const envCreateSpy = envCreate as unknown as ReturnType<typeof vi.fn>;
const readOneSpy = readOne as unknown as ReturnType<typeof vi.fn>;
const mintSpy = mintDeployKey as unknown as ReturnType<typeof vi.fn>;
const resolveProdSpy = resolveProdDeployment as unknown as ReturnType<typeof vi.fn>;

const P8 = "/tmp/AuthKey_ABC.p8";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPLE_P8_PATH = P8;
  envListSpy.mockResolvedValue(new Map()); // nothing on EAS yet -> all creates
  readOneSpy.mockImplementation((k: string) =>
    Promise.resolve(
      (
        {
          APPLE_TEAM_ID: "ABCDE12345",
          APPLE_KEY_ID: "KEY1234567",
          APPLE_SERVICES_ID: "com.test.app.signin",
          CONVEX_DEPLOYMENT: "dev:merry-otter-1",
        } as Record<string, string>
      )[k],
    ),
  );
  resolveProdSpy.mockResolvedValue("lucky-fox-1");
  mintSpy.mockResolvedValue("prod:lucky-fox-1|eyKEY");
});

afterEach(() => {
  delete process.env.APPLE_P8_PATH;
});

describe("runEasRotationSecrets", () => {
  it("pushes APPLE_P8_PRIVATE_KEY as the file PATH (not the PEM contents)", async () => {
    const exit = await runEasRotationSecrets({});
    expect(exit).toBe(0);

    const p8Call = envCreateSpy.mock.calls.find((c) => c[0] === "APPLE_P8_PRIVATE_KEY");
    expect(p8Call).toBeDefined();
    expect(p8Call![1]).toBe(P8); // value is the PATH, the regression guard
    expect(p8Call![2]).toBe("secret");
    expect(p8Call![3]).toEqual(["production"]);
    expect(p8Call![4]).toEqual({ type: "file" });
  });

  it("mints the prod CONVEX_DEPLOY_KEY via the Platform API and sets it on EAS", async () => {
    await runEasRotationSecrets({});
    expect(resolveProdSpy).toHaveBeenCalledWith("merry-otter-1");
    expect(mintSpy).toHaveBeenCalledWith("lucky-fox-1", { name: "eas-rotation" });
    const keyCall = envCreateSpy.mock.calls.find((c) => c[0] === "CONVEX_DEPLOY_KEY");
    expect(keyCall![1]).toBe("prod:lucky-fox-1|eyKEY");
    expect(keyCall![2]).toBe("secret");
  });

  it("does not mint when CONVEX_DEPLOY_KEY already exists and not --force", async () => {
    envListSpy.mockResolvedValue(new Map([["CONVEX_DEPLOY_KEY", "prod:existing|x"]]));
    await runEasRotationSecrets({});
    expect(mintSpy).not.toHaveBeenCalled();
  });
});
