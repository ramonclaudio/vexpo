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
  printPrivacyEntries(parsed as PrivacyConfig);
  return 0;
}

type PrivacyEntry = Record<string, unknown>;
type PrivacyConfig = { collectsData?: boolean; entries?: PrivacyEntry[] };

function entryFlags(entry: PrivacyEntry): string {
  return [
    entry.usedForTracking ? "tracking" : "",
    entry.linkedToUser ? "linked" : "",
    Array.isArray(entry.purposes) ? entry.purposes.join(",") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function printPrivacyEntries(config: PrivacyConfig): void {
  if (!config.collectsData) {
    line(`  ${BOLD}Data Not Collected${RESET}`);
    return;
  }
  for (const entry of config.entries ?? []) {
    line(`  ${BOLD}${String(entry.category)}${RESET}  ${DIM}${entryFlags(entry)}${RESET}`);
  }
}

export async function runPrivacyLint(filePath: string): Promise<number> {
  return runLint(filePath, lintPrivacyConfig, "Privacy lint");
}
