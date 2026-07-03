import type { Href } from "expo-router";
import { parse } from "expo-linking";

export const DeepLinkRoutes = {
  "/": "/",
  "/welcome": "/welcome",
  "/settings": "/(app)/(tabs)/settings",
  "/about": "/help",
  "/help": "/help",
  "/privacy": "/privacy",
  "/auth/sign-in": "/auth/sign-in",
  "/auth/sign-up": "/auth/sign-up",
  "/auth/forgot-password": "/auth/forgot-password",
  "/auth/reset-password": "/auth/reset-password",
  "/sign-in": "/auth/sign-in",
  "/sign-up": "/auth/sign-up",
  "/forgot-password": "/auth/forgot-password",
  "/reset-password": "/auth/reset-password",
  "/linked": "/linked",
} as const satisfies Record<string, Href>;

type DeepLinkPath = keyof typeof DeepLinkRoutes;

function normalizePath(raw: string | null | undefined): string {
  const trimmed = "/" + (raw ?? "").replace(/^\//, "").replace(/\/+$/, "");
  return trimmed === "/" ? "/" : trimmed;
}

function isDeepLinkPath(path: string): path is DeepLinkPath {
  return path in DeepLinkRoutes;
}

function isValidDeepLink(url: string): boolean {
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

type ResolvedDeepLink = {
  path: DeepLinkPath | null;
  href: Href | null;
  params: Record<string, string>;
};

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
