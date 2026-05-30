import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({ accessToken: "pat-xyz" })),
}));
vi.mock("node:os", () => ({ homedir: () => "/home/test" }));

import { deleteDeployKey, mintDeployKey } from "../../src/lib/convex-management.ts";

afterEach(() => vi.unstubAllGlobals());

describe("mintDeployKey", () => {
  it("POSTs create_deploy_key with the Bearer PAT and returns the key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ deployKey: "prod:abc|ey" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const key = await mintDeployKey("abc", { name: "eas-rotation", expiresAtMs: 123 });

    expect(key).toBe("prod:abc|ey");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.convex.dev/v1/deployments/abc/create_deploy_key");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pat-xyz");
    expect(JSON.parse(init.body as string)).toEqual({ name: "eas-rotation", expiresAt: 123 });
  });

  it("omits expiresAt when not given and defaults the name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ deployKey: "k" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await mintDeployKey("abc");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      name: "vexpo",
    });
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    await expect(mintDeployKey("abc")).rejects.toThrow(/403/);
  });

  it("throws when no deployKey is returned", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(mintDeployKey("abc")).rejects.toThrow(/no deployKey/);
  });
});

describe("deleteDeployKey", () => {
  it("POSTs delete_deploy_key with the id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteDeployKey("abc", "eas-rotation");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.convex.dev/v1/deployments/abc/delete_deploy_key");
    expect(JSON.parse(init.body as string)).toEqual({ id: "eas-rotation" });
  });
});
