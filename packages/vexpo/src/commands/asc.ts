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
 *
 * Defer: a brand-new bundle id has no ASC `apps` record until the first
 * `eas submit`, and the wizard would die on eas-cli's raw "Found 0 app(s)".
 * `ascAppExists` pre-checks with our cached creds and returns 0 with loud
 * guidance to run `eas build --auto-submit-with-profile testflight` first.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { makeAscClient } from "../lib/asc-api.ts";
import { loadAscCreds } from "../lib/asc-state.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { ascStatus } from "../lib/eas-integrations.ts";
import { withAscAppId } from "../lib/eas-submit.ts";
import { requireBundleId } from "../lib/env-local.ts";
import { BOLD, RESET, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

type AscAppResolution =
  | { kind: "found"; ascAppId: string }
  | { kind: "defer" }
  | { kind: "unknown" };

/**
 * Resolve the ASC app for a bundle id with the cached creds, carrying its
 * ascAppId (the App Store Connect numeric app id) when one exists. On a
 * brand-new bundle id no `apps` resource exists until the first `eas submit`,
 * so the wizard would die with eas-cli's raw "Found 0 app(s)". Outcomes:
 *   "found"    at least one app matches -> carries the ascAppId
 *   "defer"    cached creds + zero apps -> guide, don't spawn
 *   "unknown"  no cached creds, or the lookup itself errored -> spawn the wizard
 */
async function resolveAscApp(bundleId: string): Promise<AscAppResolution> {
  const creds = await loadAscCreds();
  if (!creds) return { kind: "unknown" };
  try {
    const id = (await makeAscClient(creds).apps.list({ bundleId }))[0]?.id;
    return id ? { kind: "found", ascAppId: id } : { kind: "defer" };
  } catch {
    return { kind: "unknown" };
  }
}

// Write the resolved ascAppId into eas.json submit profiles. `eas submit`
// reads the app id only from the submit profile (no flag, no env var), so the
// integration alone doesn't satisfy a non-interactive submit (CI, scripts).
// The upstream template ships generic; this fills the fork's id, like rebrand.
async function syncAscAppIdToEasJson(ascAppId: string | undefined): Promise<void> {
  if (!ascAppId || !existsSync("eas.json")) return;
  try {
    const before = await readFile("eas.json", "utf8");
    const after = withAscAppId(before, ascAppId);
    if (after !== before) {
      await writeFile("eas.json", after);
      ok(`wrote ascAppId ${BOLD}${ascAppId}${RESET} to eas.json submit profiles`);
      note("commit this in your fork: non-interactive `eas submit` (CI) needs it");
    } else {
      nop("eas.json submit profiles already carry ascAppId");
    }
  } catch (err) {
    yep(`couldn't write ascAppId to eas.json: ${err instanceof Error ? err.message : err}`);
    note("non-interactive submit will need `ascAppId` set manually in eas.json");
  }
}

/**
 * Resolve the ASC app id for a bundle id and write it into eas.json's submit
 * profiles. Returns the id, or null when no app record exists yet (the first
 * submit creates it). Shared by `asc:connect` and `submit`.
 */
export async function ensureAscAppId(bundleId: string): Promise<string | null> {
  const resolved = await resolveAscApp(bundleId);
  if (resolved.kind !== "found") return null;
  await syncAscAppIdToEasJson(resolved.ascAppId);
  return resolved.ascAppId;
}

/**
 * The `EXPO_ASC_*` env eas-cli reads to authenticate submits with our cached
 * ASC key (no EAS credential store needed), or null when no key is cached.
 */
export async function ascKeyEnv(): Promise<Record<string, string> | null> {
  const asc = await loadAscCreds();
  if (!asc || !("path" in asc.privateKey)) return null;
  return {
    EXPO_ASC_API_KEY_PATH: asc.privateKey.path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };
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
        // Already-connected still needs the eas.json fill: doctor's
        // asc-submit-id warn points here, so skipping it would loop the user.
        await syncAscAppIdToEasJson(status.appStoreConnectApp.ascAppIdentifier);
        return 0;
      }
    } catch {}
  }

  const asc = await loadAscCreds();
  if (!asc || !("path" in asc.privateKey)) {
    bad("no cached ASC creds. Run `vexpo apple asc-key` first to validate one.");
    return 1;
  }
  const p8Path = asc.privateKey.path;
  ok("cached ASC API key found in state.json");
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${p8Path}${RESET}`);

  const bundleId = await requireBundleId();
  if (!bundleId) return 1;
  ok(`bundle id: ${BOLD}${bundleId}${RESET}`);

  // No ASC `apps` resource exists for a brand-new bundle id until the first
  // `eas submit`. Spawning the wizard now just dies on eas-cli's raw
  // "Found 0 app(s)". Pre-check with our cached creds and defer loudly when
  // there's nothing to link yet.
  const resolved = await resolveAscApp(bundleId);
  if (resolved.kind === "defer") {
    yep("no App Store Connect app record for this bundle id yet, NOT connected");
    note("the ASC app record only appears after the first `eas submit`. run:");
    note(
      `  ${BOLD}npx eas-cli build -p ios --profile production --auto-submit-with-profile testflight${RESET}`,
    );
    note("then re-run `npx vexpo asc:connect` to finish the EAS↔ASC link");
    return 0;
  }

  // The EAS↔ASC integration wizard needs a TTY (it can't generate a key headless
  // and `--non-interactive` hard-requires --api-key-id + --asc-app-id). But a
  // non-interactive submit only needs `ascAppId` in eas.json: eas-cli reads the
  // app id from the submit profile, never a flag or env var. So when we can
  // resolve it from the ASC API, land it headless instead of failing, so CI and
  // non-interactive `vexpo full` runs aren't blocked on the wizard. The
  // server-side link (cloud submits) still wants a later interactive run.
  if (!process.stdin.isTTY) {
    if (resolved.kind === "found") {
      ok(`resolved ascAppId ${BOLD}${resolved.ascAppId}${RESET} from App Store Connect`);
      await syncAscAppIdToEasJson(resolved.ascAppId);
      await recordStep("apple-asc-link", {
        bundleId,
        ascAppId: resolved.ascAppId,
        integrationLinked: false,
        wroteAscAppIdAt: new Date().toISOString(),
      });
      note("enough for a non-interactive submit. for the EAS↔ASC server-side link");
      note("(cloud builds) run `vexpo asc:connect` in a TTY; for a local submit set");
      note("EXPO_ASC_API_KEY_PATH / EXPO_ASC_KEY_ID / EXPO_ASC_ISSUER_ID.");
      return 0;
    }
    bad("ASC connect needs a TTY and cached creds to resolve ascAppId headless");
    note("run `vexpo apple asc-key` to cache a key, then `vexpo asc:connect` in a terminal");
    return 1;
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

  line();
  note("spawning `eas integrations:asc:connect`. Most likely flow:");
  note("  1. Press Y to generate a new ASC API key (default)");
  note("  2. Press Enter to accept ADMIN role (default)");
  note("EXPO_ASC_API_KEY_* env vars are set so eas-cli uses our cached key");
  note("for the Apple auth step, no Apple ID + password prompt.");

  const code = await easSpawn(["integrations:asc:connect", "--bundle-id", bundleId], { env });
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

  if (existsSync("eas.json")) {
    let postStatus: Awaited<ReturnType<typeof ascStatus>> | null = null;
    try {
      postStatus = await ascStatus();
    } catch {
      postStatus = null;
    }
    await syncAscAppIdToEasJson(postStatus?.appStoreConnectApp?.ascAppIdentifier);
  }
  return 0;
}
