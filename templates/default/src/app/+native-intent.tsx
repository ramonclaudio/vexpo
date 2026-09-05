import type { NativeIntent } from "expo-router";
import { resolveDeepLink } from "@/lib/deep-link";

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
