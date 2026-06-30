import { readFileSync } from "node:fs";

import { BOLD, RED, RESET, YELLOW, bad, line, ok, section } from "./output.ts";

type LintIssue = { severity: "error" | "warning"; message: string };

export function runLint(
  filePath: string,
  linter: (config: unknown) => LintIssue[],
  title: string,
): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    bad(`failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const issues = linter(parsed);
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
