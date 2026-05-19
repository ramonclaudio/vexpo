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

import { bundleIdFallback } from "../../lib/app.ts";
import { envList as easEnvList } from "../../lib/eas-env.ts";
import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section, yep } from "../../lib/output.ts";
import { expandTilde } from "../../lib/path.ts";
import { dlx } from "../../lib/pkg-manager.ts";
import { spawn } from "../../lib/proc.ts";
import { load as loadState, recordStep } from "../../lib/state.ts";

/**
 * The template's `app.config.ts` ships with
 * `const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? \`com.example.${pkg.name}\`;`.
 * If the rebrand wizard hasn't been run AND production EAS env doesn't carry
 * `EXPO_PUBLIC_APP_BUNDLE_ID`, eas-cli resolves the bundle id to this
 * placeholder and silently registers it on the user's Apple Developer team
 * (e.g. `com.example.vexpo`). The dist cert + provisioning profile end up
 * bound to a bundle id the app will never actually ship under. Refuse before
 * we get there.
 */
async function resolveBundleId(profile: string): Promise<{
  source: "app.config.ts" | "EAS env" | null;
  value: string | null;
  templatePlaceholder: boolean;
}> {
  const fromConfig = await bundleIdFallback();
  if (fromConfig && !fromConfig.startsWith("com.example.")) {
    return { source: "app.config.ts", value: fromConfig, templatePlaceholder: false };
  }
  try {
    const env = await easEnvList(profile as "production" | "preview" | "development");
    const fromEnv = env.get("EXPO_PUBLIC_APP_BUNDLE_ID");
    if (fromEnv && !fromEnv.startsWith("com.example.")) {
      return { source: "EAS env", value: fromEnv, templatePlaceholder: false };
    }
  } catch {
    // eas-cli not reachable; fall through to placeholder warning.
  }
  return {
    source: fromConfig ? "app.config.ts" : null,
    value: fromConfig,
    templatePlaceholder: true,
  };
}

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

  const bundle = await resolveBundleId(profile);
  if (bundle.templatePlaceholder) {
    line();
    bad("template bundle id detected, refusing to register placeholder credentials");
    note(
      bundle.value
        ? `  app.config.ts still defaults to ${BOLD}${bundle.value}${RESET}`
        : `  could not resolve a bundle id from app.config.ts`,
    );
    note(`  EAS env (${profile}) does not set EXPO_PUBLIC_APP_BUNDLE_ID either`);
    line();
    note("fix by running the rebrand wizard, which bakes your bundle id into app.config.ts:");
    note(`  ${BOLD}bunx vexpo rebrand${RESET}`);
    note("alternatively, push your local env to EAS before running this step:");
    note(`  ${BOLD}bunx eas env:push --environment ${profile}${RESET}`);
    return 1;
  }
  ok(`bundle id: ${BOLD}${bundle.value}${RESET} (from ${bundle.source})`);

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
