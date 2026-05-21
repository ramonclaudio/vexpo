import type { NativeIntent } from "expo-router";
import { resolveDeepLink } from "@/lib/deep-link";

/**
 * Validates and rewrites incoming system paths against the typed
 * `DeepLinkRoutes` registry before the router matches. Unknown or malformed
 * paths drop to `/`.
 */
export const redirectSystemPath: NativeIntent["redirectSystemPath"] = ({
  path,
  initial: _initial,
}) => {
  const { href } = resolveDeepLink(path);
  if (!href) {
    if (__DEV__) console.warn("[NativeIntent] Blocked:", path);
    return "/";
  }
  return href as string;
};
