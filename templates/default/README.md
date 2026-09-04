# vexpo

An iOS app built on Expo SDK 57 and designed entirely with SwiftUI (`@expo/ui`), with Convex, Better Auth, and Resend wired in.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="Sign up, onboarding, search, and the dark-mode flip">
  &nbsp;&nbsp;
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/screens.png" width="600" alt="Home, profile, and settings in light and dark">
</p>

## Setup

There are two ways to get to a configured app.

To do it by hand, follow [Quick start](#quick-start), then run `npx vexpo rebrand` when you're ready to make the identity yours (`vexpo full` includes it).

To use an AI agent, paste this:

```text
Set up this fresh vexpo scaffold as my app. Collect from me first if I haven't
given them the app display name, iOS bundle id, my full name, Expo account
slug, App Review contact email, and marketing, support, and privacy URLs. Then:

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
5. Read the Conventions section of this README before writing any feature code.

Done means the gate is green, setup is committed, and you tell me to run
`npm run convex:dev` and `npm run ios` in two terminals. When I say ship,
follow the Ship path in this README. Run everything headless and hand me only
the login, the ASC .p8 download, the Resend key paste, and the one interactive
first build.
```

### Agent tooling

`.mcp.json` points at the [Expo MCP server](https://docs.expo.dev/mcp/), so an agent with project-scoped MCP support picks it up on its own. It is a remote HTTP server on `https://mcp.expo.dev/mcp` and it authenticates with your Expo account the first time you use it. Free plan, fair use.

[Expo Skills](https://docs.expo.dev/skills/) teach the agent how `@expo/ui`, Expo Router, and EAS actually work, which is most of what this template is:

```bash
claude plugin install expo@claude-plugins-official   # Claude Code
codex plugin add expo@openai-curated                 # Codex
npx skills add expo/skills                           # Cursor and everything else
```

The Claude Code and Codex plugins register the MCP server themselves, so on those two the `.mcp.json` is a duplicate you can delete.

## Prerequisites

The local tools come down to these two, since `eas-cli` and the `convex` CLI come through the project (npx fetches them) with no global installs:

- macOS and Xcode (iOS-only)
- Bun or Node 22.12+

Accounts come in by the stage that needs them, and only Convex is required before you ship:

| Stage                   | Account                                     | Cost                  |
| ----------------------- | ------------------------------------------- | --------------------- |
| `vexpo lite` (dev app)  | Convex                                      | free                  |
| `vexpo full` (shipping) | Expo (EAS builds, env, submit)              | free tier covers this |
| `vexpo full` (shipping) | Apple Developer Program + App Store Connect | $99/yr                |
| Email (OTP, reset)      | Resend + a domain you control DNS for       | free tier covers this |

Both CLIs need a one-time login before provisioning. Run `npx convex login` and `npx eas-cli login`. Setup's Prerequisites section flags whichever is missing, and `--new` on `lite` or `full` walks each signup you don't have yet. The Apple side also needs a one-time ASC API key download (`.p8`, App Manager role), covered by [Ship path](#ship-path) step 2.

## Quick start

Requires macOS and Xcode (iOS-only). The `vexpo` CLI ships as a devDependency, so `npm install` puts it on your path:

```bash
npm install

npx vexpo lite         # provisions Convex and Better Auth
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have one
```

Then in two terminals:

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

`lite` skips Apple, EAS, and Resend, so sign-up auto-verifies and drops you in with one tap. The flows that need Resend (OTP, password reset, change email) stay hidden.

To install a build without a terminal, use [Orbit](https://github.com/expo/orbit). It is a free menu bar app that installs and launches a local `.app` or an EAS build on a simulator or a connected device in one click.

```bash
brew install expo-orbit
```

One team setup needs a different route. If your Convex team is EAS-managed (created through Expo's integration), direct project creation fails with `is managed by oauth:...`, so provision through the integration instead and then adopt the deployment it made:

```bash
npx eas-cli integrations:convex:connect
npx vexpo adopt
```

## Ship path

Here are the steps in order. The first build's credentials wizard is the one interactive stretch, and `vexpo full` picks up from state, so re-running after any step is safe.

1. **Log in once per machine.** `npx eas-cli login` and `npx convex login`. Setup's Prerequisites section flags both when missing.
2. **Get the ASC API key.** App Store Connect -> Users and Access -> Integrations -> generate a **Team** key with the **App Manager** role, download the `.p8` once into `credentials/`. This download is a human step, Apple offers it exactly once. Details in [App Store submission](#app-store-submission).
3. **Run the provisioning.**

   ```bash
   npx vexpo full         # adds Resend, Apple Sign In, the ASC key, eas init, and rebrand
   npx vexpo full --new   # same, plus walks Apple, Convex, Expo, and Resend signups
   ```

   `full` writes `.env.local`, sets Convex env vars, validates the ASC key, registers the Services ID, signs the Sign in with Apple (SIWA) JWT, mirrors EAS env to all three environments, and seeds the App Review demo account on dev and prod (generating a real password into `store.config.json` if the placeholder is still there). It asks you to paste a Resend **Full access** API key. Create it fresh and don't touch it until the run reports done, editing a key's permission in the Resend dashboard rotates its token mid-run. Revoke it after, the scoped sending key vexpo mints is the only one that stays live.

4. **Arm over-the-air (OTA) code signing.** `npm run updates:gen-cert -- --name "Your Org"`, then upload the private key as the `EAS_UPDATE_PRIVATE_KEY` file secret (the script prints the command). The dev loop keeps working, `npm run dev` passes the signing key to Metro automatically.
5. **The first build.**

   ```bash
   npm run eas:tf         # credentials wizard + production build + TestFlight submit
   ```

   Four of the wizard's answers matter. Pick **reuse** for the existing distribution certificate if it offers one, since Apple caps a team at 3 and generating a 4th fails. Let it **generate** a fresh provisioning profile, they're disposable and EAS re-mints them. Pick **reuse** for the existing push key, those are capped at 2. Let it **generate** an EAS-managed submit key when it reaches App Store Connect. You end up with two live ASC keys. Your local `credentials/` key is the one `eas.json` and CLI submits use, and the EAS-managed one is for cloud auto-submits and the integration. After this one run, credentials live in EAS and every future build and submit is non-interactive.

6. **After the build, all headless:**

   ```bash
   npx vexpo asc connect                           # finishes the EAS↔ASC link, doctor goes green
   npx vexpo testflight groups create "Internal"   # beta group, no Beta App Review
   npx vexpo testflight invite you@example.com     # lands in the TestFlight app
   npx vexpo testflight whats-new <buildId> "..."  # release notes on the build
   npx vexpo submit                                # every re-submit, fully headless
   ```

   `vexpo submit` and `vexpo asc connect` write the ASC key into `eas.json`'s submit profiles, so submits authenticate with your validated key instead of whatever EAS has stored. `whats-new` is for a build that's already up or a locale other than en-US. To set the notes as part of a submit, pass `eas submit --what-to-test "..."` instead.

- `npx vexpo doctor` auth-checks every credential and cross-references IDs across `.env.local`, Convex env, EAS env, and `app.config.ts`. Run `--strict` before every release.
- `npx vexpo full --plan` previews the setup before you start.
- `npx vexpo full --dry-run` shows what the next run would change.

## Credentials

- The app bundle is public. Never put a real secret in an `EXPO_PUBLIC_*` var, it ships in plaintext inside the binary. Only public identifiers (Convex URL, bundle id, team id) belong there.
- Real secrets live at their destination, EAS or Convex (both encrypted at rest), never in git. `vexpo full` and `vexpo env push` move them there.
- EAS cloud builders can't read your local `.env` or `.p8` files, so anything a build or submit needs has to be uploaded to EAS first.
- `store.config.json` is gitignored, because `vexpo review-account` writes a generated App Review demo password into it. `store.config.example.json` is the tracked copy your working file starts from. Store copy you want versioned (subtitle, description, keywords) goes in the example, and a fresh clone restores from it: `cp store.config.example.json store.config.json`. Un-ignore the working file if your team would rather carry the credentials in git.

Each credential has one home, one local file, and one command that bridges the two:

| Credential                                         | Home                                   | Local          | Bridge                             |
| -------------------------------------------------- | -------------------------------------- | -------------- | ---------------------------------- |
| Convex URL, bundle id, team id                     | EAS env + Convex                       | `.env.local`   | `vexpo env push`                   |
| `BETTER_AUTH_SECRET`, `RESEND_*`, `APPLE_CLIENT_*` | Convex env                             | `.env.local`   | `vexpo env push`                   |
| ASC API key `.p8` (App Manager role)               | EAS credential store                   | `credentials/` | `eas credentials`                  |
| SIWA `.p8`                                         | EAS env (secret)                       | `credentials/` | `vexpo apple eas-rotation-secrets` |
| dist cert, provisioning, push key                  | EAS (managed)                          | none           | `eas credentials`                  |
| EAS Update key                                     | EAS file secret, public cert committed | `keys/`        | `npm run updates:gen-cert`         |

### App Store submission

TestFlight and App Store submission need two things. Your App Store Connect agreements have to be accepted, and an ASC API key has to be registered in EAS. A missing or expired agreement makes every ASC API call return 403, which reads as an auth failure but isn't. Accept it at App Store Connect -> Business (Agreements, Tax, and Banking). Only the Account Holder can.

1. App Store Connect -> Users and Access -> Integrations -> App Store Connect API. Generate a **Team** key with the **App Manager** role (least privilege that can submit, Admin also works). Download the `.p8` once into `credentials/`.
2. `npx vexpo apple asc-key`, registers and validates it (auto-detects `credentials/`).
3. `npx eas-cli credentials --platform ios` -> App Store Connect API Key -> set it up, so cloud submits can use it.
4. `npx vexpo asc connect`, writes `ascAppId` into your `eas.json` and links the project to its ASC app. eas-cli reads the app id only from the submit profile, there's no flag and no env var for it. That write is what makes a non-interactive submit work, and it lands the id in CI too once the app record exists.
5. `npm run eas:tf`, builds and submits to TestFlight.

The ASC app record appears only after your first submit, so a brand-new app's first `eas:tf` runs interactively. After that, `npx vexpo submit` re-submits the latest build fully non-interactively. It writes your cached ASC key's `ascApiKeyPath`, `ascApiKeyId`, and `ascApiKeyIssuerId` plus `ascAppId` into `eas.json`'s submit profiles. That's the only place `eas submit` reads them from, so the EAS credential store never decides which key signs. Pass `--profile production` to submit to the App Store, or `--id <buildId>` for a specific build.

`npx vexpo doctor` confirms the key, its role, the agreement, and the linkage. Full notes in [`credentials/README.md`](./credentials/README.md).

Part of the listing is manual. Apple has no API for privacy nutrition labels, pricing, content rights, age rating, accessibility declarations, or TestFlight Test Information. The one-time dashboard walk is written up in [`app-store/README.md`](./app-store/README.md), split by what `metadata:push` can re-push later versus what stays manual forever.

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
npm run convex:logs:prod       Tail prod deployment logs
npm run convex:env             List dev env vars
npm run convex:env:prod        List prod env vars
npm run convex:insights:prod   OCC conflicts + resource limits (prod)

The dev-side ones are `npx convex <cmd>` as-is, no alias needed:
logs, insights, dashboard, codegen, data, env get/set.

npm run eas:dev                eas build -p ios --profile development:simulator
npm run eas:dev:device         eas build -p ios --profile development:device
npm run eas:tf                 eas build -p ios --profile production --auto-submit-with-profile testflight
npm run eas:prod               eas build -p ios --profile production
npm run metadata:push          eas metadata:lint && eas metadata:push
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
npm run e2e                    Maestro flows on the simulator (one flow: npm run e2e -- .maestro/guest.yaml)
                               .maestro/guest-mode-off.yaml is opt-in. Its header has the two env commands
npm run fp                     Print Expo fingerprint hash
npm run atlas                  Bundle explorer at /_expo/atlas, served in production mode
npm run atlas:export           Export the iOS bundle and open the report offline
npm run repack                 Swap a new JS bundle into an existing build (npm run repack -- --source-app app.ipa)
npm run updates:gen-cert       Generate the OTA code-signing keypair (run once)
npm run upgrade                expo install expo@next && expo install --fix
npm run upgrade:stable         expo install expo@latest && expo install --fix
```

### Dev and prod side by side

The dev-facing scripts and the EAS `development` profile set `APP_VARIANT=development`. That appends `.dev` to the bundle id and the URL scheme and adds `(Dev)` to the display name, so a dev build and a TestFlight build install on the same phone without overwriting each other and without fighting over the same deep links. `preview` and `production` builds keep the plain identity.

Two things follow from the dev build having its own bundle id.

`npx vexpo convex` and `npx vexpo rebrand` write `APP_BUNDLE_ID=<your id>.dev` to the dev Convex deployment, because that deployment only ever serves the dev build. Prod gets the plain id from `.env.prod` through `npx vexpo env push`.

Apple treats `<your id>.dev` as its own App ID, so Sign In with Apple on the dev build needs it registered:

```bash
npx vexpo apple services-id --bundle-id <your id>.dev
```

Skip that if you only sign in with Apple on TestFlight and production builds.

### Bundle size

`npm run atlas` starts Metro with [Atlas](https://github.com/expo/atlas) on and serves the bundle explorer at `/_expo/atlas`. It runs in production mode, so the sizes match what ships instead of what the dev bundle looks like. `npm run atlas:export` writes `.expo/atlas.jsonl` and opens the same report without a running server.

That file holds the original and transformed source of every bundled module, including the values of your inlined `EXPO_PUBLIC_` vars. It is gitignored. Treat it like source and only share it with people you trust.

### Repacking a build

`npm run repack -- --source-app app.ipa` swaps a fresh JS bundle into a build you already have, so you can check a JS-only change against a real signed binary without waiting on another EAS build. It runs locally and costs nothing. Add `-o out.ipa` to write somewhere other than the default.

## What's wired up

- Convex backend: reactive queries, storage, real-time sync, per-mutation rate limiting
- Better Auth via `@convex-dev/better-auth`: email, password, OTP, Apple Sign In, per-device session revocation
- Optional accounts: guest browsing through the Better Auth anonymous plugin, with the guest's data merged onto the account when they sign up
- Resend for OTP, password reset, and change-email, with delivery webhooks
- APNs push, Apple Universal Links, profile editing with avatar uploads
- Account soft-delete with a 30-day grace window, and a same-day purge for guests, who have nothing to sign back in with
- Theme switching, haptics, reduced motion, VoiceOver, and Dynamic Type
- Liquid Glass on iOS 26+, with a `UIVisualEffectView` blur fallback on iOS 16.4 through 25
- OTA updates code-signed, so only signed bundles install
- EAS Build, Update, Submit, and Metadata, with eight workflows under `.eas/workflows/`

`runtimeVersion` uses the fingerprint policy with `appVersionSource: "remote"`, and the ASC key is managed by EAS. PR previews, Maestro E2E, and the production deploy are `workflow_dispatch`-only by default. Restore the `pull_request` triggers to build on every PR, or add a `push: main` trigger to deploy on merge.

## Conventions

For anyone writing code here, agent or human.

- TypeScript is `strict: true`. Don't add `any` casts. If a type is hard, ask before reaching for `any`.
- The path alias `@/` resolves to the project root. No deep relative imports (`../../../`).
- Files are lowercase kebab-case, one component each. Default-export the component, name-export everything else.
- Convex `useQuery` and `useMutation` hold server state, React `useState` holds local UI state. No Redux, no Zustand, no Jotai.
- Native UI is `@expo/ui/swift-ui` primitives plus `modifiers`. `<Host>` marks where SwiftUI starts. iOS only today.
- Validation runs at both boundaries: Zod on the client (`lib/schemas.ts`), Convex validators on the server (`convex/validators.ts`).
- Throw real `Error` instances and wrap server errors with `formatError` from `lib/convex-error.ts`. Don't swallow.
- Tests are Vitest under `__tests__/`. New validator logic and new HTTP handlers need one.

Five things bite harder than the rest:

- Every Convex query and mutation needs a server validator and matching client types. `convex/_generated/` is the contract, so run `npx convex codegen` after any schema or function change.
- Every public route in `convex/http.ts` goes through the `withWebhook()` factory in `convex/webhook.ts`, which does HMAC verification, a body cap, and structured logging. Inbound webhooks are untrusted by default.
- The Sign in with Apple JWT rotates every 90 days through `.eas/workflows/rotate-apple-jwt.yml`. That cron depends on `APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID` and `CONVEX_DEPLOY_KEY`, so don't break the env-var contract.
- Push notifications only work on a physical device. The iOS Simulator does not deliver APNs.
- `npx eas-cli <subcommand>` for EAS work, never bare `npx eas`, which can't resolve the binary. And don't rebuild what EAS already does.

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
  hooks/                          useNetwork, useColorScheme, useAppUpdates, ...
  lib/                            Auth client, haptics, env, deep links, native state
convex/                           Convex backend
plugins/
  with-auto-signing.js            CODE_SIGN_STYLE=Automatic + DEVELOPMENT_TEAM
  with-pod-deployment-target.js   Forces every pod to iOS 16.4
.eas/workflows/                   9 EAS Workflow YAML files
.github/workflows/check.yml       Typecheck, lint, format, tests
.maestro/                         Maestro e2e flows, run with `npm run e2e`
scripts/
  dev.mjs                         Metro launcher behind dev/start/ios
  e2e.mjs                         Maestro runner behind `npm run e2e`
  clean.mjs                       Trash + reinstall
  gen-update-cert.mjs             OTA code-signing keypair, run once
  rotate-apple-jwt.mjs            CI: re-sign JWT from env vars
__tests__/                        Convex + lib unit tests (validators, HMAC, deep link, schemas)
```

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
   - `src/lib/appAttest.ts`: the device-side `attestThisDevice` and `signRequest` client.
   - the `appAttestChallenges` and `appAttestKeys` tables in `convex/schema.ts`, and the `cleanupChallenges` hourly cron in `convex/crons.ts`.
4. The verifiers ship as `internalAction`s, which the client can't call. Wrap them in a public `action`, or call them from a protected `mutation`. The client attests once and caches the `keyId`, then signs each protected mutation's args, and the public action verifies the assertion before running the write.

## Version pinning

Every `expo-*` package tracks the same SDK 57 release. `npm run upgrade:stable` rolls them forward together. `npm run upgrade` tracks the next SDK preview.

`typescript` is part of that matrix, pinned at `^6.0.3`. Moving it to 7 is what `npx expo-doctor` flags as a major mismatch, so leave it until the SDK bumps.

Four packages are held on purpose, and `npm outdated` will keep offering newer ones:

> [!CAUTION]
> Don't downgrade `@convex-dev/better-auth` below `0.12.4` (pinned here at `0.12.5` with `better-auth@1.6.23`). Older `@convex-dev/better-auth` breaks signup.

> [!CAUTION]
> `convex-helpers` stays an exact version (`0.1.123`, paired with `convex@~1.45.0`), and the pair only moves together. Its patch releases can raise the convex peer floor, no lockfile ships with a scaffold, and `legacy-peer-deps` in `.npmrc` means npm would install a mismatch quietly rather than failing.

> [!CAUTION]
> Don't bump `better-auth` or `@better-auth/expo` past `1.6.23` while TypeScript is on 6. From 1.6.24 the client plugin type stops satisfying `BetterAuthClientPlugin`, so `createAuthClient` infers a client with no plugin actions on it and `emailOtp`, `username`, `isUsernameAvailable` and `convex` all vanish, twelve errors across the auth screens. TypeScript 7 resolves it and SDK 57 doesn't allow TypeScript 7, so the pair moves together or not at all. Both are exact versions, not carets, so an install can't drift onto it.

## License

MIT
