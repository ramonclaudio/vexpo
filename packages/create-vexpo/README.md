# create-vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![Check](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml/badge.svg)](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scaffold a new [vexpo](https://github.com/ramonclaudio/vexpo) project: an Expo SDK 57 iOS app with Convex, Better Auth, and Resend wired in. Push, OTA updates, and App Store submission all run through EAS.

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

npx vexpo lite         # Convex + Better Auth provisioned in about a minute
npx vexpo lite --new   # same + Convex signup walkthrough for first-time users
npx vexpo full         # full provisioning: TestFlight-ready
npx vexpo full --new   # same + Apple, Convex, Expo, and Resend signup walkthrough
```

## Pre-reqs

- macOS with Xcode, to build and run the app in the iOS Simulator.
- Bun, or Node 22.12+.
- An Apple Developer membership, only when you ship to TestFlight or the App Store. Not needed for local dev with `npx vexpo lite`.

## What gets scaffolded

The CLI copies `templates/default/`, rewrites `package.json`, installs with your package manager (npm, bun, pnpm, or yarn), and inits git. No lockfile ships, so the first install resolves the latest in-range `vexpo` CLI and the generated lock lands in the initial commit.

## Repo

See [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md) on GitHub.

## License

MIT
