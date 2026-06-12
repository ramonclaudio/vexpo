# create-vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scaffold a new [vexpo](https://github.com/ramonclaudio/vexpo) project: an Expo SDK 56 iOS app with Convex, Better Auth, and Resend wired in for backend, auth, and email. Push, OTA updates, and App Store submission all run through EAS.

## Usage

```bash
npm create @ramonclaudio/vexpo@latest my-app
# or
npx @ramonclaudio/create-vexpo@latest my-app
```

After scaffold:

```bash
cd my-app

npx vexpo lite         # 60 seconds: Convex + Better Auth, simulator-ready
npx vexpo lite --new   # same + Convex signup walkthrough for first-time users
npx vexpo full         # full provisioning: TestFlight-ready
npx vexpo full --new   # same + Apple, Convex, Expo, and Resend signup walkthrough
```

`npx vexpo lite` is the dev-mode shortcut. No Apple Developer account, no domain, no EAS, no Resend. Boots in the iOS Simulator in about 60 seconds. Add `--new` if you don't have a Convex account yet.

`npx vexpo full` validates and provisions everything in order: Convex, Better Auth, Resend, Apple Sign In, EAS, and a rebrand. About 30 minutes hands-on plus Apple-side wait times. It prints the `eas build` command at the end for you to run when ready.

## Options

| Flag            | Behavior                                                                          |
| --------------- | --------------------------------------------------------------------------------- |
| `[directory]`   | Project directory name (positional). Defaults to `my-vexpo-app` with `-y`.        |
| `--no-install`  | Skip installing dependencies after copying the template.                          |
| `--no-git`      | Skip `git init` after install.                                                    |
| `--no-setup`    | Skip the post-install `npx vexpo lite` or `npx vexpo full` prompt.                |
| `-y, --yes`     | Accept defaults, skip prompts.                                                     |
| `-v, --version` | Print version, exit.                                                              |

## What gets scaffolded

The CLI copies `templates/default/`, restores the dotfiles npm strips from tarballs (`.gitignore`, `.env.example`, `.npmrc`, others), and rewrites `package.json` for the new project. It installs with the package manager it detects from `npm_config_user_agent` (`npm`, `bun`, `pnpm`, or `yarn`, defaulting to `npm`). Then it initializes a git repo with `feat: initial commit`.

No lockfile ships in the tarball. The first install resolves the template's ranges fresh, including the latest in-range `vexpo` CLI, and the generated lockfile lands in the initial commit. The `vexpo` CLI installs as a devDependency, so `npx vexpo <subcommand>` resolves to the local pinned version.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)
