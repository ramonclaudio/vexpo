import { existsSync, readFileSync } from "node:fs";

import { lintPrivacyConfig } from "../lib/asc-privacy.ts";
import { runLint } from "../lib/lint.ts";
import { BOLD, DIM, RESET, bad, errText, line, note, section } from "../lib/output.ts";

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
    bad(`failed to read ${file}: ${errText(err)}`);
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
  return runLint(filePath, lintPrivacyConfig, "Privacy lint");
}
