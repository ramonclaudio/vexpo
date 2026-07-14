/**
 * Dev and prod are separate Resend channels: the scoped sending key is shared,
 * each deployment gets its own webhook and env copy. The full flow wires both
 * in one run (the old `--prod` flag was silently ignored outside `--repoint`),
 * and a repoint never retires the sibling channel's live webhook.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const localEnv = new Map<string, string>();
const prodEnvFiles = new Map<string, Map<string, string>>();

vi.mock("../../src/lib/env-local.ts", () => ({
  readOne: vi.fn(async (key: string) => localEnv.get(key)),
}));
vi.mock("../../src/lib/env-files.ts", () => ({
  readEnvFile: vi.fn(async (file: string) => prodEnvFiles.get(file) ?? new Map()),
}));
vi.mock("../../src/lib/fs.ts", () => ({
  fileExists: vi.fn(async (file: string) => prodEnvFiles.has(file)),
}));
vi.mock("../../src/lib/app.ts", () => ({ pkgName: vi.fn(async () => "acme") }));
vi.mock("../../src/lib/convex-env.ts", () => ({ envSet: vi.fn(async () => undefined) }));
vi.mock("../../src/lib/state.ts", () => ({
  load: vi.fn(async () => ({ steps: {} })),
  recordStep: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/resend-api.ts", () => ({
  probeAccess: vi.fn(async () => "full"),
  listDomains: vi.fn(async () => [{ id: "d1", name: "mailer.acme.com", status: "verified" }]),
  getDomain: vi.fn(),
  verifyDomain: vi.fn(),
  provisionSendingKey: vi.fn(async () => "re_scoped_token"),
  provisionWebhook: vi.fn(async (_key: string, endpoint: string) => ({
    id: `wh_${endpoint.includes("prod-site") ? "prod" : "dev"}`,
    secret: `whsec_${endpoint}`,
  })),
  listWebhooks: vi.fn(async () => []),
  deleteWebhook: vi.fn(async () => undefined),
}));

import { runResend } from "../../src/commands/resend.ts";
import { envSet } from "../../src/lib/convex-env.ts";
import { deleteWebhook, listWebhooks, provisionWebhook } from "../../src/lib/resend-api.ts";

const envSetSpy = envSet as unknown as ReturnType<typeof vi.fn>;
const provisionWebhookSpy = provisionWebhook as unknown as ReturnType<typeof vi.fn>;
const listWebhooksSpy = listWebhooks as unknown as ReturnType<typeof vi.fn>;
const deleteWebhookSpy = deleteWebhook as unknown as ReturnType<typeof vi.fn>;

const DEV_SITE = "https://dev-site.convex.site";
const PROD_SITE = "https://prod-site.convex.site";

beforeEach(() => {
  vi.clearAllMocks();
  localEnv.clear();
  prodEnvFiles.clear();
  localEnv.set("EXPO_PUBLIC_CONVEX_SITE_URL", DEV_SITE);
  process.env.RESEND_FULL_ACCESS_KEY = "re_full_bootstrap";
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
});

describe("runResend full flow", () => {
  it("provisions the prod channel alongside dev when a prod site URL exists", async () => {
    prodEnvFiles.set(".env.prod", new Map([["EXPO_PUBLIC_CONVEX_SITE_URL", PROD_SITE]]));

    expect(await runResend({})).toBe(0);

    const endpoints = provisionWebhookSpy.mock.calls.map((c) => c[1] as string);
    expect(endpoints).toEqual([`${DEV_SITE}/resend-webhook`, `${PROD_SITE}/resend-webhook`]);

    // Same scoped key on both deployments, prod writes through the env file.
    const keyWrites = envSetSpy.mock.calls.filter((c) => c[0] === "RESEND_API_KEY");
    expect(keyWrites).toHaveLength(2);
    expect(keyWrites[0]![1]).toBe("re_scoped_token");
    expect(keyWrites[1]![1]).toBe("re_scoped_token");
    expect(keyWrites[1]![2]).toEqual({ prod: true, envFile: ".env.prod" });

    // Each channel keeps its own webhook secret.
    const secretWrites = envSetSpy.mock.calls.filter((c) => c[0] === "RESEND_WEBHOOK_SECRET");
    expect(secretWrites[0]![1]).not.toBe(secretWrites[1]![1]);
  });

  it("skips the prod channel with a note when no prod site URL exists", async () => {
    expect(await runResend({})).toBe(0);
    expect(provisionWebhookSpy).toHaveBeenCalledTimes(1);
    expect(envSetSpy.mock.calls.every((c) => c[2] === undefined)).toBe(true);
  });
});

describe("runResend --repoint", () => {
  it("never retires the sibling channel's live webhook", async () => {
    prodEnvFiles.set(".env.prod", new Map([["EXPO_PUBLIC_CONVEX_SITE_URL", PROD_SITE]]));
    listWebhooksSpy.mockResolvedValue([
      { id: "wh_dev", endpoint: `${DEV_SITE}/resend-webhook`, status: "enabled" },
      { id: "wh_dead", endpoint: "https://old-site.convex.site/resend-webhook", status: "enabled" },
    ]);

    expect(await runResend({ repoint: true, prod: true })).toBe(0);

    const retired = deleteWebhookSpy.mock.calls.map((c) => c[1] as string);
    expect(retired).toContain("wh_dead");
    expect(retired).not.toContain("wh_dev");
  });

  it("protects the prod webhook during a dev repoint", async () => {
    prodEnvFiles.set(".env.prod", new Map([["EXPO_PUBLIC_CONVEX_SITE_URL", PROD_SITE]]));
    listWebhooksSpy.mockResolvedValue([
      { id: "wh_prod", endpoint: `${PROD_SITE}/resend-webhook`, status: "enabled" },
      { id: "wh_dead", endpoint: "https://old-site.convex.site/resend-webhook", status: "enabled" },
    ]);

    expect(await runResend({ repoint: true })).toBe(0);

    const retired = deleteWebhookSpy.mock.calls.map((c) => c[1] as string);
    expect(retired).toContain("wh_dead");
    expect(retired).not.toContain("wh_prod");
  });
});
