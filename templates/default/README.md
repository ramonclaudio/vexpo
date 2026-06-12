# vexpo

An iOS app on Expo SDK 56, wired end-to-end with Convex, Better Auth, and Resend. Native SwiftUI throughout, email + password + OTP + Apple Sign In, push, and the full EAS build surface. Everything below is already wired, so you run two commands and you're in the app.

## Quick start

Requires macOS and Xcode. This is an iOS-only template, and `npm run ios` builds against the simulator. See [Pre-reqs](#pre-reqs).

The `vexpo` CLI ships as a dependency, so `npm install` puts it on your path:

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

Lite mode skips Apple, EAS, and Resend. Sign-up auto-verifies and drops you in the app with one tap. The OTP, password-reset, and change-email flows that need Resend stay hidden.

## Ship path

When you're ready to ship, swap `lite` for `full`:

```bash
npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
```

`full` writes `.env.local`, sets Convex env vars, validates the ASC API key, signs the SIWA JWT, runs `eas init` and `eas env:push`, and prints the `eas build` command at the end. It never runs the build for you.

Run `npx vexpo doctor` any time to auth-check every credential against the real service and cross-reference IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`.

Full walkthrough with every prompt, env-var alternative, and recovery path: [`SETUP.md`](./SETUP.md).

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
npm run clean:metro            Trash Metro/Haste/node-compile caches only
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

Setup is one-shot, not a `package.json` script. Run `npx vexpo lite`, `npx vexpo full`, or `npx vexpo doctor` directly. All deletions go through `trash` (macOS Trash, recoverable).

## What's wired up

- Convex backend, reactive queries, storage, real-time sync, per-mutation rate limiting
- Better Auth via `@convex-dev/better-auth`, email + password + OTP + Apple Sign In, per-device session revocation
- App Attest device-attestation primitives ready to wire (client lib + Convex verifier)
- Resend for OTP, password reset, and change-email, with delivery webhooks
- APNs push, Apple Universal Links, profile editing with avatar uploads
- Account soft-delete with a 30-day grace window
- Theme switching, haptics, reduced motion, VoiceOver, and Dynamic Type end to end
- Liquid Glass on iOS 26+, with a `UIVisualEffectView` blur fallback on iOS 16.4-25
- OTA updates code-signed end to end, so only signed bundles install
- EAS Build, Update, Submit, and Metadata, with ten workflows under `.eas/workflows/`

`runtimeVersion` uses the fingerprint policy with `appVersionSource: "remote"`, ASC key managed by EAS. PR previews, Maestro E2E, and the production deploy are `workflow_dispatch`-only by default. Restore the `pull_request` triggers to build on every PR, or add a `push: main` trigger to deploy on merge.

For the full feature list, design system, and the upstream PRs behind it, see [`DESIGN.md`](./DESIGN.md) and [`UPSTREAM.md`](https://github.com/ramonclaudio/vexpo/blob/main/docs/UPSTREAM.md).

## Project structure

```
src/
  app/                            Expo Router screens
    (app)/                        Authenticated stack (auth modal, tabs, profile, ...)
      (tabs)/                     Home, search, settings
      auth/                       Sign in, sign up, forgot/reset password (modal)
      profile/                    index.tsx + change-password.tsx
      welcome.tsx, sessions.tsx, restore-account.tsx, debug.tsx, ...
    +native-intent.tsx            Deep link validation
    +not-found.tsx                404 fallback
  components/                     Reusable UI (auth/, ui/)
  constants/                      Theme, layout, UI tokens
  hooks/                          useNetwork, useColorScheme, useAppUpdates, etc.
  lib/                            Auth client, haptics, env, deep links, native state
convex/                           Convex backend
plugins/
  with-auto-signing.js            CODE_SIGN_STYLE=Automatic + DEVELOPMENT_TEAM
  with-pod-deployment-target.js   Forces every pod to iOS 16.4
.eas/workflows/                   10 EAS Workflow YAML files
.github/workflows/check.yml       Typecheck, lint, format, tests, fingerprint diff
scripts/
  clean.ts                        Trash + reinstall
  rotate-apple-jwt.mjs            CI: re-sign JWT from env vars
__tests__/                        Convex + lib unit tests (validators, HMAC, deep link, schemas)
```

## Long-form docs

- [`SETUP.md`](./SETUP.md). Every setup phase with full prompts, env-var alternatives, recovery paths.
- [`DESIGN.md`](./DESIGN.md). Palette, typography, spacing, materials, and the SwiftUI composition surface.
- [`AGENTS.md`](./AGENTS.md). Guidance for AI coding agents working in this codebase.
- [`UPSTREAM.md`](https://github.com/ramonclaudio/vexpo/blob/main/docs/UPSTREAM.md). Every upstream PR powering the template.

## Version pinning

Every `expo-*` package tracks the same SDK 56 release. Mismatched versions cause subtle runtime crashes. `npm run upgrade:stable` rolls them all forward together. `npm run upgrade` tracks the next SDK preview.

`@convex-dev/better-auth@0.12.0` is the minimum compatible with `better-auth@1.6.x` (`0.12.3` peer-deps `better-auth >=1.6.11 <1.7.0`). Earlier versions peer-dep `better-auth <1.6.0` and reject the `mode` field newer better-auth adds to adapter queries, which breaks signup. The template pins `better-auth@1.6.16` and `@convex-dev/better-auth@0.12.3`.

`convex` is pinned `~1.40.0` for now. 1.41.0 adds a `transactionLimits` param to `runMutation` that `@convex-dev/resend@0.2.4`'s ctx types reject, which breaks the `convex/http.ts` typecheck. Widen back to `^1.40.0` once resend's types accept 1.41.
