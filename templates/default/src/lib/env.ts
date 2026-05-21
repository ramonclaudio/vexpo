const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

if (!convexUrl) throw new Error("Missing required env var: EXPO_PUBLIC_CONVEX_URL");
if (!convexSiteUrl) throw new Error("Missing required env var: EXPO_PUBLIC_CONVEX_SITE_URL");

export const env = {
  convexUrl,
  convexSiteUrl,
} as const;
