import { bundleIdFallback, hasWidgets, isDevProfile } from "../../lib/app.ts";
import {
  APP_GROUPS_CAPABILITY,
  ASSOCIATED_DOMAINS_CAPABILITY,
  PUSH_NOTIFICATIONS_CAPABILITY,
  SIGN_IN_WITH_APPLE_CAPABILITY,
  SIGN_IN_WITH_APPLE_SETTINGS,
  makeAscClient,
  type AscBundleId,
  type AscCapabilitySetting,
  type AscClient,
} from "../../lib/asc-api.ts";
import { easSpawn } from "../../lib/eas-cli.ts";
import { readAll as readEnvLocal } from "../../lib/env-local.ts";
import { envList as easEnvList, type EasEnvironment } from "../../lib/eas-project.ts";
import {
  BOLD,
  RESET,
  askYesNo,
  bad,
  errText,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../../lib/output.ts";
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

// expo-widgets always names its extension target ExpoWidgetsTarget.
const WIDGET_TARGET_SUFFIX = ".ExpoWidgetsTarget";

// Apple rejects anything but letters, digits and spaces in a bundle id's name.
const bundleIdName = (identifier: string): string =>
  identifier.replace(/[^A-Za-z0-9]+/g, " ").trim();

// eas-cli evaluates app.config.ts in the child process and does not read .env.local, so without
// this the bundle id falls back to the com.example placeholder and Apple gets a junk identifier
// registered under it. Pass the app's own public env through, plus the team id eas would prompt for.
async function appEnv(bundleId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of await readEnvLocal()) {
    if (key.startsWith("EXPO_PUBLIC_")) out[key] = value;
  }
  out.EXPO_PUBLIC_APP_BUNDLE_ID = bundleId;
  const teamId = out.EXPO_PUBLIC_APPLE_TEAM_ID;
  if (teamId) out.EXPO_APPLE_TEAM_ID = teamId;
  // eas-cli's capability sync sends a request Apple rejects, in both directions, so any
  // difference at all stops the run. enableCapabilities puts every capability the entitlements
  // ask for on through the API instead, so skip the step.
  out.EXPO_NO_CAPABILITY_SYNC = "1";
  return out;
}

// What the template's entitlements ask for. usesAppleSignIn, associatedDomains and the app group
// come from app.config.ts, and expo-widgets writes aps-environment whether or not push is on.
type Capability = { label: string; type: string; settings?: AscCapabilitySetting[] };

const APP_CAPABILITIES: ReadonlyArray<Capability> = [
  { label: "App Groups", type: APP_GROUPS_CAPABILITY },
  {
    label: "Sign In with Apple",
    type: SIGN_IN_WITH_APPLE_CAPABILITY,
    settings: SIGN_IN_WITH_APPLE_SETTINGS,
  },
  { label: "Associated Domains", type: ASSOCIATED_DOMAINS_CAPABILITY },
  { label: "Push Notifications", type: PUSH_NOTIFICATIONS_CAPABILITY },
];

// The widget extension only needs the app group.
const WIDGET_CAPABILITIES = APP_CAPABILITIES.filter((cap) => cap.type === APP_GROUPS_CAPABILITY);

const IDENTIFIERS_URL = "https://developer.apple.com/account/resources/identifiers/list";

async function enableCapabilities(
  client: AscClient,
  identifier: string,
  wanted: ReadonlyArray<Capability>,
): Promise<void> {
  let bundle: AscBundleId;
  let on: Set<string>;
  try {
    const found = (await client.bundleIds.list({ identifier }))[0];
    bundle =
      found ?? (await client.bundleIds.create({ identifier, name: bundleIdName(identifier) }));
    const caps = await client.bundleIdCapabilities.list(bundle.id);
    on = new Set(caps.map((c) => c.attributes.capabilityType));
  } catch (err) {
    // The identifier is Apple's to hand out, and the wizard still has work to do without it.
    yep(`could not register ${identifier}: ${errText(err)}`);
    note(`  add it and turn its capabilities on by hand at ${IDENTIFIERS_URL}`);
    return;
  }
  const missing = wanted.filter((cap) => !on.has(cap.type));
  if (missing.length === 0) {
    nop(`${wanted.map((cap) => cap.label).join(", ")} already on for ${identifier}`);
    return;
  }
  const turned: string[] = [];
  for (const cap of missing) {
    try {
      await client.bundleIdCapabilities.create({
        bundleIdResourceId: bundle.id,
        capabilityType: cap.type,
        settings: cap.settings,
      });
      turned.push(cap.label);
    } catch (err) {
      // One capability Apple refuses should not take the rest of the wizard with it.
      yep(`could not turn ${cap.label} on for ${identifier}: ${errText(err)}`);
      note(`  tick it by hand at ${IDENTIFIERS_URL}`);
    }
  }
  if (turned.length > 0) ok(`turned ${turned.join(", ")} on for ${identifier}`);
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

  // A development profile signs the .dev identifier, not the one in app.config.ts.
  const signed = (await isDevProfile(profile)) ? `${bundle.value}.dev` : bundle.value;
  if (signed !== bundle.value) ok(`the ${profile} profile signs ${BOLD}${signed}${RESET}`);

  // eas-cli's own capability sync sends a request shape Apple rejects for App Groups, so the
  // build dies there and appEnv turns the sync off. Nothing else then reads the entitlements, so
  // every capability they ask for has to go on through the API here or signing fails.
  const client = makeAscClient(asc);
  await enableCapabilities(client, signed, APP_CAPABILITIES);
  if (await hasWidgets()) {
    await enableCapabilities(client, signed + WIDGET_TARGET_SUFFIX, WIDGET_CAPABILITIES);
    line();
    // Apple's API has no App Groups resource, so a key can turn the capability on but can
    // neither create the group nor see whether one is attached. eas-cli gives up here too,
    // with "Skipping capability identifier syncing". Left undone the build reaches EAS,
    // compiles, and only then fails with "doesn't support the group".
    yep(`make ${BOLD}group.${signed}${RESET} by hand, no API key can do it`);
    note("  https://developer.apple.com/account/resources/identifiers/list/applicationGroup");
    note("  then tick it under App Groups on both identifiers above");
  }

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

  const env = { ...(await appEnv(bundle.value)), ...ascKeyEnvFrom(asc) };
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
