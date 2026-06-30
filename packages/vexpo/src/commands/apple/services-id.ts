import { appName } from "../../lib/app.ts";
import {
  SIGN_IN_WITH_APPLE_CAPABILITY,
  makeAscClient,
  validate as validateAsc,
  type AscBundleId,
  type AscCredentials,
} from "../../lib/asc-api.ts";
import { loadAscCreds } from "../../lib/asc-state.ts";
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
  section,
  yep,
} from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";

export type ServicesIdOptions = {
  servicesId?: string;
};

// Env override lets a CI run point at a key without writing setup state.
function ascCredsFromEnv(): AscCredentials | null {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const p8Path = process.env.APPLE_ASC_P8_PATH;
  if (!issuerId || !keyId || !p8Path) return null;
  return { issuerId, keyId, privateKey: { path: p8Path } };
}

async function findOrCreateBundleId(
  client: ReturnType<typeof makeAscClient>,
  args: { identifier: string; name: string; platform: "IOS" | "SERVICES" },
): Promise<AscBundleId> {
  // Apple stores app bundle ids as IOS, MAC_OS, or UNIVERSAL depending on
  // capabilities. For an IOS lookup, accept any non-SERVICES platform. For
  // SERVICES, match strictly. The find by identifier alone risks crossing
  // SERVICES with non-SERVICES if both exist (rare, but possible).
  const all = await client.bundleIds.list({ identifier: args.identifier });
  const existing = all.find((b) => {
    if (b.attributes.identifier !== args.identifier) return false;
    if (args.platform === "SERVICES") return b.attributes.platform === "SERVICES";
    return b.attributes.platform !== "SERVICES";
  });
  if (existing) return existing;
  return client.bundleIds.create({
    identifier: args.identifier,
    name: args.name,
    platform: args.platform,
  });
}

/**
 * Look up an existing Services ID by identifier. Apple removed the API path
 * to create one (`POST /v1/bundleIds` rejects `platform: "SERVICES"` as of
 * 2025), so if it doesn't exist we walk the user through the web UI flow
 * and re-poll until it shows up.
 */
async function findServicesIdOrPromptManual(
  client: ReturnType<typeof makeAscClient>,
  identifier: string,
): Promise<AscBundleId | null> {
  const lookup = async () => {
    const matches = await client.bundleIds.list({ identifier });
    return matches.find((b) => b.attributes.identifier === identifier) ?? null;
  };

  const found = await lookup();
  if (found) return found;

  yep(`Services ID '${identifier}' not found in App Store Connect.`);
  note("Apple's API can no longer create Services IDs; do it once in the web UI:");
  note(`  1. Click + → 'Services IDs' → Continue`);
  note(`  2. Description: any (e.g. '${identifier} Sign In')`);
  note(`  3. Identifier: ${BOLD}${identifier}${RESET}`);
  note("  4. Continue → Register");
  note("  5. Click into the new Services ID → check Sign In with Apple → Configure");
  note("  6. Primary App ID = your App ID. Domains/return URL = any HTTPS on a domain you own.");
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
    bad(`still can't find Services ID '${identifier}'. Re-run when it shows up in the portal.`);
    return null;
  }
  return after;
}

export async function runServicesId(options: ServicesIdOptions): Promise<number> {
  section("Apple Sign In Services ID");

  try {
    const bundleId = await requireBundleId();
    if (!bundleId) return 1;
    ok(`bundle id: ${bundleId}`);

    const creds = ascCredsFromEnv() ?? (await loadAscCreds());
    if (!creds) {
      bad("App Store Connect credentials not found");
      note(
        "run `vexpo apple asc-key` first, or set APPLE_ASC_ISSUER_ID + APPLE_ASC_KEY_ID + APPLE_ASC_P8_PATH",
      );
      return 1;
    }

    const validation = await validateAsc(creds);
    if (!validation.ok) {
      bad(`ASC API key invalid: ${validation.reason}`);
      note("re-run `vexpo apple asc-key` to refresh");
      return 1;
    }
    ok(
      `ASC API authenticated (${validation.appCount} app${validation.appCount === 1 ? "" : "s"} on team)`,
    );

    const client = makeAscClient(creds);

    const servicesId = options.servicesId ?? process.env.APPLE_SERVICES_ID ?? `${bundleId}.signin`;
    const name = await appName();

    const appBundle = await findOrCreateBundleId(client, {
      identifier: bundleId,
      name,
      platform: "IOS",
    });
    ok(`app bundle id resource: ${appBundle.id} (${appBundle.attributes.identifier})`);

    const sid = await findServicesIdOrPromptManual(client, servicesId);
    if (!sid) return 1;
    ok(`services id resource: ${sid.id} (${servicesId})`);

    const caps = await client.bundleIdCapabilities.list(appBundle.id);
    const siwaCap = caps.find((c) => c.attributes.capabilityType === SIGN_IN_WITH_APPLE_CAPABILITY);
    let siwaCapId: string;
    if (siwaCap) {
      siwaCapId = siwaCap.id;
      nop("Sign In with Apple capability already enabled on app bundle id");
    } else {
      const created = await client.bundleIdCapabilities.create({
        bundleIdResourceId: appBundle.id,
        capabilityType: SIGN_IN_WITH_APPLE_CAPABILITY,
      });
      siwaCapId = created.id;
      ok("enabled Sign In with Apple capability on app bundle id");
    }

    await ensureLine("APPLE_SERVICES_ID", servicesId);
    ok(`APPLE_SERVICES_ID=${servicesId} written to .env.local`);

    await recordStep("apple-services-id", {
      servicesId,
      servicesIdResource: sid.id,
      appBundleResource: appBundle.id,
      siwaCapResource: siwaCapId,
    });

    line();
    ok("Services ID provisioned");
    yep("next: run `vexpo apple jwt` to sign the client secret JWT");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
