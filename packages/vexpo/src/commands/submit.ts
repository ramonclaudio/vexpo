/**
 * `vexpo submit`. Non-interactive local TestFlight / App Store submit without
 * the EAS credential store: writes the cached ASC key's ascApiKeyPath/Id/
 * IssuerId plus ascAppId into eas.json's submit profiles (the only places
 * `eas submit` reads them — no flag, no env var), and sets `EXPO_ASC_*` for
 * eas-cli's metadata auth. Submits the latest finished build by default, or a
 * specific `--id`.
 */

import { existsSync, readFileSync } from "node:fs";

import { ascKeyEnv, ensureAscApiKeyInEasJson, ensureAscAppId } from "./asc.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { submitProfileHasAscAppId } from "../lib/eas-submit.ts";
import { readAll, requireBundleId } from "../lib/env-local.ts";
import { BOLD, RESET, bad, note, ok, section, yep } from "../lib/output.ts";

export type SubmitOptions = {
  profile?: string;
  id?: string;
};

export async function runSubmit(opts: SubmitOptions = {}): Promise<number> {
  section("Submit");
  const profile = opts.profile ?? "testflight";

  const keyEnv = await ascKeyEnv();
  if (!keyEnv) {
    bad("no cached ASC key. Run `vexpo apple asc-key` first.");
    return 1;
  }

  const bundleId = await requireBundleId();
  if (!bundleId) return 1;

  const local = await readAll();

  // eas-cli evaluates app.config with EXPO_NO_DOTENV (it never reads .env.local),
  // so without forwarding these the bundle id falls back to the `com.example.*`
  // placeholder and the submit resolves the wrong app. Pass the public identity.
  const identity: Record<string, string> = {};
  for (const [k, v] of local) {
    if (k.startsWith("EXPO_PUBLIC_") || k === "EAS_PROJECT_ID") identity[k] = v;
  }

  if (!existsSync("eas.json")) {
    bad("no eas.json here. Run from your project root.");
    return 1;
  }

  const resolved = await ensureAscAppId(bundleId);
  if (resolved.kind === "defer") {
    bad("no App Store Connect app record for this bundle id yet");
    note("the app record appears after the first submit, which creates it. run once:");
    note(`  ${BOLD}npm run eas:tf${RESET}  (builds + submits, creates the app)`);
    note("then `vexpo submit` handles every submit after, fully non-interactive");
    return 1;
  }
  if (resolved.kind === "found") {
    ok(`ascAppId ${BOLD}${resolved.ascAppId}${RESET} in eas.json submit profiles`);
  } else if (submitProfileHasAscAppId(readFileSync("eas.json", "utf8"), profile)) {
    // ascKeyEnv() already proved the creds present, so a non-"found", non-defer
    // resolution is a lookup failure, never a missing app. eas submit reads
    // ascAppId straight from the profile, so the failed lookup was only advisory.
    yep(`couldn't confirm the app id with App Store Connect, using eas.json's ${profile} ascAppId`);
  } else {
    bad("couldn't look up the App Store Connect app id for this bundle id");
    if (resolved.kind === "error") {
      note(resolved.error instanceof Error ? resolved.error.message : String(resolved.error));
    }
    note("transient ASC API or network error, not a missing app. retry, or set");
    note(`ascAppId on the ${profile} submit profile in eas.json and re-run`);
    return 1;
  }

  // `eas submit` resolves its ASC key ONLY from eas.json's ascApiKey* fields,
  // a prompt, or the EAS credential store. Without the fields, a stale stored
  // key wins silently (a deleted key failed a live submit with altool -26000),
  // so land the validated local key in the profiles before spawning. The
  // EXPO_ASC_* env below still covers eas-cli's metadata auth.
  await ensureAscApiKeyInEasJson();

  const args = ["submit", "-p", "ios", "--profile", profile, "--non-interactive"];
  if (opts.id) args.push("--id", opts.id);
  else args.push("--latest");

  note(`eas ${args.join(" ")}`);
  const code = await easSpawn(args, {
    env: { ...(process.env as Record<string, string>), ...identity, ...keyEnv },
  });
  if (code !== 0) {
    bad(`eas submit exited with code ${code}`);
    return code;
  }
  ok("submitted to App Store Connect");
  return 0;
}
