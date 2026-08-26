# Troubleshooting

The common failure modes, grouped by surface. Run `npx vexpo doctor` first, since it names the broken check and points at the fix.

## Apple and App Store Connect

### `Found 0 app(s)` from `eas integrations:asc:connect`

A brand-new bundle id has no App Store Connect app record until the first `eas submit` creates it. The EAS<->ASC wizard reads the `apps` resource and dies on the raw `Found 0 app(s)`. `vexpo asc connect` checks for the app record with your cached credentials first. If there isn't one yet, it prints the command to run and exits without starting the wizard.

Build and submit once to create the record:

```bash
npm run eas:tf   # build -p ios --profile production --auto-submit-with-profile testflight
```

Then re-run `npx vexpo asc connect` to finish the link.

### `vexpo asc connect` says it needs a TTY

The EAS<->ASC integration wizard can't generate a key headless, and `--non-interactive` hard-requires `--api-key-id` plus `--asc-app-id`.

You don't need it for a non-interactive submit though. `eas submit` reads the app id only from `eas.json`'s submit profile. When `vexpo asc connect` runs without a TTY and can resolve the `ascAppId` from the ASC API, it writes it into `eas.json` and exits 0. That's enough for CI and `vexpo full`. Run `npx vexpo asc connect` in a terminal later to set up the cloud-build link.

### Submit resolves the wrong app (`com.example.*`)

eas-cli evaluates `app.config` with `EXPO_NO_DOTENV` set, so it never reads `.env.local`. If nothing else passes those values in, the bundle id falls back to the `com.example.*` placeholder and the submit targets the wrong app ([#133](https://github.com/ramonclaudio/vexpo/issues/133)). `vexpo submit` passes every `EXPO_PUBLIC_*` var plus `EAS_PROJECT_ID` to the `eas submit` child process, so the config evaluates with your real identity. Use `npx vexpo submit`, not a bare `eas submit`.

### `eas submit` can't find the app or `ascAppId` is missing

`eas submit` reads `ascAppId` only from the named submit profile in `eas.json`. No flag, no env var. The ASC integration covers interactive mode only. Run `npx vexpo asc connect` to write the id into every submit profile, then commit `eas.json` so CI has it.

## EAS

### A second ASC API key showed up on Apple

That's expected. `vexpo asc connect` lets the EAS wizard generate its own key for builds, submits, and metadata. That key is separate from the master key cached in vexpo state. The master key stays out of EAS's control for direct ASC API calls (`vexpo apple services-id`, `vexpo apple jwt`).

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

Editing a key's permission in the Resend dashboard rotates its token. The
string you pasted is dead the moment you flip Full access to Sending or back.
Reads can keep passing for a couple of minutes because auth is cached, and
writes fail instantly. It looks like a half-broken key. Create the
bootstrapper key with Full access from the start, leave it untouched until
`vexpo resend` reports done, then revoke it. The scoped sending key the CLI
mints stays live.

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

You ran `maestro test` directly. Maestro is a JVM tool, macOS ships no JDK, and Homebrew's `openjdk` is keg-only so it never lands on the system Java path. Run the flows through the template's runner instead:

```bash
brew install openjdk        # once
npm run e2e                 # whole folder
npm run e2e -- .maestro/auth.yaml
```

`scripts/e2e.mjs` finds the keg and sets `JAVA_HOME` itself. It also passes in three things the flows can't get on their own. `MAESTRO_APP_ID` from `.env.local`, since only EAS injects it in CI. A unique `MAESTRO_TEST_EMAIL` per run. And a simulator keychain reset, because `clearState` leaves Better Auth's session cookie behind and the next launch comes up already signed in.

### A folder run fails `tour` and `zz-delete-restore` on the sign-in screen

`npm run e2e` with no arguments hands Maestro the whole folder, and it runs those flows at the same time rather than in name order. `tour.yaml` and `zz-delete-restore.yaml` both need the session `auth.yaml` creates, so both land on sign-in and go red while `auth` is still typing. The `zz-` prefix and the `t` in `tour` only order an EAS run. Name the flows in order instead, which keeps them in one invocation and so one keychain reset:

```bash
npm run e2e -- .maestro/auth.yaml .maestro/tour.yaml .maestro/zz-delete-restore.yaml
```

Running a dependent flow by itself can't work either, for the same reason the runner resets the keychain: `npm run e2e -- .maestro/tour.yaml` always starts signed out.

### `zz-delete-restore` stalls or silently no-ops at the delete step

`deleteAccount` gates on `LocalAuthentication.authenticateAsync`, and a simulator with no enrolled biometric never satisfies it, so the mutation never runs. Enroll once, then answer the prompt while the flow is on that step:

```bash
xcrun simctl spawn booted notifyutil -s com.apple.BiometricKit.enrollmentChanged 1
xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit.enrollmentChanged
xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match   # the answer
```

### `tour.yaml` fails on `"This device" is visible`

You need a recent sign-in to manage sessions. On an old simulator session the Sessions screen renders the "Sign in again to manage sessions" fallback instead of the device list. Run `auth.yaml` first to seed a fresh session, which is what the EAS workflow does.

### `auth.yaml` fails on `"Verify your email" is visible`

That assert fires when `REQUIRE_EMAIL_VERIFICATION` is set on the deployment. Signing up only leaves you signed in while it's unset (lite mode). Once Resend provisioning flips it on, sign-up stops on the OTP screen and the code is in an inbox no headless flow can read. `tour.yaml` and `zz-delete-restore.yaml` both need the session `auth.yaml` creates, so all three go red together.

```bash
npx convex env get REQUIRE_EMAIL_VERIFICATION
npx convex env remove REQUIRE_EMAIL_VERIFICATION   # only on a deployment you e2e against
```

Otherwise seed a pre-verified account with `npx vexpo review-account` and drive a sign-in-only variant, or run the suite on EAS release builds via `.eas/workflows/e2e-tests.yml`.

### Every step after `clearState` SKIPs, and the failure lands somewhere unrelated

`clearState: true` wipes the app's permission answers, so the next launch re-raises whatever alert the app asks for first. iOS draws those from SpringBoard, so they sit over the app and never appear in the accessibility tree. Maestro can't see the alert, can't tap it, and every `runFlow` guarded by a `visible` condition quietly SKIPs, so the run goes red on a step that has nothing to do with it. Terminating the app doesn't clear it either. `auth.yaml` denies the push alert at launch for this reason. For anything the template doesn't cover, answer it once at the simulator level and stop wiping it:

```bash
xcrun simctl privacy booted grant location <bundle-id>
```

If one is already stuck on screen, `xcrun simctl shutdown booted` and boot again. Nothing short of a reboot clears it.

### An assert fails on copy you can see in the screenshot

Only `Host` roots and real controls reach the accessibility tree. A bare `@expo/ui` `Text` reaches it by neither `testID` nor copy, so an `assertVisible` against one fails while the words sit there in the failure screenshot. `HelperText` is the usual one to trip over. Assert the screen's `Host` id or a control next to the copy instead. To see exactly what a step had to work with, read the hierarchy Maestro dumps beside the screenshot:

```bash
ls ~/.maestro/tests/<run>/<flow>/screen-hierarchy/
```

### `scrollUntilVisible` reports `COMPLETED` but the list never moved

Maestro matches against the accessibility tree, which holds rows the screen isn't showing, so the scroll "succeeds" without moving and the tap that follows lands on whatever is actually under those coordinates. Same root cause as the tap failures in the next section. An `@expo/ui` `Host` renders a real SwiftUI list, and Maestro is driving pixels. Tapping a row that is genuinely on screen doesn't help, the tap still doesn't register. Before filing a navigation regression, tap the same row by hand on the simulator. If it opens, the app is fine and the flow is the thing to change.

### Taps report `COMPLETED` but sign-in never fires

On locally-built dev clients, Maestro's synthetic taps on the `@expo/ui` SwiftUI submit button can complete without the handler firing. The native field renders the text, but the change never reaches React state. No network call leaves the app and Convex logs stay empty. This is XCTest/SwiftUI bridge flakiness, not an app bug. Check the backend on its own with a raw HTTP sign-in against `https://<deployment>.convex.site/api/auth/sign-in/email`, which should return 200 and a session token. The supported e2e target is EAS release builds through `e2e-tests.yml`. Ad-hoc flows have to keep the template's input workarounds. Reveal password visibility to dodge iOS strong-password autofill, and never use `hideKeyboard`.

## "doctor says X"

`npx vexpo doctor` maps most warnings straight to their fix:

- `convex / login` failed: `npx convex login`
- `eas / signed-in` warns: `npx eas-cli login`
- `eas / asc-integration` not connected: `npx vexpo asc connect`
- `eas / asc-submit-id` missing `ascAppId`: `npx vexpo asc connect`, then commit `eas.json`
- `apple / asc-key-valid` skipped: `npx vexpo apple asc-key` to cache and validate a key
- `apple / services-id-exists` not found: `npx vexpo apple services-id` to provision it
