/**
 * `vexpo env convex-key`. Syncs the Convex deploy key + deployment selector to
 * EAS env so builds and the deploy-production workflow target the right Convex
 * deployment. env push deliberately skips these (CONVEX_DEPLOY_KEY is a
 * secret-visibility MANUAL_EAS_SECRET, CONVEX_DEPLOYMENT is an IGNORED_KEY), so
 * after a deployment migration the EAS-side key + selector go stale and the
 * build pipeline keeps deploying to the old project. This is the one path that
 * refreshes them.
 *
 *   dev key/selector  → EAS development
 *   prod key          → EAS production (the deploy-production job runs there)
 *   prod selector     → EAS production + preview (matches the URL routing)
 */

import { access } from "node:fs/promises";

import {
  envCreate,
  envList,
  envUpdate,
  resolveProjectId,
  type EasEnvironment,
} from "../../lib/eas-env.ts";
import { readEnvFile } from "../../lib/env-files.ts";
import { BOLD, DIM, RESET, bad, line, note, ok, section, yep } from "../../lib/output.ts";

export type ConvexKeyOptions = {
  devKey?: string;
  prodKey?: string;
  localFile?: string;
  prodFile?: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Create-or-update: env:update errors if the var doesn't exist yet, so branch on presence. */
async function upsert(
  name: string,
  value: string,
  visibility: "plaintext" | "secret",
  env: EasEnvironment,
): Promise<void> {
  const existing = await envList(env);
  if (existing.has(name)) await envUpdate(name, value, visibility, [env]);
  else await envCreate(name, value, visibility, [env]);
}

type Write = {
  name: string;
  value: string;
  visibility: "plaintext" | "secret";
  envs: EasEnvironment[];
  label: string;
};

export async function runConvexKey(options: ConvexKeyOptions): Promise<number> {
  section("EAS Convex key");

  const projectId = await resolveProjectId();
  if (!projectId) {
    bad("no EAS projectId. run `eas init` (or `vexpo full`) first");
    return 1;
  }
  ok(`EAS project: ${BOLD}${projectId}${RESET}`);

  const localFile = options.localFile ?? ".env.local";
  const prodFile =
    options.prodFile ?? ((await fileExists(".env.prod")) ? ".env.prod" : ".env.production");
  const local = await readEnvFile(localFile);
  const prod = await readEnvFile(prodFile);

  const devKey = options.devKey ?? local.get("CONVEX_DEPLOY_KEY");
  const prodKey = options.prodKey ?? prod.get("CONVEX_DEPLOY_KEY");
  const devSel = local.get("CONVEX_DEPLOYMENT");
  const prodSel = prod.get("CONVEX_DEPLOYMENT");

  if (devKey && !devKey.startsWith("dev:"))
    yep("dev deploy key is not dev-scoped (expected dev:…)");
  if (prodKey && !prodKey.startsWith("prod:"))
    yep("prod deploy key is not prod-scoped (expected prod:…)");

  const writes: Write[] = [];
  if (devKey)
    writes.push({
      name: "CONVEX_DEPLOY_KEY",
      value: devKey,
      visibility: "secret",
      envs: ["development"],
      label: "dev deploy key",
    });
  if (prodKey)
    writes.push({
      name: "CONVEX_DEPLOY_KEY",
      value: prodKey,
      visibility: "secret",
      envs: ["production"],
      label: "prod deploy key",
    });
  if (devSel)
    writes.push({
      name: "CONVEX_DEPLOYMENT",
      value: devSel,
      visibility: "plaintext",
      envs: ["development"],
      label: "dev selector",
    });
  if (prodSel)
    writes.push({
      name: "CONVEX_DEPLOYMENT",
      value: prodSel,
      visibility: "plaintext",
      envs: ["production", "preview"],
      label: "prod selector",
    });

  if (writes.length === 0) {
    yep("no CONVEX_DEPLOY_KEY / CONVEX_DEPLOYMENT found in env files or flags");
    note("pass --dev-key / --prod-key, or set them in .env.local / .env.prod");
    return 1;
  }

  let failed = 0;
  for (const w of writes) {
    for (const env of w.envs) {
      try {
        await upsert(w.name, w.value, w.visibility, env);
        ok(`${env}: ${w.name} ${DIM}(${w.label})${RESET}`);
      } catch (err) {
        bad(`${env}: ${w.name} failed: ${err instanceof Error ? err.message : err}`);
        failed += 1;
      }
    }
  }

  line();
  if (failed > 0) {
    bad(`${failed} write${failed === 1 ? "" : "s"} failed`);
    return 1;
  }
  ok("EAS Convex key + selector synced");
  note("`vexpo doctor` to confirm EAS now points at the active deployment");
  return 0;
}
