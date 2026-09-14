import { appName } from "../../lib/app.ts";
import {
  SIGN_IN_WITH_APPLE_CAPABILITY,
  makeAscClient,
  validate as validateAsc,
  type AscBundleId,
  type AscClient,
} from "../../lib/asc-api.ts";
import { loadAscCreds } from "../../lib/asc-state.ts";
import { ascCredsFromEnv } from "./asc-key.ts";
import { ensureLine, requireBundleId } from "../../lib/env-local.ts";
import {
  BOLD,
  RESET,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  plural,
  section,
  yep,
} from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";

type ServicesIdOptions = {
  servicesId?: string;
  bundleId?: string;
};

async function findOrCreateAppBundleId(
  client: AscClient,
  identifier: string,
  name: string,
): Promise<AscBundleId> {
  const all = await client.bundleIds.list({ identifier });
  const existing = all.find(
    (b) => b.attributes.identifier === identifier && b.attributes.platform !== "SERVICES",
  );
  return existing ?? (await client.bundleIds.create({ identifier, name }));
}

async function findServicesIdOrPromptManual(
  client: AscClient,
  identifier: string,
): Promise<AscBundleId | null> {
  const lookup = async () => {
    const matches = await client.bundleIds.list({ identifier });
    return matches.find((b) => b.attributes.identifier === identifier) ?? null;
  };

  const found = await lookup();
  if (found) return found;

  yep(`Services ID '${identifier}' not found in App Store Connect.`);
  note("Apple's API can't create Services IDs, so do it once in the browser:");
  note(`  1. click +, pick 'Services IDs', Continue`);
  note(`  2. Description: anything, like '${identifier} Sign In'`);
  note(`  3. Identifier: ${BOLD}${identifier}${RESET}`);
  note("  4. Continue, then Register");
  note("  5. open the new Services ID, check Sign in with Apple, Configure");
  note("  6. Primary App ID: your app. Domains and return URL: any https URL on a domain you own");
  note("  7. Save");
  line();
  await helpAndWait({
    body: "Open Apple Developer Console:",
    urls: [
      {
        label: "Identifiers (Services IDs)",
        url: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
      },
    ],
    allowSkip: false,
  });

  const after = await lookup();
  if (!after) {
    bad(`still can't find Services ID '${identifier}'. run this again once it shows in the portal`);
    return null;
  }
  return after;
}

export async function runServicesId(options: ServicesIdOptions): Promise<number> {
  section("Sign in with Apple Services ID");

  const bundleId = options.bundleId ?? (await requireBundleId());
  if (!bundleId) return 1;
  ok(`bundle id: ${bundleId}`);

  const creds = ascCredsFromEnv() ?? (await loadAscCreds());
  if (!creds) {
    bad("no App Store Connect key");
    note(
      "run `vexpo apple asc-key` first, or set APPLE_ASC_ISSUER_ID, APPLE_ASC_KEY_ID and APPLE_ASC_P8_PATH",
    );
    return 1;
  }

  const validation = await validateAsc(creds);
  if (!validation.ok) {
    bad(`App Store Connect key rejected: ${validation.reason}`);
    note("run `vexpo apple asc-key` to cache a working one");
    return 1;
  }
  ok(
    `App Store Connect key works (${validation.appCount} app${plural(validation.appCount)} on the team)`,
  );

  const client = makeAscClient(creds);

  const servicesId = options.servicesId ?? process.env.APPLE_SERVICES_ID ?? `${bundleId}.signin`;
  const name = await appName();

  const appBundle = await findOrCreateAppBundleId(client, bundleId, name);
  ok(`app bundle id: ${appBundle.id} (${appBundle.attributes.identifier})`);

  const sid = await findServicesIdOrPromptManual(client, servicesId);
  if (!sid) return 1;
  ok(`services id: ${sid.id} (${servicesId})`);

  const caps = await client.bundleIdCapabilities.list(appBundle.id);
  const existingCap = caps.find(
    (c) => c.attributes.capabilityType === SIGN_IN_WITH_APPLE_CAPABILITY,
  );
  if (existingCap) {
    nop("Sign in with Apple already on for the app bundle id");
  } else {
    await client.bundleIdCapabilities.create({
      bundleIdResourceId: appBundle.id,
      capabilityType: SIGN_IN_WITH_APPLE_CAPABILITY,
    });
    ok("turned Sign in with Apple on for the app bundle id");
  }

  await ensureLine("APPLE_SERVICES_ID", servicesId);
  ok(`wrote APPLE_SERVICES_ID=${servicesId} to .env.local`);

  await recordStep("apple-services-id");

  line();
  ok("Services ID ready");
  note("next: `vexpo apple jwt` signs the client secret");
  return 0;
}
