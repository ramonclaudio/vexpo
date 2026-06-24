# create-vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scaffold a new [vexpo](https://github.com/ramonclaudio/vexpo) project: an Expo SDK 56 iOS app with Convex, Better Auth, and Resend wired in for backend, auth, and email. Push, OTA updates, and App Store submission all run through EAS.

The CLI creates or links your Convex deployment and runs the setup from the terminal.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="The scaffolded app: sign up, onboarding, search, and the dark-mode flip">
</p>

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

`lite` is the dev shortcut: no Apple account, domain, EAS, or Resend, simulator-ready in about a minute. `full` provisions everything in order (Convex, Better Auth, Resend, Apple Sign In, EAS, rebrand), about 30 minutes hands-on plus Apple-side wait times, then prints the `eas build` command for you to run. Add `--new` to either for the signup walkthroughs.

## Pre-reqs

- macOS with Xcode, to build and run the app in the iOS Simulator.
- Bun, or Node 20+.
- An Apple Developer membership, only when you ship to TestFlight or the App Store. Not needed for local dev with `npx vexpo lite`.

## Options

| Flag            | Behavior                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `[directory]`   | Project directory name (positional). Defaults to `my-vexpo-app` with `-y`. |
| `--no-install`  | Skip installing dependencies after copying the template.                   |
| `--no-git`      | Skip `git init` after install.                                             |
| `--no-setup`    | Skip the printed next-steps block after install.                           |
| `-y, --yes`     | Accept defaults, skip prompts.                                             |
| `-v, --version` | Print version, exit.                                                       |

## What gets scaffolded

The CLI copies `templates/default/`, rewrites `package.json`, installs with your package manager (npm, bun, pnpm, or yarn), and inits git. No lockfile ships, so the first install resolves the latest in-range `vexpo` CLI and the generated lock lands in the initial commit.

## Repo

[github.com/ramonclaudio/vexpo](https://github.com/ramonclaudio/vexpo)

Development happens in the monorepo. See [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md) on GitHub.

## License

MIT
