import type { NativeIntent } from "expo-router";
import { isValidDeepLink } from "@/lib/deep-link";

export const redirectSystemPath: NativeIntent["redirectSystemPath"] = ({
  path,
  initial: _initial,
}) => {
  if (!isValidDeepLink(path)) {
    if (__DEV__) console.warn("[NativeIntent] Blocked:", path);
    return "/";
  }

  return path;
};
