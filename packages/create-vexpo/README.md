# create-vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![Check](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml/badge.svg)](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Creates a new [vexpo](https://github.com/ramonclaudio/vexpo) project. Vexpo is an iOS app built on Expo SDK 57 with `@expo/ui`'s fully native SwiftUI, Convex set up as the backend, Better Auth wired in for authentication, and Resend for email. Push, over-the-air (OTA) updates and App Store submission all run through EAS.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="The scaffolded app: sign up, onboarding, search, and the dark-mode flip">
</p>

## Usage

```bash
npm create @ramonclaudio/vexpo@latest my-app
# or
npx @ramonclaudio/create-vexpo@latest my-app
```

Then set it up.

```bash
cd my-app

npx vexpo lite         # sets up Convex and Better Auth
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have an account
npx vexpo full         # adds Resend, Apple Sign In, the ASC key, eas init, and rebrand
npx vexpo full --new   # same, plus helps you sign up for Apple, Convex, Expo, and Resend
```

## Prerequisites

- macOS with Xcode, to build and run the app in the iOS Simulator.
- Bun, or Node 22.12 or newer.
- An Apple Developer membership, but only when you ship to TestFlight or the App Store. You don't need it for local dev with `npx vexpo lite`.

## What you get

The CLI copies `templates/default/`, rewrites `package.json`, installs with your package manager (npm, bun, pnpm or yarn), and inits git. No lockfile ships, so the first install resolves the latest in-range `vexpo` CLI and the generated lockfile goes in the initial commit.

## Repository

If you want to work on this, [CONTRIBUTING.md](https://github.com/ramonclaudio/vexpo/blob/main/CONTRIBUTING.md) on GitHub has what you need.

## License

MIT
