/**
 * These have to be set manually because they're secret-visibility EAS env vars:
 * `eas env:push` doesn't accept a visibility flag, and we don't push real
 * secrets at default visibility.
 */

import { access } from "node:fs/promises";

import { deploymentSlug } from "../../lib/convex-env.ts";
import { mintProdDeployKey } from "../../lib/convex-management.ts";
import { envCreate, envList, envUpdate, type EasEnvironment } from "../../lib/eas-project.ts";
import { readOne } from "../../lib/env-local.ts";
import { BOLD, DIM, RESET, ask, bad, line, nop, note, ok, section, yep } from "../../lib/output.ts";
import { expandTilde, stagedP8 } from "../../lib/path.ts";
import { load as loadState, lookupCachedPath, lookupOutput } from "../../lib/state.ts";

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
    note("run `npx eas-cli login` and `npx eas-cli init` first");
    return 1;
  }

  // jwt.ts records identity to the apple-sign-in step and writes APPLE_TEAM_ID/
  // APPLE_KEY_ID to Convex, never bare to .env.local. Read from state, only
  // teamId has a .env.local mirror (EXPO_PUBLIC_APPLE_TEAM_ID) to fall back to.
  const state = await loadState();
  const teamId =
    lookupOutput(state, ["apple-sign-in"], "teamId") ??
    (await readOne("EXPO_PUBLIC_APPLE_TEAM_ID"));
  const keyId = lookupOutput(state, ["apple-sign-in"], "keyId");
  const servicesId = lookupOutput(state, ["apple-sign-in"], "servicesId");
  if (!teamId || !keyId || !servicesId) {
    const missing = [
      !teamId && "APPLE_TEAM_ID",
      !keyId && "APPLE_KEY_ID",
      !servicesId && "APPLE_SERVICES_ID",
    ]
      .filter(Boolean)
      .join(", ");
    bad(`missing Apple identity: ${missing}`);
    note("run `vexpo apple jwt` first to record these");
    return 1;
  }

  const cachedP8 = (await lookupCachedPath(state, ["apple-sign-in"], "p8Path")) ?? stagedP8();
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
  try {
    await access(p8Path);
  } catch {
    bad(`.p8 file not found at ${p8Path}`);
    return 1;
  }

  // APPLE_P8_PRIVATE_KEY pushes as `--type file`. eas env:create/update treat a
  // file-type value as a filesystem PATH (the CLI reads + base64-encodes it), so
  // pass p8Path, NOT the file contents. Other rotation values are plain strings.
  const apple: Array<{ name: string; value: string; type?: "file" | "string" }> = [
    { name: "APPLE_P8_PRIVATE_KEY", value: p8Path, type: "file" },
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

    let minted = false;
    try {
      const result = await mintProdDeployKey(
        deploymentSlug(await readOne("CONVEX_DEPLOYMENT")) ?? "",
        "eas-rotation",
      );
      if (result) {
        await setKey(result.key);
        ok(`minted + set CONVEX_DEPLOY_KEY for prod ${BOLD}${result.deployment}${RESET}`);
        minted = true;
      } else {
        yep("couldn't resolve the prod deployment (offline or not logged in)");
      }
    } catch (err) {
      yep(`couldn't mint a deploy key: ${err instanceof Error ? err.message : err}`);
    }

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
