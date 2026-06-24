/**
 * `vexpo apple jwt`. signs an ES256 client_secret JWT from a SIWA `.p8` file
 * and writes APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_SECRET
 * to the current Convex deployment.
 *
 * Apple JWTs expire every 180 days. Re-run this with `--rotate` to renew.
 *
 * Env (skip prompts when provided):
 *   APPLE_P8_PATH        path to .p8 private key
 *   APPLE_TEAM_ID        10-char team ID (iss)
 *   APPLE_KEY_ID         10-char key ID (kid)
 *   APPLE_SERVICES_ID    Services ID, e.g. com.you.app.signin (sub)
 */

import { signClientSecret } from "../../lib/apple-jwt.ts";
import { deploymentSlug, envMap, envSet } from "../../lib/convex-env.ts";
import { readOne } from "../../lib/env-local.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  askYesNo,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../../lib/output.ts";
import { expandTilde, stagedP8 } from "../../lib/path.ts";
import { load as loadState, lookupCachedPath, recordStep } from "../../lib/state.ts";

export type AppleJwtOptions = {
  rotate?: boolean;
  copyFrom?: string;
};

const APPLE_ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_CLIENT_SECRET",
] as const;

/**
 * Copy the Apple Sign In env from another deployment onto the current one. The
 * client_secret JWT and key id live on the deployment, not in any .env file, so
 * env push can't migrate them. This pulls them off `from` (a deployment slug in
 * your account) and sets them here. No .p8 and no TTY needed. The copied JWT
 * keeps the source's expiry, so re-sign with `vexpo apple jwt` before it lapses.
 */
async function copyAppleEnv(from: string): Promise<number> {
  section("Apple Sign In");
  const slug = deploymentSlug(from) ?? from;
  const src = await envMap({ deployment: slug });
  const present = APPLE_ENV_KEYS.filter((k) => src.has(k) && src.get(k));
  if (present.length === 0) {
    bad(`no APPLE_* vars on deployment ${slug} (unreachable or not provisioned)`);
    note("pass a deployment slug your account can reach, e.g. `--copy-from old-deployment-123`");
    return 1;
  }
  const dst = await envMap();
  let copied = 0;
  for (const key of present) {
    const value = src.get(key)!;
    if (dst.get(key) === value) {
      nop(`${key} already matches`);
      continue;
    }
    await envSet(key, value);
    ok(`copied ${key} from ${slug}`);
    copied += 1;
  }
  line();
  ok(`Apple env copied from ${slug} (${copied} changed)`);
  if (!present.includes("APPLE_CLIENT_SECRET")) {
    yep("source had no APPLE_CLIENT_SECRET; re-sign with `vexpo apple jwt`");
  } else {
    note("the copied client_secret keeps the source's expiry; re-sign before it lapses");
  }
  return 0;
}

async function promptOrEnv(envName: string, prompt: string): Promise<string | undefined> {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return undefined;
  const v = (await ask(`  ${envName} ${DIM}(${prompt}, paste or Enter to skip) >${RESET} `)).trim();
  return v || undefined;
}

export async function runAppleJwt(options: AppleJwtOptions): Promise<number> {
  if (options.copyFrom) {
    try {
      return await copyAppleEnv(options.copyFrom);
    } catch (err) {
      bad(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  section("Apple Sign In");

  try {
    const env = await envMap();
    const rotateOnly = options.rotate === true;

    if (rotateOnly) {
      const missing = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID"].filter(
        (k) => !env.has(k),
      );
      if (missing.length) {
        bad(`--rotate needs existing ${missing.join(", ")}; run without it first`);
        return 1;
      }
    } else {
      note("Apple Sign In needs four values. Create them in Apple Developer:");
      note(
        "  1. Services ID with Sign In with Apple enabled (return URL = <convex-site>/api/auth/sign-in/apple/callback)",
      );
      note("  2. Sign In with Apple key (download the .p8 once)");
      note("  3. Note the Team ID (10 chars) and Key ID (10 chars)");
      line();
      await helpAndWait({
        body: "Open the Apple Developer Console:",
        urls: [
          {
            label: "Identifiers (Services ID)",
            url: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
          },
          {
            label: "Keys (Sign In with Apple key)",
            url: "https://developer.apple.com/account/resources/authkeys/list",
          },
        ],
        allowSkip: true,
        skipLabel: "skip",
      });
    }

    const servicesIdFromState = await readOne("APPLE_SERVICES_ID");
    const servicesId = rotateOnly
      ? env.get("APPLE_CLIENT_ID")
      : (servicesIdFromState ??
        (await promptOrEnv("APPLE_SERVICES_ID", "Services ID, e.g. com.you.app.signin")) ??
        env.get("APPLE_CLIENT_ID"));
    if (servicesIdFromState && !rotateOnly)
      ok(`reading APPLE_SERVICES_ID from .env.local: ${servicesIdFromState}`);
    const teamId = rotateOnly
      ? env.get("APPLE_TEAM_ID")
      : ((await promptOrEnv("APPLE_TEAM_ID", "10-char team ID")) ?? env.get("APPLE_TEAM_ID"));
    const keyId = rotateOnly
      ? env.get("APPLE_KEY_ID")
      : ((await promptOrEnv("APPLE_KEY_ID", "10-char key ID")) ?? env.get("APPLE_KEY_ID"));

    if (!servicesId || !teamId || !keyId) {
      yep("missing one of APPLE_SERVICES_ID / APPLE_TEAM_ID / APPLE_KEY_ID; aborting");
      note("re-run with values, or set them via APPLE_*_ID env vars");
      return 1;
    }

    if (!env.has("APPLE_CLIENT_ID") || env.get("APPLE_CLIENT_ID") !== servicesId) {
      await envSet("APPLE_CLIENT_ID", servicesId);
      ok(`set APPLE_CLIENT_ID=${servicesId}`);
    } else nop("APPLE_CLIENT_ID already set");

    if (!env.has("APPLE_TEAM_ID") || env.get("APPLE_TEAM_ID") !== teamId) {
      await envSet("APPLE_TEAM_ID", teamId);
      ok(`set APPLE_TEAM_ID=${teamId}`);
    } else nop("APPLE_TEAM_ID already set");

    if (!env.has("APPLE_KEY_ID") || env.get("APPLE_KEY_ID") !== keyId) {
      await envSet("APPLE_KEY_ID", keyId);
      ok(`set APPLE_KEY_ID=${keyId}`);
    } else nop("APPLE_KEY_ID already set");

    const cachedP8 =
      (await lookupCachedPath(await loadState(), ["apple-sign-in"], "p8Path")) ?? stagedP8();
    const rawP8 =
      process.env.APPLE_P8_PATH ??
      (process.stdin.isTTY
        ? cachedP8
          ? (await ask(`  Path to SIWA .p8 ${DIM}[cached: ${cachedP8}]${RESET} > `)).trim() ||
            cachedP8
          : (await ask(`  Path to SIWA .p8 ${DIM}(absolute or relative) >${RESET} `)).trim()
        : (cachedP8 ?? ""));
    const p8Path = rawP8 ? expandTilde(rawP8) : "";
    if (!p8Path) {
      yep("no .p8 path provided; APPLE_CLIENT_SECRET unchanged");
      note("re-run with APPLE_P8_PATH=/path/to/AuthKey.p8 or paste the path interactively");
      return 1;
    }

    let jwt: string;
    try {
      jwt = await signClientSecret({
        privateKey: { path: p8Path },
        teamId,
        keyId,
        servicesId,
        expirationDays: 180,
      });
    } catch (err) {
      bad(err instanceof Error ? err.message : String(err));
      return 1;
    }
    await envSet("APPLE_CLIENT_SECRET", jwt);
    ok("signed and set APPLE_CLIENT_SECRET (180-day expiry)");

    await recordStep("apple-sign-in", {
      servicesId,
      teamId,
      keyId,
      p8Path,
      signedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 86_400_000).toISOString(),
    });

    if (process.stdin.isTTY && !rotateOnly) {
      line();
      if (await askYesNo("Show the renewal date and rotate command?", false)) {
        const when = new Date(Date.now() + 150 * 86400_000);
        note(`renew on or before ${when.toDateString()} by running:`);
        note(`  ${BOLD}vexpo apple jwt --rotate${RESET}`);
      }
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
