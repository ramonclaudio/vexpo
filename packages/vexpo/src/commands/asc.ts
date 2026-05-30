/**
 * `vexpo asc connect`. Exposed as `vexpo asc:connect` and also run as a step by
 * `vexpo full`. Spawns
 * `eas integrations:asc:connect --bundle-id <bundle>` with `EXPO_ASC_API_KEY_*`
 * env vars pre-set from the cached `asc-key` state.
 *
 * Why not pass `--api-key-id`: that flag is the Apple-side 10-char key id
 * (e.g. "ABCDE12345"), and eas-cli looks it up against its *uploaded* key
 * resources. Passing the cached id when no key is uploaded fails with
 * `No App Store Connect API key found with Apple key identifier ...`, which
 * is the common case on a fresh project. Dropping the flag lets the wizard
 * generate-or-pick a key itself.
 *
 * What the env vars actually do: `AppStoreApi` in eas-cli reads
 * `hasAscEnvVars()` in its constructor and sets `defaultAuthenticationMode`
 * to `API_KEY` when set, `USER` otherwise. So with the env vars set, when
 * the wizard reaches `generateAscApiKeyAsync` and needs to authenticate to
 * Apple to create a new ASC API key, it uses our cached key for that auth
 * instead of prompting for Apple ID + password. The env vars do NOT auto-
 * fill the wizard's manual paste prompts (path / keyId / issuerId) -
 * those are only reached if the user declines the auto-generate offer.
 *
 * Common path (zero uploaded EAS keys, accept defaults):
 *   1. "Generate a new App Store Connect API Key?" -> Y (default)
 *   2. "Select role: ADMIN / APP_MANAGER" -> ADMIN (default)
 *   3. Maybe "Select app" if multiple match --bundle-id (rare)
 *
 * Side effect: creates a SECOND ASC API key on Apple, separate from the
 * "master" key cached in vexpo state. This is intentional separation: the
 * master key stays out of EAS's control (used for direct ASC API calls in
 * `vexpo apple services-id`, `vexpo apple jwt`, etc.), the EAS-managed key
 * is owned by EAS for build/submit/metadata.
 *
 * Idempotency: skips entirely when `eas integrations:asc:status` already
 * reports `status === "connected"`. Status type mirrors `buildJsonOutput`
 * in `expo/eas-cli` (`packages/eas-cli/src/integrations/asc/utils.ts`).
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { ascStatus } from "../lib/eas-integrations.ts";
import { withAscAppId } from "../lib/eas-submit.ts";
import { readOne } from "../lib/env-local.ts";
import { BOLD, RESET, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { expandTilde } from "../lib/path.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { spawn } from "../lib/proc.ts";
import { load as loadState, recordStep } from "../lib/state.ts";

async function loadAscFromState(): Promise<{
  issuerId: string;
  keyId: string;
  p8Path: string;
} | null> {
  const state = await loadState();
  const rec = state.steps["asc-key"];
  if (!rec?.outputs) return null;
  const out = rec.outputs as Record<string, unknown>;
  const issuerId = out.issuerId as string | undefined;
  const keyId = out.keyId as string | undefined;
  const rawPath = out.p8Path as string | undefined;
  if (!issuerId || !keyId || !rawPath) return null;
  const p8Path = expandTilde(rawPath);
  if (!existsSync(p8Path)) return null;
  return { issuerId, keyId, p8Path };
}

export async function runAscConnect(opts: { force?: boolean } = {}): Promise<number> {
  section("ASC connect");

  if (!opts.force) {
    try {
      const status = await ascStatus();
      if (status.status === "connected" && status.appStoreConnectApp) {
        const label =
          status.appStoreConnectApp.bundleIdentifier ?? status.appStoreConnectApp.ascAppIdentifier;
        nop(`already connected (${label})`);
        await recordStep("apple-asc-link", {
          ascAppId: status.appStoreConnectApp.ascAppIdentifier,
          ascAppEasId: status.appStoreConnectApp.id,
          bundleId: status.appStoreConnectApp.bundleIdentifier,
          connectedAt: new Date().toISOString(),
        });
        return 0;
      }
    } catch {
      // ascStatus failed (no EAS project yet, eas-cli too old, etc).
      // Fall through and attempt to spawn the connect wizard.
    }
  }

  const asc = await loadAscFromState();
  if (!asc) {
    bad("no cached ASC creds. Run `vexpo apple asc-key` first to validate one.");
    return 1;
  }
  ok("cached ASC API key found in state.json");
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${asc.p8Path}${RESET}`);

  const bundleId = await readOne("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (!bundleId) {
    bad("no EXPO_PUBLIC_APP_BUNDLE_ID in .env.local. Run `vexpo convex` first.");
    return 1;
  }
  ok(`bundle id: ${BOLD}${bundleId}${RESET}`);

  // `eas integrations:asc:connect --non-interactive` hard-requires both
  // --api-key-id and --asc-app-id (and can't generate a key headless), so a
  // non-TTY attempt always fails before doing anything. Require a TTY rather
  // than spawn a doomed command.
  if (!process.stdin.isTTY) {
    bad("ASC connect needs a TTY: eas integrations:asc:connect can't run headless");
    note("run `vexpo asc:connect` in an interactive terminal to finish the EAS↔ASC link");
    return 1;
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: asc.p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

  line();
  note("spawning `eas integrations:asc:connect`. Most likely flow:");
  note("  1. Press Y to generate a new ASC API key (default)");
  note("  2. Press Enter to accept ADMIN role (default)");
  note("EXPO_ASC_API_KEY_* env vars are set so eas-cli uses our cached key");
  note("for the Apple auth step, no Apple ID + password prompt.");

  const proc = spawn([dlx(), "eas", "integrations:asc:connect", "--bundle-id", bundleId], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  const code = await proc.exited;
  if (code !== 0) {
    bad(`eas integrations:asc:connect exited with code ${code}`);
    return code;
  }

  ok("EAS project linked to ASC app");
  await recordStep("apple-asc-link", {
    bundleId,
    ascIssuerId: asc.issuerId,
    ascKeyId: asc.keyId,
    connectedAt: new Date().toISOString(),
  });

  // Write the resolved ascAppId into eas.json submit profiles. `eas submit`
  // reads the app id only from the submit profile (no flag, no env var), so the
  // integration alone doesn't satisfy a non-interactive submit (CI, scripts).
  // The upstream template ships generic; this fills the fork's id, like rebrand.
  if (existsSync("eas.json")) {
    try {
      const ascAppId = (await ascStatus()).appStoreConnectApp?.ascAppIdentifier;
      if (ascAppId) {
        const before = await readFile("eas.json", "utf8");
        const after = withAscAppId(before, ascAppId);
        if (after !== before) {
          await writeFile("eas.json", after);
          ok(`wrote ascAppId ${BOLD}${ascAppId}${RESET} to eas.json submit profiles`);
          note("commit this in your fork: non-interactive `eas submit` (CI) needs it");
        } else {
          nop("eas.json submit profiles already carry ascAppId");
        }
      }
    } catch (err) {
      yep(`couldn't write ascAppId to eas.json: ${err instanceof Error ? err.message : err}`);
      note("non-interactive submit will need `ascAppId` set manually in eas.json");
    }
  }
  return 0;
}
