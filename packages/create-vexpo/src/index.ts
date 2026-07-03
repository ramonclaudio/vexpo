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
};

async function main() {
  const program = new Command()
    .name("create-vexpo")
    .description(
      "Scaffold a new vexpo project. Expo SDK 57 + Convex + Better Auth + Resend, wired for iOS.",
    )
    .argument("[directory]", "project directory name")
    .option("--no-install", "skip installing dependencies")
    .option("--no-git", "skip git init")
    .option("--no-setup", "skip the printed next-steps block after install")
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

  // True once deps are on disk: either install succeeded, or `--no-install`
  // means we never tried so there's nothing half-built. Gates the git commit
  // and the manual-install hint below.
  let depsReady = !flags.install;

  if (flags.install) {
    const installSpin = ora(`Installing dependencies with ${kleur.cyan(pm)}`).start();
    try {
      // Capture stderr instead of discarding it so a failed install can show
      // why. stdout stays silent to keep the spinner output clean.
      await execa(pm, ["install"], { cwd: target, stdout: "ignore" });
      installSpin.succeed(`Installed with ${pm}`);
      depsReady = true;
    } catch (err) {
      installSpin.fail(`Install failed. Run ${kleur.cyan(`${pm} install`)} manually.`);
      const stderr = installFailureStderr(err);
      if (stderr) console.error(kleur.gray(tail(stderr, 20)));
    }
  }

  if (flags.git) {
    const gitSpin = ora("Initializing git").start();
    let initialized = false;
    try {
      await execa("git", ["init", "--initial-branch=main"], { cwd: target, stdio: "ignore" });
      initialized = true;
    } catch {
      gitSpin.warn("Git init skipped");
    }
    if (initialized) {
      try {
        // Don't commit a half-built project. The repo is init'd so the user can
        // commit once deps land, but skip add/commit when install failed.
        if (!depsReady) {
          gitSpin.warn("Git repo initialized, commit skipped (install failed)");
          console.error(kleur.gray(`  Commit yourself after ${pm} install lands.`));
        } else {
          await execa("git", ["add", "-A"], { cwd: target, stdio: "ignore" });
          // git commit hard-fails without an identity (fresh machines, CI). It
          // needs both name and email, so stage everything and let the user
          // commit once they set one.
          const email = await execa("git", ["config", "user.email"], {
            cwd: target,
            reject: false,
          });
          const uname = await execa("git", ["config", "user.name"], { cwd: target, reject: false });
          if (!email.stdout.trim() || !uname.stdout.trim()) {
            gitSpin.warn("Git repo initialized, commit skipped (no git identity)");
            console.error(
              kleur.gray("  Set git config user.name and user.email, then commit yourself."),
            );
          } else {
            await execa("git", ["commit", "-m", "feat: initial commit", "--no-gpg-sign"], {
              cwd: target,
              stdio: "ignore",
            });
            gitSpin.succeed("Git repo initialized");
          }
        }
      } catch {
        gitSpin.warn("Git repo initialized, commit failed");
        console.error(kleur.gray("  Commit yourself once the working tree is ready."));
      }
    }
  }

  if (flags.setup) nextSteps(target, pm, depsReady);
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const NAME_HINT = "lowercase letters, numbers, dashes; must start alphanumeric";

// Validate the LAST path segment of the target. `./my-app`, `/tmp/my-app`, and
// `my-app` should all pass when the trailing component is a valid name; only
// reject names that would produce a corrupt `package.json.name` (spaces,
// unicode, npm scopes, etc.).
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

// Restore dotfiles npm strips from published tarballs.
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
  // Pin the CLI to this scaffolder's own release line. The template can't
  // hardcode a registry range: it drifts the moment a breaking vexpo ships,
  // and caret ranges never cross the minor while the major is 0.
  const devDeps = (parsed.devDependencies ?? {}) as Record<string, string>;
  devDeps["@ramonclaudio/vexpo"] = `^${pkg.version}`;
  parsed.devDependencies = devDeps;
  delete parsed.author;
  delete parsed.repository;
  delete parsed.bugs;
  delete parsed.homepage;
  delete parsed.license;
  delete parsed.publishConfig;
  await writeFile(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
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

// Pull the stderr off a failed execa subprocess. execa 9 throws an ExecaError
// carrying the captured stderr; guard the shape so a non-execa throw is safe.
function installFailureStderr(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === "string") return stderr.trim();
  }
  return "";
}

// Last `n` lines of a string. Install logs are long; the tail holds the error.
function tail(text: string, n: number): string {
  return text.split("\n").slice(-n).join("\n");
}

function nextSteps(target: string, pm: PM, depsReady: boolean): void {
  const cdPath = relative(process.cwd(), target) || ".";
  console.log();
  console.log(kleur.bold("Next steps:"));
  console.log(kleur.gray("  cd ") + kleur.cyan(cdPath));
  // Print the manual install whenever deps aren't on disk: either install was
  // skipped (`--no-install`) or it ran and failed.
  if (!depsReady) console.log(kleur.gray(`  ${pm} install`));
  console.log(
    kleur.gray(
      `  npx vexpo lite     ${kleur.dim("# dev mode: Convex + Better Auth, provisioned in ~60s")}`,
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
