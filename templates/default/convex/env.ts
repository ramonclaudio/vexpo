const optional = (key: string, fallback: string): string => process.env[key] ?? fallback;

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const bool = (key: string, fallback: boolean): boolean => {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
};

export const env = {
  get convexSiteUrl() {
    return required("CONVEX_SITE_URL");
  },
  siteUrl: optional("SITE_URL", "vexpo://"),
  appName: optional("APP_NAME", "Vexpo"),
  email: {
    get from() {
      return required("EMAIL_FROM");
    },
  },
  requireEmailVerification: bool("REQUIRE_EMAIL_VERIFICATION", false),
} as const;
