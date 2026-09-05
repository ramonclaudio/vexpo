import type { Href } from "expo-router";
import { parse } from "expo-linking";

const DeepLinkRoutes = {
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

type ResolvedDeepLink = {
  path: DeepLinkPath | null;
  href: Href | null;
  params: Record<string, string>;
};

export function resolveDeepLink(url: string): ResolvedDeepLink {
  const empty: ResolvedDeepLink = { path: null, href: null, params: {} };
  if (!url || typeof url !== "string" || url.includes("..")) return empty;

  let parsed;
  try {
    parsed = parse(url);
  } catch {
    return empty;
  }

  const isRelativePath = url.startsWith("/") && !url.startsWith("//");
  if (!isRelativePath && !parsed.scheme) return empty;

  const path = normalizePath(parsed.path);
  if (!isDeepLinkPath(path)) return empty;

  const params: Record<string, string> = {};
  if (parsed.queryParams) {
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (value == null) continue;
      params[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }

  return { path, href: DeepLinkRoutes[path], params };
}
