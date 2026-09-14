import { bundleIdFallback } from "../../lib/app.ts";
import { easSpawn } from "../../lib/eas-cli.ts";
import { envList as easEnvList, type EasEnvironment } from "../../lib/eas-project.ts";
import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section } from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";
import { ascKeyEnvFrom, reportCachedAscKey } from "../asc.ts";

// Every profile but production builds the dev app, so its env is development.
const environmentFor = (profile: string): EasEnvironment =>
  profile === "production" ? "production" : "development";

async function resolveBundleId(
  profile: string,
): Promise<{ value: string; source: "app.config.ts" | "EAS env" } | null> {
  const fromConfig = await bundleIdFallback();
  if (fromConfig && !fromConfig.startsWith("com.example.")) {
    return { value: fromConfig, source: "app.config.ts" };
  }
  const env = await easEnvList(environmentFor(profile));
  const fromEnv = env?.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (fromEnv && !fromEnv.startsWith("com.example.")) return { value: fromEnv, source: "EAS env" };
  return null;
}

type CredentialsOptions = {
  profile?: string;
};

export async function runAppleCredentials(options: CredentialsOptions): Promise<number> {
  section("EAS iOS credentials");

  const profile = options.profile ?? "production";
  const asc = await reportCachedAscKey();
  if (!asc) return 1;

  const bundle = await resolveBundleId(profile);
  if (!bundle) {
    line();
    bad("the bundle id is still the template placeholder, so no credentials were made");
    note("app.config.ts still has the com.example default and the EAS env has no bundle id");
    note(
      `run ${BOLD}npx vexpo rebrand${RESET} to set yours, or ${BOLD}npx vexpo env push${RESET} first`,
    );
    return 1;
  }
  ok(`bundle id: ${BOLD}${bundle.value}${RESET} (from ${bundle.source})`);

  line();
  note("the wizard asks for the App Store Connect key (paste the three values above), then");
  note("makes the signing certificate and provisioning profile. After that, eas build and");
  note("eas submit never ask for your Apple login again");

  line();
  if (process.stdin.isTTY) {
    if (!(await askYesNo(`Run \`eas credentials -p ios -e ${profile}\` now?`, true))) {
      nop("skipped (run `npx vexpo apple credentials` later)");
      return 0;
    }
  } else {
    nop("no terminal, skipping the wizard");
    return 0;
  }

  const env = ascKeyEnvFrom(asc);
  const code = await easSpawn(["credentials:configure-build", "-p", "ios", "-e", profile], {
    env,
  });
  if (code !== 0) {
    bad(`eas credentials exited with code ${code}`);
    return code;
  }

  await recordStep("apple-credentials");

  line();
  ok("EAS credentials set up");
  note(
    `next: ${BOLD}npx eas-cli build -p ios --profile development:device${RESET} builds the dev client for a registered device`,
  );
  return 0;
}
