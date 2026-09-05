import { ascBootstrap } from "../lib/asc-state.ts";
import {
  fetchAccessibilityDeclarations,
  lintAccessibilityConfig,
} from "../lib/asc-accessibility.ts";
import { runLint } from "../lib/lint.ts";
import { bad, emitJson, line, section } from "../lib/output.ts";

export async function runAccessibilityShow(opts: { json?: boolean }): Promise<number> {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    bad(`no ASC app for bundle id ${bundleId ?? "(unset)"}`);
    return 1;
  }
  const decls = await fetchAccessibilityDeclarations(client, ascAppId);
  if (opts.json) return emitJson(decls);
  section("Accessibility declarations");
  line(JSON.stringify(decls, null, 2));
  return 0;
}

export async function runAccessibilityLint(filePath: string): Promise<number> {
  return runLint(filePath, lintAccessibilityConfig, "Accessibility lint");
}
