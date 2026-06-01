import { readFileSync } from "node:fs";

import { ascBootstrap } from "../lib/asc-state.ts";
import {
  fetchAccessibilityDeclarations,
  lintAccessibilityConfig,
} from "../lib/asc-accessibility.ts";
import { BOLD, RED, RESET, YELLOW, bad, line, ok, section } from "../lib/output.ts";

export async function runAccessibilityShow(opts: { json?: boolean }): Promise<number> {
  try {
    const { client, ascAppId, bundleId } = await ascBootstrap();
    if (!ascAppId) {
      bad(`no ASC app for bundle id ${bundleId ?? "(unset)"}`);
      return 1;
    }
    const decls = await fetchAccessibilityDeclarations(client, ascAppId);
    if (opts.json) {
      process.stdout.write(JSON.stringify(decls, null, 2) + "\n");
      return 0;
    }
    section("Accessibility declarations");
    line(JSON.stringify(decls, null, 2));
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runAccessibilityLint(filePath: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    bad(`failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const issues = lintAccessibilityConfig(parsed);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  section(`Accessibility lint: ${filePath}`);
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
