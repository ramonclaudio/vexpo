import type { AscClient } from "../lib/asc-api.ts";
import { ascBootstrap } from "../lib/asc-state.ts";
import {
  createAccessibilityDeclaration,
  fetchAccessibilityDeclarations,
  fetchAccessibilityUrl,
  lintAccessibilityConfig,
  planAccessibilityPush,
  publishAccessibilityDeclaration,
  setAccessibilityUrl,
  updateAccessibilityDeclaration,
  type AccessibilityConfig,
  type AccessibilityEntry,
  type PushPlan,
} from "../lib/asc-accessibility.ts";
import { readJson, runLint } from "../lib/lint.ts";
import { bad, emitJson, line, nop, note, ok, section, yep } from "../lib/output.ts";

export async function runAccessibilityShow(opts: { json?: boolean }): Promise<number> {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    bad(`App Store Connect has no app for bundle id ${bundleId ?? "(unset)"}`);
    return 1;
  }
  const [decls, url] = await Promise.all([
    fetchAccessibilityDeclarations(client, ascAppId),
    fetchAccessibilityUrl(client, ascAppId),
  ]);
  if (opts.json) return emitJson({ url, declarations: decls.data });
  section("Accessibility declarations");
  line(JSON.stringify(decls.data, null, 2));
  section("Accessibility URL");
  if (url) ok(url);
  else nop("not set");
  return 0;
}

export async function runAccessibilityLint(filePath: string): Promise<number> {
  return runLint(filePath, lintAccessibilityConfig, "Accessibility lint");
}

export async function runAccessibilityPush(
  filePath: string,
  opts: { publish?: boolean; dryRun?: boolean },
): Promise<number> {
  const config = readConfig(filePath);
  if (!config) return 1;

  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    bad(`App Store Connect has no app for bundle id ${bundleId ?? "(unset)"}`);
    return 1;
  }

  const remote = await fetchAccessibilityDeclarations(client, ascAppId);
  const plan = planAccessibilityPush(config.entries, remote.data);

  section("Accessibility push");
  let failed = 0;
  for (const [index, step] of plan.entries()) {
    const applied = await applyStep(client, ascAppId, step, config.entries[index]!, opts);
    if (!applied) failed++;
  }
  if ("url" in config) await applyUrl(client, ascAppId, config.url ?? null, opts.dryRun);
  if (!opts.publish && !opts.dryRun && failed === 0) {
    note("still a draft. re-run with --publish to show it on the App Store page.");
  }
  return failed > 0 ? 1 : 0;
}

function readConfig(filePath: string): AccessibilityConfig | null {
  const parsed = readJson(filePath);
  if (!parsed.ok) return null;
  const errors = lintAccessibilityConfig(parsed.value).filter((i) => i.severity === "error");
  if (errors.length > 0) {
    bad(`${filePath} has ${errors.length} error(s). Run \`vexpo asc accessibility lint\` first.`);
    return null;
  }
  return parsed.value as AccessibilityConfig;
}

async function applyUrl(
  client: AscClient,
  appId: string,
  url: string | null,
  dryRun: boolean | undefined,
): Promise<void> {
  const label = url ? `url would be set to ${url}` : "url would be cleared";
  if (dryRun) {
    nop(label);
    return;
  }
  await setAccessibilityUrl(client, appId, url);
  ok(url ? `url set to ${url}` : "url cleared");
}

async function applyStep(
  client: AscClient,
  appId: string,
  step: PushPlan,
  entry: AccessibilityEntry,
  opts: { publish?: boolean; dryRun?: boolean },
): Promise<boolean> {
  if (step.action === "blocked") {
    // Apple only lets you change a declaration while it is still a draft.
    yep(`${step.deviceFamily} is ${step.state ?? "published"}, so it cannot be changed`);
    note("delete it in App Store Connect to start a new draft");
    return false;
  }
  if (opts.dryRun) {
    nop(`${step.deviceFamily} would ${step.action}`);
    return true;
  }
  const res =
    step.action === "create"
      ? await createAccessibilityDeclaration(client, appId, entry)
      : await updateAccessibilityDeclaration(client, step.id!, entry);
  ok(`${step.deviceFamily} ${step.action}d`);
  if (opts.publish) {
    await publishAccessibilityDeclaration(client, res.data.id);
    ok(`${step.deviceFamily} published`);
  }
  return true;
}
