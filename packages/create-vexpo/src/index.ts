import { existsSync } from "node:fs";
import { cp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { run } from "./proc.ts";
import { askText, bold, cyan, dim, gray, red, spinner, type Spinner } from "./tty.ts";

import pkg from "../package.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(here, "templates", "default");

type PM = "bun" | "pnpm" | "yarn" | "npm";

type Flags = {
  install: boolean;
  git: boolean;
  yes: boolean;
  brand: boolean;
};

async function main() {
  const program = new Command()
    .name("create-vexpo")
    .description(
      "Scaffold a new vexpo app. Expo SDK 57 on iOS with Convex, Better Auth and Resend wired in.",
    )
    .argument("[directory]", "project directory name")
    .option("--no-install", "skip installing dependencies")
    .option("--no-git", "skip git init")
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
    console.error(red(`\nTarget ${target} already exists. Pick a different name.`));
    process.exit(1);
  }

  const pm = detectPackageManager();

  await copyTemplate(target, name);

  const depsReady = flags.install ? await install(target, pm) : true;

  if (flags.brand && depsReady && !flags.yes) await brand(target);

  if (flags.git) await initGit(target, pm, depsReady);

  nextSteps(target, pm, depsReady);
}

async function copyTemplate(target: string, name: string): Promise<void> {
  const spin = spinner(`Copying template to ${cyan(relative(process.cwd(), target) || ".")}`);
  try {
    await cp(TEMPLATE_DIR, target, { recursive: true });
    await restoreGitignore(target);
    await rewritePackage(target, name);
    await rewriteEasJson(target);
  } catch (err) {
    spin.fail("Template copy failed");
    throw err;
  }
  spin.succeed("Template copied");
}

async function install(target: string, pm: PM): Promise<boolean> {
  const spin = spinner(`Installing dependencies with ${cyan(pm)}`);
  const { code, stderr } = await run([pm, "install"], { cwd: target });
  if (code !== 0) {
    spin.fail(`Install failed. Run ${cyan(`${pm} install`)} manually.`);
    if (stderr.trim()) console.error(gray(tail(stderr.trim(), 20)));
    return false;
  }
  spin.succeed(`Installed with ${pm}`);
  return true;
}

async function brand(target: string): Promise<void> {
  const bin = join(target, "node_modules", ".bin", "vexpo");
  if (!existsSync(bin) || process.stdin.isTTY !== true) return;
  console.log();
  const { code } = await run([bin, "rebrand"], { cwd: target, stdio: "inherit" });
  if (code !== 0) {
    console.error(
      gray("  Rebrand skipped. Run ") +
        cyan("npx vexpo rebrand") +
        gray(" in the project when you are ready."),
    );
  }
}

async function commitAll(target: string, spin: Spinner): Promise<void> {
  await run(["git", "add", "-A"], { cwd: target, stdio: "ignore" });
  const email = await run(["git", "config", "user.email"], { cwd: target });
  const uname = await run(["git", "config", "user.name"], { cwd: target });
  if (!email.stdout.trim() || !uname.stdout.trim()) {
    spin.warn("Git repo initialized, commit skipped (no git identity)");
    console.error(gray("  Set git config user.name and user.email, then commit yourself."));
    return;
  }
  const commit = await run(["git", "commit", "-m", "feat: initial commit", "--no-gpg-sign"], {
    cwd: target,
    stdio: "ignore",
  });
  if (commit.code !== 0) {
    spin.warn("Git repo initialized, commit failed");
    console.error(gray("  Commit yourself once the working tree is ready."));
    return;
  }
  spin.succeed("Git repo initialized");
}

async function initGit(target: string, pm: PM, depsReady: boolean): Promise<void> {
  const spin = spinner("Initializing git");
  const init = await run(["git", "init", "--initial-branch=main"], {
    cwd: target,
    stdio: "ignore",
  });
  if (init.code !== 0) {
    spin.warn("Git init skipped");
    return;
  }
  if (!depsReady) {
    spin.warn("Git repo initialized, commit skipped (install failed)");
    console.error(gray(`  Commit yourself after ${pm} install lands.`));
    return;
  }
  await commitAll(target, spin);
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
      console.error(red(`\nInvalid project directory '${argDir}'. ${check.reason}.`));
      console.error(
        gray(`Examples: my-app, my-cool-app, project1. Avoid spaces, unicode, npm scopes.`),
      );
      process.exit(1);
    }
    return argDir;
  }
  if (yes) return "my-vexpo-app";

  return askText({
    message: "Project directory",
    initial: "my-vexpo-app",
    validate: (value) => {
      const check = validateNameSegment(value);
      return check.ok ? true : check.reason;
    },
  });
}

// npm drops .gitignore from a published package, so the template ships it as _gitignore.
async function restoreGitignore(target: string): Promise<void> {
  const src = join(target, "_gitignore");
  if (existsSync(src)) await rename(src, join(target, ".gitignore"));
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
  console.log(bold(cyan("create-vexpo")) + gray(` v${pkg.version}`));
}

function tail(text: string, n: number): string {
  return text.split("\n").slice(-n).join("\n");
}

function nextSteps(target: string, pm: PM, depsReady: boolean): void {
  const cdPath = relative(process.cwd(), target) || ".";
  console.log();
  console.log(bold("Next steps:"));
  console.log(gray("  cd ") + cyan(cdPath));
  if (!depsReady) console.log(gray(`  ${pm} install`));
  console.log(gray(`  npx vexpo lite         ${dim("# sets up Convex and Better Auth")}`));
  console.log(
    gray(
      `  npx vexpo full         ${dim("# adds Resend, Sign in with Apple, the App Store Connect key and EAS")}`,
    ),
  );
  console.log(
    gray(
      `  npx vexpo full --new   ${dim("# same, plus signups for Apple, Convex, Expo and Resend")}`,
    ),
  );
  console.log();
  console.log(bold("Then in two terminals:"));
  console.log(gray(`  npx convex dev   ${dim("# terminal 1")}`));
  console.log(gray(`  ${pm} run ios       ${dim("# terminal 2")}`));
  console.log();
  console.log(gray("Docs: ") + cyan("https://github.com/ramonclaudio/vexpo"));
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
