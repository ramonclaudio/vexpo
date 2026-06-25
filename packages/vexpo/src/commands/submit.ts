/**
 * `vexpo submit`. Non-interactive local TestFlight / App Store submit without
 * the EAS credential store: sets `EXPO_ASC_*` from the cached ASC key so eas-cli
 * authenticates with it, and ensures `ascAppId` is in eas.json (the only place
 * `eas submit` reads the app id, no flag, no env var). Submits the latest
 * finished build by default, or a specific `--id`.
 */

import { existsSync } from "node:fs";

import { ascKeyEnv, ensureAscAppId } from "./asc.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { readAll } from "../lib/env-local.ts";
import { BOLD, RESET, bad, note, ok, section } from "../lib/output.ts";

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

  const local = await readAll();
  const bundleId = local.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (!bundleId) {
    bad("no EXPO_PUBLIC_APP_BUNDLE_ID in .env.local. Run `vexpo convex` first.");
    return 1;
  }

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

  const ascAppId = await ensureAscAppId(bundleId);
  if (!ascAppId) {
    bad("no App Store Connect app record for this bundle id yet");
    note("the app record appears after the first submit, which creates it. run once:");
    note(`  ${BOLD}npm run eas:tf${RESET}  (builds + submits, creates the app)`);
    note("then `vexpo submit` handles every submit after, fully non-interactive");
    return 1;
  }
  ok(`ascAppId ${BOLD}${ascAppId}${RESET} in eas.json submit profiles`);
  ok("ASC key wired for eas-cli (EXPO_ASC_*)");

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
