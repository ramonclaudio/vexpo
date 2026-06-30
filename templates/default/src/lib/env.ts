const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

// These throws run at import time, before any React tree mounts, so the
// expo-router error boundary can't catch them. The EAS build env guard makes
// this a build/deploy check, not a runtime hazard.
if (!convexUrl) throw new Error("Missing required env var: EXPO_PUBLIC_CONVEX_URL");
if (!convexSiteUrl) throw new Error("Missing required env var: EXPO_PUBLIC_CONVEX_SITE_URL");

export const env = {
  convexUrl,
  convexSiteUrl,
} as const;
