import { access } from "node:fs/promises";

import { deploymentSlug } from "../../lib/convex-env.ts";
import { mintProdDeployKey } from "../../lib/convex-management.ts";
import { envCreate, envList, envUpdate, type EasEnvironment } from "../../lib/eas-project.ts";
import { readOne } from "../../lib/env-local.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  errText,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../../lib/output.ts";
import { load as loadState, lookupOutput, type SetupState } from "../../lib/state.ts";
import { resolveSiwaP8Path } from "./jwt.ts";

const ENVS: readonly EasEnvironment[] = ["production"];

export type RotationSecretsOptions = {
  force?: boolean;
};

type Secret = { name: string; value: string; type?: "file" | "string" };
type Tally = { created: number; updated: number; skipped: number };

async function upsertSecret(secret: Secret, present: boolean, tally: Tally): Promise<void> {
  const opts = secret.type ? { type: secret.type } : undefined;
  if (present) {
    await envUpdate(secret.name, secret.value, "secret", ENVS, opts);
    tally.updated += 1;
  } else {
    await envCreate(secret.name, secret.value, "secret", ENVS, opts);
    tally.created += 1;
  }
}

async function appleIdentity(
  state: SetupState,
): Promise<{ teamId: string; keyId: string; servicesId: string } | null> {
  const teamId =
    lookupOutput(state, ["apple-sign-in"], "teamId") ??
    (await readOne("EXPO_PUBLIC_APPLE_TEAM_ID"));
  const keyId = lookupOutput(state, ["apple-sign-in"], "keyId");
  const servicesId = lookupOutput(state, ["apple-sign-in"], "servicesId");
  if (teamId && keyId && servicesId) return { teamId, keyId, servicesId };

  const missing = [
    !teamId && "APPLE_TEAM_ID",
    !keyId && "APPLE_KEY_ID",
    !servicesId && "APPLE_SERVICES_ID",
  ]
    .filter(Boolean)
    .join(", ");
  bad(`missing Apple identity: ${missing}`);
  note("run `vexpo apple jwt` first to record these");
  return null;
}

async function readableP8(state: SetupState): Promise<string | null> {
  const p8Path = await resolveSiwaP8Path(state);
  if (!p8Path) {
    bad("no .p8 path provided");
    note("re-run with APPLE_P8_PATH=/path/to/AuthKey.p8");
    return null;
  }
  try {
    await access(p8Path);
  } catch {
    bad(`.p8 file not found at ${p8Path}`);
    return null;
  }
  return p8Path;
}

async function pushAppleSecrets(
  secrets: Secret[],
  existing: Map<string, string>,
  force: boolean,
  tally: Tally,
): Promise<boolean> {
  for (const secret of secrets) {
    const present = existing.has(secret.name);
    if (present && !force) {
      nop(`${secret.name} already set (--force to overwrite)`);
      tally.skipped += 1;
      continue;
    }
    try {
      await upsertSecret(secret, present, tally);
      ok(
        `${secret.name} ${present ? "updated" : "created"}${secret.type === "file" ? " (file type)" : ""}`,
      );
    } catch (err) {
      bad(`${secret.name}: ${errText(err)}`);
      return false;
    }
  }
  return true;
}

async function ensureConvexDeployKey(
  existing: Map<string, string>,
  force: boolean,
  tally: Tally,
): Promise<boolean> {
  const present = existing.has("CONVEX_DEPLOY_KEY");
  if (present && !force) {
    nop("CONVEX_DEPLOY_KEY already set");
    tally.skipped += 1;
    return true;
  }
  line();

  const set = async (key: string): Promise<void> =>
    upsertSecret({ name: "CONVEX_DEPLOY_KEY", value: key }, present, tally);

  try {
    const result = await mintProdDeployKey(
      deploymentSlug(await readOne("CONVEX_DEPLOYMENT")) ?? "",
      "eas-rotation",
    );
    if (result) {
      await set(result.key);
      ok(`minted + set CONVEX_DEPLOY_KEY for prod ${BOLD}${result.deployment}${RESET}`);
      return true;
    }
    yep("couldn't resolve the prod deployment (offline or not logged in)");
  } catch (err) {
    yep(`couldn't mint a deploy key: ${errText(err)}`);
  }

  if (!process.stdin.isTTY) {
    yep("skipped CONVEX_DEPLOY_KEY (non-interactive, mint unavailable)");
    tally.skipped += 1;
    return true;
  }
  const key = (
    await ask(`  Paste a Convex prod deploy key ${DIM}(or Enter to skip)${RESET} > `)
  ).trim();
  if (!key) {
    yep("skipped CONVEX_DEPLOY_KEY (set later with `eas env:create`)");
    tally.skipped += 1;
    return true;
  }
  try {
    await set(key);
    ok("CONVEX_DEPLOY_KEY set");
    return true;
  } catch (err) {
    bad(`CONVEX_DEPLOY_KEY: ${errText(err)}`);
    return false;
  }
}

export async function runEasRotationSecrets(options: RotationSecretsOptions): Promise<number> {
  section("EAS rotation secrets (production)");

  const existing = await envList("production");
  if (existing === null) {
    bad("could not list EAS production env");
    note("run `npx eas-cli login` and `npx eas-cli init` first");
    return 1;
  }

  const state = await loadState();
  const identity = await appleIdentity(state);
  if (!identity) return 1;

  const p8Path = await readableP8(state);
  if (!p8Path) return 1;

  const apple: Secret[] = [
    { name: "APPLE_P8_PRIVATE_KEY", value: p8Path, type: "file" },
    { name: "APPLE_TEAM_ID", value: identity.teamId },
    { name: "APPLE_KEY_ID", value: identity.keyId },
    { name: "APPLE_SERVICES_ID", value: identity.servicesId },
  ];

  const tally: Tally = { created: 0, updated: 0, skipped: 0 };
  const force = options.force === true;
  if (!(await pushAppleSecrets(apple, existing, force, tally))) return 1;
  if (!(await ensureConvexDeployKey(existing, force, tally))) return 1;

  line();
  ok(
    `${tally.created} created, ${tally.updated} updated, ${tally.skipped} skipped (of ${apple.length + 1} secrets)`,
  );
  yep(`${BOLD}rotation cron${RESET} reads these on the next fire (every 3 months on the 1st)`);
  return 0;
}
