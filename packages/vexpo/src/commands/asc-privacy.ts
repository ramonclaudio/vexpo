/**
 * `vexpo asc:privacy` group.
 *
 *   show [f]   Show the locally declared `privacy.config.json`. Apple exposes
 *              no public read API for the live label (the `App` resource has no
 *              privacy relationship); set it in App Store Connect.
 *   lint <f>   Validate a local `app-store/privacy.config.json` against Apple's
 *              published category + purpose enums.
 */

import { existsSync, readFileSync } from "node:fs";

import { lintPrivacyConfig } from "../lib/asc-privacy.ts";
import { BOLD, DIM, RED, RESET, YELLOW, bad, line, note, ok, section } from "../lib/output.ts";

const ASC_PRIVACY_URL = "https://appstoreconnect.apple.com";

export async function runPrivacyShow(file: string, opts: { json?: boolean } = {}): Promise<number> {
  if (!existsSync(file)) {
    section("Privacy details");
    note(`no local ${file}. Apple's API can't read the live label; set it in App Store Connect:`);
    note(`  ${ASC_PRIVACY_URL} -> your app -> App Privacy`);
    return 0;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    bad(`failed to read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
    return 0;
  }
  section(`Privacy details (declared in ${file})`);
  const config = parsed as { collectsData?: boolean; entries?: Array<Record<string, unknown>> };
  if (!config.collectsData) {
    line(`  ${BOLD}Data Not Collected${RESET}`);
    return 0;
  }
  for (const e of config.entries ?? []) {
    const flags = [
      e.usedForTracking ? "tracking" : "",
      e.linkedToUser ? "linked" : "",
      Array.isArray(e.purposes) ? e.purposes.join(",") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    line(`  ${BOLD}${String(e.category)}${RESET}  ${DIM}${flags}${RESET}`);
  }
  return 0;
}

export async function runPrivacyLint(filePath: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    bad(`failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const issues = lintPrivacyConfig(parsed);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  section(`Privacy lint: ${filePath}`);
  for (const i of issues) {
    const tag = i.severity === "error" ? `${RED}error${RESET}` : `${YELLOW}warn${RESET}`;
    line(`  ${tag}  ${i.message}`);
  }
  if (errors.length === 0 && warnings.length === 0) {
    ok("clean");
    return 0;
  }
  line(`${BOLD}${errors.length}${RESET} error(s), ${BOLD}${warnings.length}${RESET} warning(s)`);
  return errors.length > 0 ? 1 : 0;
}
