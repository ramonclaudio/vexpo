import { deploymentSlug } from "../../lib/convex-env.ts";
import { mintProdDeployKey } from "../../lib/convex-management.ts";
import {
  envCreate,
  envList,
  envUpdate,
  resolveProjectId,
  type EasEnvironment,
} from "../../lib/eas-env.ts";
import { readEnvFile } from "../../lib/env-files.ts";
import { fileExists } from "../../lib/fs.ts";
import { BOLD, DIM, RESET, bad, line, note, ok, section, yep } from "../../lib/output.ts";

export type ConvexKeyOptions = {
  devKey?: string;
  prodKey?: string;
  localFile?: string;
  prodFile?: string;
  mint?: boolean;
};

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
  let prodKey = options.prodKey ?? prod.get("CONVEX_DEPLOY_KEY");
  const devSel = local.get("CONVEX_DEPLOYMENT");
  const prodSel = prod.get("CONVEX_DEPLOYMENT");

  // The prod deploy key is a secret that belongs on EAS, not in .env.prod (which
  // carries only the CONVEX_DEPLOYMENT selector). With --mint, create one via the
  // Platform API instead of reading it off disk, but only if EAS doesn't already
  // hold it, so re-runs and a prior eas-rotation-secrets don't mint a second key.
  if (options.mint && !prodKey) {
    const easProd = await envList("production").catch(() => new Map<string, string>());
    if (easProd.has("CONVEX_DEPLOY_KEY")) {
      note("prod CONVEX_DEPLOY_KEY already on EAS; skipping mint");
    } else {
      const slug = deploymentSlug(prodSel ?? devSel);
      const minted = slug ? await mintProdDeployKey(slug, "convex-key").catch(() => null) : null;
      if (minted) {
        prodKey = minted.key;
        ok(`minted prod deploy key for ${BOLD}${minted.deployment}${RESET}`);
      } else {
        yep("--mint: couldn't resolve the prod deployment to mint a key");
      }
    }
  }

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
