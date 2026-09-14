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

type AscAppResolution =
  | { kind: "found"; ascAppId: string }
  | { kind: "defer" }
  | { kind: "error"; error: unknown };

async function resolveAscApp(creds: AscCredentials, bundleId: string): Promise<AscAppResolution> {
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
      ok(`wrote ascAppId ${BOLD}${ascAppId}${RESET} to the eas.json submit profiles`);
      note("commit it, `vexpo submit` reads it");
    } else {
      nop("the eas.json submit profiles already have ascAppId");
    }
  } catch (err) {
    yep(`couldn't write ascAppId to eas.json: ${errText(err)}`);
    note("set `ascAppId` on the submit profile in eas.json by hand");
  }
}

export async function ensureAscAppId(
  creds: AscCredentials,
  bundleId: string,
): Promise<AscAppResolution> {
  const resolved = await resolveAscApp(creds, bundleId);
  if (resolved.kind === "found") await syncAscAppIdToEasJson(resolved.ascAppId);
  return resolved;
}

export async function ensureAscApiKeyInEasJson(): Promise<void> {
  if (!existsSync("eas.json")) return;
  const asc = await loadAscCreds();
  if (!asc) return;
  const rel = relative(process.cwd(), asc.p8Path);
  if (rel.startsWith("..")) {
    nop("the .p8 is outside the project, so eas.json keeps no key path");
    return;
  }
  const key = { path: `./${rel}`, keyId: asc.keyId, issuerId: asc.issuerId };
  try {
    const before = await readFile("eas.json", "utf8");
    const after = withAscApiKey(before, key);
    if (after !== before) {
      await writeFile("eas.json", after);
      ok(
        `wrote the App Store Connect key ${BOLD}${asc.keyId}${RESET} into the eas.json submit profiles`,
      );
      note("commit it. the .p8 itself stays gitignored");
    } else {
      nop("the eas.json submit profiles already have the key");
    }
  } catch (err) {
    yep(`couldn't write the key fields to eas.json: ${errText(err)}`);
  }
}

export function ascKeyEnvFrom(asc: AscCredentials): Record<string, string> {
  return {
    EXPO_ASC_API_KEY_PATH: asc.p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };
}

async function reuseExistingLink(): Promise<boolean> {
  const status = await ascStatus().catch(() => null);
  const app = status?.status === "connected" ? status.appStoreConnectApp : undefined;
  if (!app) return false;
  nop(`already connected (${app.bundleIdentifier ?? app.ascAppIdentifier})`);
  await recordStep("apple-asc-link");
  await syncAscAppIdToEasJson(app.ascAppIdentifier);
  await ensureAscApiKeyInEasJson();
  return true;
}

async function connectWithoutTerminal(ascAppId: string | undefined): Promise<number> {
  if (!ascAppId) {
    bad("no terminal, and the App Store Connect lookup failed, so nothing was written");
    note("run `vexpo asc connect` again in a terminal");
    return 1;
  }
  ok(`found ascAppId ${BOLD}${ascAppId}${RESET} in App Store Connect`);
  await syncAscAppIdToEasJson(ascAppId);
  await ensureAscApiKeyInEasJson();
  await recordStep("apple-asc-link");
  note("that's enough for `vexpo submit`. Cloud auto-submits also need the EAS project");
  note("linked, so run `vexpo asc connect` in a terminal for that.");
  return 0;
}

export async function reportCachedAscKey(): Promise<AscCredentials | null> {
  const asc = await loadAscCreds();
  if (!asc) {
    bad("no App Store Connect key cached. run `vexpo apple asc-key` first");
    return null;
  }
  ok("App Store Connect key found in .setup-state.json");
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${asc.p8Path}${RESET}`);
  return asc;
}

export async function runAscConnect(opts: { force?: boolean } = {}): Promise<number> {
  section("App Store Connect link");

  if (!opts.force && (await reuseExistingLink())) return 0;

  const asc = await reportCachedAscKey();
  if (!asc) return 1;

  const bundleId = await requireBundleId();
  if (!bundleId) return 1;
  ok(`bundle id: ${BOLD}${bundleId}${RESET}`);

  const resolved = await resolveAscApp(asc, bundleId);
  if (resolved.kind === "defer") {
    yep("App Store Connect has no app for this bundle id yet, so nothing to link");
    note("the app appears after the first submit. run:");
    note(`  ${BOLD}npm run eas:tf${RESET}`);
    note("then `npx vexpo asc connect` again");
    return 0;
  }

  if (!process.stdin.isTTY) {
    return connectWithoutTerminal(resolved.kind === "found" ? resolved.ascAppId : undefined);
  }

  line();
  note("running `eas integrations:asc:connect` with the cached key in env, so no Apple login.");
  note("If it asks about a key, press Y to make one, or pick the create-or-upload entry.");
  note("A stored key that was deleted at Apple fails with a 401.");

  const env = { ...(process.env as Record<string, string>), ...ascKeyEnvFrom(asc) };
  const code = await easSpawn(["integrations:asc:connect", "--bundle-id", bundleId], { env });
  if (code !== 0) {
    bad(`eas integrations:asc:connect exited with code ${code}`);
    note("a 401 means the stored key was deleted at Apple. Run this again and pick the");
    note("create-or-upload entry. Your local key keeps serving `vexpo submit`.");
    return code;
  }

  ok("EAS project linked to the App Store Connect app");
  await recordStep("apple-asc-link");

  const linked = await ascStatus().catch(() => null);
  await syncAscAppIdToEasJson(linked?.appStoreConnectApp?.ascAppIdentifier);
  await ensureAscApiKeyInEasJson();
  return 0;
}
