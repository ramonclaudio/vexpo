import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-linking", () => {
  const parse = vi.fn((url: string) => {
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
  });
  return { parse, createURL: (p: string) => p };
});

import { parse } from "expo-linking";

import { redirectSystemPath } from "@/app/+native-intent";
import { resolveDeepLink } from "@/lib/deep-link";

const parseMock = parse as unknown as ReturnType<typeof vi.fn>;

const redirect = (path: string) => redirectSystemPath!({ path, initial: false });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDeepLink", () => {
  it("parses a valid path with query params", () => {
    const result = resolveDeepLink("vexpo://app/linked?foo=bar&n=1");
    expect(result.path).toBe("/linked");
    expect(result.href).toBe("/linked");
    expect(result.params).toEqual({ foo: "bar", n: "1" });
  });

  it("resolves a path alias to its canonical href", () => {
    const result = resolveDeepLink("vexpo://app/about");
    expect(result.path).toBe("/about");
    expect(result.href).toBe("/help");
  });

  it("returns null path for disallowed routes", () => {
    const result = resolveDeepLink("vexpo://app/admin");
    expect(result.path).toBeNull();
    expect(result.href).toBeNull();
    expect(result.params).toEqual({});
  });

  it("returns null path for path traversal attempts", () => {
    const result = resolveDeepLink("vexpo://app/../etc/passwd");
    expect(result.path).toBeNull();
    expect(result.href).toBeNull();
  });

  it("handles empty input", () => {
    expect(resolveDeepLink("")).toEqual({ path: null, href: null, params: {} });
  });

  it("handles garbage input without throwing", () => {
    expect(() => resolveDeepLink("not a url")).not.toThrow();
    const result = resolveDeepLink("not a url");
    expect(result.path).toBeNull();
    expect(result.href).toBeNull();
  });

  it("normalizes trailing slashes", () => {
    const result = resolveDeepLink("vexpo://app/linked/");
    expect(result.path).toBe("/linked");
    expect(result.href).toBe("/linked");
  });

  it("drops nullish query values and joins array values", () => {
    // URLSearchParams only yields strings, so the real source's `value == null`
    // skip and `Array.isArray` join branches are unreachable through a real URL.
    // Drive them directly via the parse mock.
    parseMock.mockReturnValueOnce({
      scheme: "vexpo",
      hostname: "app",
      path: "/linked",
      queryParams: { a: "1", b: null, tags: ["x", "y"] },
    });
    const result = resolveDeepLink("vexpo://app/linked");
    expect(result.params).toEqual({ a: "1", tags: "x,y" });
  });
});

describe("redirectSystemPath (native-intent)", () => {
  it("reattaches the query so params reach the route on the router's own navigation", () => {
    expect(redirect("vexpo://app/linked?foo=bar&n=1")).toBe("/linked?foo=bar&n=1");
  });

  it("returns the bare href when there's no query", () => {
    expect(redirect("vexpo://app/about")).toBe("/help");
  });

  it("carries the query across an alias rewrite", () => {
    expect(redirect("vexpo://app/about?ref=email")).toBe("/help?ref=email");
  });

  it("blocks unknown paths to /", () => {
    expect(redirect("vexpo://app/admin")).toBe("/");
  });
});
