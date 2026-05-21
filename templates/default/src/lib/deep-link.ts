import { parse, createURL } from "expo-linking";

export const ALLOWED_DEEP_LINK_PATHS = [
  "/",
  "/welcome",
  "/settings",
  "/about",
  "/help",
  "/privacy",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/linked",
] as const;

export function isValidDeepLink(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.includes("..")) return false;

  const { scheme, path } = parse(url);
  const isRelativePath = url.startsWith("/") && !url.startsWith("//");
  if (!isRelativePath && !scheme) return false;

  const normalizedPath = "/" + (path ?? "").replace(/^\//, "");

  return ALLOWED_DEEP_LINK_PATHS.some(
    (allowed) => normalizedPath === allowed || normalizedPath.startsWith(allowed + "/"),
  );
}

export type ResolvedDeepLink = {
  path: string | null;
  params: Record<string, string>;
};

/**
 * Pure helper that parses a deep link URL into `{ path, params }`.
 *
 * Returns `path: null` for invalid URLs, disallowed paths, or traversal attempts.
 * Array query values are joined with commas; nullish values are dropped.
 * Unit-testable: no React, no side effects.
 */
export function resolveDeepLink(url: string): ResolvedDeepLink {
  const empty: ResolvedDeepLink = { path: null, params: {} };
  if (!url || typeof url !== "string") return empty;

  let parsed;
  try {
    parsed = parse(url);
  } catch {
    return empty;
  }

  if (!isValidDeepLink(url)) return empty;

  const normalizedPath = "/" + (parsed.path ?? "").replace(/^\//, "").replace(/\/+$/, "");
  const path = normalizedPath === "/" ? "/" : normalizedPath;

  const params: Record<string, string> = {};
  if (parsed.queryParams) {
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (value == null) continue;
      params[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }

  return { path, params };
}

export { createURL };
