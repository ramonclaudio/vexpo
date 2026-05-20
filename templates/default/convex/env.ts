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
  // Email verification policy. Default `false` (minimal-tier setup, no Resend
  // configured). sign-up creates verified-immediately accounts so the user
  // can sign in without ever seeing an OTP. `npx vexpo full` flips
  // this to `true` on the Convex env when it provisions Resend.
  requireEmailVerification: bool("REQUIRE_EMAIL_VERIFICATION", false),
} as const;
