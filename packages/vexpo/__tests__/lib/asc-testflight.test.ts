/**
 * Request shapes verified against live App Store Connect responses from the
 * live run: tester CREATE rejects an `apps` relationship with 409
 * ENTITY_ERROR.RELATIONSHIP.NOT_ALLOWED, and the build's betaBuildLocalizations
 * endpoint rejects `filter[locale]` with 400 PARAMETER_ERROR.ILLEGAL.
 */
import { describe, expect, it, vi } from "vitest";

import type { AscClient } from "../../src/lib/asc-api.ts";
import { testflight } from "../../src/lib/asc-testflight.ts";

function fakeClient(overrides: Partial<Record<"request" | "paginatedList", unknown>> = {}) {
  return {
    request: vi.fn(async () => ({ data: { id: "new-id", type: "x", attributes: {} } })),
    paginatedList: vi.fn(async () => []),
    ...overrides,
  } as unknown as AscClient & {
    request: ReturnType<typeof vi.fn>;
    paginatedList: ReturnType<typeof vi.fn>;
  };
}

describe("betaTesters.create", () => {
  it("sends only a betaGroups relationship, never apps", async () => {
    const client = fakeClient();
    await testflight(client).betaTesters.create({
      email: "ray@example.com",
      firstName: "Ray",
      groupIds: ["g1"],
    });

    const [method, path, body] = client.request.mock.calls[0] as [string, string, unknown];
    expect(method).toBe("POST");
    expect(path).toBe("/v1/betaTesters");
    const relationships = (body as { data: { relationships: Record<string, unknown> } }).data
      .relationships;
    expect(Object.keys(relationships)).toEqual(["betaGroups"]);
    expect(relationships.betaGroups).toEqual({ data: [{ type: "betaGroups", id: "g1" }] });
  });
});

describe("betaBuildLocalizations.upsert", () => {
  it("lists without filter[locale] and PATCHes the locale-matched localization", async () => {
    const client = fakeClient({
      paginatedList: vi.fn(async () => [
        { type: "betaBuildLocalizations", id: "loc-de", attributes: { locale: "de-DE" } },
        { type: "betaBuildLocalizations", id: "loc-en", attributes: { locale: "en-US" } },
      ]),
    });
    await testflight(client).betaBuildLocalizations.upsert({
      buildId: "b1",
      locale: "en-US",
      whatsNew: "Initial release.",
    });

    const [listPath, listQuery] = client.paginatedList.mock.calls[0] as [string, unknown];
    expect(listPath).toBe("/v1/builds/b1/betaBuildLocalizations");
    expect(listQuery).toBeUndefined();

    const [method, path, body] = client.request.mock.calls[0] as [string, string, unknown];
    expect(method).toBe("PATCH");
    expect(path).toBe("/v1/betaBuildLocalizations/loc-en");
    expect((body as { data: { id: string } }).data.id).toBe("loc-en");
  });

  it("POSTs a new localization when the locale has none", async () => {
    const client = fakeClient({
      paginatedList: vi.fn(async () => [
        { type: "betaBuildLocalizations", id: "loc-de", attributes: { locale: "de-DE" } },
      ]),
    });
    await testflight(client).betaBuildLocalizations.upsert({
      buildId: "b1",
      locale: "en-US",
      whatsNew: "Initial release.",
    });

    const [method, path, body] = client.request.mock.calls[0] as [string, string, unknown];
    expect(method).toBe("POST");
    expect(path).toBe("/v1/betaBuildLocalizations");
    const data = (body as { data: { attributes: Record<string, string> } }).data;
    expect(data.attributes).toEqual({ whatsNew: "Initial release.", locale: "en-US" });
  });
});
