import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({ accessToken: "pat-xyz" })),
}));
vi.mock("node:os", () => ({ homedir: () => "/home/test" }));

import {
  checkToken,
  deleteDeployKey,
  listProjectDeployments,
  mintDeployKey,
  resolveProdDeployment,
} from "../../src/lib/convex-management.ts";
import { readFile } from "node:fs/promises";

afterEach(() => vi.unstubAllGlobals());

describe("checkToken", () => {
  it("returns 'valid' on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    expect(await checkToken()).toBe("valid");
  });

  it("returns 'unauthorized' on 401 / 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));
    expect(await checkToken()).toBe("unauthorized");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 403 })));
    expect(await checkToken()).toBe("unauthorized");
  });

  it("degrades to 'valid' on a network error (offline never blocks)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await checkToken()).toBe("valid");
  });

  it("returns 'no-token' without any fetch when config has no accessToken", async () => {
    (readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("{}");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkToken()).toBe("no-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const DEPLOYMENTS = [
  { name: "dev-a", deploymentType: "dev", projectId: 7, reference: "dev/auto" },
  { name: "dev-b", deploymentType: "dev", projectId: 7, reference: "dev/vexpo", isDefault: true },
  {
    name: "prod-x",
    deploymentType: "prod",
    projectId: 7,
    reference: "/prod/vexpo",
    isDefault: true,
  },
];

function mockTwoHop(deployments = DEPLOYMENTS) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ projectId: 7 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(deployments), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("listProjectDeployments", () => {
  it("resolves the project then lists its deployments (two Bearer GETs)", async () => {
    const fetchMock = mockTwoHop();
    const list = await listProjectDeployments("dev-a");
    expect(list).toHaveLength(3);
    const [u1, i1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(u1).toBe("https://api.convex.dev/v1/deployments/dev-a");
    expect((i1.headers as Record<string, string>).Authorization).toBe("Bearer pat-xyz");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.convex.dev/v1/projects/7/list_deployments",
    );
  });

  it("degrades to null on a 401 without the second call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listProjectDeployments("dev-a")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveProdDeployment", () => {
  it("returns the default prod deployment name", async () => {
    mockTwoHop();
    expect(await resolveProdDeployment("dev-a")).toBe("prod-x");
  });

  it("returns null when the project has no prod deployment", async () => {
    mockTwoHop(DEPLOYMENTS.filter((d) => d.deploymentType !== "prod"));
    expect(await resolveProdDeployment("dev-a")).toBeNull();
  });
});

describe("mintDeployKey", () => {
  it("POSTs create_deploy_key with the Bearer PAT and returns the key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ deployKey: "prod:abc|ey" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const future = Date.now() + 40 * 60_000;
    const key = await mintDeployKey("abc", { name: "eas-rotation", expiresAtMs: future });

    expect(key).toBe("prod:abc|ey");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.convex.dev/v1/deployments/abc/create_deploy_key");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pat-xyz");
    expect(JSON.parse(init.body as string)).toEqual({ name: "eas-rotation", expiresAt: future });
  });

  it("rejects an expiresAtMs less than 30 minutes out", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(mintDeployKey("abc", { expiresAtMs: Date.now() + 60_000 })).rejects.toThrow(
      /30 minutes/,
    );
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
