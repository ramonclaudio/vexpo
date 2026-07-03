import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeAccess } from "../../src/lib/resend-api";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function res(status: number, body = "", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("probeAccess", () => {
  it("returns full on 2xx", async () => {
    fetchSpy.mockResolvedValue(res(200, JSON.stringify({ data: [] })));
    expect(await probeAccess("re_x")).toBe("full");
  });

  it("returns sending when the body flags a restricted key", async () => {
    fetchSpy.mockResolvedValue(res(401, JSON.stringify({ name: "restricted_api_key" })));
    expect(await probeAccess("re_x")).toBe("sending");
  });

  it("returns invalid only on 401/403", async () => {
    fetchSpy.mockResolvedValue(res(403, "forbidden"));
    expect(await probeAccess("re_x")).toBe("invalid");
  });

  it("throws on a 5xx instead of reporting invalid", async () => {
    fetchSpy.mockResolvedValue(res(503, "upstream down"));
    await expect(probeAccess("re_x")).rejects.toThrow(/503/);
  });

  it("retries a 429 then classifies", async () => {
    let n = 0;
    fetchSpy.mockImplementation(async () => {
      n += 1;
      if (n === 1) return res(429, "", { "retry-after": "0" });
      return res(200, JSON.stringify({ data: [] }));
    });
    expect(await probeAccess("re_x")).toBe("full");
    expect(n).toBe(2);
  });

  it("bails loudly on an oversized Retry-After instead of freezing the CLI", async () => {
    let n = 0;
    fetchSpy.mockImplementation(async () => {
      n += 1;
      return res(429, "", { "retry-after": "3600" });
    });
    await expect(probeAccess("re_x")).rejects.toThrow(/429/);
    expect(n).toBe(1);
  });
});
