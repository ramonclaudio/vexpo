# Troubleshooting

Failure modes grouped by surface. Run `npx vexpo doctor` first, it names the broken check and points at the fix.

## Apple / App Store Connect

### `Found 0 app(s)` from `eas integrations:asc:connect`

A brand-new bundle id has no App Store Connect app record until the first `eas submit` creates it. The EAS<->ASC wizard reads the `apps` resource and dies on the raw `Found 0 app(s)`. `vexpo asc connect` pre-checks with your cached creds and defers loudly instead of spawning a wizard that can't win.

Build and submit once to create the record:

```bash
npm run eas:tf   # build -p ios --profile production --auto-submit-with-profile testflight
```

Then re-run `npx vexpo asc connect` to finish the link.

### `vexpo asc connect` says it needs a TTY

The EAS<->ASC integration wizard can't generate a key headless, and `--non-interactive` hard-requires `--api-key-id` plus `--asc-app-id`. So the server-side link wants a real terminal.

You don't need it for a non-interactive submit though. `eas submit` reads the app id only from `eas.json`'s submit profile. When `vexpo asc connect` runs without a TTY and can resolve the `ascAppId` from the ASC API, it writes it into `eas.json` and exits 0, enough for CI and `vexpo full`. Run `npx vexpo asc connect` in a terminal later to land the cloud-build link.

### Submit resolves the wrong app (`com.example.*`)

eas-cli evaluates `app.config` with `EXPO_NO_DOTENV` set, so it never reads `.env.local`. Without the public identity forwarded, the bundle id falls back to the `com.example.*` placeholder and the submit targets the wrong app ([#133](https://github.com/ramonclaudio/vexpo/issues/133)). `vexpo submit` forwards every `EXPO_PUBLIC_*` var plus `EAS_PROJECT_ID` into the spawn so the config evaluates with your real identity. Use `npx vexpo submit`, not a bare `eas submit`.

### `eas submit` can't find the app / missing `ascAppId`

`eas submit` reads `ascAppId` only from the named submit profile in `eas.json`. No flag, no env var. The ASC integration covers interactive mode only. Run `npx vexpo asc connect` to write the id into every submit profile, then commit `eas.json` so CI has it.

## EAS

### A second ASC API key showed up on Apple

Expected. `vexpo asc connect` lets the EAS wizard generate its own key for build/submit/metadata, kept separate from the master key cached in vexpo state. The master key stays out of EAS's control for direct ASC API calls (`vexpo apple services-id`, `vexpo apple jwt`).

## Convex

### Provisioning hangs or fails on a team picker

A multi-team Convex account shows an interactive team picker on `convex dev --configure new`. It can't prompt in CI or a non-TTY shell. Set the team and re-run:

```bash
CONVEX_TEAM=<slug> npx vexpo lite
```

The slug is in the Convex dashboard under team settings. `vexpo convex` also reads `CONVEX_TEAM` from `.env.local`.

### Provisioning fails: team `is managed by oauth:...`

Accounts created through the EAS-Convex integration have their team managed by that OAuth app, and `convex dev --configure new` can't create projects there directly, with or without `CONVEX_TEAM`. Create the project through the integration, then adopt it:

```bash
npx eas-cli integrations:convex:connect
npx vexpo adopt
```

## Resend

### Key that worked minutes ago now returns `API key is invalid`

Editing a key's permission in the Resend dashboard rotates its token: the
string you pasted is dead the moment you flip Full access to Sending or back.
Reads can keep passing for a couple of minutes (cached auth) while writes fail
instantly, which looks like a half-broken key. Create the bootstrapper key with
Full access from the start, leave it untouched until `vexpo resend` reports
done, then revoke it. The scoped sending key the CLI mints is the only one that
stays live.

## Expo

### Push notifications don't fire

Push notifications don't work in the iOS Simulator. Test on a physical device.

### Expo Go won't load the app

This is a dev-client project, not an Expo Go project. Expo Go can't load custom native modules. Always start with the dev client:

```bash
npm run dev   # expo start --dev-client
```

## Maestro

### `Unable to locate a Java Runtime`

Maestro's launcher needs a JVM and Homebrew's `openjdk` is keg-only, so it never lands on the system Java path. Point `JAVA_HOME` at the keg:

```bash
brew install openjdk
JAVA_HOME=/opt/homebrew/opt/openjdk PATH="$JAVA_HOME/bin:$PATH" maestro test .maestro/tour.yaml
```

Export both in your shell profile if you run flows often.

### `tour.yaml` fails on `"This device" is visible`

The Sessions screen gates session management behind a recent sign-in. An old simulator session renders the "Sign in again to manage sessions" fallback instead of the device list. Run `auth.yaml` first to seed a fresh session, which is what the EAS workflow does.

### `auth.yaml` fails after Resend is provisioned

The flow's sign-up-lands-authed path only works while `REQUIRE_EMAIL_VERIFICATION` is unset (lite mode). Once Resend provisioning flips it on, sign-up needs a real OTP email, which a headless flow can't read. Seed a pre-verified account with `npx vexpo review-account` and drive a sign-in-only variant, or run the suite on EAS release builds via `.eas/workflows/e2e-tests.yml`.

### Taps report `COMPLETED` but sign-in never fires

On locally-built dev clients, Maestro's synthetic taps on the `@expo/ui` SwiftUI submit button can complete without the handler firing: the native field renders the text, but the change never reaches React state, so no network call leaves the app and Convex logs stay empty. This is XCTest/SwiftUI bridge flakiness, not an app bug. Prove the backend independently with a raw HTTP sign-in against `https://<deployment>.convex.site/api/auth/sign-in/email` (expect 200 and a session token). The supported e2e target is EAS release builds through `e2e-tests.yml`, and ad-hoc flows must keep the template's input workarounds (reveal password visibility to dodge iOS strong-password autofill, never `hideKeyboard`).

## "doctor says X"

`npx vexpo doctor` maps most warnings straight to their fix:

- `convex / login` failed: `npx convex login`
- `eas / signed-in` warns: `npx eas-cli login`
- `eas / asc-integration` not connected: `npx vexpo asc connect`
- `eas / asc-submit-id` missing `ascAppId`: `npx vexpo asc connect`, then commit `eas.json`
- `apple / asc-key-valid` skipped: `npx vexpo apple asc-key` to cache and validate a key
- `apple / services-id-exists` not found: `npx vexpo apple services-id` to provision it
