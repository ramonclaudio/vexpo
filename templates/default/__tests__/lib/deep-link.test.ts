import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-linking", () => {
  function parse(url: string) {
    try {
      const u = new URL(url);
      const queryParams: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        queryParams[k] = v;
      });
      return {
        scheme: u.protocol.replace(/:$/, ""),
        hostname: u.hostname || null,
        path: u.pathname || null,
        queryParams,
      };
    } catch {
      return { scheme: null, hostname: null, path: url, queryParams: null };
    }
  }
  return { parse, createURL: (p: string) => p };
});

import { resolveDeepLink } from "@/lib/deep-link";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDeepLink", () => {
  it("parses a valid path with query params", () => {
    const result = resolveDeepLink("vexpo://app/linked?foo=bar&n=1");
    expect(result.path).toBe("/linked");
    expect(result.params).toEqual({ foo: "bar", n: "1" });
  });

  it("returns null path for disallowed routes", () => {
    const result = resolveDeepLink("vexpo://app/admin");
    expect(result.path).toBeNull();
    expect(result.params).toEqual({});
  });

  it("returns null path for path traversal attempts", () => {
    const result = resolveDeepLink("vexpo://app/../etc/passwd");
    expect(result.path).toBeNull();
  });

  it("handles empty input", () => {
    expect(resolveDeepLink("")).toEqual({ path: null, params: {} });
  });

  it("handles garbage input without throwing", () => {
    expect(() => resolveDeepLink("not a url")).not.toThrow();
    const result = resolveDeepLink("not a url");
    expect(result.path).toBeNull();
  });

  it("normalizes trailing slashes", () => {
    const result = resolveDeepLink("vexpo://app/linked/");
    expect(result.path).toBe("/linked");
  });

  it("drops nullish query values", () => {
    const result = resolveDeepLink("vexpo://app/linked?x=1");
    expect(result.params).toEqual({ x: "1" });
  });
});
