import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";

import { makeAscClient, type AscCredentials } from "../lib/asc-api.ts";
import { loadAscCreds } from "../lib/asc-state.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { ascStatus } from "../lib/eas-integrations.ts";
import { withAscApiKey, withAscAppId } from "../lib/eas-submit.ts";
import { requireBundleId } from "../lib/env-local.ts";
import { BOLD, RESET, bad, errText, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

export type AscAppResolution =
  | { kind: "found"; ascAppId: string }
  | { kind: "defer" }
  | { kind: "error"; error: unknown }
  | { kind: "unknown" };

async function resolveAscApp(bundleId: string): Promise<AscAppResolution> {
  const creds = await loadAscCreds();
  if (!creds) return { kind: "unknown" };
  try {
    const id = (await makeAscClient(creds).apps.list({ bundleId }))[0]?.id;
    return id ? { kind: "found", ascAppId: id } : { kind: "defer" };
  } catch (error) {
    return { kind: "error", error };
  }
}

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
    yep(`couldn't write ascAppId to eas.json: ${errText(err)}`);
    note("non-interactive submit will need `ascAppId` set manually in eas.json");
  }
}

export async function ensureAscAppId(bundleId: string): Promise<AscAppResolution> {
  const resolved = await resolveAscApp(bundleId);
  if (resolved.kind === "found") await syncAscAppIdToEasJson(resolved.ascAppId);
  return resolved;
}

export async function ensureAscApiKeyInEasJson(): Promise<void> {
  if (!existsSync("eas.json")) return;
  const asc = await loadAscCreds();
  if (!asc || !("path" in asc.privateKey)) return;
  const rel = relative(process.cwd(), asc.privateKey.path);
  if (rel.startsWith("..")) {
    nop("ASC .p8 lives outside the repo; leaving eas.json submit-key fields unset");
    return;
  }
  const key = { path: `./${rel}`, keyId: asc.keyId, issuerId: asc.issuerId };
  try {
    const before = await readFile("eas.json", "utf8");
    const after = withAscApiKey(before, key);
    if (after !== before) {
      await writeFile("eas.json", after);
      ok(`wrote ASC key ${BOLD}${asc.keyId}${RESET} into eas.json submit profiles`);
      note("commit this; the .p8 stays gitignored, so CI submits need the file restored");
    } else {
      nop("eas.json submit profiles already carry the ASC key");
    }
  } catch (err) {
    yep(`couldn't write ASC key fields to eas.json: ${errText(err)}`);
  }
}

export async function ascKeyEnv(): Promise<Record<string, string> | null> {
  const asc = await loadAscCreds();
  if (!asc || !("path" in asc.privateKey)) return null;
  return {
    EXPO_ASC_API_KEY_PATH: asc.privateKey.path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };
}

async function reuseExistingLink(): Promise<boolean> {
  let app: NonNullable<Awaited<ReturnType<typeof ascStatus>>["appStoreConnectApp"]> | undefined;
  try {
    const status = await ascStatus();
    if (status.status !== "connected") return false;
    app = status.appStoreConnectApp;
  } catch {
    return false;
  }
  if (!app) return false;
  nop(`already connected (${app.bundleIdentifier ?? app.ascAppIdentifier})`);
  await recordStep("apple-asc-link", {
    ascAppId: app.ascAppIdentifier,
    ascAppEasId: app.id,
    bundleId: app.bundleIdentifier,
    connectedAt: new Date().toISOString(),
  });
  await syncAscAppIdToEasJson(app.ascAppIdentifier);
  await ensureAscApiKeyInEasJson();
  return true;
}

async function connectHeadless(bundleId: string, ascAppId: string | undefined): Promise<number> {
  if (!ascAppId) {
    bad("ASC connect needs a TTY and cached creds to resolve ascAppId headless");
    note("run `vexpo apple asc-key` to cache a key, then `vexpo asc connect` in a terminal");
    return 1;
  }
  ok(`resolved ascAppId ${BOLD}${ascAppId}${RESET} from App Store Connect`);
  await syncAscAppIdToEasJson(ascAppId);
  await ensureAscApiKeyInEasJson();
  await recordStep("apple-asc-link", {
    bundleId,
    ascAppId,
    integrationLinked: false,
    wroteAscAppIdAt: new Date().toISOString(),
  });
  note("enough for a non-interactive submit. for the EAS↔ASC server-side link");
  note("(cloud builds) run `vexpo asc connect` in a TTY; for a local submit set");
  note("EXPO_ASC_API_KEY_PATH / EXPO_ASC_KEY_ID / EXPO_ASC_ISSUER_ID.");
  return 0;
}

async function syncAfterConnect(): Promise<void> {
  if (!existsSync("eas.json")) return;
  const postStatus = await ascStatus().catch(() => null);
  await syncAscAppIdToEasJson(postStatus?.appStoreConnectApp?.ascAppIdentifier);
  await ensureAscApiKeyInEasJson();
}

type CachedAscKey = AscCredentials & {
  privateKey: Extract<AscCredentials["privateKey"], { path: string }>;
};

async function reportCachedAscKey(): Promise<CachedAscKey | null> {
  const asc = await loadAscCreds();
  if (!asc || !("path" in asc.privateKey)) {
    bad("no cached ASC creds. Run `vexpo apple asc-key` first to validate one.");
    return null;
  }
  ok("cached ASC API key found in state.json");
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${asc.privateKey.path}${RESET}`);
  return { issuerId: asc.issuerId, keyId: asc.keyId, privateKey: asc.privateKey };
}

export async function runAscConnect(opts: { force?: boolean } = {}): Promise<number> {
  section("ASC connect");

  if (!opts.force && (await reuseExistingLink())) return 0;

  const asc = await reportCachedAscKey();
  if (!asc) return 1;
  const p8Path = asc.privateKey.path;

  const bundleId = await requireBundleId();
  if (!bundleId) return 1;
  ok(`bundle id: ${BOLD}${bundleId}${RESET}`);

  const resolved = await resolveAscApp(bundleId);
  if (resolved.kind === "defer") {
    yep("no App Store Connect app record for this bundle id yet, NOT connected");
    note("the ASC app record only appears after the first `eas submit`. run:");
    note(
      `  ${BOLD}npx eas-cli build -p ios --profile production --auto-submit-with-profile testflight${RESET}`,
    );
    note("then re-run `npx vexpo asc connect` to finish the EAS↔ASC link");
    return 0;
  }

  if (!process.stdin.isTTY) {
    return connectHeadless(bundleId, resolved.kind === "found" ? resolved.ascAppId : undefined);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

  line();
  note("spawning `eas integrations:asc:connect`. The wizard branches on what");
  note("EAS's credential store already holds:");
  note("  • no stored ASC keys: press Y to generate one (default), Enter for ADMIN");
  note("  • stored keys exist: a picker, ending with a create-or-upload entry");
  yep("a stored key that was deleted at Apple fails with `rejected this API key");
  yep("with status 401` — don't pick it, take the create-or-upload entry instead");
  note("(it mints a fresh EAS-managed key or accepts your existing .p8 path).");
  note("EXPO_ASC_API_KEY_* env vars are set so eas-cli uses our cached key");
  note("for the Apple auth step, no Apple ID + password prompt.");

  const code = await easSpawn(["integrations:asc:connect", "--bundle-id", bundleId], { env });
  if (code !== 0) {
    bad(`eas integrations:asc:connect exited with code ${code}`);
    note("a 401 on a stored key means it was deleted at Apple. Re-run");
    note(`${BOLD}npx vexpo asc connect${RESET} and pick the key picker's create-or-upload`);
    note("entry: the EAS-managed key it mints is the expected SECOND key. Your");
    note("local key keeps serving eas.json/CLI submits, the EAS-managed one");
    note("serves the integration and cloud auto-submits. Both stay live.");
    return code;
  }

  ok("EAS project linked to ASC app");
  await recordStep("apple-asc-link", {
    bundleId,
    ascIssuerId: asc.issuerId,
    ascKeyId: asc.keyId,
    connectedAt: new Date().toISOString(),
  });

  await syncAfterConnect();
  return 0;
}
