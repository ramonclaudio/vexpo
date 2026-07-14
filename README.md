# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo?label=create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo?label=vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![Check](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml/badge.svg)](https://github.com/ramonclaudio/vexpo/actions/workflows/check.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ramonclaudio/vexpo/badge)](https://scorecard.dev/viewer/?uri=github.com/ramonclaudio/vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

vexpo is an Expo SDK 57 iOS template with Convex, Better Auth, and Resend wired in, plus a CLI that owns the road from `npm create` to TestFlight: identity, backend, Apple credentials, EAS, and email. A dev app runs in about a minute. One step on the whole road is interactive, Apple's first-build credentials wizard.

<p align="center">
  <img src=".github/assets/demo-app.gif" width="300" alt="The template app on the iOS simulator: sign up, onboarding, search, and the dark-mode flip">
</p>

```bash
npm create @ramonclaudio/vexpo@latest my-app
cd my-app

npx vexpo lite          # Convex + Better Auth provisioned in about a minute
npx vexpo lite --new    # same, plus a Convex signup walkthrough if you don't have one
```

Run it in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

`lite` skips Apple, EAS, and Resend, so sign-up auto-verifies. The app boots as Vexpo until `npx vexpo rebrand` swaps in your identity, one flagged command that rewrites every branded file (`full` runs the wizard for you). When you're ready to ship:

```bash
npx vexpo full          # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo doctor        # auth-checks every credential against the real service
```

`full` writes the env, sets Convex vars, signs the Apple JWT, runs `eas init` + `eas env:push`, and seeds the App Review account. Add `--new` for signup walkthroughs, or `--plan` to preview the setup first.

The honest shape of the whole road: four things only you can do (log in to EAS, download the ASC `.p8` once, paste a Resend key, answer the first build's credentials wizard), and everything else runs headless, including every build and submit after that first one. The ordered walk lives in the scaffold's [Ship path](./templates/default/README.md#ship-path).

## Starting with an AI agent

Every command above is agent-drivable: `rebrand` takes full flags with `-y` for non-TTY runs, and the scaffold ships an [`AGENTS.md`](./templates/default/AGENTS.md) with two playbooks (fresh-scaffold setup and the ship path, with the human/agent split marked per step) plus pre-approved read-only permissions for Claude Code. Scaffold, open the project in your agent, and paste:

```text
Set up this fresh vexpo scaffold as my app. Collect my identity inputs (app
name, bundle id, my name, Expo slug, review email, URLs), run
`npx vexpo rebrand -y` with full flags, then `npx vexpo lite`, verify with
typecheck + lint + format:check + test, and commit. AGENTS.md has the details,
including the Ship path playbook for when I say ship.
```

The scaffold's own [`README.md`](./templates/default/README.md#setting-up) carries the long-form version of this prompt.

<p align="center">
  <img src=".github/assets/demo-doctor.gif" width="720" alt="vexpo doctor auth-checking every credential against the live services and flagging real drift">
</p>

## What's included

- Expo SDK 57, RN 0.86, React 19. Strict TypeScript, no NativeWind.
- Every screen is SwiftUI via `@expo/ui/swift-ui`, Liquid Glass on iOS 26+, blur fallback below.
- VoiceOver, Voice Control, and Dynamic Type across every screen: spoken async state, combined VoiceOver stops, native symbol scaling, redaction-built skeletons, and an app-switcher privacy shield. Built on our 28 merged `expo/expo` PRs, wired against released `@expo/ui` only.
- Email, password, OTP, and Apple Sign In, with per-device session revocation and account soft-delete.
- Convex reactive queries and storage, Resend delivery webhooks.
- APNs push and Apple Universal Links.
- EAS builds, updates, submission, and store metadata, with nine workflows under `.eas/workflows/`. None trigger on a push to `main`.

<p align="center">
  <img src=".github/assets/screens.png" width="760" alt="Template screens in light and dark: home, profile, settings">
</p>

## Repo layout

```text
vexpo/
├── packages/
│   ├── create-vexpo/      # npm scaffolder
│   └── vexpo/             # operational CLI
└── templates/default/     # the Expo + Convex + Better Auth app
```

`create-vexpo` copies `templates/default/`, rewrites `package.json`, installs, inits git. `vexpo` ships as a devDependency, so `npx vexpo` resolves to the pinned version.

## Pre-reqs

Tools, all local. `eas-cli` and the `convex` CLI come through the project (npx fetches them), no global installs:

- macOS and Xcode (iOS-only)
- Bun or Node 22.12+

Accounts, by the stage that needs them. Nothing beyond Convex is required until you ship:

| Stage                   | Account                                     | Cost                  |
| ----------------------- | ------------------------------------------- | --------------------- |
| `vexpo lite` (dev app)  | Convex                                      | free                  |
| `vexpo full` (shipping) | Expo (EAS builds, env, submit)              | free tier covers this |
| `vexpo full` (shipping) | Apple Developer Program + App Store Connect | $99/yr                |
| Email (OTP, reset)      | Resend + a domain you control DNS for       | free tier covers this |

Both CLIs need a one-time login before provisioning: `npx convex login` and `npx eas-cli login`. Setup's Prerequisites section flags whichever is missing, and `--new` on `lite`/`full` walks each signup you don't have yet. The Apple leg also needs a one-time ASC API key download (`.p8`, App Manager role), which the scaffold's [Ship path](./templates/default/README.md#ship-path) covers in order.

## Docs

- [`templates/default/README.md`](./templates/default/README.md): the app, screen by screen.
- [`docs/troubleshooting.md`](./docs/troubleshooting.md): the common Apple, EAS, Convex, and Expo failure modes and their fixes.
- [`SECURITY.md`](./SECURITY.md): threat model, webhook verification, OTA signing, secret rotation.
- [`CHANGELOG.md`](./CHANGELOG.md): release history.

Working on vexpo itself? See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Bugs go to [GitHub Issues](https://github.com/ramonclaudio/vexpo/issues).

## License

MIT
