/**
 * `vexpo apple credentials`. wraps `eas credentials:configure-build`.
 *
 * Loads the cached ASC API key from `.setup-state.json` and passes it to
 * eas-cli via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID`
 * env vars so the wizard skips the Apple Developer login prompt and generates
 * the dist cert + provisioning profile + push key automatically.
 *
 * Idempotent: re-running detects existing credentials on EAS and reuses them.
 */

import { existsSync } from "node:fs";

import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section, yep } from "../../lib/output.ts";
import { expandTilde } from "../../lib/path.ts";
import { dlx } from "../../lib/pkg-manager.ts";
import { spawn } from "../../lib/proc.ts";
import { load as loadState, recordStep } from "../../lib/state.ts";

export type CredentialsOptions = {
  profile?: string;
};

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

export async function runAppleCredentials(options: CredentialsOptions): Promise<number> {
  section("EAS iOS credentials");

  const profile = options.profile ?? "production";
  const asc = await loadAscFromState();

  if (!asc) {
    yep("no cached ASC creds. Run `vexpo apple asc-key` first to validate one.");
    return 1;
  }

  ok(`cached ASC API key found in state.json`);
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${asc.p8Path}${RESET}`);

  line();
  note("eas-cli's credentials wizard is interactive (no non-interactive path).");
  note("It walks through:");
  note(`  1. ${BOLD}App Store Connect: Manage your API Key${RESET}, Set up a new key`);
  note("     paste the 3 values above when prompted");
  note(`  2. ${BOLD}Build Credentials${RESET}, generate dist cert + provisioning profile`);
  note(`  3. ${BOLD}Push Notifications${RESET}, generate APNs key`);
  note("");
  note("After this, every `eas build` + `eas submit` works without Apple Developer");
  note("login prompts. Existing creds are detected and reused.");

  line();
  if (process.stdin.isTTY) {
    if (!(await askYesNo(`Run \`eas credentials -p ios -e ${profile}\` now?`, true))) {
      nop("skipped (run `bunx eas credentials -p ios` later)");
      return 0;
    }
  } else {
    nop("non-TTY: skipping interactive wizard");
    return 0;
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: asc.p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

  // `eas credentials:configure-build` is the per-profile entrypoint that
  // skips the top-level credentials menu and goes straight into "set up
  // builds for <profile>". Combined with EXPO_ASC_API_KEY_* env vars, this
  // is the shortest path to provisioned credentials.
  const proc = spawn([dlx(), "eas", "credentials:configure-build", "-p", "ios", "-e", profile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  const code = await proc.exited;
  if (code !== 0) {
    bad(`eas credentials exited with code ${code}`);
    return code;
  }

  await recordStep("apple-credentials", {
    profile,
    configuredAt: new Date().toISOString(),
    ascIssuerId: asc.issuerId,
    ascKeyId: asc.keyId,
  });

  line();
  ok("EAS credentials configured");
  yep(`next: ${BOLD}bun run eas:dev:device${RESET} to build the dev client on a registered device`);
  return 0;
}
