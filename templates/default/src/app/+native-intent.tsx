import type { NativeIntent } from "expo-router";
import { resolveDeepLink } from "@/lib/deep-link";

/**
 * Validates and rewrites incoming system paths against the typed
 * `DeepLinkRoutes` registry before the router matches. Unknown or malformed
 * paths drop to `/`.
 *
 * This is the single entry point for deep-link navigation (expo-router runs
 * `redirectSystemPath` and drives the navigator itself for both cold-start and
 * warm links). The resolved query is reattached to the returned path so the
 * router, which parses the returned string as a URL, delivers params to the
 * destination's `useLocalSearchParams`. Returning the bare path here would
 * strip the query and render the screen param-less.
 */
export const redirectSystemPath: NativeIntent["redirectSystemPath"] = ({ path }) => {
  const { href, params } = resolveDeepLink(path);
  if (!href) {
    if (__DEV__) console.warn("[NativeIntent] Blocked:", path);
    return "/";
  }
  const route = href as string;
  const search = new URLSearchParams(params).toString();
  return search ? `${route}?${search}` : route;
};
