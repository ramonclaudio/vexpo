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

async function setUnlessMatches(
  env: Map<string, string>,
  key: string,
  value: string,
): Promise<void> {
  if (env.get(key) === value) {
    nop(`${key} already set to ${value}`);
    return;
  }
  await envSet(key, value);
  ok(`set ${key}=${value}`);
}

export async function runBetterAuth(options: BetterAuthOptions): Promise<number> {
  section("Better Auth env");

  const env = (await envMap()) ?? new Map<string, string>();

  const siteUrl = options.siteUrl ?? `${await scheme()}://`;
  await setUnlessMatches(env, "SITE_URL", siteUrl);

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
  await setUnlessMatches(env, "APP_NAME", desiredAppName);

  await recordStep("better-auth", {
    siteUrl,
    appName: desiredAppName,
    rotated: options.rotateSecret === true,
  });

  return 0;
}
