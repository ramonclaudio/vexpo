# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pre-1.0, the minor version bumps for breaking changes and the patch for everything else.

## [Unreleased]

- Add `vite` to the template's devDependencies. vitest 5 moved it to a peer dependency and the template's `.npmrc` sets `legacy-peer-deps`, so a fresh scaffold installed without it. `npm test` failed at startup with `Cannot find package 'vite'`, and `tsc` failed on the `vite/client` reference in the Convex tests. Inside this repo both passed, because the root install had a copy to fall back on.
- Drop the leading blank line in `.maestro/links.yaml`. It was the only flow file that started blank, so a fresh scaffold failed its own `npm run format:check`.
- Remove 1,012 comment lines across the template and both packages. What stays is the tooling directives and one line each for a trap someone would otherwise walk into, like `expo-image` ignoring `accessibilityLabel` without `accessible`.
- Use American spellings in the source. `colour`, `grey`, `labelled` and `recognise` were in comments, test names and the accessibility notes Apple reads.
- Rewrite all nine READMEs and every entry in this changelog as short bullets and plain sentences.
- Make the whole row tappable on `CapsuleRowButton`, the settings profile row and the search results. A SwiftUI `Button` only responds where it draws something, so the gap between the label and the chevron took the tap.
- Add `contentShape` to `CapsuleButton` and the resend row on the code screen too. Both had dead bands above and below the label.
- Add `__tests__/lib/hit-area.test.ts`, which reads the source for buttons missing `contentShape`.
- Tap the Debug row by id in `screens.yaml`. A tap by visible text goes to the label, which is why the flows never caught the dead rows.
- Cover forgot password, reset password and the linked screen in the flows. `links.yaml` opens the first two by deep link, and `screens.yaml` reaches the linked screen and turns the debug preference on before it taps the Debug row.
- Leave `+not-found` uncovered on purpose. `+native-intent.tsx` sends every unknown path to the root.
- Run the flows on the simulator the app was installed on. `smoke.mjs` handed `maestro test` no device, so a run after a clean build could pick a different one and fail with "Package com.vexpo.smoke is not installed".
- Exclude `.smoke-build` and `dist` from the published scaffolder. A local `npm run smoke` left 3GB there and the tarball packed at 1.2GB.
- Write the smoke flow's screenshot somewhere that survives the run. Maestro 2.8 deletes its artifact folder on a pass, so `scripts/e2e.mjs` sets `--debug-output` to `.maestro/debug`, the path the job already uploads.
- Exclude `.maestro/debug` from the scaffolder payload and assert that in the e2e. A local e2e run was leaving the screenshot and command log in every new project.
- Replace the glyphs in `vexpo doctor` and `vexpo env push` with the `ok`, `!!`, `xx` and `--` tags. Most screen readers read a check mark and a ballot x as nothing, so a pass and a fail sounded the same. Three tests pin it.
- Use the same tags in `create-vexpo`. Every scaffold step ended on a check mark, a cross or a warning sign, and the name prompt's validation error started with the cross.
- Use one accessibility hint per field across sign in, sign up and the profile. The email field had four wordings, the username three and the new password three.
- Raise the verification code field's Dynamic Type cap from xxLarge to AX3, so it meets Apple's Larger Text bar. The tracking between the six digits narrows as the size climbs. The fit is arithmetic and has not been measured on a device.
- Announce when the app is back online, not only when it goes offline.
- Make the debug screen's download bar announce its own percentage. The JavaScript side cannot see whether SwiftUI's value survives the `@expo/ui` bridge.
- Fix three rows in `docs/accessibility-audit.md` that said pass and were wrong. Larger Text, the VoiceOver banner row and the state row.
- Pull every Apple accessibility and nutrition label doc, 425 pages, into `refs/xcode-docs` and check the repo against it. `docs/accessibility-audit.md` lists one Apple rule per row with the file and line that satisfies it.
- Fix two Voice Control input labels that did not match the visible text. The revoke button and the guest avatar row now answer to what you can read on them.
- Add `vexpo asc accessibility url` to read and write the App Store accessibility link. Pass a URL to set it and `--clear` to remove it. It rejects anything that is not https.
- Note in `accessibility.config.json` that an app set to Dark under a Light system flashes white on launch. `userInterfaceStyle` is automatic and the in-app preference runs later, in JavaScript.
- Give the avatar row a hint and Voice Control input labels. Its `accessibilityLabel` on the container replaced what its children said, so VoiceOver never read the name or email.
- Announce "Revoking session..." when a session is revoked. Nothing read it before.
- Add `SectionLabel` headings to the three settings groups, so the headings rotor has something on that screen. `auth.yaml` and `guest.yaml` now scroll to the sign-out row.
- Add `contentShape` to Go Home, Skip, Cancel and Back to sign in. Those four plain-style buttons only responded on their glyphs.
- Move the widget's detail color into `constants/theme.ts`. The hard-coded `#8E8E93` was 3.26:1 on a light widget and the contrast test never saw it.
- Route the error boundary's announcement through `announce` in `lib/a11y.ts`.
- **Breaking:** match `accessibility.config.json` and `vexpo asc accessibility lint` to Apple's `AccessibilityDeclaration`, nine booleans plus a device family. The old four-level enum does not exist in the API, and `lint` rejects the old `features` map, so a project scaffolded before this release has to rewrite `app-store/accessibility.config.json` to the new shape. The template's copy is the reference. The linter also rejects a feature the device family does not have.
- Add `vexpo asc accessibility push` to send the declaration. `--dry-run` prints the plan, `--publish` moves the draft onto the App Store page, and a published declaration is reported instead of attempted. Every push sends all nine booleans.
- Measure non-text contrast in the contrast test, six control pairings at 3:1 next to the twelve text ones. `contrastRatio` blends a see-through color with what is behind it.
- Stop the `create-vexpo` spinner repainting for screen readers and `TERM=dumb`. It follows the same opt-outs color does and falls back to one plain line. `TERM=dumb` also stops getting color escapes, and `section()` no longer draws a box-drawing rule off a terminal. Eight new tests.
- Gate the colors in the template's `scripts/clean.mjs` the same way, with the `ok`, `xx`, `!!` and `--` tags.
- Document the accessibility rules in the template README. It has `useDynamicFont`, the color tokens and contrast test, `fail()` and `succeed()`, when to override SwiftUI's labels, and `accessible` on an `expo-image` `Image`.
- Drop `tertiaryLabel` from the palette. It was 2.58:1 in light and 4.18:1 in dark, under the 4.5:1 WCAG AA asks for. `__tests__/lib/contrast.test.ts` measures twelve pairs across all four appearances.
- Stop pinning a point size on the tab labels. A fixed `fontSize` on a native tab label opts it out of Dynamic Type.
- Say what backs each feature in the accessibility declaration note, and that all of it was verified statically. `app-store/README.md` notes that nothing ships the declaration automatically.
- Stop `vexpo` writing color when stderr is not a terminal or `NO_COLOR` is set. The `ok`, `xx`, `!!` and `--` tags keep the meaning with the escapes off.

- Announce every error every time it happens. `StatusText` announced from an effect keyed on the message, so a repeated identical error was silent. The announcement moved to `fail()`, every raise site goes through it, and `form-result.test.ts` covers the repeat.
- Announce success once. `succeed()` and `SuccessText` both announced, so saving a profile spoke twice. The email change branch now announces the verify step it opens.
- Stop a successful account delete firing the error haptic. `useSignOutMutation` buzzed on entry, before the Face ID gate.
- Add `accessibilityState` to the Apple button, so VoiceOver says when it is disabled.
- Scale the widget text with Larger Text. Its two rows passed `font({ size })` with no text style, which is a fixed size.
- Add a `hint` to `CapsuleRowButton` and use it on the five rows that open the Settings app or a support link.
- Drop three `accessibilityLabel`s on images that did nothing. expo-image ignores a label without `accessible`, and none of the three should be read anyway.

- Drop every runtime dependency from `npx create-vexpo`. execa, kleur, ora and prompts brought 31 packages. `tty.ts` handles colors, the spinner and the prompt in 87 lines, and `proc.ts` returns an exit code in 27.
- Run knip over the template. `knip.json` ignored `templates/**`, so 12,000 lines shipped with no dead-code check. The knip job installs the template's dependencies first, about 45 seconds on a job that was 14.
- Remove 1,454 lines of duplication across 152 files. The tests shared temp-directory fixtures, process stubs, push-token seeding and auth env setup. 48 hand-cast mocks moved to `vi.mocked`, which caught a bad fixture in `deep-link.test.ts`.
- Share the linters' guards, declare the six setup flags once, publish both packages in one release step, draw the app icon through one `BrandIcon`, and move the Maestro flows onto four shared subflows.

- Test every Convex function, 31 of 31, up from 16. 205 tests, up from 164.
- Cover help, debug and change-password in `.maestro/screens.yaml`. `linked`, `forgot-password` and `reset-password` stay out because they are deep-link-only and expo-dev-launcher claims the scheme on a development build.
- Go through the search tab and back out of sign-up with "Not now" in `guest.yaml`.
- Document two Maestro traps in `docs/troubleshooting.md`. A `testID` on a `Text` never shows up in Maestro with `@expo/ui`, and the deep-link alert needs a simulator reboot.

- Catch the template up to the SDK 57 patch matrix, with `expo` 57.0.21, `expo-updates` 57.0.21, `expo-router` 57.0.20, `expo-dev-client` 57.0.18, `@expo/ui` 57.0.17 and the other `expo-*` packages. `expo-doctor` passes 21/21.
- Move the toolchain to `vitest` 5 and `oxfmt` 0.66 in both trees, with `@vitest/coverage-v8` 5 alongside it, and re-pin the codeql, release and scorecard actions.
- Leave the fourteen advisories in the template lockfile. Three are `decode-uri-component` under `expo-router`, whose fix is pure ESM and would break the install. The other eleven are `uuid` under `xcode`, which never ends up in the app binary.

- Keep `.disabled()` on the prominent button whatever the caller passes. It emitted `disabled ?? false` on every render, so leaving the prop off overrode an inherited disabled state rather than picking it up. Welcome, the error boundary and `+not-found` all leave it off.

- Verify the webhook and push payloads instead of casting them. `withWebhook` took its type from the caller and got there with `JSON.parse(rawBody) as T`, so a verified sender could still send the wrong shape. Options carry a `parse` now, and a body that fails it gets a 400 before the handler runs. `pushSender` checks the Expo tickets and receipts the same way.
- Give the sessions load a stable identity with `useCallback`. The effect captured the first render of `load`, which works only while it closes over nothing but setters. `useNetwork` moves its settle-flag reset into the cleanup that already clears the timer.
- Cache the iOS build in CI and skip it when nothing native changed. The job took 22 minutes and `xcodebuild` was 15 of them, on pull requests that mostly never touch native code. Derived data moves to `.smoke-build` next to the native project, and CI keys the cache on `package-lock.json` and `app.config.ts`.
- Derive the details indent in `vexpo doctor` from the tag width. The severity tag went from one character to two and the line under it was a hardcoded seven spaces.

- Add a home screen widget. `src/widgets/status-widget.tsx` is `@expo/ui/swift-ui` components with a `'widget'` directive, so the layout is TypeScript rather than Swift, and `use-widget-sync.ts` sends a new snapshot whenever auth state changes. Prebuild puts the app group entitlement on both targets, so the dev variant gets its own.
- Report startup metrics with `expo-observe`. `ObserveRoot` wraps the root layout and `markInteractive()` fires in the same effect that hides the splash, so Time to First Render and Time to Interactive both land. Release builds only.
- Install the dev and production builds side by side. `APP_VARIANT` was read in `app.config.ts` and written nowhere, so a dev build and a TestFlight build collided on device. The dev scripts and the EAS `development` profile set it now, and it adds `.dev` to the bundle id and the URL scheme and `(Dev)` to the name.
- Add `npm run atlas`, `atlas:export` and `repack`. Atlas serves the bundle explorer in production mode, and repack puts a fresh JS bundle into a build you already have, so a JS-only change can be checked against a real signed binary without another EAS build.
- Add `vexpo testflight feedback` and `vexpo testflight crashes`. Both print the date, tester email, device, OS and comment, newest first. Reading what a tester sent used to mean opening App Store Connect.
- Add `.eas/workflows/register-device.yml`. It pauses on an Apple device registration request, shows a QR code on the run page, then builds `development:device` with a refreshed provisioning profile.
- Add `npx vexpo convex --eas` for an EAS-managed Convex team. Creating a project directly fails there with `is managed by oauth:...`, so this runs `eas integrations:convex:connect` and carries on with the rest of setup. It reads `eas integrations:convex:project` first and stops if the app already has one.
- Ship a `.mcp.json` pointing at the Expo MCP server, and point the README at Expo Skills. A fresh scaffold had no agent config at all.
- Gate the rollout and the store submit on approval. `rollout.yml` is three jobs now, publish, wait, then take it to 100%, and `deploy-production.yml` waits between the build and the submit. `development-builds.yml` is gone, since it did what `npm run eas:dev` already does from a terminal.
- Run `vexpo rebrand` during the scaffold, so the first commit carries your identity instead of the template's. It skips under `-y`, `--no-install`, the new `--no-brand`, and anything without a TTY.

- Add guest mode. "Continue as guest" on the sign-in screen creates a real Better Auth session through the anonymous plugin, so every `authQuery` and `authMutation` works with no branching. `GUEST_MODE=false` on the Convex deployment turns it off.
- Move a guest's bio, avatar and push tokens to the account on sign-up or sign-in. `users.mergeGuestData` runs in Better Auth's `onLinkAccount` and never overwrites. The name stays on the sign-up form, pre-filled.
- Sweep abandoned guests daily with `purgeAbandonedGuests`. A guest is gone after `session.expiresIn` (7 days) of idle. Leaving guest mode from settings purges on the spot.
- Give a guest the profile screen minus username and email. The avatar header shows "Tap to add a photo" instead of the placeholder address.
- Add a `hasAccount` guard for sessions and password change. Settings gets a "Create an account" row and one "Discard guest data" action. `useAuthStatus` is the one place that reads the difference.
- Delete the `users` row, the avatar blob and the push tokens when an account is hard-deleted. `purgeUser` skipped the `user.onDelete` trigger, so every purge left an orphan row. Both paths call `purgeAppUser` now.
- Re-fetch the Convex JWT when a guest becomes an account. `useBetterAuthForConvex` keyed `fetchAccessToken` on nothing, so Convex kept the guest's token and the profile card stayed on "Loading...". It keys on the user id now.
- Move the guest sign-in copy out of the hook as `guestSignInError`, with a test. The rate-limit line says "wait" because guests share an IP behind a NAT.
- Test `use-theme`'s `setTheme`. "system" has to go to UIKit as `unspecified`, or choosing System pins the app to the last scheme.
- Test `useAuthStatus` and `dismissAuth`. An account from before the anonymous plugin has no `isAnonymous` field, so anything but exactly `true` reads as an account.
- Add `.maestro/guest-mode-off.yaml`, which asserts both entry points lose the button. It is off the suite list because it only means anything against a deployment with the flag set.
- Add `.maestro/guest.yaml`. Its first run caught the JWT bug, the profile screen behind the wrong guard, and the placeholder email in the header. It runs first in the suite and has no Face ID gate, so it runs on EAS.

## [0.3.3] - 2026-08-30

- Pass the Maestro suite end to end, 4/4 locally on iPhone 17 and iOS 26.5, 3/3 on EAS on iPhone 16 and iOS 18.3.
- Run `auth.yaml` first from `scripts/e2e.mjs`. Maestro plans a folder in reverse alphabetical order, so it ran last.
- Turn the dev menu off through the `EXDevMenu*` defaults in `scripts/e2e.mjs`. Its sheet opened 13 seconds into every relaunch and blocked every screen id.
- Enroll a biometric and answer the Face ID prompt in `scripts/e2e.mjs`, so the delete step runs unattended.
- Fix three flow bugs. `launch.yaml` only took a screenshot, the search dismiss reads `Close` or `Cancel` depending on the simulator, and the edge swipe back does not register everywhere.
- Build the EAS end-to-end job from a new `preview:simulator` profile. The development profile came up on the server picker with no Metro.
- Keep `zz-delete-restore.yaml` local. The EAS simulator has no enrolled biometric.
- Assert the privacy rows in `tour.yaml` instead of the disclaimer, which an inner `Text` never exposes to Maestro.
- Add two findings to `docs/troubleshooting.md`. Copy in a screenshot is not always matchable, and a flow run alone starts signed out.
- Rename the template's Vitest config to `vitest.config.mts`, which drops the CommonJS deprecation warning on every `npm run test`.
- Move six field handlers and `setNativeValue` from `runOnJS` and `runOnUI` to `scheduleOnRN` and `scheduleOnUI`, which Reanimated 4 renamed.
- Keep the cross-fade into onboarding under Reduce Motion. Both branches were already opacity only.
- Build the banner animations once at module scope instead of on every render.
- Animate the onboarding progress bar and the sessions list at 200ms ease-out, with a jump under Reduce Motion. A `toSeconds` helper is next to the `Duration` tokens because `@expo/ui` measures in seconds.
- Use the platform push transition on both stacks. The forced `slide_from_right` and `fade_from_bottom` broke the back swipe.
- Slide the offline and update banners in and out through an `Animated.View`, 200ms in and 150ms out. `@expo/ui` has no `transition` modifier. Reduce Motion keeps the cross-fade.
- Fire haptics on outcomes and value changes only. 35 `haptics.light()` calls on plain taps are gone, four moved to `selection()`, and tab presses lost theirs.
- Fix profile photo uploads, broken since SDK 56. `expo/fetch` replaced the `Content-Type` with the blob's empty type, so Convex answered `400 BadHeader`. The upload sends `arrayBuffer()` bytes now.
- Retry a failed `/convex/token` call three times with backoff, and only return `null` on a 4xx. A phone coming back from lock stayed on the profile skeleton after one dropped request.
- Catch the template up to the SDK 57 patch matrix, with `expo` 57.0.18, `expo-router` 57.0.17, `expo-updates` 57.0.19, `@expo/ui` 57.0.14, `react-native` 0.86.3 and twelve more. `expo-doctor` passes 21/21. The toolchain moves to `oxlint` 1.80 and `oxfmt` 0.65.
- Hold `better-auth` and `@better-auth/expo` at 1.6.23. `@convex-dev/better-auth@0.12.5` declares `better-auth <1.7.0`.
- Leave the eleven moderate advisories in the template lockfile. All trace to `uuid` under `xcode`, which never ends up in the app binary. The `image-size` root under Metro is gone.

## [0.3.2] - 2026-08-23

- Send a fresh code and open the verify screen when someone signs in with an unverified account, or signs up again with the same address. Better Auth answered with a bare 403 before. Neither path reveals whether the address exists. Lite-mode scaffolds don't change.
- Say a username is taken and focus the field, instead of the generic "different email or username" line.
- Map Apple sign-in errors to plain English through `appleErrorMessage`. The red row was showing a Swift exception with a file and line. Cancel stays a no-op and a 429 says to wait.
- Forward Apple's `givenName` and `familyName` on `signIn.social`. Apple sends the name once and never again.
- Test native Sign in with Apple over the Better Auth HTTP routes, with a locally signed ES256 token and Apple's JWKS stubbed. `jose` is a declared devDependency now.
- Stop showing raw transport errors. Four catch blocks showed `Error.message`, so a dropped connection put "Network request failed" under the form. `formatError` gives everything but a ConvexError one plain line.
- Document two Maestro traps in `docs/troubleshooting.md`. `clearState: true` re-raises the first permission alert, and `scrollUntilVisible` reports COMPLETED without moving.
- Pin `convex-helpers` exact and move the pair to `convex@~1.45.0` with `convex-helpers@0.1.123`. A fresh scaffold now passes strict peer resolution.
- Catch the template up to the SDK 57 patch matrix, with expo and expo-router at 57.0.15, expo-updates 57.0.16, `@expo/ui` 57.0.12 and eleven more.
- Bump oxlint 1.79, oxfmt 0.64, vitest 4.1.11, knip 6.32 and convex-test 0.0.56, and refresh the template's Convex codegen output.
- Turn off the four react rules new in oxlint 1.79. They misfire on the worklets, the sessions mount fetch and Convex's `useAuth` prop.
- Bump nanoid 3.3.18 and postcss 8.5.26 in the template lockfile.
- Bump nanoid to 3.3.18 in the toolchain lockfile. The low esbuild advisory stays because the fix is a major.
- Say why the pod plugin isn't redundant in `plugins/README.md`, and fix the typescript range the pinning docs quoted.
- Rewrite the CLI help, the next-steps block and `.env.example`. The "~60 seconds" claim is gone because nothing measured it.
- Rewrite every README and guide as sentences.

## [0.3.1] - 2026-07-31

- Run `create-vexpo` on execa 10.
- Ship oxfmt 0.61 in template scaffolds. `^0.58.0` never allows 0.61.
- Refresh convex 1.42.3, `@convex-dev/resend` 0.2.6, `@types/react` 19.2.18 and oxlint 1.76.
- Build the CLI on TypeScript 7.0.2, with knip 6.30, oxfmt 0.61 and oxlint 1.76. The template stays on TypeScript 6.0.3, which SDK 57 pins.
- Hold `better-auth` and `@better-auth/expo` at 1.6.23, pinned exact. 1.6.24 drops every plugin action off the client type under TypeScript 6.
- Re-pin the five GitHub Actions and check every SHA against its tag. That caught a setup-node pin labeled v6 pointing at v7.

## [0.3.0] - 2026-07-30

- Stop `create-vexpo` reflowing `eas.json` on every scaffold, so a fresh scaffold passes `npm run format:check`. The scaffold e2e runs oxfmt over a whole project now.
- Ship `store.config.json` from a tracked `store.config.example.json`. The working copy is gitignored, so the release runner had nothing to copy. `vexpo rebrand` rewrites both.
- Declare `engines.node >= 22.12` in the template. It was documented as Node 20 and enforced nowhere.
- Patch postcss 8.5.25, nanoid and brace-expansion 5.0.9 in the lockfiles. The eleven moderates stay because npm's fix is a downgrade to SDK 46.
- **Breaking:** rename `scripts/clean.ts` to `scripts/clean.mjs`, and drop `scripts/_run.mjs` and the `tsx` devDependency.
- Drop six npm scripts that were plain aliases. `convex:logs`, `convex:insights`, `convex:dashboard`, `convex:codegen`, `metadata:lint` and `metadata:pull`. Run the underlying command directly.
- Declare `sf-symbols-typescript` as a devDependency. Two files import it and it only worked because npm happened to put it at the top level.
- Drop the dead `Haptics` export and the `export` on `DeepLinkRoutes`.
- Warn in `.env.example` that a `CONVEX_DEPLOY_KEY` there beats `--prod` on every convex command.
- Write Maestro screenshots to `.maestro/screenshots/`, and point the flows at `npm run e2e`.
- Open the dev bundle by deep link in the auth flow. The launcher's server row never resolves on a simulator.
- Deny the push permission alert at launch in the auth flow. SpringBoard draws it outside the accessibility tree.
- Add `npm run e2e` to run the Maestro flows locally. `scripts/e2e.mjs` finds a JDK, reads the bundle id, makes up a test email, builds the deep link and resets the simulator keychain.
- Name every index `by_<field>`, the convention Convex's own `guidelines.md` states. Five of eight broke it.
- Make `pushTokens.revoked` a required boolean. A row without it matched neither of `cleanupStale`'s index ranges.
- Name the device behind the app's own sessions. iOS reports them as `<AppName>/1 CFNetwork/...`, which printed raw. `deviceLabel` moved to `src/lib/device.ts` with a test.
- Fall back to the theme's `card` color in `<Material>` under Reduce Transparency, instead of a hardcoded near-black.
- Fix the FAQ's delete-account answer. It said "permanently" where the code gives a 30-day grace window.
- Drop the Share Analytics toggle. It wrote to a preference nothing read.
- Gitignore `store.config.json`. `vexpo review-account` writes a generated password into it.
- Pass `appBundleIdentifier` in `convex/auth.ts`, so Better Auth accepts a native Sign in with Apple token.
- Strip the App Store Connect identity out of `eas.json` when `create-vexpo` scaffolds. The scaffold e2e and a gitleaks rule both guard it.
- Run the secret scan in the pre-push hook, on the pushed commits only. Without gitleaks installed the hook says so and continues.
- Skip doctor's `project-info` check when you are logged out, instead of guessing the project was deleted.
- Say "logged out" and name the fix on every eas-cli failure caused by it. The useful line was on stdout and vexpo only printed stderr.
- Fall through to the external group in `testflight invite` when an outside email hits an internal group. An explicit `--group` gets the explanation instead of a bare 409.
- Check group membership in `testflight invite` before adding a tester. Re-adding a member 409s.
- Report a pending Beta App Review as success in `testflight invite`. The tester is in the group, and Apple sends the email once a build is installable.
- **Breaking:** drop `vexpo eas`. Every part of it was eas-cli. Run `eas init` yourself or `vexpo full`, and `vexpo env push` for the env sync.
- Say in `vexpo testflight whats-new --help` when to use it. It is for a build that's already up, or a locale other than en-US.
- Print the whole group id in `testflight groups list`. The 8-character prefix 404s everywhere you paste it.
- Start Metro before the build in the template's `ios`, `ios:dev` and `ios:device` scripts, through a new `--build` flag on `scripts/dev.mjs`. The app was launching against a dead port.
- Catch template deps up to SDK 57, 34 packages, including `expo` 57.0.9, `expo-router` 57.0.9, `expo-updates` 57.0.11 and `react-native` 0.86.2. `expo-doctor` is 20/20.
- Expect a one-time runtime version bump from the two template changes above. Scripts and dependency versions are both fingerprint sources.

## [0.2.3] - 2026-07-14

- Explain the key picker in `vexpo asc connect` when the EAS key store isn't empty, and print the recovery on failure. Doctor's `asc-integration` hint matches.
- Document the two-key end state. The local `credentials/` key serves `eas.json` and CLI submits, and the EAS-managed key serves cloud auto-submits.
- Catalog the manual half of the ASC dashboard in `app-store/README.md`, split by what `metadata:push` re-pushes and what stays manual.
- Write the cached ASC key's `ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId` into the `eas.json` submit profiles from `vexpo submit` and `vexpo asc connect`. Without them a stale EAS-stored key wins silently.
- Fix `vexpo testflight invite`. Attach through `betaGroups`, drop the `apps` relationship App Store Connect rejects, and resolve the app's internal group when `--group` is omitted.
- Fix `vexpo testflight whats-new`. The localizations endpoint rejects `filter[locale]`, so the locale is matched client-side.
- Pass `--private-key-path` to Metro from the new `scripts/dev.mjs` once the OTA cert is wired. `dev`, `start` and `ios` route through it.
- Read `.env.prod` in the template's `convex:deploy`, so the dev deploy key in `.env.local` can't send a prod deploy to dev.
- Generate a real password in `vexpo review-account` when the placeholder is still in `store.config.json`, create the account on prod in the same run, and rotate an existing account's password.
- Check `eas login` in setup prerequisites and in doctor, so a logged-out eas-cli fails at the start.
- Document the Maestro limits found live. The auth flow is lite-mode-only once verification is on, and synthetic taps can miss the SwiftUI submit button on local dev clients.
- List every step from scaffold to TestFlight in the template README's Ship path, with the four human moments marked, and add a Ship path playbook to `AGENTS.md`.
- Provision the prod deployment in `vexpo resend` too, whenever a prod site URL exists.
- Stop `vexpo resend --repoint` deleting the other channel's live webhook.
- Report an unreadable Convex env as a doctor warn instead of failing every var as "not set".
- Move `releaseNotes` and `promoText` under `info.<locale>`, the shape `eas metadata:lint` accepts.
- Drop the placeholder App Review notes key on rebrand instead of blanking it. An empty string fails `eas metadata:lint`.
- Un-ignore `certs/certificate.pem` in the template `.gitignore`.
- Document in troubleshooting that editing a Resend key's permission rotates its token.
- Derive `CONVEX_DEPLOYMENT` from the deploy key's prefix in `vexpo adopt` and `vexpo lite`. eas-cli 21 writes only `CONVEX_DEPLOY_KEY` to `.env.local`.
- Stop passing `--deployment` to the Convex CLI for the deployment in `.env.local`. The flag needs a user login. Cross-deployment reads keep it.
- Extend `vexpo rebrand` to the whole scaffold. It now rewrites the `convex/env.ts` fallbacks, the README title and hero images, `.env.example` and `package-lock.json`.
- Write the bare app name as the App Store title, and keep App Review notes a user wrote.
- Run the project formatter over every file rebrand rewrites.
- Insert the `@ramonclaudio/vexpo` devDependency sorted in `create-vexpo`.
- Match DerivedData by package name, case-insensitive, in the template `clean.ts`.
- Change the deep-link test fixtures to a `test://` scheme.
- Point the README's App Attest recovery steps at the vexpo repo's removal commit.
- Add an agent setup path, with a fresh-scaffold playbook in the template `AGENTS.md`, a paste-in prompt in both READMEs, and a pointer in the next-steps output.
- Bump convex 1.42.2, oxlint 1.74, oxfmt 0.58, vitest 4.1.10, knip 6.26, tsx 4.23.1 and the codeql action pins. `expo-doctor` 20/20.

## [0.2.2] - 2026-07-08

- Put every section label and plain-text screen title in the VoiceOver Headings rotor with `accessibilityAddTraits(["isHeader"])`, and mark the update banner `updatesFrequently` while a download runs ([expo/expo#47387](https://github.com/expo/expo/pull/47387), shipped in `@expo/ui` 57.0.3).
- Flag an invalid OTP code with a destructive capsule ring via `strokeBorder`, and keep the avatar slot's footprint during upload with a dashed circle stroke ([expo/expo#47426](https://github.com/expo/expo/pull/47426), shipped in `@expo/ui` 57.0.3). Both had waited on a release since 0.1.11.
- Bump the template to Expo SDK 57.0.4. `expo install --fix` aligns 14 drifted packages, and `expo-doctor` passes 20/20.
- Bump template `better-auth` and `@better-auth/expo` to 1.6.23, `@convex-dev/better-auth` to 0.12.5, and `convex` to `~1.42.1`.

## [0.2.1] - 2026-07-03

- Fix `rebrand --force` re-runs after a rebrand whose app name had quotes or backslashes. The config markers are escape-aware now.
- Refuse the template's placeholder demo password in `vexpo review-account`.
- Point accounts whose Convex team is managed by the EAS integration at `eas integrations:convex:connect` and `vexpo adopt` when provisioning fails.
- Drop `doctor --redact`. It was an internal screenshot helper.
- Drop the unused `react-dom` and `expo-symbols` dependencies, the dead `react-dom` override, and a handful of dead exports.
- Drop 19 uncalled `expo-notifications` wrappers from `notifications.ts`.

## [0.2.0] - 2026-07-03

- **Breaking:** rename the colon commands. `asc:connect`, `asc:privacy`, `asc:accessibility` and `convex:migrate` are now `asc connect`, `asc privacy`, `asc accessibility` and `convex migrate`. `vexpo eas` is a registered command.
- **Breaking:** raise the Node floor to `>=22.12`, which `commander@15` and oxlint's platform binding require. CI tests the exact floor.
- Write Convex env values through a `0600` temp file instead of argv, including in the CI JWT rotation script.
- Cap `Retry-After` at 30s, throw the real status on exhaustion, and stop reporting a transient Resend 429 as "invalid key".
- Fail loud in the CLI plumbing. An `eas env:list` failure is distinct from an empty deployment, garbled JSON throws, spawn errors include the real cause, and ASC auth errors propagate.
- Survive quotes and backslashes in app names in `vexpo rebrand`, and make a re-run a clean no-op.
- Replace ten per-command `try/catch` copies with one error boundary in `cli.ts`.
- Share the SwiftUI form primitives across screens. The profile screen drops from 858 lines to composed sections.
- Read the native OTP field on submit so all six digits are seen, re-announce repeated errors to VoiceOver, stop notification listeners re-subscribing, and clear stale delete-account errors on retry.
- Chunk push sends at Expo's 100-message limit, enforce the webhook body cap while streaming, and count only accepted tickets as `sent`.
- Bump template `better-auth` and `@better-auth/expo` to 1.6.22 and `convex` to `~1.42.0`.
- Drop `expo-sharing`, 15 unreferenced fonts (about 2.1MB per binary), dead design tokens and the template author's LICENSE from every scaffold.
- Use the locally packed CLI in the template CI job, match npm's forced-include rules in `pack-guard`, and make a half-failed publish re-runnable.
- Fix the docs against source. The stale App Attest section is gone, CI token scopes are cataloged, and the 60-second claim is about provisioning only.

## [0.1.11] - 2026-07-02

- Move every SF Symbol onto native `font` and `dynamicTypeSize` scaling and delete the `useSymbolSize` workaround ([expo/expo#46714](https://github.com/expo/expo/pull/46714), [#46774](https://github.com/expo/expo/pull/46774)).
- Rebuild the loading skeletons on `redacted("placeholder")` so they track the live layout ([expo/expo#47269](https://github.com/expo/expo/pull/47269)).
- Redact emails, session IPs and device identifiers in the app switcher snapshot via `privacySensitive`, and mark the debug OTA status `invalidatableContent` while a check runs.
- Wire the template against released `@expo/ui` only. `accessibilityAddTraits` and `strokeBorder` stay documented until a release ships them.
- Announce async state changes to VoiceOver. The offline and update banners, username availability, OTA check outcomes and session revoke failures.
- Collapse fragmented VoiceOver stops with `accessibilityElement`, alias unspeakable Voice Control labels, and meet the 44pt touch target on every plain text button.
- Scroll the OTP, restore-account and crash screens at accessibility type sizes so no control can scale off-screen.
- Mirror the welcome hero with per-axis `scaleEffect`, settle search flicks on row boundaries with `scrollTargetBehavior("viewAligned")`, and bold the name in the home greeting.
- Anchor the `ios/` excludes in `.gitignore`, `.easignore` and the create-vexpo copy filter so a local module's `modules/*/ios` sources survive packaging.
- Skip Scorecard analysis and npm publish on forks, the same guards as [expo/expo#45782](https://github.com/expo/expo/pull/45782) and [#45859](https://github.com/expo/expo/pull/45859).

## [0.1.10] - 2026-06-30

- Upgrade the template to Expo SDK 57. React Native moves 0.85 to 0.86, `react-native-reanimated` to 4.5, `react-native-worklets` to 0.10 and `react-native-gesture-handler` to 2.32, and the `expo-asset` and `expo-status-bar` config plugins are registered. `expo-doctor` passes 20/20.

## [0.1.9] - 2026-06-30

- Fix the template's auth, which did not work out of the box. `expectAuth: true` paused the Convex socket until sign-in, so every pre-auth query hung.
- Forward the `.env.local` public identity into the `eas submit` subprocess, so it resolves the real app instead of `com.example.*`.
- Read the `apple eas-rotation-secrets` identity from saved state instead of `.env.local`, so it no longer aborts `vexpo full`.
- Stop `vexpo env push` printing raw Convex secrets in the plan, force the Convex overwrite on re-push, and exit nonzero on failure.
- Report a transient App Store Connect lookup error in `vexpo submit` instead of "no app record", keep cached step outputs on a live-check refresh, and redact identifiers in `vexpo doctor --json --redact`.
- Poll Expo push receipts on a cron so `DeviceNotRegistered` tokens get marked dead, and bundle the brand icons in OTA updates.
- Cut the unwired App Attest stack to a documented optional add-on, and drop the `fingerprint:diff` CI job that failed on every scaffold.
- Patch the `shell-quote`, esbuild and `@babel/core` advisories in the template tooling, and update Convex, Better Auth and Resend to the latest SDK 56 compatible versions.
- Harden CI. SHA-pin every action, add `dependency-review`, OpenSSF Scorecard, a Dependabot cooldown, a Node 20/22/24 matrix, an `npm pack` guard and a `knip` gate.
- Slim the CLI by collapsing duplicated helpers, rewrite `CONTRIBUTING` around an issue-first flow with `npm run validate` and a pre-push hook, and add issue forms, a PR template and a troubleshooting guide.

## [0.1.8] - 2026-06-24

- Pass `--team` to Convex when `CONVEX_TEAM` is set, so `vexpo lite` and `full` stop dying on the raw `(Team:)` prompt in CI.
- Exclude `.env.convex.local` from the `create-vexpo` payload, like `.env.local` and `.env.prod`.
- Add tests for the `lite` and `full` setup engine (`runSetup`), covering the scope matrix, step ordering, `--plan` and `--dry-run`, and the failure path.
- Bring the suite to 540 tests, 391 vexpo unit, 113 template, 16 cli e2e and 20 scaffold e2e, plus the opt-in live suites.

## [0.1.7] - 2026-06-24

- Fail an EAS build that is missing `EXPO_PUBLIC_CONVEX_URL` or `EXPO_PUBLIC_CONVEX_SITE_URL`. A binary without them crashes at launch, which got the app rejected at App Review once.
- Invoke eas-cli as `npx eas-cli` everywhere. Bare `npx eas` can't resolve the binary without a local eas-cli, which turned doctor's EAS checks into false negatives.
- Report App Store Connect's real 403 cause, a missing or expired agreement, instead of always saying "key role insufficient".
- Add a gitignored `credentials/` staging dir for one-time Apple `.p8` downloads. `vexpo apple asc-key`, `jwt` and `eas-rotation-secrets` default to it.
- Write `ascAppId` into `eas.json` from a headless `asc:connect`, so CI runs aren't blocked on the interactive wizard.
- Add `vexpo submit`, a non-interactive TestFlight or App Store submit that uses the cached ASC key and runs `eas submit --latest`.
- Route the versioned `BETTER_AUTH_SECRETS` through `env push`, so rotating the auth secret doesn't sign every session out.
- Add a gitleaks pre-commit config and a CI secret-scan job, give each CI job the smallest `permissions` it needs, and pin third-party actions to commit SHAs.
- Bump the SDK 56 dep matrix (`expo` 56.0.12, `@expo/ui` 56.0.18, `expo-router` 56.2.11 and more). Fresh scaffolds pass `expo-doctor` 21/21.
- Fix stale Resend webhook comments. The management API reads the signing secret back now.
- Bring the suite to 524 tests, 377 vexpo unit, 113 template, 14 cli e2e and 20 scaffold e2e, plus the opt-in live suites.

## [0.1.6] - 2026-06-24

- Drop `execa`, `kleur`, `ora`, `prompts` and `@types/prompts` from the `vexpo` CLI. Nothing imported them since 0.1.0.
- Route every `eas` invocation through the `eas-cli.ts` helpers. Five interactive spawns and seven text-parsing calls dropped their inline duplication.
- Drop dead weight. The unused `src/index.ts` constants module, a stale `runResendRepoint` export, the template's `@vitest/ui` devDep, a bad `tsconfig` exclude, and the dead `test:all` and `test:template` scripts.
- Drop the unused `EXPO_PUBLIC_HEAD_ORIGIN` read from `app.config.ts`.
- Document `rotateKeys` in `convex/auth.ts` as a manual ops tool, not a cron. It deletes the whole JWKS with no grace period.
- Move `SECURITY.md` to the repo root and demo media to `.github/assets/`.
- Split the deep reference docs into a gitignored `.dev/`, and rewrite the READMEs in plain voice.
- Bump the template's `@ramonclaudio/vexpo` floor to track the release.
- Bring the suite to 513 tests, 366 vexpo unit, 113 template, 14 cli e2e and 20 scaffold e2e, plus the opt-in live suites.

## [0.1.5] - 2026-06-12

- Stop `doctor` reporting false warnings when `FORCE_COLOR` is set. eas-cli wrapped its output in ANSI codes and every parser missed, so `run()` forces color off for any subprocess it parses.
- Write `ascAppId` into `eas.json` on the already-connected `asc:connect` path too. The early return left doctor telling you to run a command that changed nothing.
- Add `doctor --redact` to mask identifying values with `<placeholder>` labels for screenshots and issue reports.
- Point the doctor `asc-submit-id` hint at `vexpo asc:connect`, not the nonexistent `vexpo asc`.
- Generate a random e2e password per run in the template's `e2e-tests.yml`.
- Add demo media to the READMEs, an app tour GIF, a `vexpo doctor` GIF and a light and dark screenshot strip.
- Bring the suite to 513 tests, 366 vexpo unit, 113 template, 14 cli e2e and 20 scaffold e2e, plus the opt-in live suites.

## [0.1.4] - 2026-06-12

- Run `vexpo rebrand` non-interactively with the identity flags plus `--yes`. The TTY guard fired before the flags were read.
- Sync a rebrand's bundle id into `.env.local` and Convex env. A value written by a prior `lite` shadowed the new one forever.
- Defer `asc:connect` with guidance when no ASC app record exists yet, instead of dying on "Found 0 app(s)".
- Stop `vexpo env push` stamping the accounts setup cache, which made a later `vexpo full` skip the account walkthrough.
- Route `REQUIRE_EMAIL_VERIFICATION` through `env push` so it survives a restore on a new machine.
- Default the rotate-JWT prompt to No when Apple Sign In is healthy, and report a lite-tier `.env.local` as `partial (lite)` instead of `missing`.
- Point `.env.example` at the real `npx vexpo` commands. Every `npm run setup*` script it referenced no longer exists.
- Point the doctor `asc-submit-id` hint at `vexpo asc:connect`.
- Wire the welcome screen's first-launch gate. The onboarding flow existed and nothing navigated to it.
- Fix the dev menu's "Clear Secure Storage". It deleted keys Better Auth never writes, so the session survived.
- Persist the privacy screen's Share Analytics toggle, and announce lite-mode redirects on the email auth screens.
- Match the sign-up subtitle to lite mode. It promised a verification code that never sends.
- Say why the sessions screen needs a fresh sign-in. Better Auth only lists sessions if you signed in within the last ten minutes, and the old copy blamed the connection.
- Wrap the restore-account action in a transition so the Restore button disables during the call.
- Print the stderr tail and the manual install hint when a create-vexpo install fails, and skip the initial commit when install failed or git has no identity.
- Add a 20-case scaffold e2e for create-vexpo. It checks name rewrite, dotfile restore, git init, flag variants, scoped-name rejection and payload shape.
- Add three Maestro flows against the live dev deployment. They run the full auth journey, the signed-in app tour, and account delete and restore through the Face ID gate. `e2e-tests.yml` makes up a unique test email per run.
- Fix the Maestro local-run docs. `appId` reads `MAESTRO_APP_ID`, which only EAS injects.
- Drop dead code across the CLI and template. That is unused ASC API sub-clients, `verifyOrInvalidate`, unreachable options, dead e2e fixtures, uncalled convex endpoints, unused rate buckets, `ConvexErrorView` and the stale `Material` constant.
- Rewrite the READMEs around the built-on-EAS story, and fix every doc claim the full-repo audit found drifted.
- Bring the suite to 506 tests, 359 vexpo unit, 113 template, 14 cli e2e and 20 scaffold e2e, plus the opt-in live suites.

## [0.1.3] - 2026-06-11

- Make the Apple Team id optional in `lite`. Enter at the prompt skips it, and `vexpo full` still asks when Apple provisioning needs it. `resolveTeamIdInput` has tests.
- Bump the template to the SDK 56 patch matrix (`expo` 56.0.11, `@expo/ui` 56.0.17, `expo-router` 56.2.10 and 14 more). Fresh scaffolds pass `expo-doctor` 21/21.
- Reject scoped names in `create-vexpo`. `@scope/pkg` scaffolded into a nested `@scope/` directory.
- Fix the docs to match the CLI. The README named a `vexpo setup` command that doesn't exist, and `adopt`, `convex:migrate`, `env convex-key` and `asc:connect` were missing from the reference.
- Bring the suite to 480 tests, 353 vexpo unit, 113 template and 14 e2e.

## [0.1.2] - 2026-06-10

- Pin the template's `convex` to `~1.40.0`. `^1.40.0` floated to 1.41.0, whose new `transactionLimits` param breaks the `convex/http.ts` typecheck against `@convex-dev/resend@0.2.4`. Widen it back once resend accepts 1.41.

## [0.1.1] - 2026-06-10

Scope narrowed to 0 to 1. Every command must help an empty directory reach a first shipped iOS app. Post-launch ops are out.

- Scale template typography with native iOS Dynamic Type through `textStyle` on the `font` modifier (upstream `expo/expo#46007`).
- Cap Dynamic Type with `dynamicTypeSize` on the seven controls that clip instead of wrapping (upstream `expo/expo#46540`, shipped in `@expo/ui` 56.0.16). SF Symbols sized in JS get a 1.6x cap until `expo/expo#46714` lands.
- Hide 30 decorative SF Symbols and skeleton placeholders from VoiceOver with `accessibilityHidden(true)` (upstream `expo/expo#46579`, shipped in `@expo/ui` 56.0.16).
- Grow buttons and the profile card with Dynamic Type. Fixed heights become `minHeight`, so oversized text wraps instead of clipping.
- Scale the Sign in with Apple button with Dynamic Type, extracted to a shared `AppleButton`.
- Render the Preferences and not-found nav titles, the FAQ disclosure header and the error-boundary button in Geist.
- Pass an Apple HIG accessibility audit, with 44pt tap targets, WCAG AA contrast for the status tokens plus a new `warning` token, VoiceOver labels on progress indicators, native press and focus on the avatar controls, and safe-area insets on the error screen.
- Tag the testable surface with stable `testID`s for Maestro and XCUITest, which `@expo/ui` maps to `accessibilityIdentifier` (upstream `expo/expo#46556`). 189 unique ids plus 39 per-item dynamic ones. Ten content and state wrappers forward a `testID` prop. expo-router's native nav-config components can't take an id.
- Drop the optional profile-photo upload from the sign-up form. Set a photo from the profile editor after signing in.
- Add App Attest device attestation via `@expo/app-integrity`, verified server-side in Convex.
- Add account soft-delete with a 30-day grace window, a restore-or-confirm screen on next sign-in, and Apple Sign In token revocation on delete.
- Add the server-side push sender in Convex and push-token cleanup on sign-out and delete.
- Code-sign OTA updates end to end, with the cert from `npm run updates:gen-cert`.
- Add `adopt`, which finishes a project created by `eas integrations:convex:connect` on the existing dev deployment.
- Add `convex:migrate`, which copies server-side Convex env from another deployment onto the current one.
- Add `env convex-key`, which syncs the Convex deploy key and deployment selector to EAS env.
- Add `asc:privacy` and `asc:accessibility` show and lint for the nutrition labels Apple requires before review.
- Add `asc:connect`, which links the EAS project to its App Store Connect app so `eas submit` resolves the app from the bundle id.
- Drop `reviews`, `sandbox`, `asc:version` and `asc:submissions`. All are post-launch ops.
- Drop `testflight remove` and the beta-group `--public-link` options.
- Drop the `doctor` reviews-answered check and about 60 lines of unused TestFlight lib.
- Switch the template's `pr-preview`, Maestro E2E and `deploy-production` workflows to manual `workflow_dispatch`, so a merge to `main` can't build and ship by surprise.
- Fix the `doctor` resend webhook check to flag the wrong-account case.
- Drop dead `$schema` refs from `privacy.config.json` and `accessibility.config.json`.
- Drop the template's `package-lock.json` from the create-vexpo tarball. The committed lock froze `@ramonclaudio/vexpo` at the previous release.
- Ship the template's `.npmrc` as `_npmrc` and restore it at scaffold time, since npm strips dotfiles from tarballs.
- Update the SDK 56 dependency set, with `expo` 56.0.9, `@expo/ui` 56.0.16, `better-auth` and `@better-auth/expo` 1.6.16, `@convex-dev/better-auth` 0.12.3, and the dev toolchain. `convex` holds at 1.40.0 because 1.41.0 breaks `@convex-dev/resend` 0.2.4's types. The React Native packages stay on the SDK 56 native matrix.
- Bump the CLI's `commander` to 15 and the root dev tooling (`oxlint` 1.68.0, `oxfmt` 0.54.0).
- Bump CI to `actions/checkout@v6`, `actions/setup-node@v6`, `softprops/action-gh-release@v3` and Node 22.
- Bring the suite to 475 tests, 348 vexpo unit, 113 template and 14 e2e.

## [0.1.0] - 2026-05-11

First public release.

- Ship `@ramonclaudio/create-vexpo@0.1.0`, the npm scaffolder. `npm create @ramonclaudio/vexpo@latest my-app` copies the template, rewrites `package.json`, runs install and inits git.
- Ship `@ramonclaudio/vexpo@0.1.0`, the operational CLI. `lite` and `full` setup, `doctor` for drift detection, the `apple` commands for Sign In with Apple, the App Store Connect endpoints `eas-cli` doesn't expose, and `env push` for multi-destination env sync.
- Ship `templates/default/`, a production-ready Expo SDK 56, Convex, Better Auth and Resend iOS app. Native SwiftUI via `@expo/ui/swift-ui`, Apple Sign In, APNs push, Universal Links, profile and sessions, an HMAC-verified webhook factory, and 10 EAS Workflows.
- Start at 277 tests, 238 vexpo unit, 29 template and 10 e2e.

See [`README.md`](./README.md) for the feature list and [`SECURITY.md`](./SECURITY.md) for the threat model.

[Unreleased]: https://github.com/ramonclaudio/vexpo/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.3.3
[0.3.2]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.3.2
[0.3.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.3.1
[0.3.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.3.0
[0.2.3]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.2.3
[0.2.2]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.2.2
[0.2.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.2.1
[0.2.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.2.0
[0.1.11]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.11
[0.1.10]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.10
[0.1.9]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.9
[0.1.8]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.8
[0.1.7]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.7
[0.1.6]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.6
[0.1.5]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.5
[0.1.4]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.4
[0.1.3]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.3
[0.1.2]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.2
[0.1.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.1
[0.1.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.0
