import { existsSync } from "node:fs";
import { cp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { execa } from "execa";
import kleur from "kleur";
import ora from "ora";
import prompts from "prompts";

import { STRIPPED_DOTFILES, strippedToUnderscore } from "./dotfiles.ts";

import pkg from "../package.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(here, "templates", "default");

type PM = "bun" | "pnpm" | "yarn" | "npm";

type Flags = {
  install: boolean;
  git: boolean;
  yes: boolean;
  setup: boolean;
  brand: boolean;
};

async function main() {
  const program = new Command()
    .name("create-vexpo")
    .description(
      "Scaffold a new vexpo project. An Expo SDK 57 iOS app with Convex, Better Auth, and Resend wired in.",
    )
    .argument("[directory]", "project directory name")
    .option("--no-install", "skip installing dependencies")
    .option("--no-git", "skip git init")
    .option("--no-setup", "skip the printed next-steps block after install")
    .option("--no-brand", "skip the rebrand prompts after install")
    .option("-y, --yes", "accept defaults, skip prompts")
    .version(pkg.version, "-v, --version")
    .parse();

  const flags = program.opts<Flags>();
  const argDir = program.args[0];

  intro();

  const name = await resolveName(argDir, flags.yes);
  const target = resolve(process.cwd(), name);

  if (existsSync(target)) {
    console.error(kleur.red(`\nTarget ${target} already exists. Pick a different name.`));
    process.exit(1);
  }

  const pm = detectPackageManager();

  await copyTemplate(target, name);

  const depsReady = flags.install ? await install(target, pm) : true;

  if (flags.brand && depsReady && !flags.yes) await brand(target);

  if (flags.git) await initGit(target, pm, depsReady);

  if (flags.setup) nextSteps(target, pm, depsReady);
}

async function copyTemplate(target: string, name: string): Promise<void> {
  const spin = ora(
    `Copying template to ${kleur.cyan(relative(process.cwd(), target) || ".")}`,
  ).start();
  try {
    await cp(TEMPLATE_DIR, target, { recursive: true });
    await restoreStrippedDotfiles(target);
    await rewritePackage(target, name);
    await rewriteEasJson(target);
  } catch (err) {
    spin.fail("Template copy failed");
    throw err;
  }
  spin.succeed("Template copied");
}

async function install(target: string, pm: PM): Promise<boolean> {
  const spin = ora(`Installing dependencies with ${kleur.cyan(pm)}`).start();
  try {
    await execa(pm, ["install"], { cwd: target, stdout: "ignore" });
  } catch (err) {
    spin.fail(`Install failed. Run ${kleur.cyan(`${pm} install`)} manually.`);
    const stderr = installFailureStderr(err);
    if (stderr) console.error(kleur.gray(tail(stderr, 20)));
    return false;
  }
  spin.succeed(`Installed with ${pm}`);
  return true;
}

async function brand(target: string): Promise<void> {
  const bin = join(target, "node_modules", ".bin", "vexpo");
  if (!existsSync(bin) || process.stdin.isTTY !== true) return;
  console.log();
  try {
    await execa(bin, ["rebrand"], { cwd: target, stdio: "inherit" });
  } catch {
    console.error(
      kleur.gray("  Rebrand skipped. Run ") +
        kleur.cyan("npx vexpo rebrand") +
        kleur.gray(" in the project when you are ready."),
    );
  }
}

async function commitAll(target: string, spin: ReturnType<typeof ora>): Promise<void> {
  await execa("git", ["add", "-A"], { cwd: target, stdio: "ignore" });
  const email = await execa("git", ["config", "user.email"], { cwd: target, reject: false });
  const uname = await execa("git", ["config", "user.name"], { cwd: target, reject: false });
  if (!email.stdout.trim() || !uname.stdout.trim()) {
    spin.warn("Git repo initialized, commit skipped (no git identity)");
    console.error(kleur.gray("  Set git config user.name and user.email, then commit yourself."));
    return;
  }
  await execa("git", ["commit", "-m", "feat: initial commit", "--no-gpg-sign"], {
    cwd: target,
    stdio: "ignore",
  });
  spin.succeed("Git repo initialized");
}

async function initGit(target: string, pm: PM, depsReady: boolean): Promise<void> {
  const spin = ora("Initializing git").start();
  try {
    await execa("git", ["init", "--initial-branch=main"], { cwd: target, stdio: "ignore" });
  } catch {
    spin.warn("Git init skipped");
    return;
  }
  if (!depsReady) {
    spin.warn("Git repo initialized, commit skipped (install failed)");
    console.error(kleur.gray(`  Commit yourself after ${pm} install lands.`));
    return;
  }
  try {
    await commitAll(target, spin);
  } catch {
    spin.warn("Git repo initialized, commit failed");
    console.error(kleur.gray("  Commit yourself once the working tree is ready."));
  }
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const NAME_HINT = "lowercase letters, numbers, dashes; must start alphanumeric";

function validateNameSegment(target: string): { ok: true } | { ok: false; reason: string } {
  if (target.startsWith("@")) {
    return { ok: false, reason: "npm scopes are not directories; use a plain directory name" };
  }
  const segment = basename(target);
  if (!NAME_RE.test(segment)) return { ok: false, reason: NAME_HINT };
  return { ok: true };
}

async function resolveName(argDir: string | undefined, yes: boolean): Promise<string> {
  if (argDir) {
    const check = validateNameSegment(argDir);
    if (!check.ok) {
      console.error(kleur.red(`\nInvalid project directory '${argDir}'. ${check.reason}.`));
      console.error(
        kleur.gray(`Examples: my-app, my-cool-app, project1. Avoid spaces, unicode, npm scopes.`),
      );
      process.exit(1);
    }
    return argDir;
  }
  if (yes) return "my-vexpo-app";

  const res = await prompts(
    {
      type: "text",
      name: "name",
      message: "Project directory",
      initial: "my-vexpo-app",
      validate: (v: string) => {
        const check = validateNameSegment(v);
        return check.ok ? true : check.reason;
      },
    },
    { onCancel: () => process.exit(1) },
  );

  return res.name as string;
}

async function restoreStrippedDotfiles(target: string): Promise<void> {
  for (const to of STRIPPED_DOTFILES) {
    const src = join(target, strippedToUnderscore(to));
    if (existsSync(src)) await rename(src, join(target, to));
  }
}

async function rewritePackage(target: string, requestedName: string): Promise<void> {
  const pkgPath = join(target, "package.json");
  const raw = await readFile(pkgPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.name = toPackageName(requestedName);
  parsed.version = "0.0.0";
  parsed.private = true;
  const devDeps = (parsed.devDependencies ?? {}) as Record<string, string>;
  devDeps["@ramonclaudio/vexpo"] = `^${pkg.version}`;
  parsed.devDependencies = Object.fromEntries(
    Object.entries(devDeps).toSorted(([a], [b]) => (a < b ? -1 : 1)),
  );
  delete parsed.author;
  delete parsed.repository;
  delete parsed.bugs;
  delete parsed.homepage;
  delete parsed.license;
  delete parsed.publishConfig;
  await writeFile(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function rewriteEasJson(target: string): Promise<void> {
  const path = join(target, "eas.json");
  if (!existsSync(path)) return;
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    submit?: Record<string, { ios?: Record<string, unknown> }>;
  };
  let removed = false;
  for (const profile of Object.values(parsed.submit ?? {})) {
    for (const key of ["ascAppId", "ascApiKeyId", "ascApiKeyIssuerId", "ascApiKeyPath"]) {
      if (profile.ios && key in profile.ios) {
        delete profile.ios[key];
        removed = true;
      }
    }
  }
  if (!removed) return;
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

function toPackageName(raw: string): string {
  return basename(raw).replace(/-+$/, "");
}

function detectPackageManager(): PM {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  return "npm";
}

function intro(): void {
  console.log();
  console.log(kleur.bold().cyan("create-vexpo") + kleur.gray(` v${pkg.version}`));
}

function installFailureStderr(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === "string") return stderr.trim();
  }
  return "";
}

function tail(text: string, n: number): string {
  return text.split("\n").slice(-n).join("\n");
}

function nextSteps(target: string, pm: PM, depsReady: boolean): void {
  const cdPath = relative(process.cwd(), target) || ".";
  console.log();
  console.log(kleur.bold("Next steps:"));
  console.log(kleur.gray("  cd ") + kleur.cyan(cdPath));
  if (!depsReady) console.log(kleur.gray(`  ${pm} install`));
  console.log(
    kleur.gray(`  npx vexpo lite         ${kleur.dim("# provisions Convex and Better Auth")}`),
  );
  console.log(
    kleur.gray(
      `  npx vexpo full         ${kleur.dim("# adds Resend, Apple Sign In, the ASC key, and eas init")}`,
    ),
  );
  console.log(
    kleur.gray(
      `  npx vexpo full --new   ${kleur.dim("# same, plus walks Apple, Convex, Expo, and Resend signups")}`,
    ),
  );
  console.log();
  console.log(kleur.bold("Then in two terminals:"));
  console.log(kleur.gray(`  ${pm} run convex:dev   ${kleur.dim("# terminal 1")}`));
  console.log(kleur.gray(`  ${pm} run ios          ${kleur.dim("# terminal 2")}`));
  console.log();
  console.log(
    kleur.gray("Using an AI agent? The setup playbook and the paste-in prompt are in ") +
      kleur.cyan("README.md") +
      kleur.gray("."),
  );
  console.log(kleur.gray("Docs: ") + kleur.cyan("https://github.com/ramonclaudio/vexpo"));
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
