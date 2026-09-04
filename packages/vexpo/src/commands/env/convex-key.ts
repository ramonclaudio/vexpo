import { deploymentSlug } from "../../lib/convex-env.ts";
import { mintProdDeployKey } from "../../lib/convex-management.ts";
import {
  envCreate,
  envList,
  envUpdate,
  resolveProjectId,
  type EasEnvironment,
} from "../../lib/eas-project.ts";
import { findProdEnvFile, readEnvFile } from "../../lib/env-files.ts";
import {
  BOLD,
  DIM,
  RESET,
  bad,
  errText,
  line,
  note,
  ok,
  plural,
  section,
  yep,
} from "../../lib/output.ts";

export type ConvexKeyOptions = {
  devKey?: string;
  prodKey?: string;
  localFile?: string;
  prodFile?: string;
  mint?: boolean;
};

async function upsert(
  name: string,
  value: string,
  visibility: "plaintext" | "secret",
  env: EasEnvironment,
  present: boolean,
): Promise<void> {
  if (present) await envUpdate(name, value, visibility, [env]);
  else await envCreate(name, value, visibility, [env]);
}

type Write = {
  name: string;
  value: string;
  visibility: "plaintext" | "secret";
  envs: EasEnvironment[];
  label: string;
};

async function mintProdKey(
  selector: string | undefined,
): Promise<{ ok: boolean; key?: string; easProd?: Map<string, string> }> {
  const easProd = await envList("production");
  if (easProd === null) {
    bad("could not list EAS production env");
    note("run `npx eas-cli login` and `npx eas-cli init` first");
    return { ok: false };
  }
  if (easProd.has("CONVEX_DEPLOY_KEY")) {
    note("prod CONVEX_DEPLOY_KEY already on EAS; skipping mint");
    return { ok: true, easProd };
  }
  const slug = deploymentSlug(selector);
  const minted = slug ? await mintProdDeployKey(slug, "convex-key").catch(() => null) : null;
  if (!minted) {
    yep("--mint: couldn't resolve the prod deployment to mint a key");
    return { ok: true, easProd };
  }
  ok(`minted prod deploy key for ${BOLD}${minted.deployment}${RESET}`);
  return { ok: true, key: minted.key, easProd };
}

function planWrites(keys: {
  devKey?: string;
  prodKey?: string;
  devSel?: string;
  prodSel?: string;
}): Write[] {
  const writes: Write[] = [];
  if (keys.devKey)
    writes.push({
      name: "CONVEX_DEPLOY_KEY",
      value: keys.devKey,
      visibility: "secret",
      envs: ["development"],
      label: "dev deploy key",
    });
  if (keys.prodKey)
    writes.push({
      name: "CONVEX_DEPLOY_KEY",
      value: keys.prodKey,
      visibility: "secret",
      envs: ["production"],
      label: "prod deploy key",
    });
  if (keys.devSel)
    writes.push({
      name: "CONVEX_DEPLOYMENT",
      value: keys.devSel,
      visibility: "plaintext",
      envs: ["development"],
      label: "dev selector",
    });
  if (keys.prodSel)
    writes.push({
      name: "CONVEX_DEPLOYMENT",
      value: keys.prodSel,
      visibility: "plaintext",
      envs: ["production", "preview"],
      label: "prod selector",
    });
  return writes;
}

async function presenceMaps(
  writes: Write[],
  known: Map<EasEnvironment, Map<string, string>>,
): Promise<Map<EasEnvironment, Map<string, string>> | null> {
  const maps = new Map(known);
  for (const env of new Set(writes.flatMap((w) => w.envs))) {
    if (maps.has(env)) continue;
    const map = await envList(env);
    if (map === null) {
      bad(`could not list EAS ${env} env`);
      note("run `npx eas-cli login` and `npx eas-cli init` first");
      return null;
    }
    maps.set(env, map);
  }
  return maps;
}

async function applyWrites(
  writes: Write[],
  envMaps: Map<EasEnvironment, Map<string, string>>,
): Promise<number> {
  let failed = 0;
  for (const w of writes) {
    for (const env of w.envs) {
      try {
        await upsert(w.name, w.value, w.visibility, env, envMaps.get(env)!.has(w.name));
        ok(`${env}: ${w.name} ${DIM}(${w.label})${RESET}`);
      } catch (err) {
        bad(`${env}: ${w.name} failed: ${errText(err)}`);
        failed += 1;
      }
    }
  }
  return failed;
}

async function loadEnvPair(
  options: ConvexKeyOptions,
): Promise<{ local: Map<string, string>; prod: Map<string, string> }> {
  const localFile = options.localFile ?? ".env.local";
  const prodFile = options.prodFile ?? (await findProdEnvFile()) ?? ".env.production";
  return { local: await readEnvFile(localFile), prod: await readEnvFile(prodFile) };
}

async function resolveProdKey(
  options: ConvexKeyOptions,
  prod: Map<string, string>,
  selector: string | undefined,
  known: Map<EasEnvironment, Map<string, string>>,
): Promise<{ ok: false } | { ok: true; key?: string }> {
  const existing = options.prodKey ?? prod.get("CONVEX_DEPLOY_KEY");
  if (existing || !options.mint) return { ok: true, key: existing };
  const minted = await mintProdKey(selector);
  if (!minted.ok) return { ok: false };
  if (minted.easProd) known.set("production", minted.easProd);
  return { ok: true, key: minted.key };
}

function warnKeyScope(devKey?: string, prodKey?: string): void {
  if (devKey && !devKey.startsWith("dev:"))
    yep("dev deploy key is not dev-scoped (expected dev:…)");
  if (prodKey && !prodKey.startsWith("prod:"))
    yep("prod deploy key is not prod-scoped (expected prod:…)");
}

export async function runConvexKey(options: ConvexKeyOptions): Promise<number> {
  section("EAS Convex key");

  const projectId = await resolveProjectId();
  if (!projectId) {
    bad("no EAS projectId. run `eas init` (or `vexpo full`) first");
    return 1;
  }
  ok(`EAS project: ${BOLD}${projectId}${RESET}`);

  const { local, prod } = await loadEnvPair(options);
  const devKey = options.devKey ?? local.get("CONVEX_DEPLOY_KEY");
  const devSel = local.get("CONVEX_DEPLOYMENT");
  const prodSel = prod.get("CONVEX_DEPLOYMENT");

  const known = new Map<EasEnvironment, Map<string, string>>();
  const resolved = await resolveProdKey(options, prod, prodSel ?? devSel, known);
  if (!resolved.ok) return 1;
  const prodKey = resolved.key;

  warnKeyScope(devKey, prodKey);

  const writes = planWrites({ devKey, prodKey, devSel, prodSel });
  if (writes.length === 0) {
    yep("no CONVEX_DEPLOY_KEY / CONVEX_DEPLOYMENT found in env files or flags");
    note("pass --dev-key / --prod-key, or set them in .env.local / .env.prod");
    return 1;
  }

  const envMaps = await presenceMaps(writes, known);
  if (!envMaps) return 1;

  const failed = await applyWrites(writes, envMaps);
  line();
  if (failed > 0) {
    bad(`${failed} write${plural(failed)} failed`);
    return 1;
  }
  ok("EAS Convex key + selector synced");
  note("`vexpo doctor` to confirm EAS now points at the active deployment");
  return 0;
}
