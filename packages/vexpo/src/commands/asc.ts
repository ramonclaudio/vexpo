/**
 * `vexpo asc` group. `eas integrations:asc:*`. Newer EAS-native path for
 * linking the project to an ASC app via API key.
 *
 * `vexpo apple asc-key` already validates the key against ASC; this group
 * tells EAS about the link so EAS can drive submit + metadata without
 * walking through the credentials wizard.
 */

import { readOne } from "../lib/env-local.ts";
import { ascConnect, ascStatus } from "../lib/eas-integrations.ts";
import { BOLD, DIM, RESET, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { load as loadState, recordStep } from "../lib/state.ts";

export async function runAscStatus(opts: { json?: boolean } = {}): Promise<number> {
  try {
    const data = await ascStatus();
    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return 0;
    }
    section("ASC integration status");
    if (data.connected) {
      ok("connected");
      if (data.ascApp?.bundleId) line(`  bundle: ${BOLD}${data.ascApp.bundleId}${RESET}`);
      if (data.ascApp?.id) line(`  ascAppId: ${DIM}${data.ascApp.id}${RESET}`);
      if (data.ascApp?.name) line(`  name: ${data.ascApp.name}`);
    } else {
      line(`  ${DIM}not connected${RESET}`);
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

/**
 * `vexpo asc connect`. Runs `eas integrations:asc:connect`. Without flags,
 * fills `--api-key-id` from the `asc-key` cached state and `--bundle-id`
 * from .env.local so the orchestrator can call this non-interactively.
 *
 * Skips with a no-op when EAS already reports the project as connected.
 */
export async function runAscConnect(opts: {
  apiKeyId?: string;
  ascAppId?: string;
  bundleId?: string;
  force?: boolean;
}): Promise<number> {
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
      // status fetch failed. likely no EAS project. Fall through to connect.
    }
  }

  const apiKeyId = opts.apiKeyId ?? (await ascKeyIdFromState());
  const bundleId = opts.bundleId ?? (await readOne("EXPO_PUBLIC_APP_BUNDLE_ID"));
  if (!apiKeyId) {
    yep("no --api-key-id and no cached ASC key id in state.json");
    note("run `vexpo apple asc-key` first, or pass --api-key-id");
  }
  if (!bundleId) {
    yep("no --bundle-id and no EXPO_PUBLIC_APP_BUNDLE_ID in .env.local");
    note("run `vexpo convex` first, or pass --bundle-id");
  }

  const exit = await ascConnect({
    apiKeyId,
    ascAppId: opts.ascAppId,
    bundleId,
  });
  if (exit !== 0) {
    bad(`eas integrations:asc:connect exited with ${exit}`);
    return exit;
  }
  ok("EAS project linked to ASC app");
  await recordStep("apple-asc-link", {
    ascApiKeyId: apiKeyId,
    bundleId,
    connectedAt: new Date().toISOString(),
  });
  return 0;
}

async function ascKeyIdFromState(): Promise<string | undefined> {
  const state = await loadState();
  const rec = state.steps["asc-key"];
  if (!rec?.outputs) return undefined;
  const keyId = (rec.outputs as Record<string, unknown>).keyId;
  return typeof keyId === "string" ? keyId : undefined;
}
