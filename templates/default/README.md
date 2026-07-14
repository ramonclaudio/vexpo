# vexpo

An iOS app on Expo SDK 57, wired with Convex, Better Auth, and Resend. Native SwiftUI throughout.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="Sign up, onboarding, search, and the dark-mode flip">
  &nbsp;&nbsp;
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/screens.png" width="600" alt="Home, profile, and settings in light and dark">
</p>

## Setting up

Two paths to a configured app:

- **By hand**: follow [Quick start](#quick-start) below. Run `npx vexpo rebrand` when you're ready to make the identity yours (`vexpo full` includes it).
- **With an AI agent**: the playbook lives in [`AGENTS.md`](./AGENTS.md), which most agents read on their own. Or paste this:

```text
Set up this fresh vexpo scaffold as my app. Collect from me first if I haven't
given them: app display name, iOS bundle id, my full name, Expo account slug,
App Review contact email, and marketing, support, and privacy URLs. Then:

1. Rebrand non-interactively (derives slug, scheme, and copyright, rewrites
   every branded file, formats what it touches):
   npx vexpo rebrand -y --app-name "<name>" --bundle-id <id> \
     --owner-name "<me>" --expo-owner <slug> --review-email <email> \
     --marketing-url <url> --support-url <url> --privacy-url <url>
   Don't hand-edit identity afterward or sweep for leftover template branding,
   the command owns both. Re-run with --force to change identity later.
2. Provision the dev backend: npx vexpo lite (hand any login prompt to me).
3. Verify: npm run typecheck && npm run lint && npm run format:check && npm run test
4. Commit the result as one commit.
5. Read AGENTS.md before writing any feature code.

Done means the gate is green, setup is committed, and you tell me to run
`npm run convex:dev` and `npm run ios` in two terminals. When I say ship,
follow the Ship path playbook in AGENTS.md: you run everything headless and
hand me only the login, the ASC .p8 download, the Resend key paste, and the
one interactive first build.
```

## Pre-reqs

Tools, all local. `eas-cli` and the `convex` CLI come through the project (npx fetches them), no global installs:

- macOS and Xcode (iOS-only)
- Bun or Node 20+

Accounts, by the stage that needs them. Only Convex is required before you ship:

| Stage                   | Account                                     | Cost                  |
| ----------------------- | ------------------------------------------- | --------------------- |
| `vexpo lite` (dev app)  | Convex                                      | free                  |
| `vexpo full` (shipping) | Expo (EAS builds, env, submit)              | free tier covers this |
| `vexpo full` (shipping) | Apple Developer Program + App Store Connect | $99/yr                |
| Email (OTP, reset)      | Resend + a domain you control DNS for       | free tier covers this |

Both CLIs need a one-time login before provisioning: `npx convex login` and `npx eas-cli login`. Setup's Prerequisites section flags whichever is missing, and `--new` on `lite`/`full` walks each signup you don't have yet. The Apple leg also needs the one-time ASC API key download (`.p8`, App Manager role) from [Ship path](#ship-path) step 2.

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

One team shape needs a different door: if your Convex team is EAS-managed (created through Expo's integration), direct project creation fails with `is managed by oauth:...`. Provision through the integration instead, then adopt the deployment it made:

```bash
npx eas-cli integrations:convex:connect
npx vexpo adopt
```

## Ship path

The whole road from a dev app to TestFlight, in order. One step is interactive by Apple's design (the first build's credentials wizard). Everything else runs headless, and the sequence is resumable: `vexpo full` picks up from state, so re-running after any step is safe.

1. **Log in once per machine.** `npx eas-cli login` and `npx convex login`. Setup's Prerequisites section flags both when missing.
2. **Get the ASC API key.** App Store Connect → Users and Access → Integrations → generate a **Team** key with the **App Manager** role, download the `.p8` once into `credentials/`. This download is a human step, Apple offers it exactly once. Details in [App Store submission](#app-store-submission).
3. **Run the provisioning.**

   ```bash
   npx vexpo full         # provisions Resend, Apple Sign In, EAS, rebrand wizard
   npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
   ```

   `full` writes `.env.local`, sets Convex env vars, validates the ASC key, registers the Services ID, signs the SIWA JWT, mirrors EAS env to all three environments, and seeds the App Review demo account on dev and prod (generating a real password into `store.config.json` if the placeholder is still there). One paste it asks of you: a Resend **Full access** API key. Create it fresh and don't touch it until the run reports done, editing a key's permission in the Resend dashboard rotates its token mid-run. Revoke it after, the scoped sending key vexpo mints is the only one that stays live.

4. **Arm OTA code signing.** `npm run updates:gen-cert -- --name "Your Org"`, then upload the private key as the `EAS_UPDATE_PRIVATE_KEY` file secret (the script prints the command). The dev loop keeps working, `npm run dev` passes the signing key to Metro automatically.
5. **The one interactive moment: first build.**

   ```bash
   npm run eas:tf         # credentials wizard + production build + TestFlight submit
   ```

   Wizard answers that matter: **reuse** the existing distribution certificate if offered (Apple caps a team at 3, generating a 4th fails), let it **generate** a fresh provisioning profile (they're disposable, EAS re-mints them), **reuse** the existing push key (capped at 2), and let it **generate** an EAS-managed submit key when it reaches App Store Connect. Two live ASC keys is the designed end state: your local `credentials/` key serves `eas.json` and CLI submits, the EAS-managed one serves cloud auto-submits and the integration. After this one run, credentials live in EAS and every future build and submit is non-interactive.

6. **After the build, all headless:**

   ```bash
   npx vexpo asc connect                           # finishes the EAS↔ASC link, doctor goes green
   npx vexpo testflight groups create "Internal"   # beta group, no Beta App Review
   npx vexpo testflight invite you@example.com     # lands in the TestFlight app
   npx vexpo testflight whats-new <buildId> "..."  # release notes on the build
   npx vexpo submit                                # every re-submit, fully headless
   ```

   `vexpo submit` and `vexpo asc connect` write the ASC key into `eas.json`'s submit profiles, so submits authenticate with your validated key instead of whatever EAS has stored.

- `npx vexpo doctor` auth-checks every credential and cross-references IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`. Run `--strict` before every release.
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

The ASC app record appears only after your first submit, so a brand-new app's first `eas:tf` runs interactively. After that, `npx vexpo submit` re-submits the latest build fully non-interactively: it writes your cached ASC key's `ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId` plus `ascAppId` into `eas.json`'s submit profiles, the only place `eas submit` reads them, so the EAS credential store never decides which key signs. Pass `--profile production` to submit to the App Store, or `--id <buildId>` for a specific build.

`npx vexpo doctor` confirms the key, its role, the agreement, and the linkage. Full notes in [`credentials/README.md`](./credentials/README.md).

The listing itself has a manual half: Apple exposes no API for privacy nutrition labels, pricing, content rights, age rating, accessibility declarations, or TestFlight Test Information. The one-time dashboard walk is cataloged in [`app-store/README.md`](./app-store/README.md), split by what `metadata:push` can re-push later versus what stays manual forever.

## Scripts

```text
npm run dev                    Metro + dev client
npm run start                  Metro with cleared cache
npm run ios                    Clean prebuild + compile + run on simulator
npm run ios:dev                Run on simulator (skip prebuild, fast)
npm run ios:device             Clean prebuild + compile + run on physical device
npm run prebuild               Generate iOS native project from config

npm run convex:dev             Convex dev server (watch mode)
npm run convex:deploy          Deploy Convex functions to production (reads .env.prod so the dev deploy key in .env.local can't hijack the target)
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

3. Bring back the verifier and client from the vexpo repo's [removal commit](https://github.com/ramonclaudio/vexpo/commit/486f3f90e5b63ce89da219db86f91785833d8cbf). Scaffolded projects start with fresh git history, so the deleted files live in the template repo under `templates/default/`, not in this repo's log:
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
