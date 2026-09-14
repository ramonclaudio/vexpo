import { access, readFile, writeFile } from "node:fs/promises";

import {
  BOLD,
  DIM,
  RESET,
  ask,
  askYesNo,
  bad,
  errText,
  line,
  nop,
  note,
  ok,
  section,
} from "../lib/output.ts";
import { envSet as convexEnvSet } from "../lib/convex-env.ts";
import { ensureLine, readAll, removeLines } from "../lib/env-local.ts";
import { load, recordStep } from "../lib/state.ts";

type RebrandOptions = {
  force?: boolean;
  yes?: boolean;
  appName?: string;
  bundleId?: string;
  packageName?: string;
  scheme?: string;
  ownerName?: string;
  expoOwner?: string;
  reviewEmail?: string;
  reviewPhone?: string;
  marketingUrl?: string;
  supportUrl?: string;
  privacyUrl?: string;
  copyright?: string;
};

type RebrandInputs = {
  appName: string;
  packageName: string;
  bundleId: string;
  scheme: string;
  ownerName: string;
  reviewFirstName: string;
  reviewLastName: string;
  reviewEmail: string;
  reviewPhone: string;
  marketingUrl: string;
  supportUrl: string;
  privacyUrl: string;
  copyrightOwner: string;
  expoOwner?: string;
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

function slug(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function bundleSlug(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

type Basics = { appName: string; ownerName: string; bundleId: string; reviewEmail: string };

async function field(
  given: string | undefined,
  interactive: boolean,
  prompt: string,
  fallback: string,
): Promise<string> {
  if (given !== undefined) return given;
  if (!interactive) return fallback;
  return (await ask(prompt)).trim() || fallback;
}

async function askForBasics(
  overrides: Partial<RebrandInputs>,
  interactive: boolean,
): Promise<Basics> {
  const appName = await field(
    overrides.appName,
    interactive,
    `  ${BOLD}App name${RESET} ${DIM}(e.g. Foobar)${RESET} > `,
    "",
  );
  if (!appName) throw new Error("app name required");

  const ownerName = await field(
    overrides.ownerName,
    interactive,
    `  ${BOLD}Your name${RESET} > `,
    "Owner",
  );

  const orgSlug = bundleSlug(overrides.expoOwner ?? ownerName) || "example";
  const bundleHint = `com.${orgSlug}.${bundleSlug(slug(appName))}`;
  const bundleId = await field(
    overrides.bundleId,
    interactive,
    `  ${BOLD}Bundle ID${RESET} ${DIM}[${bundleHint}]${RESET} > `,
    bundleHint,
  );

  const reviewEmail = await field(
    overrides.reviewEmail,
    interactive,
    `  ${BOLD}Apple review contact email${RESET} > `,
    "",
  );
  if (!reviewEmail) throw new Error("review email required");

  return { appName, ownerName, bundleId, reviewEmail };
}

function deriveReviewer(
  overrides: Partial<RebrandInputs>,
  ownerName: string,
): Pick<RebrandInputs, "reviewFirstName" | "reviewLastName" | "reviewPhone"> {
  const [first = "First", ...rest] = ownerName.split(/\s+/);
  return {
    reviewFirstName: overrides.reviewFirstName ?? first,
    reviewLastName: overrides.reviewLastName ?? (rest.join(" ") || "Last"),
    reviewPhone: overrides.reviewPhone ?? "",
  };
}

function deriveUrls(
  overrides: Partial<RebrandInputs>,
  githubHint: string,
): Pick<RebrandInputs, "marketingUrl" | "supportUrl" | "privacyUrl"> {
  return {
    marketingUrl: overrides.marketingUrl ?? githubHint,
    supportUrl: overrides.supportUrl ?? `${githubHint}/issues`,
    privacyUrl: overrides.privacyUrl ?? `${githubHint}#privacy`,
  };
}

function deriveInputs(basics: Basics, overrides: Partial<RebrandInputs>): RebrandInputs {
  const { appName, ownerName, bundleId, reviewEmail } = basics;
  const packageName = overrides.packageName ?? slug(appName);
  return {
    appName,
    packageName,
    bundleId,
    scheme: overrides.scheme ?? bundleSlug(packageName),
    ownerName,
    reviewEmail,
    ...deriveReviewer(overrides, ownerName),
    ...deriveUrls(overrides, `https://github.com/${slug(ownerName)}/${packageName}`),
    copyrightOwner: overrides.copyrightOwner ?? `${new Date().getFullYear()} ${ownerName}`,
    expoOwner: overrides.expoOwner,
  };
}

async function promptInputs(overrides: Partial<RebrandInputs>): Promise<RebrandInputs> {
  const interactive = process.stdin.isTTY === true;
  if (interactive) {
    line();
    note(`${DIM}Four questions. Everything else follows from them, or pass flags.${RESET}`);
    line();
  }
  return deriveInputs(await askForBasics(overrides, interactive), overrides);
}

async function syncBundleId(bundleId: string): Promise<void> {
  const env = await readAll();
  const current = env.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (current === bundleId) return;

  if (current !== undefined) await removeLines(["EXPO_PUBLIC_APP_BUNDLE_ID"]);
  await ensureLine("EXPO_PUBLIC_APP_BUNDLE_ID", bundleId);
  ok(`wrote EXPO_PUBLIC_APP_BUNDLE_ID=${bundleId} to .env.local`);

  if (env.has("CONVEX_DEPLOYMENT")) {
    const devBundleId = `${bundleId}.dev`;
    await convexEnvSet("APP_BUNDLE_ID", devBundleId);
    ok(`Convex env: APP_BUNDLE_ID=${devBundleId} (the dev deployment serves the dev build)`);
  } else {
    note("no Convex deployment yet. the next `vexpo convex` run sets APP_BUNDLE_ID");
  }
}

const QUOTED = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;

type AppConfigMarker = {
  re: RegExp;
  label: string;
  replace: (inputs: RebrandInputs) => string;
};

const APP_CONFIG_MARKERS: AppConfigMarker[] = [
  {
    re: new RegExp(
      String.raw`const BUNDLE_ID = process\.env\.EXPO_PUBLIC_APP_BUNDLE_ID \?\? (?:\x60[^\x60]*\x60|${QUOTED});`,
    ),
    label: "BUNDLE_ID assignment",
    replace: (i) =>
      `const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? ${JSON.stringify(i.bundleId)};`,
  },
  {
    re: new RegExp(String.raw`const APP_NAME = ${QUOTED};`),
    label: "APP_NAME",
    replace: (i) => `const APP_NAME = ${JSON.stringify(i.appName)};`,
  },
  {
    re: new RegExp(String.raw`slug: ${QUOTED},`),
    label: "slug",
    replace: (i) => `slug: ${JSON.stringify(i.packageName)},`,
  },
  {
    re: new RegExp(String.raw`const SCHEME = ${QUOTED};`),
    label: "SCHEME",
    replace: (i) => `const SCHEME = ${JSON.stringify(i.scheme)};`,
  },
];

async function rewriteAppConfig(inputs: RebrandInputs): Promise<void> {
  const file = "app.config.ts";
  let text = await readFile(file, "utf8");

  for (const marker of APP_CONFIG_MARKERS) {
    if (!marker.re.test(text)) {
      throw new Error(
        `${file} has no ${marker.label} to rewrite. Restore it from the vexpo template`,
      );
    }
    text = text.replace(marker.re, () => marker.replace(inputs));
  }

  await writeFile(file, text);
  ok(`updated ${file}`);
}

async function rewriteAppJson(): Promise<void> {
  const file = "app.json";
  const json = JSON.parse(await readFile(file, "utf8")) as {
    expo?: { extra?: { eas?: { projectId?: string } } };
  };
  if (json.expo?.extra?.eas) delete json.expo.extra.eas.projectId;
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`reset ${file} (eas init writes a new projectId)`);
}

const REBRAND_VERSION = "0.1.0";

async function rewritePackageJson(inputs: RebrandInputs): Promise<void> {
  const file = "package.json";
  const json = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  json.name = inputs.packageName;
  json.version = REBRAND_VERSION;
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`updated ${file} (name=${inputs.packageName}, version=${REBRAND_VERSION})`);
}

async function syncPackageLock(inputs: RebrandInputs): Promise<void> {
  const file = "package-lock.json";
  let json: {
    name?: string;
    version?: string;
    packages?: Record<string, { name?: string; version?: string }>;
  };
  try {
    json = JSON.parse(await readFile(file, "utf8")) as typeof json;
  } catch {
    nop(`${file} not found, skipped`);
    return;
  }
  json.name = inputs.packageName;
  json.version = REBRAND_VERSION;
  const root = json.packages?.[""];
  if (root) {
    root.name = inputs.packageName;
    root.version = REBRAND_VERSION;
  }
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`updated ${file} (name and version)`);
}

async function rewriteStoreConfig(inputs: RebrandInputs): Promise<void> {
  await rewriteStoreConfigFile("store.config.json", inputs, { required: true });
  await rewriteStoreConfigFile("store.config.example.json", inputs, { required: false });
}

async function rewriteStoreConfigFile(
  file: string,
  inputs: RebrandInputs,
  { required }: { required: boolean },
): Promise<void> {
  let json: StoreConfig;
  try {
    await access(file);
    json = JSON.parse(await readFile(file, "utf8")) as StoreConfig;
  } catch {
    if (!required) return;
    throw new Error(
      `${file} is missing or not valid JSON. Restore it from the vexpo template first`,
    );
  }
  const en = json.apple.info["en-US"];
  en.title = inputs.appName;
  en.marketingUrl = inputs.marketingUrl;
  en.supportUrl = inputs.supportUrl;
  en.privacyPolicyUrl = inputs.privacyUrl;
  json.apple.copyright = inputs.copyrightOwner;
  json.apple.review.firstName = inputs.reviewFirstName;
  json.apple.review.lastName = inputs.reviewLastName;
  json.apple.review.email = inputs.reviewEmail;
  json.apple.review.phone = inputs.reviewPhone;
  const notes = json.apple.review.notes;
  if (typeof notes === "string" && notes.includes("vexpo rebrand")) {
    delete json.apple.review.notes;
  }
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`updated ${file}`);
}

type StoreConfig = {
  configVersion: number;
  apple: {
    copyright: string;
    categories: string[];
    info: { "en-US": Record<string, unknown> };
    advisory: Record<string, unknown>;
    review: Record<string, unknown>;
    release: Record<string, unknown>;
  };
};

async function readJsonTarget(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`${file} is missing. Restore it from the vexpo template first`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${file} is not valid JSON. Restore it from the vexpo template first`);
  }
}

async function validateAppConfig(): Promise<void> {
  let cfg: string;
  try {
    cfg = await readFile("app.config.ts", "utf8");
  } catch {
    throw new Error("app.config.ts is missing. Restore it from the vexpo template first");
  }
  for (const { re, label } of APP_CONFIG_MARKERS) {
    if (!re.test(cfg)) {
      throw new Error(`app.config.ts has no ${label}. Restore it from the vexpo template first`);
    }
  }
}

async function validateStoreConfig(): Promise<void> {
  const store = await readJsonTarget("store.config.json");
  const apple = (store as { apple?: { info?: Record<string, unknown>; review?: unknown } }).apple;
  if (
    !apple ||
    typeof apple !== "object" ||
    typeof apple.info?.["en-US"] !== "object" ||
    apple.info["en-US"] === null ||
    typeof apple.review !== "object" ||
    apple.review === null
  ) {
    throw new Error(
      'store.config.json: missing apple.info["en-US"]/apple.review; restore it from the vexpo template first',
    );
  }
}

async function validateTargets(): Promise<void> {
  await validateAppConfig();
  await readJsonTarget("app.json");
  const pkg = await readJsonTarget("package.json");
  if (typeof pkg !== "object" || pkg === null) {
    throw new Error("package.json is not a JSON object. Restore it from the vexpo template first");
  }
  await validateStoreConfig();
}

async function readOrSkip(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    nop(`${file} not found, skipped`);
    return null;
  }
}

async function rewriteConvexEnv(inputs: RebrandInputs): Promise<void> {
  const file = "convex/env.ts";
  const text = await readOrSkip(file);
  if (text === null) return;

  const siteRe = new RegExp(String.raw`optional\("SITE_URL", ${QUOTED}\)`);
  const nameRe = new RegExp(String.raw`optional\("APP_NAME", ${QUOTED}\)`);
  if (!siteRe.test(text) && !nameRe.test(text)) {
    nop(`${file} has no SITE_URL or APP_NAME fallbacks, skipped`);
    return;
  }

  const updated = text
    .replace(siteRe, () => `optional("SITE_URL", ${JSON.stringify(`${inputs.scheme}://`)})`)
    .replace(nameRe, () => `optional("APP_NAME", ${JSON.stringify(inputs.appName)})`);
  await writeFile(file, updated);
  ok(`updated ${file}`);
}

async function rewriteReadme(inputs: RebrandInputs): Promise<void> {
  const file = "README.md";
  const text = await readOrSkip(file);
  if (text === null) return;

  if (!text.startsWith("# vexpo\n")) {
    nop(`${file} already customized, skipped`);
    return;
  }
  await writeFile(file, text.replace("# vexpo", `# ${inputs.appName}`));
  ok(`updated ${file}`);
}

async function alreadyRebranded(): Promise<boolean> {
  const state = await load();
  return !!state.steps.rebrand;
}

async function detectTemplateDefaults(): Promise<{ stillTemplate: boolean; signals: string[] }> {
  const signals: string[] = [];
  const cfg = await readFile("app.config.ts", "utf8");
  if (cfg.includes("`com.example.${pkg.name}`")) signals.push("app.config.ts: example bundle id");
  if (/slug: "vexpo"/.test(cfg)) signals.push("app.config.ts: slug=vexpo");
  if (/const SCHEME = "vexpo";/.test(cfg)) signals.push("app.config.ts: scheme=vexpo");
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { name?: string };
  if (pkg.name === "vexpo") signals.push("package.json: name=vexpo");
  return { stillTemplate: signals.length > 0, signals };
}

function printPlan(inputs: RebrandInputs): void {
  line();
  note(`${BOLD}About to rewrite:${RESET}`);
  note(
    `  app name      ${BOLD}${inputs.appName}${RESET} ${DIM}/ slug ${inputs.packageName} / scheme ${inputs.scheme}${RESET}`,
  );
  note(`  bundle id     ${BOLD}${inputs.bundleId}${RESET}`);
  note(`  marketing     ${inputs.marketingUrl}`);
  note(`  support       ${inputs.supportUrl}`);
  note(`  privacy       ${inputs.privacyUrl}`);
  note(
    `  review        ${inputs.reviewFirstName} ${inputs.reviewLastName} <${inputs.reviewEmail}>`,
  );
}

async function resolveInputs(
  options: RebrandOptions,
  overrides: Partial<RebrandInputs>,
): Promise<RebrandInputs | null> {
  const missing =
    !overrides.appName || !overrides.bundleId || !overrides.ownerName || !overrides.reviewEmail;
  if (!process.stdin.isTTY && missing) {
    throw new Error(
      "no terminal to ask in. pass at least --app-name, --bundle-id, --owner-name and --review-email",
    );
  }
  const inputs = await promptInputs(overrides);
  printPlan(inputs);
  if (!options.yes && !(await askYesNo("Apply these changes?", true))) {
    nop("aborted, no files changed");
    return null;
  }
  return inputs;
}

async function applyRewrites(inputs: RebrandInputs): Promise<void> {
  await rewriteAppConfig(inputs);
  await rewriteAppJson();
  await rewritePackageJson(inputs);
  await syncPackageLock(inputs);
  await rewriteStoreConfig(inputs);
  await rewriteConvexEnv(inputs);
  await rewriteReadme(inputs);
  await syncBundleId(inputs.bundleId);
  if (inputs.expoOwner) {
    await ensureLine("EXPO_PUBLIC_EXPO_OWNER", inputs.expoOwner);
    ok(`wrote EXPO_PUBLIC_EXPO_OWNER=${inputs.expoOwner} to .env.local`);
  }
}

export async function runRebrand(options: RebrandOptions): Promise<number> {
  try {
    const overrides: Partial<RebrandInputs> = {
      appName: options.appName,
      bundleId: options.bundleId,
      packageName: options.packageName,
      scheme: options.scheme,
      ownerName: options.ownerName,
      expoOwner: options.expoOwner,
      reviewEmail: options.reviewEmail,
      reviewPhone: options.reviewPhone,
      marketingUrl: options.marketingUrl,
      supportUrl: options.supportUrl,
      privacyUrl: options.privacyUrl,
      copyrightOwner: options.copyright,
    };

    section("Rebrand");

    if (!options.force && (await alreadyRebranded())) {
      nop("rebrand already done (see .setup-state.json). pass --force to run it again");
      return 0;
    }

    const detect = await detectTemplateDefaults();
    if (!detect.stillTemplate && !options.force) {
      ok("no template defaults left, nothing to rebrand");
      note("pass --force to run it anyway");
      return 0;
    }

    await validateTargets();

    if (detect.signals.length > 0) {
      note("template defaults still in place:");
      for (const s of detect.signals) note(`  • ${s}`);
      line();
    }

    const inputs = await resolveInputs(options, overrides);
    if (!inputs) return 0;

    await applyRewrites(inputs);

    await recordStep("rebrand", {
      appName: inputs.appName,
      packageName: inputs.packageName,
      bundleId: inputs.bundleId,
      scheme: inputs.scheme,
    });

    line();
    ok("rebrand done");
    note("run `vexpo full` again to get a new EAS project id and update the Convex env");
    return 0;
  } catch (err) {
    bad(errText(err));
    return 1;
  }
}
