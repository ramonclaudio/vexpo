/**
 * We do not create the key in App Store Connect. That has no API path. You
 * create it once in the ASC web UI; we validate from there. We also don't
 * upload the key to EAS (that's `eas credentials`): the key being valid here
 * doesn't mean EAS knows about it.
 */

import { validate as validateAsc, type AscCredentials } from "../../lib/asc-api.ts";
import { loadAscCreds } from "../../lib/asc-state.ts";
import { fileExists } from "../../lib/fs.ts";
import { expandTilde, stagedP8 } from "../../lib/path.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";

export type AscKeyOptions = {
  revalidate?: boolean;
};

async function promptCredsInteractive(): Promise<AscCredentials | null> {
  if (!process.stdin.isTTY) return null;
  line();
  note("Create an App Store Connect API key:");
  await helpAndWait({
    body: "1. Open ASC → Users and Access → Integrations → App Store Connect API",
    urls: [
      {
        label: "ASC Integrations",
        url: "https://appstoreconnect.apple.com/access/integrations/api",
      },
    ],
    allowSkip: false,
  });
  line();
  note("2. Click 'Generate API Key' (top-right). Name it (e.g. 'vexpo-asc').");
  note("3. Set the role to 'Admin' or 'App Manager'.");
  note("4. Click 'Generate'. The key cannot be retrieved later. save the .p8 now.");
  note("5. From the table: copy the Issuer ID (above the table) and Key ID.");
  line();

  const issuerId = (await ask(`  Issuer ID ${DIM}(UUID, e.g. 69a6d…) >${RESET} `)).trim();
  if (!issuerId) {
    yep("no issuer id provided; aborting");
    return null;
  }
  const keyId = (await ask(`  Key ID ${DIM}(10 chars) >${RESET} `)).trim();
  if (!keyId) {
    yep("no key id provided; aborting");
    return null;
  }
  const staged = stagedP8();
  const rawP8 =
    (
      await ask(
        staged
          ? `  Path to .p8 ${DIM}[detected: ${staged}]${RESET} > `
          : `  Path to .p8 ${DIM}(save it in ./credentials/, or absolute/relative path) >${RESET} `,
      )
    ).trim() ||
    (staged ?? "");
  if (!rawP8) {
    yep("no .p8 path provided; aborting");
    return null;
  }
  const p8Path = expandTilde(rawP8);
  if (!(await fileExists(p8Path))) {
    bad(`.p8 not found at ${p8Path}`);
    return null;
  }
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

// Env override lets a CI run point at a key without writing setup state.
export function ascCredsFromEnv(): AscCredentials | null {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const p8Path = process.env.APPLE_ASC_P8_PATH;
  if (!issuerId || !keyId || !p8Path) return null;
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

async function readEnvCreds(): Promise<AscCredentials | null> {
  const creds = ascCredsFromEnv();
  if (!creds) return null;
  const p8Path = process.env.APPLE_ASC_P8_PATH!;
  if (!(await fileExists(expandTilde(p8Path)))) {
    bad(`APPLE_ASC_P8_PATH=${p8Path} not found`);
    return null;
  }
  return creds;
}

export async function runAscKey(options: AscKeyOptions): Promise<number> {
  section("App Store Connect API key");

  if (options.revalidate) {
    const cached = await loadAscCreds();
    if (!cached) {
      bad("no cached ASC key in state.json; run without --revalidate first");
      return 1;
    }

    const result = await validateAsc(cached);
    if (!result.ok) {
      bad(`cached key invalid: ${result.reason}`);
      return 1;
    }
    ok(`cached key still valid (${result.appCount} app${result.appCount === 1 ? "" : "s"})`);
    await recordStep("asc-key", {
      issuerId: cached.issuerId,
      keyId: cached.keyId,
      p8Path: "path" in cached.privateKey ? cached.privateKey.path : undefined,
    });
    return 0;
  }

  const cached = await loadAscCreds();
  if (cached) {
    nop(`cached ASC key found (issuer=${cached.issuerId.slice(0, 8)}…, key=${cached.keyId})`);
    const result = await validateAsc(cached);
    if (result.ok) {
      ok(`cached key valid (${result.appCount} app${result.appCount === 1 ? "" : "s"})`);
      await recordStep("asc-key", {
        issuerId: cached.issuerId,
        keyId: cached.keyId,
        p8Path: "path" in cached.privateKey ? cached.privateKey.path : undefined,
      });
      return 0;
    }
    yep(`cached key failed validation: ${result.reason}`);
  }

  let creds = await readEnvCreds();
  if (!creds) creds = await promptCredsInteractive();
  if (!creds) {
    bad("no credentials provided");
    return 1;
  }

  const validation = await validateAsc(creds);
  if (!validation.ok) {
    bad(validation.reason);
    return 1;
  }
  ok(
    `ASC API authenticated (${validation.appCount} app${validation.appCount === 1 ? "" : "s"} on team)`,
  );

  const p8Path = "path" in creds.privateKey ? creds.privateKey.path : undefined;
  await recordStep("asc-key", {
    issuerId: creds.issuerId,
    keyId: creds.keyId,
    p8Path,
    validatedAt: new Date().toISOString(),
  });
  ok("validated key cached in .setup-state.json");

  line();
  note(
    `${BOLD}This step is purely validation${RESET} ${DIM}- EAS still needs the same key uploaded:${RESET}`,
  );
  note(`  ${BOLD}npx eas-cli credentials -p ios${RESET}`);
  note(`  → Build Credentials → 'Use existing App Store Connect API Key'`);
  note(`  → 'Set up a new key' if no existing match, paste:`);
  note(`     issuer=${creds.issuerId}, keyId=${creds.keyId}`);
  note(`     .p8=${p8Path ?? "<paste contents>"}`);
  return 0;
}
