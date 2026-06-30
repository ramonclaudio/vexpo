import { bundleIdFallback } from "../../lib/app.ts";
import { loadAscCreds } from "../../lib/asc-state.ts";
import { easSpawn } from "../../lib/eas-cli.ts";
import { envList as easEnvList } from "../../lib/eas-project.ts";
import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section, yep } from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";

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
  } catch {}
  return {
    source: fromConfig ? "app.config.ts" : null,
    value: fromConfig,
    templatePlaceholder: true,
  };
}

export type CredentialsOptions = {
  profile?: string;
};

export async function runAppleCredentials(options: CredentialsOptions): Promise<number> {
  section("EAS iOS credentials");

  const profile = options.profile ?? "production";
  const asc = await loadAscCreds();

  if (!asc || !("path" in asc.privateKey)) {
    yep("no cached ASC creds. Run `vexpo apple asc-key` first to validate one.");
    return 1;
  }
  const p8Path = asc.privateKey.path;

  ok(`cached ASC API key found in state.json`);
  note(`  issuerId: ${BOLD}${asc.issuerId}${RESET}`);
  note(`  keyId:    ${BOLD}${asc.keyId}${RESET}`);
  note(`  .p8:      ${BOLD}${p8Path}${RESET}`);

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
    note(`  ${BOLD}npx vexpo rebrand${RESET}`);
    note("alternatively, push your local env to EAS before running this step:");
    note(`  ${BOLD}npx eas-cli env:push --environment ${profile}${RESET}`);
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
      nop("skipped (run `npx eas-cli credentials -p ios` later)");
      return 0;
    }
  } else {
    nop("non-TTY: skipping interactive wizard");
    return 0;
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EXPO_ASC_API_KEY_PATH: p8Path,
    EXPO_ASC_KEY_ID: asc.keyId,
    EXPO_ASC_ISSUER_ID: asc.issuerId,
  };

  const code = await easSpawn(["credentials:configure-build", "-p", "ios", "-e", profile], { env });
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
  yep(`next: ${BOLD}npm run eas:dev:device${RESET} to build the dev client on a registered device`);
  return 0;
}
