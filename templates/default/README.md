# vexpo

An iOS app on Expo SDK 57, wired with Convex, Better Auth, and Resend. Native SwiftUI throughout.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="Sign up, onboarding, search, and the dark-mode flip">
  &nbsp;&nbsp;
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/screens.png" width="600" alt="Home, profile, and settings in light and dark">
</p>

## Quick start

Requires macOS and Xcode (iOS-only). The `vexpo` CLI ships as a dependency, so `npm install` puts it on your path:

```bash
npm install

npx vexpo lite         # Convex + Better Auth provisioned in about a minute
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have one
```

Then in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

Lite skips Apple, EAS, and Resend. Sign-up auto-verifies and drops you in with one tap. The flows that need Resend (OTP, password reset, change email) stay hidden.

## Ship path

Swap `lite` for `full`:

```bash
npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
```

`full` writes `.env.local`, sets Convex env vars, validates the ASC API key, signs the SIWA JWT, runs `eas init` + `eas env:push`, and prints the `eas build` command. It never runs the build for you.

- `npx vexpo doctor` auth-checks every credential and cross-references IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`.
- `npx vexpo full --plan` previews the setup before you start.
- `npx vexpo full --dry-run` shows what the next run would change.

## Credentials

- The app bundle is public. Never put a real secret in an `EXPO_PUBLIC_*` var, it ships in plaintext inside the binary. Only public identifiers (Convex URL, bundle id, team id) belong there.
- Real secrets live at their destination, EAS or Convex (both encrypted at rest), never in git. `vexpo full` and `vexpo env push` move them there.
- EAS cloud builders can't read your local `.env` or `.p8` files, so anything a build or submit needs has to be uploaded to EAS first.

| Credential                                         | Home                                   | Local          | Bridge                             |
| -------------------------------------------------- | -------------------------------------- | -------------- | ---------------------------------- |
| Convex URL, bundle id, team id                     | EAS env + Convex                       | `.env.local`   | `vexpo env push`                   |
| `BETTER_AUTH_SECRET`, `RESEND_*`, `APPLE_CLIENT_*` | Convex env                             | `.env.local`   | `vexpo env push`                   |
| ASC API key `.p8` (App Manager role)               | EAS credential store                   | `credentials/` | `eas credentials`                  |
| SIWA `.p8`                                         | EAS env (secret)                       | `credentials/` | `vexpo apple eas-rotation-secrets` |
| dist cert, provisioning, push key                  | EAS (managed)                          | none           | `eas credentials`                  |
| EAS Update key                                     | EAS file secret, public cert committed | `keys/`        | `npm run updates:gen-cert`         |

### App Store submission

TestFlight and App Store submission need two things: your App Store Connect agreements accepted, and an ASC API key registered in EAS. A missing or expired agreement makes every ASC API call return 403, which reads as an auth failure but isn't. Accept it at App Store Connect -> Business (Agreements, Tax, and Banking). Only the Account Holder can.

1. App Store Connect -> Users and Access -> Integrations -> App Store Connect API. Generate a **Team** key with the **App Manager** role (least privilege that can submit, Admin also works). Download the `.p8` once into `credentials/`.
2. `npx vexpo apple asc-key`, registers and validates it (auto-detects `credentials/`).
3. `npx eas-cli credentials --platform ios` -> App Store Connect API Key -> set it up, so cloud submits can use it.
4. `npx vexpo asc connect`, writes `ascAppId` into your `eas.json` and links the project to its ASC app. eas-cli takes the app id only from the submit profile (no flag, no env var), so this write is what makes a non-interactive submit work, and it lands the id even headless (CI) once the app record exists.
5. `npm run eas:tf`, builds and submits to TestFlight.

The ASC app record appears only after your first submit, so a brand-new app's first `eas:tf` runs interactively. After that, `npx vexpo submit` re-submits the latest build fully non-interactively: it sets `EXPO_ASC_*` from your cached key and writes `ascAppId` into `eas.json`, no EAS credential store needed. Pass `--profile production` to submit to the App Store, or `--id <buildId>` for a specific build.

`npx vexpo doctor` confirms the key, its role, the agreement, and the linkage. Full notes in [`credentials/README.md`](./credentials/README.md).

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
npm run upgrade                expo install expo@next && expo install --fix
npm run upgrade:stable         expo install expo@latest && expo install --fix
```

## What's wired up

- Convex backend: reactive queries, storage, real-time sync, per-mutation rate limiting
- Better Auth via `@convex-dev/better-auth`: email, password, OTP, Apple Sign In, per-device session revocation
- Resend for OTP, password reset, and change-email, with delivery webhooks
- APNs push, Apple Universal Links, profile editing with avatar uploads
- Account soft-delete with a 30-day grace window
- Theme switching, haptics, reduced motion, VoiceOver, and Dynamic Type end to end
- Liquid Glass on iOS 26+, with a `UIVisualEffectView` blur fallback on iOS 16.4-25
- OTA updates code-signed end to end, so only signed bundles install
- EAS Build, Update, Submit, and Metadata, with nine workflows under `.eas/workflows/`

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
.eas/workflows/                   9 EAS Workflow YAML files
.github/workflows/check.yml       Typecheck, lint, format, tests
scripts/
  clean.ts                        Trash + reinstall
  rotate-apple-jwt.mjs            CI: re-sign JWT from env vars
__tests__/                        Convex + lib unit tests (validators, HMAC, deep link, schemas)
```

## More

- [`AGENTS.md`](./AGENTS.md): conventions for AI coding agents (and humans) working in this codebase.

## Re-adding App Attest

The template used to ship an Apple App Attest stack (a Convex verifier plus a client lib). App Attest proves a request came from a real, unmodified build on a device with a Secure Enclave. Add it back when you have a mutation worth protecting:

1. Install the native module: `npm install @expo/app-integrity`.
2. Add the entitlement under `ios` in `app.config.ts`:

   ```ts
   entitlements: {
     "com.apple.developer.devicecheck.appattest-environment": "production",
   },
   ```

3. Bring back the verifier and client from git history (`git log --diff-filter=D --name-only -- convex/appAttest.ts`):
   - `convex/appAttest.ts`: the attestation + assertion verifier (needs `cbor-x`, `npm install cbor-x`).
   - `convex/appAttestStore.ts`: challenge and key storage mutations.
   - `src/lib/appAttest.ts`: the device-side `attestThisDevice` / `signRequest` client.
   - the `appAttestChallenges` and `appAttestKeys` tables in `convex/schema.ts`, and the `cleanupChallenges` hourly cron in `convex/crons.ts`.
4. The verifiers ship as `internalAction`s, so wrap them in a public `action` (or call them from a protected `mutation`) before the client can reach them. Pattern: client attests once, caches the `keyId`, then signs each protected mutation's args and the public action verifies the assertion before running the write.

## Version pinning

Every `expo-*` package tracks the same SDK 57 release. `npm run upgrade:stable` rolls them forward together. `npm run upgrade` tracks the next SDK preview.

> [!CAUTION]
> Don't downgrade `@convex-dev/better-auth` below `0.12.4` (pinned with `better-auth@1.6.22`). Older `@convex-dev/better-auth` breaks signup.

## License

MIT
