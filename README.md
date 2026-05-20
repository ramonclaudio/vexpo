# vexpo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

I ship a lot of Expo apps. Every time I start one I end up rebuilding the same scaffolding. Convex deployment, Better Auth secrets, Resend sending key and webhook, the Apple Developer / ASC API / SIWA Services ID dance, EAS init, env mirroring to dev/preview/prod, dist cert, provisioning profile, push key, the rotation cron for the 180-day JWT. By the time I'm writing app code I've burned a day in Apple Developer Portal and EAS dashboards. vexpo is that setup, automated, plus the app already wired correctly behind it.

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

Lite mode skips Apple / EAS / Resend entirely. `REQUIRE_EMAIL_VERIFICATION` is off on Convex so sign-up auto-verifies, the user lands in the app with one tap, and the UI hides the OTP / password-reset / change-email flows that need Resend to work.

When you're ready to ship, swap `lite` for `full`:

```bash
npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo full --new   # same, plus walks Apple / Convex / Expo / Resend signups
```

`full` jumps straight into provisioning: writes `.env.local`, sets Convex env vars (including `REQUIRE_EMAIL_VERIFICATION=true` once Resend is wired), validates the ASC API key, signs the Apple Sign In JWT, runs `eas init` and `eas env:push`, prompts the rebrand wizard. Prints the `eas build -p ios --profile production --auto-submit-with-profile testflight` command at the end. vexpo doesn't run it for you. You run `npx eas build` when you're ready.

`full --new` is for first-time users coming in cold. Convex and Expo signups happen via their CLIs' browser-based OAuth. Resend signup is a browser-open + paste-API-key flow (Resend has no signup API). Apple Developer Program is the only signup vexpo can't automate at all. Apple requires identity verification, payment, and 24-48h review. That step pauses the orchestrator while you complete enrollment.

State is cached in `.setup-state.json` so re-runs are fast. `npx vexpo doctor` auth-checks every credential against the real service (Resend `/api-keys`, ASC `/v1/apps`, Apple JWT decoded for kid/iss/sub/expiry) and cross-references the bundle ID, team ID, and Services ID across `.env.local`, Convex env, EAS env, and `app.config.ts`. Catches "wrong .p8 from another project" or ".env.prod copied from a different fork" in seconds.

## What's in the box

**Stack.** Expo SDK 56 preview + RN 0.85 + React 19 + Convex + Better Auth + Resend. Strict TypeScript, no NativeWind, no Tailwind.

**Native UI.** Every screen renders SwiftUI through `@expo/ui/swift-ui`. Forms, lists, sections, segmented controls, sheets, alerts, dynamic colors, system materials. Liquid Glass on iOS 26+ via `expo-glass-effect`, UIVisualEffectView blur fallback on iOS 16.4-25 via `expo-blur`. DynamicColorIOS for every palette token (auto-adapts to dark mode + the Increase Contrast accessibility setting). SF Symbols via `expo-symbols`. Haptics, dynamic type, VoiceOver labels, reduced motion respected. Many of the SwiftUI modifiers the template reaches for, `clipShape("capsule")`, `defaultScrollAnchorForRole`, `scrollTargetBehavior`, `scrollPosition`, `textInputAutocapitalization`, `textContentType`, the `Alert` component, ship via upstream PRs we wrote and got merged into `expo/expo`. Full ledger in [`docs/UPSTREAM.md`](./docs/UPSTREAM.md).

**Auth.** Email + password + email OTP via Better Auth (`@convex-dev/better-auth`). Apple Sign In via Apple's official `AppleAuthenticationButton` (HIG-compliant BLACK/WHITE theme-aware styling). SIWA Services ID JWT signing (ES256, 180-day expiry, auto-rotated every 90 days by EAS Workflows cron). Active sessions screen with device-by-device revocation. Profile editing with avatar uploads to Convex storage. Rate limiting on every endpoint via `@convex-dev/rate-limiter`.

**Push + Universal Links.** APNs push via `expo-notifications` with token registration on sign-in. Apple Universal Links served from Convex's HTTP router (AASA at `/.well-known/apple-app-site-association`).

**Email.** Resend via `@convex-dev/resend` for transactional email + webhook delivery events.

**EAS, every product wired.** 10 workflows under `.eas/workflows/`. PR previews with `github-comment` job + QR code + fingerprint-gated OTA-or-build. Production deploys on `main` (Convex + iOS build + submit + OTA, fingerprint-gated). TestFlight on `beta/*` branches with the dedicated `testflight` job (internal groups + auto-changelog from commit). Maestro E2E. ASC event triggers via `on.app_store_connect`. Manual rollback (`update:republish` or `update:roll-back-to-embedded`). Manual rollout (`update --rollout-percentage` or `update:edit`). Tag releases. Apple Sign In JWT rotation cron. `EAS Webhooks` for `BUILD` and `SUBMIT` events into Convex's HTTP router at `/eas-webhook`, HMAC-SHA1 verified, structured access log with `X-Request-Id`. `expo-insights` SDK installed for cold-start metrics + app-store-version breakdowns.

## Repo layout

```
vexpo/
├── packages/
│   ├── create-vexpo/      # npm scaffolder (`npm create @ramonclaudio/vexpo@latest`)
│   └── vexpo/             # operational CLI (`npx vexpo <subcommand>`)
└── templates/default/     # the Expo + Convex + Better Auth app
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
- Security: [`docs/SECURITY.md`](./docs/SECURITY.md). Threat model, webhook signature + replay protection, OTA code-signing, Apple credential rotation, the secret-rotation matrix.
- Operations: [`docs/OPERATIONS.md`](./docs/OPERATIONS.md). Service map, daily checks, failure modes with concrete recovery steps, useful queries, when to escalate.
- Upstream contributions: [`docs/UPSTREAM.md`](./docs/UPSTREAM.md). Ledger of every PR we wrote and got merged into `expo/expo` that the template depends on. `@expo/ui/swift-ui` modifiers (`clipShape` capsule + ellipse, `scaleEffect` per-axis, `defaultScrollAnchor`, `defaultScrollAnchorForRole`, `scrollTargetBehavior`, `scrollTargetLayout`, `scrollPosition`, `textInputAutocapitalization`, `textContentType`), the `Alert` component, an `expo-modules-core` race fix, an `expo-tools` scoped-package resolution fix, and two CI workflow guards that make every fork green.
- Design system: [`templates/default/DESIGN.md`](./templates/default/DESIGN.md). Color palette, typography, spacing, radius ladder, materials, the SwiftUI primitives + custom composition surface.

## Monorepo dev

For working on the CLI itself:

```bash
bun install                # install package + workspace deps
bun run link:dev           # build vexpo + `bun link` it into templates/default
bun --filter vexpo dev     # tsup watch mode on the CLI source
cd templates/default
npx vexpo full --dry-run  # exercises the linked CLI
```

Tests:

```bash
bun run test               # 291 unit (vexpo lib) + 34 template = 325 total
bun run test:packages:e2e  # 14 e2e tests against the built `vexpo` CLI dist
bun run test:all           # everything
```

### Testing `eas build` against `templates/default`

The committed `templates/default/app.json` is `{ "expo": {} }` — no `projectId`. Forks run `eas init` once and commit their own. For testing in this repo without committing your `projectId`, eas-cli needs it in process env at invocation time, because eas-cli sets `EXPO_NO_DOTENV=1` when evaluating `app.config.ts` for projectId resolution (intentional, for build determinism). `.env.local` alone won't be loaded by eas-cli for that step.

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

`npx vexpo doctor`, `vexpo setup`, and `vexpo env push` all read `.env.local` directly, so they work without shell-loading.
