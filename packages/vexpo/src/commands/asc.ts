/**
 * `vexpo asc connect`. Internal step run by `vexpo full`, not exposed as a
 * standalone public command (no entry in `cli.ts`). Spawns
 * `eas integrations:asc:connect --bundle-id <bundle>` with `EXPO_ASC_API_KEY_*`
 * env vars pre-set from the cached `asc-key` state. Same orchestration pattern
 * `vexpo apple credentials` uses with `eas credentials:configure-build`.
 *
 * Why not pass `--api-key-id`: that flag matches against EAS's *uploaded* key
 * resources, not Apple-side key identifiers. Passing the cached 10-char Apple
 * key id (e.g. "3SBKJXPM27") fails with `No App Store Connect API key found
 * with Apple key identifier ...` when the key hasn't been uploaded to EAS yet,
 * which is the common case on a fresh project. The env vars let the wizard
 * upload the key on its own, then link the app, both inside the same spawn.
 *
 * The wizard still prompts once when no key is uploaded yet ("Use existing /
 * Set up new"). eas-cli owns the upload-and-link state; vexpo doesn't mirror
 * it. Skips entirely when `eas integrations:asc:status` already reports the
 * project as linked.
 */

import { existsSync } from "node:fs";

import { ascStatus } from "../lib/eas-integrations.ts";
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
      if (status.connected) {
        const label = status.ascApp?.bundleId ?? status.ascApp?.id ?? "ok";
        nop(`already connected (${label})`);
        await recordStep("apple-asc-link", {
          ascAppId: status.ascApp?.id,
          bundleId: status.ascApp?.bundleId,
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

  line();
  note("spawning `eas integrations:asc:connect`. Wizard prompts once when no");
  note("key is uploaded yet (Use existing / Set up new key). EXPO_ASC_API_KEY_*");
  note("env vars are pre-set so the credential paste step auto-fills.");

  if (!process.stdin.isTTY) {
    yep("non-TTY: skipping interactive wizard");
    return 0;
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: asc.p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

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
  return 0;
}
