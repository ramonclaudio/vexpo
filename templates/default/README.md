# vexpo

Expo SDK 56 + Convex + Better Auth + Resend, wired end-to-end for iOS. Native SwiftUI via `@expo/ui/swift-ui`, email + password + email OTP + Apple Sign In, APNs push, Universal Links, profile + active sessions with avatar uploads and device-by-device revocation. EAS for the whole build surface: 10 workflows, fingerprint-gated OTA-or-build, TestFlight, rollback, rollout, ASC events, and the Apple Sign In JWT rotation cron.

A lot of the SwiftUI modifiers the template reaches for, `clipShape("capsule")`, `defaultScrollAnchorForRole`, `scrollTargetBehavior`, `scrollPosition`, `textInputAutocapitalization`, `textContentType`, the `Alert` component, are upstream PRs we wrote and got merged into `expo/expo`. Full ledger in [`../../docs/UPSTREAM.md`](../../docs/UPSTREAM.md).

## Quick start

```bash
npm install

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

`full` writes `.env.local`, sets Convex env vars (`REQUIRE_EMAIL_VERIFICATION=true` once Resend is wired), validates the ASC API key, signs the SIWA JWT, runs `eas init` and `eas env:push`, prompts the rebrand wizard. Prints the `eas build` command at the end. vexpo doesn't run it for you, you run `npx eas build -p ios --profile production --auto-submit-with-profile testflight` when you're ready.

Run `npx vexpo doctor` any time to auth-check every credential against the real service and cross-reference IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`. Catches "wrong .p8 from another project" or ".env.prod copied from a different fork" in seconds.

Long-form walkthrough with every prompt, every env-var alternative, and recovery paths: [`SETUP.md`](./SETUP.md).

## What's wired up

- Convex backend with reactive queries, storage, real-time sync, and `@convex-dev/rate-limiter` on every application mutation. Auth-route rate limits ship via Better Auth at the HTTP layer.
- Better Auth via `@convex-dev/better-auth` (sessions, accounts; per-device revocation via `session.userAgent`)
- Resend via `@convex-dev/resend` for OTP, password reset, change-email, with webhook delivery events
- Apple Sign In via Apple's official `AppleAuthenticationButton`, HIG-compliant (BLACK in dark mode, WHITE in light; `WHITE_OUTLINE` isn't used), SIWA Services ID + ES256 JWT signing (180-day expiry, auto-rotated every 90 days)
- APNs push via `expo-notifications` with token registration on sign-in
- Apple Universal Links from Convex's HTTP router (AASA at `/.well-known/apple-app-site-association`)
- Profile editing with avatar uploads to Convex storage
- Active sessions screen with device-by-device revocation
- Theme switching, haptics toggle, reduced motion, dynamic type, VoiceOver labels everywhere
- Spotlight-style search tab (debounced, scored, keyword-aware)
- Skeleton placeholders during initial query loads
- Debug screen at `/debug` gated by toggle, off in production by default
- Liquid Glass on iOS 26+ via `expo-glass-effect`, UIVisualEffectView blur fallback on iOS 16.4-25 via `expo-blur`, both behind a `<Material>` primitive
- EAS Build / Update / Submit / Metadata. `runtimeVersion: { policy: "fingerprint" }` (auto-bumps on native code changes), branch/channel model, `appVersionSource: "remote"`. ASC API key managed by EAS (`eas credentials -p ios`), no `eas.json` patches. Two fingerprint stability knobs make the policy work end-to-end on this stack: `fingerprint.config.js` sets `useRNCoreAutolinkingFromExpo: false` (so reanimated/worklets are hashed once via the autolinker's JSON output, not per-dir), and `.fingerprintignore` excludes `node_modules/expo-modules-jsi/apple/**` (skips the pod-install-stamped `Products/` stubs). Drop both knobs when upstream fixes the autolinker determinism.
- 10 EAS Workflows under `.eas/workflows/`: dev builds, PR previews with `github-comment` + QR + fingerprint-gated OTA-or-build, deploy on `main`, TestFlight on `beta/*`, manual rollback / rollout, ASC event triggers to Slack, the SIWA JWT rotation cron, Maestro E2E
- GitHub Actions for general-purpose checks: typecheck, lint, format, tests, fingerprint diff on PR + push to `main`

## Pre-reqs

- macOS + Xcode for the simulator and signing
- Apple Developer Program membership ($99/yr) when you're ready to ship
- A domain you control DNS for, for Resend's sending domain
- Bun or Node 20+

## Scripts

```
npm run dev                    Metro + dev client
npm run start                  Metro with cleared cache
npm run ios                    Clean prebuild + compile + run on simulator
npm run ios:dev                Run on simulator (skip prebuild, fast)
npm run ios:device             Clean prebuild + compile + run on physical device
npm run prebuild               Generate iOS native project from config

npm run convex:dev             Convex dev server (watch mode)
npm run convex:deploy          Deploy Convex functions to production
npm run convex:logs            Tail dev deployment logs
npm run convex:logs:prod       Tail prod deployment logs
npm run convex:env             List dev env vars
npm run convex:env:prod        List prod env vars
npm run convex:insights        OCC conflicts + resource limits (dev)
npm run convex:insights:prod   Same for prod
npm run convex:dashboard       Open the Convex dashboard
npm run convex:codegen         Regenerate convex/_generated/

npm run eas:dev                eas build -p ios --profile development:simulator
npm run eas:dev:device         eas build -p ios --profile development:device
npm run eas:tf                 eas build -p ios --profile production --auto-submit-with-profile testflight
npm run eas:prod               eas build -p ios --profile production
npm run metadata:lint          eas metadata:lint
npm run metadata:push          eas metadata:lint && eas metadata:push
npm run metadata:pull          eas metadata:pull
npm run env:pull               eas env:pull --environment development
npm run env:pull:prod          eas env:pull --environment production

npm run clean                  Trash node_modules, ios, caches, then reinstall
npm run clean:metro            Trash Metro/Babel/Haste caches only
npm run clean:state            Wipe .setup-state.json + standard clean
npm run typecheck              tsc --noEmit
npm run lint                   oxlint
npm run format                 oxfmt
npm run format:check           oxfmt --check
npm run test                   vitest run
npm run test:watch             vitest
npm run fp                     Print Expo fingerprint hash
npm run fp:diff                Diff fingerprint vs base ref
npm run upgrade                expo install expo@next && expo install --fix
npm run upgrade:stable         expo install expo@latest && expo install --fix
```

Setup is one-shot, not a `package.json` script. Run `npx vexpo lite` / `npx vexpo full` / `npx vexpo doctor` directly. All deletions go through `trash` (macOS Trash, recoverable).

## Project structure

```
app/                              Expo Router screens
  (auth)/                         Sign in, sign up, forgot/reset password
  (app)/                          Authenticated screens
    (tabs)/                       Tab navigation
    welcome.tsx, sessions.tsx, debug.tsx, ...
    profile/                      Profile screens (index.tsx + change-password.tsx)
  +native-intent.tsx              Deep link validation
  +not-found.tsx                  404 fallback
components/                       Reusable UI
constants/                        Theme, layout, UI tokens
convex/                           Convex backend
hooks/                            useNetwork, useTheme, useUpdates, etc.
lib/                              Auth client, haptics, env, deep links
plugins/
  with-auto-signing.js            Sets CODE_SIGN_STYLE=Automatic + DEVELOPMENT_TEAM
  with-pod-deployment-target.js   Forces every pod to iOS 16.4
.eas/workflows/                   10 EAS Workflow YAML files
.github/workflows/check.yml       Typecheck, lint, format, tests, fingerprint diff
scripts/
  clean.ts                        Trash + reinstall
  rotate-apple-jwt.mjs            CI: re-sign JWT from env vars
__tests__/                        Convex constants + validators + HMAC verification + deep-link
```

## Long-form docs

- [`SETUP.md`](./SETUP.md). Every setup phase with full prompts, env-var alternatives for non-interactive runs, recovery paths.
- [`DESIGN.md`](./DESIGN.md). Color palette, typography, spacing, radius ladder, materials, the SwiftUI primitives + custom composition surface.
- [`../../docs/UPSTREAM.md`](../../docs/UPSTREAM.md). Every upstream PR powering the template: `@expo/ui/swift-ui` modifiers, `expo-modules-core` fixes, `expo-tools` resolution, CI workflow guards.
- [`AGENTS.md`](./AGENTS.md). Guidance for AI coding agents working in this codebase.

## Version pinning

Every `expo-*` package tracks the same SDK 56 preview tag. Mismatched tags cause subtle runtime crashes. `npm run upgrade` runs `expo install expo@next && expo install --fix` to roll all of them forward together.

`@convex-dev/better-auth@0.12.0` is the minimum compatible with `better-auth@1.6.x` (peer-dep range is `>=1.6.9 <1.7.0`). Earlier versions peer-dep `better-auth <1.6.0` and reject the `mode` field newer better-auth adds to adapter queries, breaking signup. The template pins `better-auth@1.6.11` + `@convex-dev/better-auth@0.12.2`.
