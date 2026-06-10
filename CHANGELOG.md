# Changelog

All notable changes to vexpo are tracked here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-10

Scope narrowed to 0 to 1: every command must help an empty directory reach a first shipped iOS app. Post-launch ops are out.

- Scale template typography with native iOS Dynamic Type (`textStyle` on the `font` modifier, upstream `expo/expo#46007`): text follows the user's Larger Text setting, rescaled by SwiftUI with no JS re-render.
- Bound Dynamic Type where layouts can't reflow (`dynamicTypeSize`, upstream `expo/expo#46540`, shipped in `@expo/ui` 56.0.16): ceilings on the seven fixed-geometry controls that clip rather than wrap at the largest accessibility sizes, three OTP fields, the segmented auth toggle, the two preference pickers, and the "This device" session badge. SF Symbols sized in JS via `useSymbolSize` get the icon analogue, a 1.6x cap, until `expo/expo#46714` lands the native path.
- Hide 30 decorative SF Symbols and skeleton placeholders from VoiceOver with `accessibilityHidden(true)` (upstream `expo/expo#46579`, shipped in `@expo/ui` 56.0.16), replacing the old `accessibilityLabel("")` workaround. Six icons VoiceOver used to announce are now silent, informative images keep their labels.
- Grow buttons and the profile card with Dynamic Type instead of clipping: fixed control heights become `minHeight`, so oversized text wraps inside the capsule rather than getting cut off at the largest accessibility sizes.
- Scale the Sign in with Apple button with Dynamic Type: Apple sizes its label to the frame height, so the button height now tracks the text setting (capped) instead of staying fixed. Extracted to a shared `AppleButton` so both auth screens get it.
- Close the last system-font gaps so in-app labels render in Geist: the Preferences and not-found nav titles, the FAQ disclosure header, and the error-boundary button.
- Pass a full Apple HIG accessibility audit: 44pt tap-target floors on secondary buttons, WCAG AA contrast for the success/destructive/muted tokens (and a new adaptive `warning` token), VoiceOver labels on progress indicators and decorative icons, native press/focus on the avatar controls, safe-area insets on the error screen, and a genuinely inert disabled state on the Apple button.
- Tag the full testable surface with stable `testID`s for Maestro and XCUITest, which `@expo/ui` maps to the native iOS `accessibilityIdentifier` (upstream `expo/expo#46556`). Beyond every interactive control (fields, submits, toggles, pickers, Apple buttons, dialog and alert actions), this covers the assertable surface: error and status messages, dynamic values (name, email, app version, OTA channel, dates), screen titles, the empty/loading/offline/update-banner state containers, the debug info rows, and a `<screen>-screen` id on each screen root for scoping. Ten content and state wrappers (`ErrorText`, `SuccessText`, `ContentUnavailable`, `LoadingScreen`, `ConvexErrorView`, the offline and update banners, the skeletons, `InfoRow`, plus the four control wrappers) forward a `testID` prop so each instance is addressable. 189 unique ids plus 39 per-item dynamic ones, across every screen and layout. Pure layout, static labels, and silenced decorative icons stay untagged on purpose; expo-router's native nav-config components (the tab triggers, back buttons, and toolbar buttons) can't take an id, their prop types don't expose `testID`. No runtime change: `testID` already resolved to `accessibilityIdentifier`.
- Drop the optional profile-photo upload from the sign-up form; set a photo from the profile editor after signing in instead. Removes the avatar picker, its dialog, and the post-verification upload from the auth flow.
- Drop `reviews`, `sandbox`, `asc:version`, and `asc:submissions`: post-launch ops that all need a live app with users (`sandbox` tests in-app purchases the template doesn't ship).
- Drop `testflight remove` and the beta-group `--public-link` options: post-launch tester management, not first-ship machinery.
- Drop the `doctor` reviews-answered check and ~60 lines of unused TestFlight lib.
- Disable the template's auto PR builds: `pr-preview` and Maestro E2E now ship as manual `workflow_dispatch` to conserve EAS build credits. Restore their `pull_request` triggers to run on every PR.
- Fix the `doctor` resend webhook check to flag the wrong-account case instead of a missing webhook.
- Drop dead `$schema` refs from the template's `privacy.config.json` and `accessibility.config.json`.
- Update the SDK 56 dependency set: `expo` 56.0.9 and the `expo-*` modules to the current SDK 56 matrix via `expo install --fix`, `@expo/ui` 56.0.16, `better-auth` and `@better-auth/expo` 1.6.16 (carries our `better-auth/better-auth#9072` operationId fix), `@convex-dev/better-auth` 0.12.3, and the dev toolchain (`vitest` 4.1.8, `oxlint` 1.68.0, `oxfmt` 0.54.0, `tsx` 4.22.4). `convex` holds at 1.40.0: 1.41.0 adds a `transactionLimits` options param to `runMutation` that `@convex-dev/resend` 0.2.4's ctx types reject. The React Native packages (`react`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`, `react-native-safe-area-context`) stay pinned to the SDK 56 native matrix; the newer versions `npm outdated` lists for them are ahead of what SDK 56 bundles.
- Bump the CLI's `commander` to 15 and the root dev tooling (`oxlint` 1.68.0, `oxfmt` 0.54.0).
- Bump CI to `actions/checkout@v6`, `actions/setup-node@v6`, `softprops/action-gh-release@v3`, and the runner to Node 22.
- 475 tests (348 vexpo unit + 113 template + 14 e2e).

## [0.1.0] - 2026-05-11

First public release.

- `@ramonclaudio/create-vexpo@0.1.0`: npm scaffolder. `npm create @ramonclaudio/vexpo@latest my-app` copies the template, rewrites `package.json`, runs install, inits git.
- `@ramonclaudio/vexpo@0.1.0`: operational CLI. Two-mode setup (`lite` for 60-second simulator, `full` for TestFlight-ready), cross-source drift detection (`doctor`), Apple SIWA work (`apple jwt`, `apple services-id`, `apple credentials`, `apple eas-rotation-secrets`), App Store Connect API endpoints `eas-cli` doesn't expose (`testflight`, `reviews`, `sandbox`, `asc:version`, `asc:submissions`), and multi-destination env sync (`env push`).
- `templates/default/`: production-ready Expo SDK 56 + Convex + Better Auth + Resend iOS app. Native SwiftUI via `@expo/ui/swift-ui`, Apple Sign In, APNs push, Universal Links, profile + sessions, HMAC-verified webhook factory, 10 EAS Workflows covering dev builds, PR previews, deploy on main, TestFlight, rollback, rollout, ASC events, JWT rotation cron.
- 277 tests (238 vexpo unit + 29 template + 10 e2e).

See [`README.md`](./README.md) for the feature list, [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the trade-off log, [`docs/SECURITY.md`](./docs/SECURITY.md) for the threat model, [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) for the on-call runbook, and [`docs/UPSTREAM.md`](./docs/UPSTREAM.md) for the ledger of every upstream PR we shipped to `expo/expo` that the template depends on.

[Unreleased]: https://github.com/ramonclaudio/vexpo/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.1
[0.1.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.0
