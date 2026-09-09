# vexpo

Vexpo is an iOS app built on Expo SDK 57 with `@expo/ui`'s fully native SwiftUI, Convex set up as the backend, Better Auth wired in for authentication, and Resend for email.

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/demo-app.gif" width="300" alt="Sign up, onboarding, search, and the dark-mode flip">
  &nbsp;&nbsp;
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ramonclaudio/vexpo/main/.github/assets/screens.png" width="600" alt="Home, profile, and settings in light and dark">
</p>

## Setup

To set it up by hand, follow [Quick start](#quick-start), then run `npx vexpo rebrand` when you're ready to make the identity yours. `vexpo full` runs the rebrand for you.

To let an agent do it, paste this.

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

`.mcp.json` points at the [Expo MCP server](https://docs.expo.dev/mcp/), so an agent with project-scoped MCP support picks it up on its own. It is a remote HTTP server on `https://mcp.expo.dev/mcp` and it signs in with your Expo account the first time you use it. Free plan, fair use.

[Expo Skills](https://docs.expo.dev/skills/) teach the agent how `@expo/ui`, Expo Router and EAS actually work, which is most of what this template is.

```bash
claude plugin install expo@claude-plugins-official   # Claude Code
codex plugin add expo@openai-curated                 # Codex
npx skills add expo/skills                           # Cursor and everything else
```

The Claude Code and Codex plugins register the MCP server themselves, so on those two you can delete `.mcp.json`.

An agent can also drive the app instead of only reading the code. [`agent-device`](https://agent-device.dev) is Callstack's CLI for that. It reads an accessibility snapshot of the current screen, acts on refs like `@e2`, and saves a screenshot as evidence.

```bash
npm install -g agent-device@latest
agent-device doctor
```

Once the app is running on a simulator, the loop looks like this.

```bash
agent-device apps --platform ios
agent-device open Vexpo --platform ios
agent-device snapshot -i          # @e1 [heading] "Welcome"  @e2 [button] "Sign in"
agent-device press @e2 --settle
agent-device screenshot ./artifacts/sign-in.png
agent-device close
```

Two more tools are for watching rather than driving. `expo-device-hub` adds a device dashboard to `npm run dev`, printed as `Expo Device Hub: http://localhost:8081/_expo/plugins/expo-device-hub`. It streams the simulator into the browser and you can tap and type into it there. `npx @expo/serve-sim` does the same thing without a dev server, on port 3200, and the URL tunnels, so an agent on another machine can see the screen.

## Prerequisites

You need these two on your machine. `eas-cli` and the `convex` CLI run through npx, so there's nothing else to install globally.

- macOS and Xcode. The template is iOS only for now.
- Bun, or Node 22.12 or newer.

You only need each account once you get to the step that uses it. Convex is the only one you need before you ship.

| Stage                   | Account                                     | Cost                  |
| ----------------------- | ------------------------------------------- | --------------------- |
| `vexpo lite` (dev app)  | Convex                                      | free                  |
| `vexpo full` (shipping) | Expo (EAS builds, env, submit)              | free tier covers this |
| `vexpo full` (shipping) | Apple Developer Program + App Store Connect | $99/yr                |
| Email (OTP, reset)      | Resend + a domain you control DNS for       | free tier covers this |

Run `npx convex login` and `npx eas-cli login` once before setup. Setup tells you if either one is missing, and `--new` on `lite` or `full` helps you sign up for anything you don't have yet. Apple also needs a one-time ASC API key download, a `.p8` with the App Manager role, and [Ship path](#ship-path) step 2 has that.

## Quick start

You need macOS and Xcode. The `vexpo` CLI is a devDependency, so `npm install` puts it on your path.

```bash
npm install

npx vexpo lite         # sets up Convex and Better Auth
npx vexpo lite --new   # same, plus a Convex signup walkthrough if you don't have an account
```

Then run the backend and the app in two terminals.

```bash
npm run convex:dev      # terminal 1
npm run ios             # terminal 2
```

`lite` skips Apple, EAS and Resend, so sign-up auto-verifies and you're in the app right away. The flows that need Resend (OTP, password reset, change email) are hidden until you set it up.

To install a build without a terminal, use [Orbit](https://github.com/expo/orbit). It is a free menu bar app that installs and launches a local `.app` or an EAS build on a simulator or a connected device in one click.

```bash
brew install expo-orbit
```

If your Convex team is EAS-managed, meaning it was created through Expo's integration, creating a project directly fails with `is managed by oauth:...`. Set it up through the integration instead.

```bash
npx eas-cli init            # if the app is not linked to EAS yet
npx vexpo convex --eas      # add --region aws-us-east-1 to skip the region prompt
```

That runs `eas integrations:convex:connect`, which creates the project and writes `CONVEX_DEPLOY_KEY` and `EXPO_PUBLIC_CONVEX_URL` to `.env.local`, then continues with the site URLs, the identity vars and the schema push. A deploy key in `.env.local` wins over `--prod` on every convex command, so `npm run convex:logs:prod` reads dev until you point the CLI at another env file. `.env.example` has the fix.

The integration always creates a new Convex project. There is no input for an existing one, and it does not check whether this app already has one. So `--eas` reads `eas integrations:convex:project` first and stops if the app is already linked, which is what a fresh clone with no `.env.local` looks like. To use a project you already have, put its deploy key in `.env.local` and run `npx vexpo convex` without `--eas`. To relink on purpose, run `npx eas-cli integrations:convex:project:delete` first. That drops the EAS link and leaves everything on Convex alone.

The integration also writes the dev deployment URL to `EXPO_PUBLIC_CONVEX_URL` on EAS for production, preview and development alike. `npx vexpo env push` sends prod to production and preview and dev to development, so run it once a prod deployment exists.

## Ship path

These are the steps in order. The first build's credentials wizard is the one part you have to sit through, and `vexpo full` saves its progress, so running it again after any step is safe.

1. **Log in once per machine.** `npx eas-cli login` and `npx convex login`. Setup's Prerequisites section tells you if either is missing.
2. **Get the ASC API key.** App Store Connect -> Users and Access -> Integrations -> generate a **Team** key with the **App Manager** role, and download the `.p8` into `credentials/`. You have to do this one yourself, and Apple only lets you download it once. Details in [App Store submission](#app-store-submission).
3. **Run the setup.**

   ```bash
   npx vexpo full         # adds Resend, Apple Sign In, the ASC key, eas init, and rebrand
   npx vexpo full --new   # same, plus helps you sign up for Apple, Convex, Expo, and Resend
   ```

   `full` writes `.env.local`, sets the Convex env vars, validates the ASC key, registers the Services ID, signs the Sign in with Apple (SIWA) JWT, copies EAS env to all three environments, and creates the App Review demo account on dev and prod. If the placeholder password is still in `store.config.json`, it generates a real one. It asks you to paste a Resend **Full access** API key. Create that key fresh and don't touch it until the run says it's done, because editing a key's permission in the Resend dashboard changes its token mid-run. Revoke it after. The scoped sending key vexpo creates is the only one that stays.

4. **Set up over-the-air (OTA) code signing.** `npm run updates:gen-cert -- --name "Your Org"`, then upload the private key as the `EAS_UPDATE_PRIVATE_KEY` file secret (the script prints the command). The dev loop keeps working, since `npm run dev` passes the signing key to Metro for you.
5. **The first build.**

   ```bash
   npm run eas:tf         # credentials wizard + production build + TestFlight submit
   ```

   Four of the wizard's answers matter. Pick **reuse** for the existing distribution certificate if it offers one, since Apple caps a team at 3 and generating a 4th fails. Let it **generate** a fresh provisioning profile, they're disposable and EAS makes new ones. Pick **reuse** for the existing push key, those are capped at 2. Let it **generate** an EAS-managed submit key when it gets to App Store Connect. You end up with two live ASC keys. Your local `credentials/` key is the one `eas.json` and CLI submits use, and the EAS-managed one is for cloud auto-submits and the integration. After this one run, credentials are stored in EAS and every future build and submit runs without prompts.

6. **After the build, none of this needs you.**

   ```bash
   npx vexpo asc connect                           # finishes the EAS to ASC link, doctor goes green
   npx vexpo testflight groups create "Internal"   # beta group, no Beta App Review
   npx vexpo testflight invite you@example.com     # shows up in the TestFlight app
   npx vexpo testflight whats-new <buildId> "..."  # release notes on the build
   npx vexpo submit                                # every re-submit, no prompts
   ```

   `vexpo submit` and `vexpo asc connect` write the ASC key into `eas.json`'s submit profiles, so submits use your validated key instead of whatever EAS has stored. `whats-new` is for a build that's already up or a locale other than en-US. To set the notes as part of a submit, pass `eas submit --what-to-test "..."` instead.

- `npx vexpo doctor` checks every credential against the live service and compares IDs across `.env.local`, Convex env, EAS env and `app.config.ts`. Run `--strict` before every release.
- `npx vexpo full --plan` shows the setup before you start.
- `npx vexpo full --dry-run` shows what the next run would change.

## Credentials

- The app bundle is public. Never put a real secret in an `EXPO_PUBLIC_*` var, because it ships in plaintext inside the binary. Only public identifiers (Convex URL, bundle id, team id) go there.
- Real secrets are stored where they're used, EAS or Convex (both encrypted at rest), never in git. `vexpo full` and `vexpo env push` put them there.
- EAS cloud builders can't read your local `.env` or `.p8` files, so anything a build or submit needs has to be uploaded to EAS first.
- `store.config.json` is gitignored, because `vexpo review-account` writes a generated App Review demo password into it. `store.config.example.json` is the tracked copy your working file starts from. Store copy you want versioned (subtitle, description, keywords) goes in the example, and a fresh clone restores from it with `cp store.config.example.json store.config.json`. Un-ignore the working file if your team would rather keep the credentials in git.

Each credential has one home, one local file, and one command that moves it between the two.

| Credential                                         | Home                                   | Local          | Command                            |
| -------------------------------------------------- | -------------------------------------- | -------------- | ---------------------------------- |
| Convex URL, bundle id, team id                     | EAS env + Convex                       | `.env.local`   | `vexpo env push`                   |
| `BETTER_AUTH_SECRET`, `RESEND_*`, `APPLE_CLIENT_*` | Convex env                             | `.env.local`   | `vexpo env push`                   |
| ASC API key `.p8` (App Manager role)               | EAS credential store                   | `credentials/` | `eas credentials`                  |
| SIWA `.p8`                                         | EAS env (secret)                       | `credentials/` | `vexpo apple eas-rotation-secrets` |
| dist cert, provisioning, push key                  | EAS (managed)                          | none           | `eas credentials`                  |
| EAS Update key                                     | EAS file secret, public cert committed | `keys/`        | `npm run updates:gen-cert`         |

### App Store submission

TestFlight and App Store submission need two things. Your App Store Connect agreements have to be accepted, and an ASC API key has to be registered in EAS. A missing or expired agreement makes every ASC API call return 403, which looks like an auth failure but isn't. Accept it at App Store Connect -> Business (Agreements, Tax, and Banking). Only the Account Holder can.

1. App Store Connect -> Users and Access -> Integrations -> App Store Connect API. Generate a **Team** key with the **App Manager** role, which is the smallest role that can submit. Admin also works. Download the `.p8` once into `credentials/`.
2. `npx vexpo apple asc-key` registers and validates it. It finds `credentials/` on its own.
3. `npx eas-cli credentials --platform ios` -> App Store Connect API Key -> set it up, so cloud submits can use it.
4. `npx vexpo asc connect` writes `ascAppId` into your `eas.json` and links the project to its ASC app. eas-cli reads the app id only from the submit profile, there's no flag and no env var for it. That write is what makes a submit work without prompts, and it puts the id in CI too once the app record exists.
5. `npm run eas:tf` builds and submits to TestFlight.

The ASC app record only appears after your first submit, so a brand-new app's first `eas:tf` runs with prompts. After that, `npx vexpo submit` re-submits the latest build with none. It writes your cached ASC key's `ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId` plus `ascAppId` into `eas.json`'s submit profiles. That's the only place `eas submit` reads them from, so the EAS credential store never decides which key signs. Pass `--profile production` to submit to the App Store, or `--id <buildId>` for a specific build.

`npx vexpo doctor` confirms the key, its role, the agreement and the link. Full notes in [`credentials/README.md`](./credentials/README.md).

Part of the listing is manual. Apple has no API for privacy nutrition labels, pricing, content rights, age rating, accessibility declarations or TestFlight Test Information. The one-time dashboard steps are in [`app-store/README.md`](./app-store/README.md), split by what `metadata:push` can re-push later and what stays manual.

## Scripts

```text
npm run dev                    Metro + dev client
npm run start                  Metro with cleared cache
npm run ios                    Clean prebuild + compile + run on simulator
npm run ios:dev                Run on simulator (skip prebuild, fast)
npm run ios:device             Clean prebuild + compile + run on physical device
npm run prebuild               Generate iOS native project from config

npm run convex:dev             Convex dev server (watch mode)
npm run convex:deploy          Deploy Convex functions to production (reads .env.prod so the dev deploy key in .env.local can't send it to dev)
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
npm run clean:state            Remove .setup-state.json + standard clean
npm run typecheck              tsc --noEmit
npm run lint                   oxlint
npm run format                 oxfmt
npm run format:check           oxfmt --check
npm run test                   vitest run
npm run test:watch             vitest
npm run e2e                    Maestro flows on the simulator (one flow: npm run e2e -- .maestro/guest.yaml)
                               .maestro/guest-mode-off.yaml is opt-in. Its header has the two env commands
npm run smoke                  Release simulator build, then one flow that stops at the sign-in screen
                               No backend, no Metro. This is what CI runs on macos-latest
npm run fp                     Print Expo fingerprint hash
npm run atlas                  Bundle explorer at /_expo/atlas, served in production mode
npm run atlas:export           Export the iOS bundle and open the report offline
npm run repack                 Put a new JS bundle into an existing build (npm run repack -- --source-app app.ipa)
npm run updates:gen-cert       Generate the OTA code-signing keypair (run once)
npm run upgrade                expo install expo@next && expo install --fix
npm run upgrade:stable         expo install expo@latest && expo install --fix
```

### Dev and prod side by side

The dev-facing scripts and the EAS `development` profile set `APP_VARIANT=development`. That adds `.dev` to the bundle id and the URL scheme and `(Dev)` to the display name, so a dev build and a TestFlight build install on the same phone without overwriting each other or fighting over the same deep links. `preview` and `production` builds keep the plain identity.

Because the dev build has its own bundle id, `npx vexpo convex` and `npx vexpo rebrand` write `APP_BUNDLE_ID=<your id>.dev` to the dev Convex deployment, since that deployment only ever serves the dev build. Prod gets the plain id from `.env.prod` through `npx vexpo env push`.

Apple also treats `<your id>.dev` as its own App ID, so Sign In with Apple on the dev build needs it registered.

```bash
npx vexpo apple services-id --bundle-id <your id>.dev
```

Skip that if you only sign in with Apple on TestFlight and production builds.

### Bundle size

`npm run atlas` starts Metro with [Atlas](https://github.com/expo/atlas) on and serves the bundle explorer at `/_expo/atlas`. It runs in production mode, so the sizes match what ships instead of what the dev bundle looks like. `npm run atlas:export` writes `.expo/atlas.jsonl` and opens the same report without a running server.

That file has the original and transformed source of every bundled module, including the values of your inlined `EXPO_PUBLIC_` vars. It is gitignored. Treat it like source and only share it with people you trust.

### Repacking a build

`npm run repack -- --source-app app.ipa` puts a fresh JS bundle into a build you already have, so you can check a JS-only change against a real signed binary without waiting on another EAS build. It runs locally and costs nothing. Add `-o out.ipa` to write somewhere other than the default.

## What's wired up

- Convex backend with live queries, storage, real-time sync and per-mutation rate limiting
- Better Auth through `@convex-dev/better-auth`, with email, password, OTP, Apple Sign In and per-device sign out
- Optional accounts. Guests browse through the Better Auth anonymous plugin, and their data moves to the account when they sign up
- Resend for OTP, password reset and change-email, with delivery webhooks
- APNs push, Apple Universal Links, profile editing with avatar uploads
- Account delete with a 30-day undo, and a same-day purge for guests, who have nothing to sign back in with
- Theme switching, haptics, reduced motion, VoiceOver and Dynamic Type
- Liquid Glass on iOS 26 and later, with a `UIVisualEffectView` blur fallback on iOS 16.4 through 25
- Code-signed OTA updates, so only signed bundles install
- Startup metrics through `expo-observe`, reported to EAS Observe
- A home screen widget showing your account state, built with `expo-widgets`
- EAS Build, Update, Submit and Metadata, with nine workflows under `.eas/workflows/`

`ObserveRoot` wraps the root layout and `markInteractive()` fires in the same effect that hides the splash, so Time to First Render and Time to Interactive both get reported. It only runs in release builds. Startup metrics are all I wired up. The Expo Router per-route integration and `Observe.logEvent` are both in the library if you want them, they just add to your event count. The free plan covers 100,000 events a month.

The widget is TypeScript, not Swift. `src/widgets/status-widget.tsx` is `@expo/ui/swift-ui` components with a `'widget'` directive, and the `expo-widgets` plugin entry in `app.config.ts` generates the extension target during prebuild. `src/hooks/use-widget-sync.ts` sends a new snapshot whenever auth state changes, so the widget says signed out, browsing as guest, or your name. Prebuild writes the app group entitlement onto both targets, defaulting to `group.<bundle id>`, so the dev variant gets its own group and its own widget.

This is an iOS app and `platforms` says so, which means you can't put an Expo Router `+api.ts` route on EAS Hosting. That needs a web export, and the export prerenders every client route, so the whole UI would have to run on web first. It doesn't. `src/constants/theme.ts` builds the palette out of `DynamicColorIOS`, `expoClient()` uses `localStorage` at module scope, and the 47 files importing `@expo/ui/swift-ui` have no web version to fall back on. HTTP endpoints go in `convex/http.ts`, which is where the auth routes and the Resend webhook already are.

`runtimeVersion` uses the fingerprint policy with `appVersionSource: "remote"`, and the ASC key is managed by EAS. PR previews, Maestro E2E and the production deploy are `workflow_dispatch`-only by default. Restore the `pull_request` triggers to build on every PR, or add a `push: main` trigger to deploy on merge.

There are two test paths, and they cost different things. `.github/workflows/check.yml` has an `ios` job on `macos-latest` that runs `npm run smoke`, a Release simulator build plus one flow that checks the app boots to the sign-in screen. macOS runners are free on public repos, and the flow never touches Convex, so this one needs no account and no secrets. It catches the thing that actually breaks, a native build that no longer compiles.

That job only runs on a PR that touches `templates/default`, and it always runs on a push to `main`. The Xcode build is the expensive part, so CI caches the native project, the CocoaPods download cache and the derived data under `.smoke-build`, all keyed on `package-lock.json` and `app.config.ts`. CI also sets `SMOKE_KEEP_NATIVE=1`, which drops the `--clean` from `expo prebuild` so the restored `ios/` survives. Locally the clean still happens, so `npm run smoke` on your machine can't build against a stale native project.

`.eas/workflows/e2e-tests.yml` runs the full set (guest, auth, launch, tour, screens) through the `maestro` job type. That job is not on the EAS free plan, and the auth flow signs up against a live Convex deployment. Keep it if you are on a paid plan, otherwise the smoke job is the free half.

## Accessibility

`app-store/accessibility.config.json` is the App Store Accessibility Nutrition Label, one entry per device family with nine booleans, matching Apple's `AccessibilityDeclaration`. `npx vexpo asc accessibility lint` checks the shape and `npx vexpo asc accessibility push --publish` sends it. Apple judges by task, so first launch, sign in, purchase, settings and the app's primary job all have to be doable with the feature on. The template ships claiming seven of the nine, so keep the declaration true as you change the app.

- Text scales through `useDynamicFont`, which resolves every size to a SwiftUI text style. A hard-coded `size:` with no `textStyle` opts that label out of Larger Text.
- Colors come from `constants/theme.ts` as four-appearance `DynamicColorIOS` tokens. `__tests__/lib/contrast.test.ts` measures the pairings the screens actually draw, text at 4.5:1 and controls and anything whose color shows a state at 3:1. Add a pairing when you draw a new one.
- Form errors and successes go through `fail()` and `succeed()` in `lib/form-result.ts`, which pair the haptic with the VoiceOver announcement. Announcing from there rather than from the row that draws the message is what makes the same error twice get heard twice.
- `@expo/ui` keeps SwiftUI's default labeling, so a control wrapping a `Text` already announces it. Label icon-only controls, hide decorative symbols with `accessibilityHidden(true)`, and leave the rest alone. A label on a container replaces what its children would have said.
- An `expo-image` `Image` needs `accessible` next to `accessibilityLabel`. Without it the view never enters the accessibility hierarchy and the label does nothing.
- Nothing depends on color alone. Status rows pair the tone with a symbol and a word.
- Voice Control matches what you can read. When a control's input labels differ from its visible text, keep the visible words in the list too, or saying them does nothing.
- The launch screen follows the system appearance, not the in-app one, so an app set to Dark under a Light system flashes white on every launch. `vexpo asc accessibility url` sets the App Store link Apple keeps for exactly this kind of caveat.
- No test can confirm what VoiceOver says. Maestro reads the iOS accessibility hierarchy and an `@expo/ui` `Text` never reaches it. Turn VoiceOver on before you submit.

## Conventions

For anyone writing code here, agent or human.

- TypeScript is `strict: true`. Don't add `any` casts. If a type is hard, ask before reaching for `any`.
- The path alias `@/` resolves to the project root. No deep relative imports (`../../../`).
- Files are lowercase kebab-case, one component each. Default-export the component, name-export everything else.
- Convex `useQuery` and `useMutation` hold server state, React `useState` holds local UI state. No Redux, no Zustand, no Jotai.
- Native UI is `@expo/ui/swift-ui` primitives plus `modifiers`. `<Host>` marks where SwiftUI starts. iOS only today.
- Validation runs at both ends, Zod on the client (`lib/schemas.ts`) and Convex validators on the server (`convex/validators.ts`).
- Throw real `Error` instances and wrap server errors with `formatError` from `lib/convex-error.ts`. Don't swallow.
- Tests are Vitest under `__tests__/`. New validator logic and new HTTP handlers need one.

Five things break the most.

- Every Convex query and mutation needs a server validator and matching client types. `convex/_generated/` is the contract, so run `npx convex codegen` after any schema or function change.
- Every public route in `convex/http.ts` goes through the `withWebhook()` factory in `convex/webhook.ts`, which does HMAC verification, a body cap and structured logging. Inbound webhooks are untrusted by default.
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
  widgets/                        Home screen widget layouts
convex/                           Convex backend
plugins/
  with-auto-signing.js            CODE_SIGN_STYLE=Automatic + DEVELOPMENT_TEAM
  with-pod-deployment-target.js   Forces every pod to iOS 16.4
.eas/workflows/                   9 EAS Workflow YAML files
.github/workflows/check.yml       Typecheck, lint, format, tests, and the iOS smoke build
.maestro/                         Maestro e2e flows, run with `npm run e2e`
  smoke.yaml                      Boots to sign-in, no backend. What CI runs
  _*.yaml                         Subflows the flows share, not flows themselves
scripts/
  dev.mjs                         Metro launcher behind dev/start/ios
  e2e.mjs                         Maestro runner behind `npm run e2e`
  smoke.mjs                       Release build + install + smoke flow, behind `npm run smoke`
  clean.mjs                       Trash + reinstall
  gen-update-cert.mjs             OTA code-signing keypair, run once
  rotate-apple-jwt.mjs            CI: re-sign JWT from env vars
__tests__/                        Convex + lib unit tests (validators, HMAC, deep link, schemas)
```

## Re-adding App Attest

The template used to ship an Apple App Attest stack, a Convex verifier plus a client lib. App Attest proves a request came from a real, unmodified build on a device with a Secure Enclave. Add it back when you have a mutation worth protecting.

1. Install the native module with `npm install @expo/app-integrity`.
2. Add the entitlement under `ios` in `app.config.ts`.

   ```ts
   entitlements: {
     "com.apple.developer.devicecheck.appattest-environment": "production",
   },
   ```

3. Bring back the verifier and client from the vexpo repo's [removal commit](https://github.com/ramonclaudio/vexpo/commit/486f3f90e5b63ce89da219db86f91785833d8cbf). Scaffolded projects start with fresh git history, so the deleted files are in the template repo under `templates/default/`, not in this repo's log.
   - `convex/appAttest.ts` is the attestation and assertion verifier. It needs `cbor-x`, so `npm install cbor-x`.
   - `convex/appAttestStore.ts` has the challenge and key storage mutations.
   - `src/lib/appAttest.ts` is the device-side `attestThisDevice` and `signRequest` client.
   - The `appAttestChallenges` and `appAttestKeys` tables in `convex/schema.ts`, and the `cleanupChallenges` hourly cron in `convex/crons.ts`.
4. The verifiers ship as `internalAction`s, which the client can't call. Wrap them in a public `action`, or call them from a protected `mutation`. The client attests once and caches the `keyId`, then signs each protected mutation's args, and the public action verifies the assertion before running the write.

## Version pinning

Every `expo-*` package tracks the same SDK 57 release. `npm run upgrade:stable` moves them forward together. `npm run upgrade` tracks the next SDK preview.

`typescript` is part of that matrix, pinned at `^6.0.3`. Moving it to 7 is what `npx expo-doctor` flags as a major mismatch, so leave it until the SDK bumps.

Four packages are held on purpose, and `npm outdated` will keep offering newer ones.

> [!CAUTION]
> Don't downgrade `@convex-dev/better-auth` below `0.12.4` (pinned here at `0.12.5` with `better-auth@1.6.23`). Older `@convex-dev/better-auth` breaks signup.

> [!CAUTION]
> `convex-helpers` stays an exact version (`0.1.123`, paired with `convex@~1.45.0`), and the pair only moves together. Its patch releases can raise the convex peer floor, no lockfile ships with a scaffold, and `legacy-peer-deps` in `.npmrc` means npm would install a mismatch quietly rather than failing.

> [!CAUTION]
> Don't bump `better-auth` or `@better-auth/expo` past `1.6.23` while TypeScript is on 6. From 1.6.24 the client plugin type stops satisfying `BetterAuthClientPlugin`, so `createAuthClient` infers a client with no plugin actions on it and `emailOtp`, `username`, `isUsernameAvailable` and `convex` all vanish, twelve errors across the auth screens. TypeScript 7 resolves it and SDK 57 doesn't allow TypeScript 7, so the pair moves together or not at all. Both are exact versions, not carets, so an install can't drift onto it.

## License

MIT
