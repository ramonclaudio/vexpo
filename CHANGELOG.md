# Changelog

All notable changes to vexpo are tracked here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.11] - 2026-07-02

- Move every SF Symbol off the JS `fontScale` multiply onto native `font` and `dynamicTypeSize` scaling and delete the `useSymbolSize` workaround, so icons ride the same Dynamic Type curve as their labels ([expo/expo#46714](https://github.com/expo/expo/pull/46714), [#46774](https://github.com/expo/expo/pull/46774)).
- Rebuild the loading skeletons on `redacted("placeholder")` so placeholders track the live layout instead of hand-drawn bars ([expo/expo#47269](https://github.com/expo/expo/pull/47269)).
- Add an app-switcher privacy shield: backgrounding redacts emails, session IPs, and device identifiers in the iOS switcher snapshot via `privacySensitive`, and the debug OTA status gets the `invalidatableContent` treatment while a check runs.
- Vendor the `accessibilityAddTraits` and `accessibilityRemoveTraits` modifiers ([expo/expo#47387](https://github.com/expo/expo/pull/47387), merged upstream but in no published `@expo/ui`) as a local expo module through the public `ViewModifierRegistry` API, and mark every screen title and section label `isHeader` so the VoiceOver Headings rotor can navigate the whole app.
- Vendor the `strokeBorder` modifier ([expo/expo#47426](https://github.com/expo/expo/pull/47426), same deal) as a second local module: the OTP capsules raise an invalid-code ring while a verify holds an error (the first consumer of the theme's `destructiveBorder` tone), and the profile avatar keeps a dashed in-flight ring while an upload replaces the photo with a bare spinner. Both modules delete cleanly once a released `@expo/ui` ships the modifiers.
- Announce async state changes to VoiceOver on iOS: the offline and update banners, username availability results, OTA check outcomes, and session revoke failures all spoke nothing before.
- Collapse fragmented VoiceOver stops (session identity rows, empty states, label-value pairs) with `accessibilityElement`, alias unspeakable Voice Control labels (ampersands, duplicate "Revoke" buttons), and meet the 44pt touch-target minimum on every plain text button.
- Scroll the OTP, restore-account, and crash screens at accessibility type sizes so no control can scale off-screen; the restore modal previously stranded the user with unreachable buttons.
- Give the welcome hero a mirrored reflection via per-axis `scaleEffect`, settle search flicks on row boundaries with `scrollTargetBehavior("viewAligned")`, and bold the name in the home greeting through the fixed `Text` concatenation path.
- Anchor the `ios/` excludes in the template `.gitignore`, `.easignore`, and the create-vexpo copy filter so the vendored modules' native sources actually ship; the e2e suite now asserts both modules in the dist payload and a scaffold.
- Skip Scorecard analysis and npm publish on forks, the same fork-safety guards we shipped upstream in [expo/expo#45782](https://github.com/expo/expo/pull/45782) and [#45859](https://github.com/expo/expo/pull/45859).

## [0.1.10] - 2026-06-30

- Upgrade the template to Expo SDK 57: React Native 0.85 to 0.86, React unchanged at 19.2. Moves `react-native-reanimated` to 4.5, `react-native-worklets` to 0.10, and `react-native-gesture-handler` to 2.32 via `expo install --fix`, and registers the `expo-asset` and `expo-status-bar` config plugins SDK 57 expects. `expo install --check` and `expo-doctor` (20/20) pass clean. RN 0.86 ships no breaking changes, so a scaffold rolls forward with a single `npx expo install expo@latest --fix`.

## [0.1.9] - 2026-06-30

- Fix the template's auth surface, which was dead out of the box. `expectAuth: true` on the Convex client paused the socket until sign-in, so every pre-auth query hung and Apple Sign In, OTP, email verification, and full-tier sign-up never worked. Dropping it lets the public pre-auth queries run.
- Forward the `.env.local` public identity into the `eas submit` subprocess so it resolves the real app instead of the `com.example.*` placeholder.
- Source `apple eas-rotation-secrets` identity from saved state instead of `.env.local`, where nothing writes it, so it no longer aborts `vexpo full`.
- Stop `vexpo env push` from printing raw Convex secrets in the plan, force the Convex overwrite so a re-push doesn't fail, and exit nonzero when an env push fails.
- Surface a transient App Store Connect lookup error in `vexpo submit` instead of misreporting "no app record". Preserve cached step outputs on a live-check refresh so a later `vexpo full` no longer wipes the saved Apple identity. Redact identifiers in `vexpo doctor --json --redact` too.
- Poll Expo push receipts on a cron so `DeviceNotRegistered` tokens get tombstoned promptly, and bundle the brand icons in OTA updates so a rebranded icon doesn't resolve stale on device.
- Cut the unwired App Attest stack to a documented optional add-on, and drop the `fingerprint:diff` CI job that failed on every scaffold.
- Patch the `shell-quote` (critical), esbuild, and `@babel/core` advisories in the template build tooling. Update the template's Convex, Better Auth, and Resend deps to the latest SDK 56 compatible versions; `expo install --check` and `expo-doctor` pass clean.
- Harden CI to the 2026 baseline: SHA-pin every action (Dependabot-maintained), `dependency-review` on PRs, OpenSSF Scorecard, a Dependabot cooldown, a Node 20/22/24 matrix, an `npm pack` guard, and a `knip` gate.
- Slim the CLI by collapsing duplicated helpers and dropping re-wraps of the `eas` and `convex` CLIs. Rewrite `CONTRIBUTING` around an issue-first flow with a one-command `npm run validate` and a pre-push hook, and add structured issue forms, a PR template, and a troubleshooting guide.

## [0.1.8] - 2026-06-24

- Skip the Convex team picker when provisioning a new project non-interactively. `vexpo lite`/`full` died on convex's raw `(Team:)` prompt in CI or a scripted run; `planConvexDev` now passes `--team` when `CONVEX_TEAM` is set (read from the env or `.env.local`), and the failure path points at `CONVEX_TEAM` instead of letting the prompt fail blind.
- Never ship `.env.convex.local` in the `create-vexpo` template payload. It was gitignored but listed in the dotfile-ship set, so it was dead on CI and a leak on a local publish. It's now excluded from the payload like `.env.local` and `.env.prod`.
- Add orchestration coverage for the `lite`/`full` setup engine (`runSetup`), which had no tests that imported it: the lite-vs-full scope matrix, step ordering, the `--plan`/`--dry-run` short-circuits, and the failure path, plus a reversible live `convex env` e2e and `lite`/`full` `--plan` cases in the CLI harness.
- 540 tests (391 vexpo unit + 113 template + 16 cli e2e + 20 scaffold e2e), plus opt-in live suites (Convex Platform API, Maestro).

## [0.1.7] - 2026-06-24

- Fail an EAS build that's missing `EXPO_PUBLIC_CONVEX_URL` or `EXPO_PUBLIC_CONVEX_SITE_URL` instead of shipping a binary that throws at startup in `src/lib/env.ts` before React mounts, an uncatchable launch crash. That shipped once and got the app rejected at App Review. Local dev (no `EAS_BUILD`) loads these from `.env.local` and is unaffected.
- Invoke eas-cli as `npx eas-cli`, not bare `npx eas`, everywhere (CLI helpers, every user-facing hint, the template's `npm run eas:*` scripts). Bare `npx eas` can't resolve the binary unless eas-cli is a local dependency, which silently turned `doctor`'s EAS checks into false negatives and broke the template's eas scripts for anyone without a global eas-cli.
- Surface App Store Connect's real 403 cause (a missing or expired agreement) instead of always reporting "key role insufficient". A valid Admin or App Manager key hitting a pending-agreement 403 was mislabeled as a permissions problem.
- Add a `credentials/` staging dir (gitignored except its `README.md`) as the one home for one-time Apple `.p8` downloads. `vexpo apple asc-key`, `jwt`, and `eas-rotation-secrets` auto-detect and default to it; the real home stays EAS, uploaded and KMS-encrypted.
- Land `ascAppId` in `eas.json` from a headless `asc:connect` (resolved from the ASC API), so CI and non-interactive `vexpo full` runs aren't blocked on the interactive EAS↔ASC wizard.
- Add `vexpo submit`: non-interactive TestFlight or App Store submit that sets `EXPO_ASC_*` from the cached ASC key and writes `ascAppId` into `eas.json`, then runs `eas submit --latest`. No EAS credential store needed.
- Route the versioned `BETTER_AUTH_SECRETS` through `env push` so rotating the auth secret doesn't sign every active session out.
- Add a gitleaks pre-commit config and a CI secret-scan job; narrow the CI workflows to least-privilege `permissions` and pin third-party actions to commit SHAs.
- Bump the SDK 56 dep matrix (`expo` 56.0.12, `@expo/ui` 56.0.18, `expo-router` 56.2.11, and more) via `expo install --fix`; fresh scaffolds pass `npx expo-doctor` 21/21.
- Fix stale Resend webhook comments: the management API reads the signing secret back now, so recreate-on-move is a deliberate choice for one known value, not a workaround.
- 524 tests (377 vexpo unit + 113 template + 14 cli e2e + 20 scaffold e2e), plus opt-in live suites (Convex Platform API, Maestro).

## [0.1.6] - 2026-06-24

- Drop unused deps from the `vexpo` CLI (`execa`, `kleur`, `ora`, `prompts`, `@types/prompts`). The CLI hand-rolls its ANSI output and subprocess spawning in `output.ts` and `proc.ts`, so these rode along since 0.1.0 without ever being imported. `create-vexpo` keeps the ones it uses.
- Wire the `eas-cli` helpers (`easSpawn`, `easText`) and the runtime helpers (`currentRuntime`, `currentRuntimeVersion`) into their call sites, making `eas-cli.ts` the single source for every `eas` invocation. Five interactive spawns and seven text-parsing calls dropped their inline `[dlx(), "eas", ...]` duplication.
- Drop dead weight across the CLI and template: the unused `src/index.ts` constants module and its package export, a stale `runResendRepoint` export, the template's `@vitest/ui` devDep, a `tsconfig` exclude pointing at a file that never existed, and the dead `test:all` and `test:template` npm scripts.
- Drop the vestigial `EXPO_PUBLIC_HEAD_ORIGIN` read from `app.config.ts`: the inert remnant of an unstarted Apple Handoff feature, read but never provisioned, so always undefined.
- Document `convex/auth.ts` `rotateKeys` as a manual ops tool, not a cron. It deletes the whole JWKS with no grace period, so a scheduled run would invalidate every active session.
- Move `SECURITY.md` to the repo root and demo media to `.github/assets/`, and relink every reference.
- Cut fluff from the public docs and split the deep reference (`ARCHITECTURE`, `OPERATIONS`, `UPSTREAM`, `SETUP`, `DESIGN`) into a gitignored `.dev/`, kept internal and out of scaffolded projects. Rewrite the READMEs in plain voice and run a GitHub-Flavored-Markdown formatting pass.
- Bump the template's `@ramonclaudio/vexpo` floor to track the release.
- 513 tests (366 vexpo unit + 113 template + 14 cli e2e + 20 scaffold e2e), plus opt-in live suites (Convex Platform API, Maestro).

## [0.1.5] - 2026-06-12

- Stop `doctor` reporting false warnings when `FORCE_COLOR` is set in the parent shell (CI, screen recordings). eas-cli wrapped its output in ANSI dim codes and every regex parser silently missed, so a healthy project showed phantom `project-info failed` and `missing` env warns. `run()` now forces color off for any subprocess it parses.
- Write `ascAppId` into `eas.json` on the already-connected `asc:connect` path too. The connected branch returned early without the write while `doctor`'s `asc-submit-id` warn told you to run `asc:connect`, an unbreakable loop.
- Add `doctor --redact` to mask identifying values (deployment slugs, project ids, bundle ids, key and team ids, emails, owner handles) with `<placeholder>` labels for screenshots and pasted issue reports. Statuses and check names stay readable.
- Point the doctor `asc-submit-id` hint at `vexpo asc:connect` (the command that writes the id), not the nonexistent `vexpo asc`.
- Mint a random e2e password per run in the template's `e2e-tests.yml` instead of a hardcoded one.
- Add demo media to the READMEs: an app tour GIF, a `vexpo doctor` GIF, and a light/dark screenshot strip, embedded with the GitHub-and-npm-safe centered-image pattern.
- 513 tests (366 vexpo unit + 113 template + 14 cli e2e + 20 scaffold e2e), plus opt-in live suites (Convex Platform API, Maestro).

## [0.1.4] - 2026-06-12

- Run `vexpo rebrand` non-interactively with the identity flags plus `--yes`: the TTY guard fired before the flags were considered, contradicting its own non-TTY error message.
- Sync a rebrand's bundle id into `.env.local` and Convex env. The new id only landed as the `app.config.ts` fallback, so a value written by a prior `lite` shadowed it forever and the convex step re-pushed the stale id.
- Defer `asc:connect` with guidance when no ASC app record exists for the bundle id yet (it appears after the first `eas submit`), instead of dying on eas-cli's raw "Found 0 app(s)".
- Stop `vexpo env push` stamping the accounts setup cache: a later `vexpo full` within 24 hours skipped the account walkthrough believing it had run.
- Route `REQUIRE_EMAIL_VERIFICATION` through `env push` so the flag the resend phase sets survives a restore on a new machine.
- Default the rotate-JWT prompt to No when Apple Sign In is already healthy, and report a lite-tier `.env.local` as `partial (lite)` in the setup probe instead of a red `missing`.
- Point `.env.example` at the real `npx vexpo` commands: every `npm run setup*` script it referenced no longer exists, so a new user's first documented command failed.
- Point the doctor `asc-submit-id` hint at `vexpo asc:connect`: the command it named does not exist.
- Wire the welcome screen's first-launch gate: the onboarding flow existed, was deep-linkable, and nothing ever navigated to it.
- Fix the dev menu's "Clear Secure Storage": it deleted keys Better Auth never writes, so the action logged success while the session survived.
- Persist the privacy screen's Share Analytics toggle, and announce lite-mode redirects on the email auth screens instead of bouncing silently.
- Match the sign-up subtitle to lite mode: it promised a verification code that never sends when sign-up auto-verifies.
- Name the real reason the sessions screen needs a fresh sign-in. Better Auth freshness-gates `listSessions` (`freshAge` is ten minutes), and the old copy blamed the connection with a retry that could never succeed.
- Wrap the restore-account action in a transition so `restorePending` updates and the Restore button disables during the network call.
- Surface create-vexpo install failures (stderr tail plus the manual install hint) and skip the initial commit when install failed or git has no identity, instead of committing a half-built project or hard-failing.
- Add a 20-case scaffold e2e for create-vexpo driving the built binary against temp dirs: name rewrite, dotfile restore, git init, flag variants, scoped-name rejection, payload shape. The scaffolder had no automated coverage at all.
- Add three Maestro flows that run against the live dev deployment: the full auth journey (sign up on the auto-verify lite path, welcome gate, sign out, sign back in), the signed-in app tour (search with a result assert, appearance and haptics, the persisted analytics toggle, a profile save round-tripped to Convex, sessions), and account delete-restore through the Face ID gate and the 30-day grace screen. `e2e-tests.yml` mints a unique test email per run.
- Fix the Maestro local-run docs: `appId` reads `MAESTRO_APP_ID`, which only EAS injects, so the documented bare `maestro test` command could not work.
- Drop dead code across the CLI and template: unused ASC API sub-clients, `verifyOrInvalidate`, unreachable command options, dead e2e fixtures, uncalled convex endpoints (`listUsers`, `pushTokens.list`), unused rate buckets, `ConvexErrorView`, and the stale `Material` constant.
- Reposition the READMEs around the built-on-EAS story (the template comes with Convex and Better Auth wired, the CLI creates or links your Convex deployment and handles the Apple P8 dance) and fix every doc claim the full-repo audit found drifted across `SETUP.md`, `DESIGN.md`, and `docs/`.
- 506 tests (359 vexpo unit + 113 template + 14 cli e2e + 20 scaffold e2e), plus opt-in live suites (Convex Platform API, Maestro).

## [0.1.3] - 2026-06-11

- Make the Apple Team id optional in `lite`: pressing Enter at the prompt now skips it instead of killing the run, matching lite's own no-Apple-account contract. A fresh user without a Developer account couldn't finish `lite` before. Empty-vs-invalid input split into `resolveTeamIdInput` with tests; `vexpo full` still asks when Apple provisioning actually needs it.
- Bump the template to the current SDK 56 patch matrix via `expo install --fix` (`expo` 56.0.11, `@expo/ui` 56.0.17, `expo-router` 56.2.10, and 14 more): fresh scaffolds pass `npx expo-doctor` 21/21 again instead of flagging 17 one-patch-behind packages.
- Reject scoped names in `create-vexpo`: `@scope/pkg` used to pass validation (only the basename was checked) and scaffolded into a nested `@scope/` directory nobody asked for.
- Fix the docs to match the CLI 1:1: the README referenced a `vexpo setup` command that doesn't exist (it's `lite`/`full`), the package README claimed `asc:connect` wasn't a standalone command while `cli.ts` registers it, and `adopt`, `convex:migrate`, `env convex-key`, and `asc:connect` were missing from the command reference.
- 480 tests (353 vexpo unit + 113 template + 14 e2e).

## [0.1.2] - 2026-06-10

- Pin the template's `convex` to `~1.40.0`: scaffolds resolve deps fresh now, and `^1.40.0` floated to 1.41.0, whose new `transactionLimits` param on `runMutation` breaks the `convex/http.ts` typecheck against `@convex-dev/resend@0.2.4`. The monorepo dodged it through its lockfile; fresh scaffolds didn't. Caught by scaffolding from the published 0.1.1 packages. Widen back to `^1.40.0` once resend's ctx types accept 1.41.

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
- Add App Attest device attestation to the template via `@expo/app-integrity`, verified server-side in Convex.
- Add account soft-delete with a 30-day grace window, a restore-or-confirm screen on next sign-in, and Apple Sign In token revocation on delete.
- Add the server-side push sender in Convex and push-token cleanup on sign-out and delete.
- Code-sign OTA updates end-to-end (`expo-updates` code signing, cert via `npm run updates:gen-cert`), so only signed bundles install.
- Add `adopt`: finish a project created by `eas integrations:convex:connect` by adopting the existing dev deployment (never a fresh one), backfilling site URLs and Better Auth, and printing the exact commands left.
- Add `convex:migrate`: copy server-side Convex env (`BETTER_AUTH_SECRET`, `RESEND_*`, `APPLE_*`, ...) from another deployment onto the current one, the piece a deployment migration can't get off disk.
- Add `env convex-key`: sync the Convex deploy key and deployment selector to EAS env, fixing a stale deploy key after a deployment migration.
- Add `asc:privacy` and `asc:accessibility` show/lint: the privacy and accessibility nutrition labels Apple requires before review, validated locally against Apple's enums.
- Add `asc:connect`: link the EAS project to its App Store Connect app with the cached ASC key, so `eas submit` resolves the app from the bundle id.
- Drop `reviews`, `sandbox`, `asc:version`, and `asc:submissions`: post-launch ops that all need a live app with users (`sandbox` tests in-app purchases the template doesn't ship).
- Drop `testflight remove` and the beta-group `--public-link` options: post-launch tester management, not first-ship machinery.
- Drop the `doctor` reviews-answered check and ~60 lines of unused TestFlight lib.
- Disable the template's auto PR builds: `pr-preview` and Maestro E2E now ship as manual `workflow_dispatch` to conserve EAS build credits. Restore their `pull_request` triggers to run on every PR. `deploy-production` is dispatch-only too, so a merge to `main` can't build, submit, and ship an OTA by surprise.
- Fix the `doctor` resend webhook check to flag the wrong-account case instead of a missing webhook.
- Drop dead `$schema` refs from the template's `privacy.config.json` and `accessibility.config.json`.
- Drop the template's `package-lock.json` from the create-vexpo tarball: the committed lock froze `@ramonclaudio/vexpo` at the previous release, so a fresh scaffold installed the old CLI. The first install now resolves the template's ranges fresh and the generated lock lands in the initial commit.
- Ship the template's `.npmrc` (`legacy-peer-deps=true`) in the create-vexpo tarball: npm strips the literal dotfile from published tarballs, so it now travels as `_npmrc` and is restored at scaffold time like the other dotfiles.
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

See [`README.md`](./README.md) for the feature list and [`SECURITY.md`](./SECURITY.md) for the threat model.

[Unreleased]: https://github.com/ramonclaudio/vexpo/compare/v0.1.8...HEAD
[0.1.8]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.8
[0.1.7]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.7
[0.1.6]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.6
[0.1.5]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.5
[0.1.4]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.4
[0.1.3]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.3
[0.1.2]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.2
[0.1.1]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.1
[0.1.0]: https://github.com/ramonclaudio/vexpo/releases/tag/v0.1.0
