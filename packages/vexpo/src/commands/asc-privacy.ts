import { existsSync } from "node:fs";

import { lintPrivacyConfig } from "../lib/asc-privacy.ts";
import { readJson, runLint } from "../lib/lint.ts";
import { BOLD, DIM, RESET, emitJson, line, note, section } from "../lib/output.ts";

const ASC_PRIVACY_URL = "https://appstoreconnect.apple.com";

export async function runPrivacyShow(file: string, opts: { json?: boolean } = {}): Promise<number> {
  if (!existsSync(file)) {
    section("Privacy details");
    note(`no ${file}. Set the labels under App Privacy at ${ASC_PRIVACY_URL}`);
    return 0;
  }
  const parsed = readJson(file);
  if (!parsed.ok) return 1;
  if (opts.json) return emitJson(parsed.value);
  section(`Privacy details (declared in ${file})`);
  printPrivacyEntries(parsed.value as PrivacyConfig);
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
    .join(", ");
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
