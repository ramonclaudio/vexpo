# create-vexpo

[![npm](https://img.shields.io/npm/v/create-vexpo)](https://www.npmjs.com/package/create-vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scaffold a new [vexpo](https://github.com/ramonclaudio/vexpo) project: Expo SDK 56 + Convex + Better Auth + Resend, wired end-to-end for iOS. Real auth (email + password, email OTP, Apple Sign In), APNs push, OTA updates, App Store submission. Strict TypeScript, native SwiftUI via `@expo/ui/swift-ui`, no NativeWind.

## Usage

```bash
npm create vexpo@latest my-app
# or
bunx create-vexpo@latest my-app
```

After scaffold:

```bash
cd my-app

bunx vexpo lite         # 60 seconds: Convex + Better Auth, simulator-ready
bunx vexpo lite --new   # same + Convex signup walkthrough for first-time users
bunx vexpo full         # full provisioning: TestFlight-ready (Convex, Better Auth, Resend, Apple Sign In, EAS, rebrand)
bunx vexpo full --new   # same + Apple/Convex/Expo/Resend signup walkthrough
```

`bunx vexpo lite` is the dev-mode shortcut. No Apple Developer account, no domain, no EAS, no Resend. Boots in the iOS Simulator in ~60 seconds. Add `--new` if you don't have a Convex account yet.

`bunx vexpo full` walks Apple Developer / Expo / Convex / Resend signups (with `--new`), validates each, provisions everything in order. ~30 minutes hands-on plus Apple-side wait times. Prints the canonical `eas build` command at the end. You run it when ready.

## Options

| Flag            | Behavior                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| `[directory]`   | Project directory name (positional). Defaults to `my-vexpo-app` with `-y`, otherwise prompts. |
| `--no-install`  | Skip running `<pm> install` after copying the template.                                       |
| `--no-git`      | Skip `git init` after install.                                                                |
| `--no-setup`    | Skip the post-install `bunx vexpo lite` / `bunx vexpo full` prompt.                           |
| `-y, --yes`     | Accept defaults, skip prompts.                                                                |
| `-v, --version` | Print version, exit.                                                                          |

## What gets scaffolded

The CLI copies `templates/default/` from the published tarball, restores npm-stripped dotfiles (`.gitignore`, `.env.example`, etc.), rewrites `package.json` (project name, version, drops monorepo metadata, swaps `vexpo` workspace ref for the published version), runs `bun install`, and initializes a fresh git repo with `feat: initial commit`.

After that, the project is standalone. The operational CLI (`vexpo`) is installed as a devDependency, so `bunx vexpo <subcommand>` resolves to the local pinned version. Setup commands aren't in `package.json`. They're one-shot CLI invocations, not runtime scripts.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)
