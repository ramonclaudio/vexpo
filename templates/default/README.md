# vexpo

Expo SDK 56 + Convex + Better Auth + Resend, wired end-to-end for iOS. Native SwiftUI via `@expo/ui/swift-ui`, email + password + email OTP + Apple Sign In, APNs push, Universal Links, profile + active sessions with avatar uploads and device-by-device revocation. EAS for the whole build surface: 10 workflows, fingerprint-gated OTA-or-build, TestFlight, rollback, rollout, ASC events, and the Apple Sign In JWT rotation cron.

## Quick start

```bash
bun install

bunx vexpo lite         # 60-second path: Convex + Better Auth, simulator-ready
bunx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have one
```

Then in two terminals:

```bash
bun run convex:dev      # terminal 1
bun run ios             # terminal 2
```

Lite mode skips Apple / EAS / Resend entirely. `REQUIRE_EMAIL_VERIFICATION` is off on Convex so sign-up auto-verifies, the user lands in the app with one tap, and the UI hides the OTP / password-reset / change-email flows that need Resend to work.

When you're ready to ship, swap `lite` for `full`:

```bash
bunx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
bunx vexpo full --new   # same, plus walks Apple / Convex / Expo / Resend signups
```

`full` writes `.env.local`, sets Convex env vars (`REQUIRE_EMAIL_VERIFICATION=true` once Resend is wired), validates the ASC API key, signs the SIWA JWT, runs `eas init` and `eas env:push`, prompts the rebrand wizard. Prints the `eas build` command at the end. vexpo doesn't run it for you, you run `bunx eas build -p ios --profile production --auto-submit-with-profile testflight` when you're ready.

Run `bunx vexpo doctor` any time to auth-check every credential against the real service and cross-reference IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`. Catches "wrong .p8 from another project" or ".env.prod copied from a different fork" in seconds.

Long-form walkthrough with every prompt, every env-var alternative, and recovery paths: [`SETUP.md`](./SETUP.md).

## What's wired up

- Convex backend with reactive queries, storage, real-time sync, and rate limiting on every endpoint via `@convex-dev/rate-limiter`
- Better Auth via `@convex-dev/better-auth` (sessions, accounts, devices)
- Resend via `@convex-dev/resend` for OTP, password reset, change-email, with webhook delivery events
- Apple Sign In via Apple's official `AppleAuthenticationButton`, HIG-compliant BLACK/WHITE theme-aware, SIWA Services ID + ES256 JWT signing (180-day expiry, auto-rotated every 90 days)
- APNs push via `expo-notifications` with token registration on sign-in
- Apple Universal Links from Convex's HTTP router (AASA at `/.well-known/apple-app-site-association`)
- Profile editing with avatar uploads to Convex storage
- Active sessions screen with device-by-device revocation
- Theme switching, haptics toggle, reduced motion, dynamic type, VoiceOver labels everywhere
- Spotlight-style search tab (debounced, scored, keyword-aware)
- Skeleton placeholders during initial query loads
- Debug screen at `/debug` gated by toggle, off in production by default
- Liquid Glass on iOS 26+ via `expo-glass-effect`, UIVisualEffectView blur fallback on iOS 16.4-25 via `expo-blur`, both behind a `<Material>` primitive
- EAS Build / Update / Submit / Metadata. `runtimeVersion: { policy: "fingerprint" }`, branch/channel model, `appVersionSource: "remote"`. ASC API key managed by EAS (`eas credentials -p ios`), no `eas.json` patches
- 10 EAS Workflows under `.eas/workflows/`: dev builds, PR previews with `github-comment` + QR + fingerprint-gated OTA-or-build, deploy on `main`, TestFlight on `beta/*`, manual rollback / rollout, ASC event triggers to Slack, the SIWA JWT rotation cron, Maestro E2E
- GitHub Actions for general-purpose checks: typecheck, lint, format, tests, fingerprint diff on PR + push to `main`

## Pre-reqs

- macOS + Xcode for the simulator and signing
- Apple Developer Program membership ($99/yr) when you're ready to ship
- A domain you control DNS for, for Resend's sending domain
- Bun or Node 20+

## Scripts

```
bun run dev                    Metro + dev client
bun run start                  Metro with cleared cache
bun run ios                    Clean prebuild + compile + run on simulator
bun run ios:dev                Run on simulator (skip prebuild, fast)
bun run ios:device             Clean prebuild + compile + run on physical device
bun run prebuild               Generate iOS native project from config

bun run convex:dev             Convex dev server (watch mode)
bun run convex:deploy          Deploy Convex functions to production
bun run convex:logs            Tail dev deployment logs
bun run convex:logs:prod       Tail prod deployment logs
bun run convex:env             List dev env vars
bun run convex:env:prod        List prod env vars
bun run convex:insights        OCC conflicts + resource limits (dev)
bun run convex:insights:prod   Same for prod
bun run convex:dashboard       Open the Convex dashboard
bun run convex:codegen         Regenerate convex/_generated/

bun run eas:dev                eas build -p ios --profile development:simulator
bun run eas:dev:device         eas build -p ios --profile development:device
bun run eas:tf                 eas build -p ios --profile production --auto-submit-with-profile testflight
bun run eas:prod               eas build -p ios --profile production
bun run metadata:lint          eas metadata:lint
bun run metadata:push          eas metadata:lint && eas metadata:push
bun run metadata:pull          eas metadata:pull
bun run env:pull               eas env:pull --environment development
bun run env:pull:prod          eas env:pull --environment production

bun run clean                  Trash node_modules, ios, caches, then reinstall
bun run clean:metro            Trash Metro/Babel/Haste caches only
bun run clean:state            Wipe .setup-state.json + standard clean
bun run typecheck              tsc --noEmit
bun run lint                   oxlint
bun run format                 oxfmt
bun run format:check           oxfmt --check
bun run test                   vitest run
bun run test:watch             vitest
bun run fp                     Print Expo fingerprint hash
bun run fp:diff                Diff fingerprint vs base ref
bun run upgrade                expo install expo@canary && expo install --fix
bun run upgrade:stable         expo install expo@latest && expo install --fix
```

Setup is one-shot, not a `package.json` script. Run `bunx vexpo lite` / `bunx vexpo full` / `bunx vexpo doctor` directly. All deletions go through `trash` (macOS Trash, recoverable).

## Project structure

```
app/                              Expo Router screens
  (auth)/                         Sign in, sign up, forgot/reset password
  (app)/                          Authenticated screens
    (tabs)/                       Tab navigation
    welcome.tsx, profile.tsx, sessions.tsx, debug.tsx, ...
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
- [`AGENTS.md`](./AGENTS.md). Guidance for AI coding agents working in this codebase.

## Known issues with this canary

Specific to `expo@56.0.0-canary-20260506-03817f5`. Should resolve when SDK 56 ships stable.

- The pinned `@expo/ui` declares iOS 15.1 in its podspec, but `expo-modules-core` requires iOS 16.4. Fixed by `plugins/with-pod-deployment-target.js`, which injects a Podfile `post_install` hook bumping `IPHONEOS_DEPLOYMENT_TARGET` on every pod target.
- `Section` from `@expo/ui/swift-ui` crashes when `title`/`footer` are passed as strings. Use `<Text>` children inside `Section`.
- `Updates.checkForUpdateAsync()` throws in dev builds even with the native module present. Guard `useUpdates()` with `isEnabled && !__DEV__`.
- `unstable_settings` (initialRouteName) is incompatible with `asyncRoutes`. Let `Stack.Protected` handle auth routing.
- `+native-intent.tsx` must return a string path, never `null`. Return `"/"` for blocked deep links.
- `Host` from `@expo/ui/swift-ui` doesn't extend its background behind the tab bar safe area. Set `backgroundColor` explicitly on the `Host`'s style.
- The manifest asset CDN doesn't recognize canary version numbers. "Unable to resolve manifest assets" warnings are cosmetic.

## Version pinning

Every `expo-*` package uses the same canary tag. Mismatched tags cause subtle runtime crashes.

`package.json` overrides:

- `@better-auth/passkey: 1.6.9` prevents better-auth from pulling SolidJS deps that break Metro.
- `@expo/ui: 56.0.0-canary-20260506-03817f5` unifies the version across transitive deps.

`react-native-reanimated 4.3.0` is intentionally ahead of the canary's expected 4.2.1 because Bun resolves `react-native-worklets@0.8.x` which needs Reanimated 4.3+. Listed in `expo.install.exclude` to silence the doctor warning.

`@convex-dev/better-auth@0.12.0` is the minimum compatible with `better-auth@1.6.9`. Earlier versions peer-dep `better-auth <1.6.0` and reject the `mode` field newer better-auth adds to adapter queries, breaking signup. Currently the template installs from `patches/convex-dev-better-auth-0.12.2.tgz` until [PR #368](https://github.com/get-convex/better-auth/pull/368) merges.
