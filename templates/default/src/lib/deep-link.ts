import type { Href } from "expo-router";
import { parse, createURL } from "expo-linking";

/**
 * Single source of truth for deep-linkable paths in this app.
 *
 * Keys are app-relative URL paths. Values are the typed Href the router pushes
 * when the link resolves. `+native-intent.tsx`, `use-deep-link.ts`, Apple
 * Universal Links, and Siri Shortcut destination declarations all read from
 * this map. Adding a deep-linkable route is one edit here.
 */
export const DeepLinkRoutes = {
  "/": "/",
  "/welcome": "/welcome",
  "/settings": "/(app)/(tabs)/settings",
  "/about": "/help",
  "/help": "/help",
  "/privacy": "/privacy",
  "/sign-in": "/sign-in",
  "/sign-up": "/sign-up",
  "/forgot-password": "/forgot-password",
  "/reset-password": "/reset-password",
  "/linked": "/linked",
} as const satisfies Record<string, Href>;

export type DeepLinkPath = keyof typeof DeepLinkRoutes;

function normalizePath(raw: string | null | undefined): string {
  const trimmed = "/" + (raw ?? "").replace(/^\//, "").replace(/\/+$/, "");
  return trimmed === "/" ? "/" : trimmed;
}

export function isDeepLinkPath(path: string): path is DeepLinkPath {
  return path in DeepLinkRoutes;
}

export function isValidDeepLink(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.includes("..")) return false;

  let parsed;
  try {
    parsed = parse(url);
  } catch {
    return false;
  }

  const isRelativePath = url.startsWith("/") && !url.startsWith("//");
  if (!isRelativePath && !parsed.scheme) return false;

  return isDeepLinkPath(normalizePath(parsed.path));
}

export type ResolvedDeepLink = {
  path: DeepLinkPath | null;
  href: Href | null;
  params: Record<string, string>;
};

/**
 * Parse a deep-link URL into typed `{ path, href, params }`.
 *
 * `path` is the URL-shape registry key. `href` is the typed router destination.
 * Returns `{ path: null, href: null, params: {} }` for invalid URLs, disallowed
 * paths, or traversal attempts. Pure: no React, no side effects.
 */
export function resolveDeepLink(url: string): ResolvedDeepLink {
  const empty: ResolvedDeepLink = { path: null, href: null, params: {} };
  if (!url || typeof url !== "string") return empty;

  let parsed;
  try {
    parsed = parse(url);
  } catch {
    return empty;
  }

  if (!isValidDeepLink(url)) return empty;

  const path = normalizePath(parsed.path) as DeepLinkPath;

  const params: Record<string, string> = {};
  if (parsed.queryParams) {
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (value == null) continue;
      params[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }

  return { path, href: DeepLinkRoutes[path], params };
}

export { createURL };
