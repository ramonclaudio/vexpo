import { existsSync, readFileSync } from "node:fs";

import { ascKeyEnvFrom, ensureAscApiKeyInEasJson, ensureAscAppId } from "./asc.ts";
import { loadAscCreds } from "../lib/asc-state.ts";
import type { AscCredentials } from "../lib/asc-api.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { submitProfileHasAscAppId } from "../lib/eas-submit.ts";
import { readAll, requireBundleId } from "../lib/env-local.ts";
import { BOLD, RESET, bad, errText, note, ok, section, yep } from "../lib/output.ts";

type SubmitOptions = {
  profile?: string;
  id?: string;
  whatToTest?: string;
};

function identityEnv(local: Map<string, string>): Record<string, string> {
  const identity: Record<string, string> = {};
  for (const [k, v] of local) {
    if (k.startsWith("EXPO_PUBLIC_") || k === "EAS_PROJECT_ID") identity[k] = v;
  }
  return identity;
}

async function confirmAscAppId(
  creds: AscCredentials,
  bundleId: string,
  profile: string,
): Promise<boolean> {
  const resolved = await ensureAscAppId(creds, bundleId);
  if (resolved.kind === "defer") {
    bad("App Store Connect has no app for this bundle id yet");
    note("the first submit creates it. run once:");
    note(`  ${BOLD}npm run eas:tf${RESET}`);
    note("after that, `vexpo submit` handles every submit with no prompts");
    return false;
  }
  if (resolved.kind === "found") {
    ok(`ascAppId ${BOLD}${resolved.ascAppId}${RESET} in the eas.json submit profiles`);
    return true;
  }
  if (submitProfileHasAscAppId(readFileSync("eas.json", "utf8"), profile)) {
    yep(
      `couldn't reach App Store Connect, using the ascAppId from the ${profile} profile in eas.json`,
    );
    return true;
  }
  bad(`couldn't look up the App Store Connect app id: ${errText(resolved.error)}`);
  note(`try again, or set ascAppId on the ${profile} submit profile in eas.json`);
  return false;
}

export async function runSubmit(opts: SubmitOptions = {}): Promise<number> {
  section("Submit");
  const profile = opts.profile ?? "testflight";

  const creds = await loadAscCreds();
  if (!creds) {
    bad("no App Store Connect key cached. run `vexpo apple asc-key` first");
    return 1;
  }

  const bundleId = await requireBundleId();
  if (!bundleId) return 1;

  if (!existsSync("eas.json")) {
    bad("no eas.json here. Run from your project root.");
    return 1;
  }

  if (!(await confirmAscAppId(creds, bundleId, profile))) return 1;

  await ensureAscApiKeyInEasJson();

  const args = ["submit", "-p", "ios", "--profile", profile, "--non-interactive"];
  if (opts.id) args.push("--id", opts.id);
  else args.push("--latest");
  if (opts.whatToTest) args.push("--what-to-test", opts.whatToTest);

  note(`eas ${args.join(" ")}`);
  const identity = identityEnv(await readAll());
  const code = await easSpawn(args, {
    env: { ...(process.env as Record<string, string>), ...identity, ...ascKeyEnvFrom(creds) },
  });
  if (code !== 0) {
    bad(`eas submit exited with code ${code}`);
    return code;
  }
  ok("submitted to App Store Connect");
  return 0;
}
