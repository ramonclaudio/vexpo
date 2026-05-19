/**
 * `vexpo apple asc-key`. validates an App Store Connect API key against the
 * ASC REST API and caches the (issuerId, keyId, p8Path) tuple in
 * .setup-state.json so other vexpo commands that talk to ASC directly
 * (`vexpo apple services-id`) can reuse it without re-prompting.
 *
 * What this is NOT:
 *   - We do not upload the key to EAS. That's `eas credentials`. The key
 *     being valid here doesn't mean EAS knows about it.
 *   - We do not create the key in App Store Connect. That has no API path.
 *     You create it once in the ASC web UI; we validate from there.
 *
 * Why we run this before `eas credentials`: catching a bad key here saves
 * the round-trip of uploading to EAS and watching the build fail. Validation
 * is a single GET /v1/apps with the signed JWT; it takes <1 second.
 *
 * Env (skip prompts, useful for CI):
 *   APPLE_ASC_ISSUER_ID    issuer (UUID)
 *   APPLE_ASC_KEY_ID       10-char key id
 *   APPLE_ASC_P8_PATH      path to AuthKey_<id>.p8
 */

import { access } from "node:fs/promises";

import { validate as validateAsc, type AscCredentials } from "../../lib/asc-api.ts";
import { expandTilde } from "../../lib/path.ts";
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
import { load, recordStep } from "../../lib/state.ts";

export type AscKeyOptions = {
  revalidate?: boolean;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(expandTilde(p));
    return true;
  } catch {
    return false;
  }
}

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
  const rawP8 = (await ask(`  Path to .p8 ${DIM}(absolute or relative) >${RESET} `)).trim();
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

async function readEnvCreds(): Promise<AscCredentials | null> {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const p8Path = process.env.APPLE_ASC_P8_PATH;
  if (!issuerId || !keyId || !p8Path) return null;
  if (!(await fileExists(p8Path))) {
    bad(`APPLE_ASC_P8_PATH=${p8Path} not found`);
    return null;
  }
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

async function readStateCreds(): Promise<AscCredentials | null> {
  const state = await load();
  const rec = state.steps["asc-key"];
  if (!rec?.outputs) return null;
  const out = rec.outputs as Record<string, unknown>;
  const issuerId = out.issuerId as string | undefined;
  const keyId = out.keyId as string | undefined;
  const p8Path = out.p8Path as string | undefined;
  if (!issuerId || !keyId || !p8Path) return null;
  if (!(await fileExists(p8Path))) return null;
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

export async function runAscKey(options: AscKeyOptions): Promise<number> {
  section("App Store Connect API key");

  try {
    if (options.revalidate) {
      const cached = await readStateCreds();
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

    const cached = await readStateCreds();
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
    note(`  ${BOLD}bunx eas credentials -p ios${RESET}`);
    note(`  → Build Credentials → 'Use existing App Store Connect API Key'`);
    note(`  → 'Set up a new key' if no existing match, paste:`);
    note(`     issuer=${creds.issuerId}, keyId=${creds.keyId}`);
    note(`     .p8=${p8Path ?? "<paste contents>"}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
