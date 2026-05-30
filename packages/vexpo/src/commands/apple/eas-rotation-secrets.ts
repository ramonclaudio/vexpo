/**
 * `vexpo apple eas-rotation-secrets`. sets the 5 EAS production env secrets
 * the JWT rotation cron needs.
 *
 * The cron at `.eas/workflows/rotate-apple-jwt.yml` reads these every 90 days
 * to re-sign the Apple Sign In `client_secret` JWT. They have to be set
 * manually because they're secret-visibility EAS env vars: `eas env:push`
 * doesn't accept a visibility flag, and we don't push real secrets at default
 * visibility.
 *
 *   APPLE_P8_PRIVATE_KEY    PEM contents of the SIWA .p8 (read from path)
 *   APPLE_TEAM_ID           10-char team id
 *   APPLE_KEY_ID            10-char SIWA key id
 *   APPLE_SERVICES_ID       services id (e.g. com.you.app.signin)
 *   CONVEX_DEPLOY_KEY       prod deploy key (minted via the Platform API)
 *
 * For the 4 Apple values: read from .env.local + state cache, push idempotently.
 * For CONVEX_DEPLOY_KEY: mint one for the project's prod deployment via the
 * Convex Platform API (no dashboard), falling back to an interactive paste only
 * when the deployment can't be resolved (offline / not logged in).
 */

import { readFile } from "node:fs/promises";

import { deploymentSlug } from "../../lib/convex-env.ts";
import { mintDeployKey, resolveProdDeployment } from "../../lib/convex-management.ts";
import { envCreate, envList, envUpdate, type EasEnvironment } from "../../lib/eas-env.ts";
import { readOne } from "../../lib/env-local.ts";
import { BOLD, DIM, RESET, ask, bad, line, nop, note, ok, section, yep } from "../../lib/output.ts";
import { expandTilde } from "../../lib/path.ts";
import { load as loadState, lookupCachedPath } from "../../lib/state.ts";

const ENVS: readonly EasEnvironment[] = ["production"];

export type RotationSecretsOptions = {
  force?: boolean;
};

export async function runEasRotationSecrets(options: RotationSecretsOptions): Promise<number> {
  section("EAS rotation secrets (production)");

  let existing: Map<string, string>;
  try {
    existing = await envList("production");
  } catch (err) {
    bad(`could not list EAS production env: ${err instanceof Error ? err.message : err}`);
    note("run `npx eas login` and `npx eas init` first");
    return 1;
  }

  const teamId = await readOne("APPLE_TEAM_ID");
  const keyId = await readOne("APPLE_KEY_ID");
  const servicesId = (await readOne("APPLE_SERVICES_ID")) ?? (await readOne("APPLE_CLIENT_ID"));
  if (!teamId || !keyId || !servicesId) {
    const missing = [
      !teamId && "APPLE_TEAM_ID",
      !keyId && "APPLE_KEY_ID",
      !servicesId && "APPLE_SERVICES_ID",
    ]
      .filter(Boolean)
      .join(", ");
    bad(`missing from .env.local: ${missing}`);
    note("run `vexpo apple jwt` first to populate these");
    return 1;
  }

  const cachedP8 = await lookupCachedPath(await loadState(), ["apple-sign-in"], "p8Path");
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
    bad("no .p8 path provided");
    note("re-run with APPLE_P8_PATH=/path/to/AuthKey.p8");
    return 1;
  }
  let pem: string;
  try {
    pem = await readFile(p8Path, "utf8");
  } catch {
    bad(`.p8 file not found at ${p8Path}`);
    return 1;
  }

  // APPLE_P8_PRIVATE_KEY pushes as `--type file` per Resend / EAS docs
  // recommendation for .p8 binary content. Other rotation values are plain
  // strings.
  const apple: Array<{ name: string; value: string; type?: "file" | "string" }> = [
    { name: "APPLE_P8_PRIVATE_KEY", value: pem, type: "file" },
    { name: "APPLE_TEAM_ID", value: teamId },
    { name: "APPLE_KEY_ID", value: keyId },
    { name: "APPLE_SERVICES_ID", value: servicesId },
  ];

  let applied = 0;
  let skipped = 0;
  let updated = 0;
  for (const { name, value, type } of apple) {
    const present = existing.has(name);
    if (present && !options.force) {
      nop(`${name} already set (--force to overwrite)`);
      skipped += 1;
      continue;
    }
    try {
      if (present) {
        await envUpdate(name, value, "secret", ENVS, type ? { type } : undefined);
        ok(`${name} updated${type === "file" ? " (file type)" : ""}`);
        updated += 1;
      } else {
        await envCreate(name, value, "secret", ENVS, type ? { type } : undefined);
        ok(`${name} created${type === "file" ? " (file type)" : ""}`);
        applied += 1;
      }
    } catch (err) {
      bad(`${name}: ${err instanceof Error ? err.message : err}`);
      return 1;
    }
  }

  if (!existing.has("CONVEX_DEPLOY_KEY") || options.force) {
    line();
    const setKey = async (key: string): Promise<void> => {
      if (existing.has("CONVEX_DEPLOY_KEY")) {
        await envUpdate("CONVEX_DEPLOY_KEY", key, "secret", ENVS);
        updated += 1;
      } else {
        await envCreate("CONVEX_DEPLOY_KEY", key, "secret", ENVS);
        applied += 1;
      }
    };

    // Mint a prod deploy key via the Platform API: resolve the project's prod
    // deployment from the dev deployment in .env.local, then create a key.
    const prodSlug = await resolveProdDeployment(
      deploymentSlug(await readOne("CONVEX_DEPLOYMENT")) ?? "",
    );
    let minted = false;
    if (prodSlug) {
      try {
        const key = await mintDeployKey(prodSlug, { name: "eas-rotation" });
        await setKey(key);
        ok(`minted + set CONVEX_DEPLOY_KEY for prod ${BOLD}${prodSlug}${RESET}`);
        minted = true;
      } catch (err) {
        yep(`couldn't mint a deploy key: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      yep("couldn't resolve the prod deployment (offline or not logged in)");
    }

    // Fallback: interactive paste only when minting wasn't possible.
    if (!minted) {
      if (process.stdin.isTTY) {
        const key = (
          await ask(`  Paste a Convex prod deploy key ${DIM}(or Enter to skip)${RESET} > `)
        ).trim();
        if (key) {
          try {
            await setKey(key);
            ok("CONVEX_DEPLOY_KEY set");
          } catch (err) {
            bad(`CONVEX_DEPLOY_KEY: ${err instanceof Error ? err.message : err}`);
            return 1;
          }
        } else {
          yep("skipped CONVEX_DEPLOY_KEY (set later with `eas env:create`)");
          skipped += 1;
        }
      } else {
        yep("skipped CONVEX_DEPLOY_KEY (non-interactive, mint unavailable)");
        skipped += 1;
      }
    }
  } else {
    nop("CONVEX_DEPLOY_KEY already set");
    skipped += 1;
  }

  line();
  ok(`${applied} created, ${updated} updated, ${skipped} skipped (of ${apple.length + 1} secrets)`);
  yep(`${BOLD}rotation cron${RESET} reads these on the next fire (every 3 months on the 1st)`);
  return 0;
}
