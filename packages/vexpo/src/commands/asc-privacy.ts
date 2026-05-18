/**
 * `vexpo asc:privacy` group.
 *
 *   show       Pull the app's current Privacy Nutrition Label state.
 *   lint <f>   Validate a local `app-store/privacy.config.json` against
 *              Apple's published category + purpose enums.
 */

import { readFileSync } from "node:fs";

import { ascBootstrap } from "../lib/asc-state.ts";
import { fetchAppPrivacyDetails, lintPrivacyConfig } from "../lib/asc-privacy.ts";
import { BOLD, RED, RESET, YELLOW, bad, line, ok, section } from "../lib/output.ts";

export async function runPrivacyShow(opts: { json?: boolean }): Promise<number> {
  try {
    const { client, ascAppId, bundleId } = await ascBootstrap();
    if (!ascAppId) {
      bad(`no ASC app for bundle id ${bundleId ?? "(unset)"}`);
      return 1;
    }
    const details = await fetchAppPrivacyDetails(client, ascAppId);
    if (opts.json) {
      process.stdout.write(JSON.stringify(details, null, 2) + "\n");
      return 0;
    }
    section("Privacy details");
    line(JSON.stringify(details, null, 2));
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
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
