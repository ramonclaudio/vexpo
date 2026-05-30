import { describe, expect, it, vi } from "vitest";

import type { AscClient } from "../../src/lib/asc-api.ts";
import { sandbox } from "../../src/lib/asc-sandbox.ts";

describe("sandbox v2 API", () => {
  it("lists via GET /v2/sandboxTesters", async () => {
    const paginatedList = vi.fn().mockResolvedValue([]);
    const s = sandbox({ paginatedList } as unknown as AscClient);
    await s.sandboxTesters.list();
    expect(paginatedList).toHaveBeenCalledWith("/v2/sandboxTesters");
  });

  it("updates via PATCH /v2/sandboxTesters/{id} with type sandboxTesters", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { type: "sandboxTesters", id: "abc", attributes: {} } });
    const s = sandbox({ request } as unknown as AscClient);

    await s.sandboxTesters.update("abc", {
      subscriptionRenewalRate: "MONTHLY_RENEWAL_EVERY_HOUR",
      interruptPurchases: true,
    });

    const [method, path, body] = request.mock.calls[0] as [string, string, unknown];
    expect(method).toBe("PATCH");
    expect(path).toBe("/v2/sandboxTesters/abc");
    expect(body).toEqual({
      data: {
        type: "sandboxTesters",
        id: "abc",
        attributes: {
          subscriptionRenewalRate: "MONTHLY_RENEWAL_EVERY_HOUR",
          interruptPurchases: true,
        },
      },
    });
  });

  it("clears purchase history via POST with a sandboxTesters relationship array", async () => {
    const request = vi.fn().mockResolvedValue({});
    const s = sandbox({ request } as unknown as AscClient);

    await s.sandboxTesters.clearPurchaseHistory(["a", "b"]);

    const [method, path, body] = request.mock.calls[0] as [string, string, unknown];
    expect(method).toBe("POST");
    expect(path).toBe("/v2/sandboxTestersClearPurchaseHistoryRequest");
    expect(body).toEqual({
      data: {
        type: "sandboxTestersClearPurchaseHistoryRequest",
        relationships: {
          sandboxTesters: {
            data: [
              { type: "sandboxTesters", id: "a" },
              { type: "sandboxTesters", id: "b" },
            ],
          },
        },
      },
    });
  });
});
