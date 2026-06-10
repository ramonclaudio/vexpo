import { existsSync } from "node:fs";
import { cp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { execa } from "execa";
import kleur from "kleur";
import ora from "ora";
import prompts from "prompts";

import pkg from "../package.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(here, "templates", "default");

type PM = "bun" | "pnpm" | "yarn" | "npm";

type Flags = {
  install: boolean;
  git: boolean;
  yes: boolean;
  setup: boolean;
};

async function main() {
  const program = new Command()
    .name("create-vexpo")
    .description(
      "Scaffold a new vexpo project. Expo SDK 56 + Convex + Better Auth + Resend, wired for iOS.",
    )
    .argument("[directory]", "project directory name")
    .option("--no-install", "skip installing dependencies")
    .option("--no-git", "skip git init")
    .option("--no-setup", "skip the `npx vexpo lite` / `npx vexpo full` prompt after install")
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

  const copySpin = ora(
    `Copying template to ${kleur.cyan(relative(process.cwd(), target) || ".")}`,
  ).start();
  try {
    await cp(TEMPLATE_DIR, target, { recursive: true });
    await restoreStrippedDotfiles(target);
    await rewritePackage(target, name);
    copySpin.succeed("Template copied");
  } catch (err) {
    copySpin.fail("Template copy failed");
    throw err;
  }

  if (flags.install) {
    const installSpin = ora(`Installing dependencies with ${kleur.cyan(pm)}`).start();
    try {
      await execa(pm, ["install"], { cwd: target, stdio: "ignore" });
      installSpin.succeed(`Installed with ${pm}`);
    } catch {
      installSpin.warn(`Install skipped. Run ${kleur.cyan(`${pm} install`)} manually.`);
    }
  }

  if (flags.git) {
    const gitSpin = ora("Initializing git").start();
    try {
      await execa("git", ["init", "--initial-branch=main"], { cwd: target, stdio: "ignore" });
      await execa("git", ["add", "-A"], { cwd: target, stdio: "ignore" });
      await execa("git", ["commit", "-m", "feat: initial commit", "--no-gpg-sign"], {
        cwd: target,
        stdio: "ignore",
      });
      gitSpin.succeed("Git repo initialized");
    } catch {
      gitSpin.warn("Git init skipped");
    }
  }

  if (flags.setup) nextSteps(target, flags, pm);
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const NAME_HINT = "lowercase letters, numbers, dashes; must start alphanumeric";

// Validate the LAST path segment of the target. `./my-app`, `/tmp/my-app`, and
// `my-app` should all pass when the trailing component is a valid name; only
// reject names that would produce a corrupt `package.json.name` (spaces,
// unicode, npm scopes, etc.).
function validateNameSegment(target: string): { ok: true } | { ok: false; reason: string } {
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

// Restore dotfiles npm strips from published tarballs. Keep this list in sync
// with tsup.config.ts STRIPPED_DOTFILES.
async function restoreStrippedDotfiles(target: string): Promise<void> {
  const renames: Array<[string, string]> = [
    ["_gitignore", ".gitignore"],
    ["_env.example", ".env.example"],
    ["_oxfmtrc.json", ".oxfmtrc.json"],
    ["_oxlintrc.json", ".oxlintrc.json"],
    ["_editorconfig", ".editorconfig"],
    ["_gitattributes", ".gitattributes"],
    ["_easignore", ".easignore"],
    ["_fingerprintignore", ".fingerprintignore"],
    ["_env.convex.local", ".env.convex.local"],
    ["_npmrc", ".npmrc"],
  ];
  for (const [from, to] of renames) {
    const src = join(target, from);
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
  delete parsed.author;
  delete parsed.repository;
  delete parsed.bugs;
  delete parsed.homepage;
  delete parsed.license;
  delete parsed.publishConfig;
  await writeFile(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function toPackageName(raw: string): string {
  const name = basename(raw)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "my-vexpo-app";
}

function detectPackageManager(): PM {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("npm")) return "npm";
  return "npm";
}

function intro(): void {
  console.log();
  console.log(kleur.bold().cyan("create-vexpo") + kleur.gray(` v${pkg.version}`));
}

function nextSteps(target: string, flags: Flags, pm: PM): void {
  const cdPath = relative(process.cwd(), target) || ".";
  console.log();
  console.log(kleur.bold("Next steps:"));
  console.log(kleur.gray("  cd ") + kleur.cyan(cdPath));
  if (!flags.install) console.log(kleur.gray(`  ${pm} install`));
  console.log(
    kleur.gray(
      `  npx vexpo lite     ${kleur.dim("# dev mode: Convex + Better Auth, 60s to simulator")}`,
    ),
  );
  console.log(
    kleur.gray(
      `  npx vexpo full     ${kleur.dim("# real setup: TestFlight-ready (add --new if you're new)")}`,
    ),
  );
  console.log();
  console.log(kleur.bold("Then in two terminals:"));
  console.log(kleur.gray(`  ${pm} run convex:dev   ${kleur.dim("# terminal 1")}`));
  console.log(kleur.gray(`  ${pm} run ios          ${kleur.dim("# terminal 2")}`));
  console.log();
  console.log(kleur.gray("Docs: ") + kleur.cyan("https://github.com/ramonclaudio/vexpo"));
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
