import type { Href } from "expo-router";
import { parse } from "expo-linking";

// Public paths, as they appear in the auth emails and on the associated domain.
const DeepLinkRoutes = {
  "/": "/",
  "/welcome": "/welcome",
  "/settings": "/(app)/(tabs)/settings",
  "/help": "/help",
  "/privacy": "/privacy",
  "/linked": "/linked",
  "/sign-in": "/auth/sign-in",
  "/sign-up": "/auth/sign-up",
  "/forgot-password": "/auth/forgot-password",
  "/reset-password": "/auth/reset-password",
} as const satisfies Record<string, Href>;

type DeepLinkPath = keyof typeof DeepLinkRoutes;
export type DeepLinkHref = (typeof DeepLinkRoutes)[DeepLinkPath];

function normalizePath(raw: string | null | undefined): string {
  const trimmed = "/" + (raw ?? "").replace(/^\//, "").replace(/\/+$/, "");
  return trimmed === "/" ? "/" : trimmed;
}

function isDeepLinkPath(path: string): path is DeepLinkPath {
  return path in DeepLinkRoutes;
}

type ResolvedDeepLink = {
  href: DeepLinkHref | null;
  params: Record<string, string>;
};

export function resolveDeepLink(url: string): ResolvedDeepLink {
  const empty: ResolvedDeepLink = { href: null, params: {} };
  if (!url || url.includes("..")) return empty;

  let parsed;
  try {
    parsed = parse(url);
  } catch {
    return empty;
  }

  const isRelativePath = url.startsWith("/") && !url.startsWith("//");
  if (!isRelativePath && !parsed.scheme) return empty;

  // `vexpo://linked` parses the first segment as the hostname, `https://x/linked` as the path.
  const isWeb = parsed.scheme === "http" || parsed.scheme === "https";
  const rawPath = isWeb ? parsed.path : [parsed.hostname, parsed.path].filter(Boolean).join("/");
  const path = normalizePath(rawPath);
  if (!isDeepLinkPath(path)) return empty;

  const params: Record<string, string> = {};
  if (parsed.queryParams) {
    for (const [key, value] of Object.entries(parsed.queryParams)) {
      if (value == null) continue;
      params[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }

  return { href: DeepLinkRoutes[path], params };
}
