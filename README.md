# vexpo

[![npm](https://img.shields.io/npm/v/@ramonclaudio/create-vexpo?label=create-vexpo)](https://www.npmjs.com/package/@ramonclaudio/create-vexpo)
[![npm](https://img.shields.io/npm/v/@ramonclaudio/vexpo?label=vexpo)](https://www.npmjs.com/package/@ramonclaudio/vexpo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

vexpo automates the setup between an empty directory and TestFlight. The scaffold ships Expo SDK 56, Convex, Better Auth, and Resend wired end to end. The CLI handles the provisioning around it: Apple Developer, App Store Connect, Sign in with Apple, EAS, and env sync across dev, preview, and prod.

```bash
npm create @ramonclaudio/vexpo@latest my-app
cd my-app
npx vexpo lite   # Convex + Better Auth, simulator-ready in about a minute
```

Two packages: [`@ramonclaudio/create-vexpo`](https://www.npmjs.com/package/@ramonclaudio/create-vexpo) scaffolds the app, [`@ramonclaudio/vexpo`](https://www.npmjs.com/package/@ramonclaudio/vexpo) is the operational CLI that provisions, verifies, and repairs the setup (`lite`, `full`, `doctor`, and friends).

The problem it deletes: every new Expo app burns a day in the Apple Developer Portal and EAS dashboards before the first line of app code. Convex deployment, auth secrets, sending keys, the ASC API and Sign in with Apple dance, certs, profiles, env mirroring, the rotation cron for the 180-day JWT. vexpo is that setup, automated, plus the app already wired correctly behind it.

## Quick start

Needs macOS + Xcode, a [Convex](https://convex.dev) account (free tier), and Bun or Node 20+.

```bash
npm create @ramonclaudio/vexpo@latest my-app
cd my-app

npx vexpo lite         # 60-second path: Convex + Better Auth, simulator-ready
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have one
```

Then in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

Lite mode skips Apple, EAS, and Resend entirely. `REQUIRE_EMAIL_VERIFICATION` is off on Convex so sign-up auto-verifies, the user lands in the app with one tap, and the UI hides the OTP, password-reset, and change-email flows that need Resend to work.

When you're ready to ship, swap `lite` for `full`:

```bash
npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
```

`full` jumps straight into provisioning. It writes `.env.local`, sets Convex env vars (`REQUIRE_EMAIL_VERIFICATION=true` once Resend is wired), validates the ASC API key, signs the Apple Sign In JWT, runs `eas init` and `eas env:push`, and prompts the rebrand wizard. At the end it prints the `eas build -p ios --profile production --auto-submit-with-profile testflight` command. vexpo doesn't run it for you. You run `npx eas build` when you're ready.

`full --new` is for first-time users coming in cold. Convex and Expo signups happen via their CLIs' browser-based OAuth. Resend signup is a browser-open + paste-API-key flow (Resend has no signup API). Apple Developer Program is the only signup vexpo can't automate at all. Apple requires identity verification, payment, and 24-48h review. That step pauses the orchestrator while you complete enrollment.

State is cached in `.setup-state.json` so re-runs are fast. `npx vexpo doctor` auth-checks every credential against the real service. It hits Resend `/api-keys`, ASC `/v1/apps`, and decodes the Apple JWT for kid, iss, sub, and expiry. Then it cross-references the bundle ID, team ID, and Services ID across `.env.local`, Convex env, EAS env, and `app.config.ts`. Catches "wrong .p8 from another project" or ".env.prod copied from a different fork" in seconds.

## What's in the box

**Stack.** Expo SDK 56 + RN 0.85 + React 19 + Convex + Better Auth + Resend. Strict TypeScript, no NativeWind, no Tailwind.

**Native UI.** Every screen renders SwiftUI through `@expo/ui/swift-ui`. Forms, lists, sections, segmented controls, sheets, alerts, dynamic colors, system materials. Liquid Glass on iOS 26+ via `expo-glass-effect`, UIVisualEffectView blur fallback on iOS 16.4-25 via `expo-blur`. DynamicColorIOS for every palette token, so colors auto-adapt to dark mode and the Increase Contrast accessibility setting. SF Symbols via `expo-symbols`. Haptics, dynamic type, VoiceOver labels, reduced motion respected. A bunch of the SwiftUI modifiers the template reaches for ship via upstream PRs I wrote and got merged into `expo/expo`. Full ledger in [`docs/UPSTREAM.md`](./docs/UPSTREAM.md).

**Auth.** Email plus password plus email OTP via Better Auth (`@convex-dev/better-auth`). Apple Sign In via Apple's official `AppleAuthenticationButton`. It's HIG-compliant, black in dark mode and white in light. The third HIG style, `WHITE_OUTLINE`, isn't used here. SIWA Services ID JWT signing is ES256 with a 180-day expiry, auto-rotated every 90 days by an EAS Workflows cron. Active sessions screen with device-by-device revocation via `listSessions` and `revokeSession`. Profile editing with avatar uploads to Convex storage. Rate limiting on every endpoint via `@convex-dev/rate-limiter`. App Attest device attestation via `@expo/app-integrity`, verified server-side in Convex. Account soft-delete with a 30-day grace window and restore-on-next-sign-in.

**Push + Universal Links.** APNs push via `expo-notifications` with token registration on sign-in. Apple Universal Links served from Convex's HTTP router (AASA at `/.well-known/apple-app-site-association`).

**Email.** Resend via `@convex-dev/resend` for transactional email and webhook delivery events.

**EAS, every product wired.** 10 workflows under `.eas/workflows/`. PR previews ship a `github-comment` job, a QR code, and a fingerprint-gated OTA-or-build. They run on manual `workflow_dispatch` by default. Flip on the `pull_request` trigger if you want a build on every PR and the EAS credits to spare. Production deploy is Convex plus iOS build plus submit plus OTA, all fingerprint-gated. It's manual-only by design so a merge to `main` can't ship to the App Store by surprise. Add a `push: main` trigger if you want that. TestFlight runs on `beta/*` branches with a dedicated `testflight` job, internal groups, and an auto-changelog from the commit. Maestro E2E is manual, same reason. ASC event triggers via `on.app_store_connect`. Manual rollback (`update:republish` or `update:roll-back-to-embedded`) and manual rollout (`update --rollout-percentage` or `update:edit`). Tag releases. Apple Sign In JWT rotation cron. `EAS Webhooks` for `BUILD` and `SUBMIT` events land in Convex's HTTP router at `/eas-webhook`, HMAC-SHA1 verified, with a structured access log keyed on `X-Request-Id`. `expo-insights` is installed for cold-start metrics and app-store-version breakdowns. OTA bundles are code-signed end-to-end.

## Repo layout

```
vexpo/
├── packages/
│   ├── create-vexpo/      # npm scaffolder (`npm create @ramonclaudio/vexpo@latest`)
│   └── vexpo/             # operational CLI (`npx vexpo <subcommand>`)
├── templates/default/     # the Expo + Convex + Better Auth app
└── docs/                  # ARCHITECTURE, SECURITY, OPERATIONS, UPSTREAM
```

`create-vexpo` copies `templates/default/` into a fresh directory, rewrites `package.json`, runs `npm install`, inits git. `vexpo` ships as a devDependency, so `npx vexpo` resolves to the local pinned version.

## Pre-reqs

- macOS + Xcode for the simulator and signing
- Apple Developer Program membership ($99/yr) when you're ready to ship
- A domain you control DNS for (Resend sending domain)
- Bun or Node 20+

## Long-form docs

- Template README: [`templates/default/README.md`](./templates/default/README.md)
- Setup walkthrough: [`templates/default/SETUP.md`](./templates/default/SETUP.md). Every phase with full prompts, env-var alternatives for non-interactive runs, recovery paths.
- Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Why Convex over Postgres+Redis+Node, why Better Auth, every EAS product wiring, the setup state machine, performance characteristics, deliberate non-goals.
- Security: [`docs/SECURITY.md`](./docs/SECURITY.md). Threat model, webhook signature and replay protection, OTA code-signing, Apple credential rotation, the secret-rotation matrix.
- Operations: [`docs/OPERATIONS.md`](./docs/OPERATIONS.md). Service map, daily checks, failure modes with concrete recovery steps, useful queries, when to escalate.
- Upstream contributions: [`docs/UPSTREAM.md`](./docs/UPSTREAM.md). Ledger of every PR I wrote and got merged into `expo/expo` that the template depends on. The `@expo/ui/swift-ui` modifiers, the `Alert` component, Dynamic Type fixes, an `expo-modules-core` race fix, an `expo-tools` scoped-package resolution fix, and three CI workflow guards that make every fork green.
- Design system: [`templates/default/DESIGN.md`](./templates/default/DESIGN.md). Color palette, typography, spacing, radius ladder, materials, the SwiftUI primitives and the custom composition surface.

## Monorepo dev

For working on the CLI itself:

```bash
npm install                # install package + workspace deps
npm run link:dev           # build vexpo + `npm link` it into templates/default
npm run dev -w @ramonclaudio/vexpo     # tsup watch mode on the CLI source
cd templates/default
npx vexpo full --dry-run  # exercises the linked CLI
```

Tests:

```bash
npm run test               # 353 unit (vexpo) + 113 template = 466 total
npm run test:packages:e2e  # e2e suite against the built `vexpo` CLI dist
npm run test:all           # everything
```

### Testing `eas build` against `templates/default`

The committed `templates/default/app.json` is `{ "expo": {} }`, no `projectId`. Forks run `eas init` once and commit their own. For testing in this repo without committing your `projectId`, eas-cli needs it in process env at invocation time. That's because eas-cli sets `EXPO_NO_DOTENV=1` when evaluating `app.config.ts` for projectId resolution, which is intentional for build determinism. So `.env.local` alone won't be loaded by eas-cli for that step.

Once-per-session shell export, no tools to install:

```bash
cd templates/default
export $(grep '^EAS_PROJECT_ID=' .env.local)
npx eas build -p ios --profile production --auto-submit-with-profile testflight
```

The new shell only retains the value for that session. Open a new terminal and you'll need to re-run the `export` before testing. That's the trade-off for no external dependencies.

If you'd rather auto-load on `cd`, [direnv](https://direnv.net) handles it:

```bash
brew install direnv                                # if not installed; add `eval "$(direnv hook zsh)"` to your shell rc
echo 'dotenv .env.local' > templates/default/.envrc
direnv allow templates/default
```

Then every subsequent `cd templates/default` exports `.env.local` automatically.

Without either path, the first `eas build` of a fresh checkout prompts "Configure this project?", writes `projectId` into `app.json`, and you'll need to stash it before committing.

`npx vexpo doctor`, `vexpo lite`/`vexpo full`, and `vexpo env push` all read `.env.local` directly, so they work without shell-loading.
