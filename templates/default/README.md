# vexpo

An iOS app on Expo SDK 56, wired with Convex, Better Auth, and Resend. Native SwiftUI throughout.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/docs/assets/demo-app.gif" width="300" alt="Sign up, onboarding, search, and the dark-mode flip">
  &nbsp;&nbsp;
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/docs/assets/screens.png" width="600" alt="Home, profile, and settings in light and dark">
</p>

## Quick start

Requires macOS and Xcode (iOS-only). The `vexpo` CLI ships as a dependency, so `npm install` puts it on your path:

```bash
npm install

npx vexpo lite         # Convex + Better Auth, simulator-ready in about a minute
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have one
```

Then in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

Lite skips Apple, EAS, and Resend. Sign-up auto-verifies and drops you in with one tap. The flows that need Resend (OTP, password reset, change email) stay hidden.

## Ship path

When you're ready to ship, swap `lite` for `full`:

```bash
npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
```

`full` writes `.env.local`, sets Convex env vars, validates the ASC API key, signs the SIWA JWT, runs `eas init` + `eas env:push`, and prints the `eas build` command. It never runs the build for you.

- `npx vexpo doctor` auth-checks every credential and cross-references IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`.
- `npx vexpo full --plan` previews the setup before you start.
- `npx vexpo full --dry-run` shows what the next run would change.

## Pre-reqs

- macOS and Xcode
- Bun or Node 20+
- Apple Developer Program ($99/yr), when you're ready to ship
- A domain you control DNS for (Resend sending domain)

## Scripts

```text
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

Setup is one-shot, not a `package.json` script. Run `npx vexpo lite`, `npx vexpo full`, or `npx vexpo doctor` directly. Deletions go through `trash` (recoverable from macOS Trash).

## What's wired up

- Convex backend: reactive queries, storage, real-time sync, per-mutation rate limiting
- Better Auth via `@convex-dev/better-auth`: email, password, OTP, Apple Sign In, per-device session revocation
- App Attest device-attestation primitives ready to wire (client lib + Convex verifier)
- Resend for OTP, password reset, and change-email, with delivery webhooks
- APNs push, Apple Universal Links, profile editing with avatar uploads
- Account soft-delete with a 30-day grace window
- Theme switching, haptics, reduced motion, VoiceOver, and Dynamic Type end to end
- Liquid Glass on iOS 26+, with a `UIVisualEffectView` blur fallback on iOS 16.4-25
- OTA updates code-signed end to end, so only signed bundles install
- EAS Build, Update, Submit, and Metadata, with ten workflows under `.eas/workflows/`

`runtimeVersion` uses the fingerprint policy with `appVersionSource: "remote"`, ASC key managed by EAS. PR previews, Maestro E2E, and the production deploy are `workflow_dispatch`-only by default. Restore the `pull_request` triggers to build on every PR, or add a `push: main` trigger to deploy on merge.

## Project structure

```text
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

## More

- [`AGENTS.md`](./AGENTS.md): conventions for AI coding agents (and humans) working in this codebase.

## Version pinning

Every `expo-*` package tracks the same SDK 56 release. `npm run upgrade:stable` rolls them forward together. `npm run upgrade` tracks the next SDK preview.

> [!CAUTION]
> Two deps are pinned on purpose, don't bump them blind:
>
> - `better-auth@1.6.16` + `@convex-dev/better-auth@0.12.3`. Older `@convex-dev/better-auth` breaks signup.
> - `convex@~1.40.0`. 1.41.0 breaks the `convex/http.ts` typecheck against `@convex-dev/resend@0.2.4`.

## License

MIT
