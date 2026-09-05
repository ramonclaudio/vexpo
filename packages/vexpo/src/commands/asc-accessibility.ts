import type { AscClient } from "../lib/asc-api.ts";
import { ascBootstrap } from "../lib/asc-state.ts";
import {
  createAccessibilityDeclaration,
  fetchAccessibilityDeclarations,
  fetchAccessibilityUrl,
  setAccessibilityUrl,
  lintAccessibilityConfig,
  planAccessibilityPush,
  publishAccessibilityDeclaration,
  updateAccessibilityDeclaration,
  type AccessibilityEntry,
  type PushPlan,
} from "../lib/asc-accessibility.ts";
import { readJson, runLint } from "../lib/lint.ts";
import { bad, emitJson, line, nop, note, ok, section, yep } from "../lib/output.ts";

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

export async function runAccessibilityPush(
  filePath: string,
  opts: { publish?: boolean; dryRun?: boolean },
): Promise<number> {
  const entries = readEntries(filePath);
  if (!entries) return 1;

  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    bad(`no ASC app for bundle id ${bundleId ?? "(unset)"}`);
    return 1;
  }

  const plan = planAccessibilityPush(entries, await remoteDeclarations(client, ascAppId));

  section("Accessibility push");
  let failed = 0;
  for (const [index, step] of plan.entries()) {
    const applied = await applyStep(client, ascAppId, step, entries[index]!, opts);
    if (!applied) failed++;
  }
  if (!opts.publish && !opts.dryRun && failed === 0) {
    note("still a draft. re-run with --publish to show it on the App Store page.");
  }
  return failed > 0 ? 1 : 0;
}

/** The entries to send, or null once the reason the file cannot be sent is printed. */
function readEntries(filePath: string): AccessibilityEntry[] | null {
  const parsed = readJson(filePath);
  if (!parsed.ok) return null;
  const errors = lintAccessibilityConfig(parsed.value).filter((i) => i.severity === "error");
  if (errors.length > 0) {
    bad(`${filePath} has ${errors.length} error(s). Run \`vexpo asc accessibility lint\` first.`);
    return null;
  }
  return (parsed.value as { entries: AccessibilityEntry[] }).entries;
}

async function remoteDeclarations(
  client: AscClient,
  appId: string,
): Promise<{ id: string; attributes?: { deviceFamily?: string; state?: string } }[]> {
  const res = (await fetchAccessibilityDeclarations(client, appId)) as { data?: unknown };
  return Array.isArray(res.data) ? res.data : [];
}

/** False once the reason this entry could not be sent has been printed. */
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

/** True once the reason the arguments cannot be used has been printed. */
function urlArgsRejected(value: string | undefined, clear: boolean | undefined): boolean {
  if (value && clear) {
    bad("pass a URL or --clear, not both.");
    return true;
  }
  if (value && !value.startsWith("https://")) {
    bad(`the accessibility URL must start with https://, got '${value}'`);
    note("it is a public link on your App Store page, so Apple rejects anything else");
    return true;
  }
  return false;
}

export async function runAccessibilityUrl(
  value: string | undefined,
  opts: { clear?: boolean; json?: boolean },
): Promise<number> {
  if (urlArgsRejected(value, opts.clear)) return 1;

  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    bad(`no ASC app for bundle id ${bundleId ?? "(unset)"}`);
    return 1;
  }

  if (value || opts.clear) {
    await setAccessibilityUrl(client, ascAppId, value ?? null);
  }
  const current = await fetchAccessibilityUrl(client, ascAppId);
  if (opts.json) return emitJson({ accessibilityUrl: current });
  reportUrl(current, opts.clear === true);
  return 0;
}

function reportUrl(current: string | null, cleared: boolean): void {
  section("Accessibility URL");
  if (current) {
    ok(current);
    return;
  }
  nop("not set");
  if (cleared) return;
  note("Apple points here for what the nine labels cannot say: in-app");
  note("accessibility settings, caption languages, and the parts of the app");
  note("that do not support a feature.");
}
