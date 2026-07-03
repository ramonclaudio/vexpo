import { appName, scheme } from "../lib/app.ts";
import { envMap, envSet } from "../lib/convex-env.ts";
import { nop, ok, section } from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

export type BetterAuthOptions = {
  rotateSecret?: boolean;
  siteUrl?: string;
  appName?: string;
};

function base64Secret(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

export async function runBetterAuth(options: BetterAuthOptions): Promise<number> {
  section("Better Auth env");

  // A failed read coalesces to empty; the envSet calls below hit the same
  // auth/CLI error and fail loud through the CLI's error boundary.
  const env = (await envMap()) ?? new Map<string, string>();

  const siteUrl = options.siteUrl ?? `${await scheme()}://`;
  if (env.has("SITE_URL") && env.get("SITE_URL") === siteUrl) {
    nop(`SITE_URL already set to ${siteUrl}`);
  } else {
    await envSet("SITE_URL", siteUrl);
    ok(`set SITE_URL=${siteUrl}`);
  }

  if (env.has("BETTER_AUTH_SECRET") && !options.rotateSecret) {
    nop("BETTER_AUTH_SECRET already set (use --rotate-secret to regenerate)");
  } else {
    await envSet("BETTER_AUTH_SECRET", base64Secret());
    ok(
      options.rotateSecret === true
        ? "rotated BETTER_AUTH_SECRET (sessions invalidated)"
        : "generated BETTER_AUTH_SECRET",
    );
  }

  const desiredAppName = options.appName ?? (await appName());
  if (env.has("APP_NAME") && env.get("APP_NAME") === desiredAppName) {
    nop(`APP_NAME already set to ${desiredAppName}`);
  } else {
    await envSet("APP_NAME", desiredAppName);
    ok(`set APP_NAME=${desiredAppName}`);
  }

  await recordStep("better-auth", {
    siteUrl,
    appName: desiredAppName,
    rotated: options.rotateSecret === true,
  });

  return 0;
}
