import { readFileSync } from "node:fs";

import { isRecord } from "./json.ts";
import { BOLD, RED, RESET, YELLOW, bad, errText, line, ok, section } from "./output.ts";

export type LintIssue = { severity: "error" | "warning"; message: string };

export const error = (message: string): LintIssue => ({ severity: "error", message });
export const warn = (message: string): LintIssue => ({ severity: "warning", message });

export function readJson(filePath: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, "utf8")) };
  } catch (err) {
    bad(`failed to read ${filePath}: ${errText(err)}`);
    return { ok: false };
  }
}

export function entriesOf(config: unknown, issues: LintIssue[]): unknown[] | null {
  if (!isRecord(config)) {
    issues.push(error("config must be a JSON object"));
    return null;
  }
  if (!Array.isArray(config.entries)) {
    issues.push(error("`entries` must be an array"));
    return null;
  }
  return config.entries;
}

export function oneOf(
  issues: LintIssue[],
  where: string,
  value: unknown,
  allowed: readonly string[],
  typeName: string,
): boolean {
  if (typeof value === "string" && allowed.includes(value)) return true;
  issues.push(
    error(`${where} '${String(value)}' is not a valid ${typeName}. Allowed: ${allowed.join(", ")}`),
  );
  return false;
}

export function firstSeen(
  seen: Set<string>,
  issues: LintIssue[],
  where: string,
  value: string,
): boolean {
  if (!seen.has(value)) {
    seen.add(value);
    return true;
  }
  issues.push(warn(`${where} '${value}' is duplicated; only the last entry counts.`));
  return false;
}

export function runLint(
  filePath: string,
  linter: (config: unknown) => LintIssue[],
  title: string,
): number {
  const parsed = readJson(filePath);
  if (!parsed.ok) return 1;
  const issues = linter(parsed.value);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  section(`${title}: ${filePath}`);
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
