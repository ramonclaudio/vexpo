# Upstream contributions

A lot of what the template uses landed upstream in PRs we wrote and got merged into `expo/expo`. Ledger of every contribution that powers vexpo. Each entry has: what it does, the part of the template that depends on it, the upstream PR, and the file where the surface is exercised. Grep `upstream expo/expo#` under `src/` to jump to the showcase comments inline.

## SwiftUI modifiers and components in `@expo/ui/swift-ui`

### [`expo/expo#43158`](https://github.com/expo/expo/pull/43158). Fix `clipShape` and `mask` ignoring capsule and ellipse

`ClipShapeModifier` and `MaskModifier` carried a raw `String` shape field instead of the `ShapeType` enum, so anything outside `"circle"` and `"roundedRectangle"` silently fell through to `Rectangle()`. Switched to exhaustive `ShapeType` cases and aligned with `BackgroundModifier` / `ContentShapeModifier` / `ContainerShapeModifier`.

Without this, `clipShape("capsule")` rendered as a rectangle. The capsule shape is the most-used shape in the template: it pills every primary button. Roughly 22 call sites, all flowing through the shared `src/components/ui/prominent-button.tsx`, the search rows at `src/app/(app)/(tabs)/(search)/index.tsx`, the privacy and help header chips (`src/app/(app)/privacy.tsx`, `src/app/(app)/help.tsx`), the session and profile action buttons, and the OTA "Download & install" button at `src/app/(app)/debug.tsx`. Self-documented at `src/app/(app)/debug.tsx`.

### [`expo/expo#43228`](https://github.com/expo/expo/pull/43228). Per-axis `scaleEffect`

`scaleEffect` accepts `number | { x: number; y: number }` so `scaleEffect({ x: 1, y: -1 })` flips a list vertically, the canonical inverted-message-list pattern. Existing `scaleEffect(0.5)` calls normalize to `{ x: 0.5, y: 0.5 }` so the change is back-compat.

Not exercised by the template. The per-axis form only has an honest home in an inverted list or a deliberate mirror, and the template has no chat surface, so wiring it anywhere today would be decoration. Available the moment you add one.

### [`expo/expo#43914`](https://github.com/expo/expo/pull/43914). `defaultScrollAnchor` modifier

SwiftUI's `.defaultScrollAnchor(_:)` (iOS 17+) as a modifier. Lands a `ScrollView` or `List` at a `UnitPoint` of your choice without `scaleEffect(y: -1)` flip hacks or reversed data. Accepts `top`, `bottom`, `center`, `leading`, `trailing`, `topLeading`, `topTrailing`, `bottomLeading`, `bottomTrailing`, `zero`, or `null` to opt out.

Used at `src/app/(app)/debug.tsx` for the OTA update-log card so the newest entry is the one you see first when you open the screen. Self-documented at `src/app/(app)/debug.tsx`.

### [`expo/expo#43923`](https://github.com/expo/expo/pull/43923). `defaultScrollAnchorForRole` modifier

SwiftUI's `.defaultScrollAnchor(_:for:)` (iOS 18+) with the `ScrollAnchorRole` parameter: `initialOffset`, `sizeChanges`, `alignment`. Each role can be set independently. Also extended `#43914`'s plain `defaultScrollAnchor` with `null` support and `@platform macos 14.0+` JSDoc.

The template uses `defaultScrollAnchorForRole("center", "sizeChanges")` on every long auth and profile form so the keyboard-driven content reflow keeps the active field centered, not pinned to the top.

Used in `src/app/(app)/auth/sign-in.tsx`, `src/app/(app)/auth/sign-up.tsx`, `src/app/(app)/auth/reset-password.tsx`, `src/app/(app)/profile/index.tsx`, `src/app/(app)/profile/change-password.tsx`. Self-documented at `src/app/(app)/auth/sign-in.tsx`.

### [`expo/expo#43955`](https://github.com/expo/expo/pull/43955). `scrollTargetBehavior` and `scrollTargetLayout`

`scrollTargetLayout()` marks a layout container as the scroll-target layout. `scrollTargetBehavior("paging" | "viewAligned")` snaps a `ScrollView`, the same surface as SwiftUI's `.scrollTargetLayout()` and `.scrollTargetBehavior(.paging)`. iOS 17+.

Half of this PR is exercised, half is not. `scrollTargetLayout()` is live at `src/app/(app)/auth/sign-up.tsx`, where it marks the field column so the `scrollPosition`-driven scroll-to-field from `#44652` resolves its targets. The `scrollTargetBehavior` snapping has no natural home: the only paging surface in the template is the onboarding flow in `src/app/(app)/welcome.tsx`, and that uses SwiftUI `TabView` page style rather than a horizontal `ScrollView`. Add a horizontal card carousel and `scrollTargetBehavior("paging")` drops straight in. Left unforced on purpose rather than bolting a carousel onto a screen that does not need one.

### [`expo/expo#44547`](https://github.com/expo/expo/pull/44547). `textInputAutocapitalization` modifier

SwiftUI's `.textInputAutocapitalization(_:)` (iOS 15+). Four modes: `never`, `words`, `sentences`, `characters`. Without this, the only way to disable autocapitalization on `TextField` was `keyboardType="ascii-capable"`, which also changes the keyboard layout.

The template uses `never` on every email, username, password, and OTP field, and `words` on the display-name field. The keyboard's shift key stops fighting the user on sign-in.

Used in `src/app/(app)/auth/sign-in.tsx`, `src/app/(app)/auth/sign-up.tsx` (`words`), `src/app/(app)/auth/forgot-password.tsx`, `src/app/(app)/profile/index.tsx`, `src/components/auth/password-field.tsx`. Self-documented at `src/app/(app)/auth/sign-in.tsx`.

### [`expo/expo#44548`](https://github.com/expo/expo/pull/44548). `textContentType` modifier

SwiftUI's `.textContentType(_:)` (iOS 13+) wired to all 45 `UITextContentType` values. Enables keychain autofill for passwords, emails, addresses, credit cards, OTP codes. iOS 17+ values (`creditCardExpiration`, `birthdate`, etc.) and iOS 17.4+ values (`cellularEID`, `cellularIMEI`) include `#available` guards with sensible fallbacks.

The template uses `emailAddress`, `username`, `password`, `newPassword`, `oneTimeCode`, and `name` across the auth forms and profile editor. The system password manager picks up every field correctly, the strong-password generator fires on sign-up, OTP autofill kicks in on the verification screen.

Used in `src/app/(app)/auth/sign-in.tsx`, `src/app/(app)/auth/sign-up.tsx` (`emailAddress`), `src/app/(app)/auth/reset-password.tsx` (`oneTimeCode`), `src/app/(app)/profile/index.tsx`, `src/app/(app)/profile/change-password.tsx`, `src/components/auth/otp-verification.tsx`, `src/components/auth/password-field.tsx`. Self-documented at `src/app/(app)/auth/sign-in.tsx`.

### [`expo/expo#44652`](https://github.com/expo/expo/pull/44652). `scrollPosition` and `id` on `ScrollView`

SwiftUI's iOS 17 `.scrollPosition(id:anchor:)` as a modifier. Reading `state.value` returns the id of the leading scroll target. Writing it scrolls the container. The optional `onChange` callback fires on the JS thread when the leading target changes. The `id(string)` modifier marks each child as a scroll target. Built on top of the worklet `.value` write path from #44215 and `useNativeState` / `ObservableState` from #44214.

The template uses it for sign-up validation: `scrollPosition(activeField, { anchor: "top" })` binds the form `ScrollView` at `src/app/(app)/auth/sign-up.tsx`, each field column carries `id(...)`, and `scrollTargetLayout()` marks the column, so writing the first invalid field's id scrolls it into view automatically.

Used in `src/app/(app)/auth/sign-up.tsx`.

### [`expo/expo#45700`](https://github.com/expo/expo/pull/45700). `Alert` component

Wraps SwiftUI's iOS 15 `.alert(_:isPresented:actions:message:)`. Mirrors the `Trigger` / `Actions` / `Message` slot model from `ConfirmationDialog` (#43366). Two-way `isPresented` binding with the `props.isPresented != newValue` guard that prevents double-fire when SwiftUI auto-dismisses on action tap.

The template uses `Alert` for the account-deletion confirmations on the settings and profile screens and the per-session revoke confirmation, with `destructive` button roles on the confirm actions. The settings sign-out confirmation uses `ConfirmationDialog`, not `Alert`.

Used in `src/app/(app)/(tabs)/settings/index.tsx` (self-documented inline), `src/app/(app)/profile/index.tsx`, and `src/app/(app)/sessions.tsx`.

### [`expo/expo#46007`](https://github.com/expo/expo/pull/46007). `textStyle` on the `font` modifier for Dynamic Type

Adds an optional `textStyle` to the `font` modifier, mapping to SwiftUI's `Font.TextStyle` (`largeTitle`, `title`, `title2`, `title3`, `headline`, `subheadline`, `body`, `callout`, `footnote`, `caption`, `caption2`), so text tracks the user's Dynamic Type setting natively. Combine it with `family` to scale a custom font relative to the style (`Font.custom(_:size:relativeTo:)`).

The template's `useDynamicFont` (`src/lib/dynamic-font.ts`) is the single typography chokepoint, so it adopts this once for the whole app: it maps each declared point size to the matching `Font.TextStyle` and passes it through, then SwiftUI scales the Geist family along Apple's Dynamic Type curves. That replaced the old JS-side `fontScale` multiply for all 125 `dfont` call sites across 26 files, with no call-site changes. The declared size stays the base, so default-size rendering is unchanged, and SwiftUI rescales natively when the setting changes (no JS re-render).

The size-to-style map lives in `src/lib/text-style.ts` (`textStyleForSize`, unit-tested), applied by `useDynamicFont` in `src/lib/dynamic-font.ts`.

### [`expo/expo#45872`](https://github.com/expo/expo/pull/45872). Apply `<Host>` modifiers prop

Fixes the `<Host modifiers={...}>` prop being silently dropped on iOS. `HostProps` (TS) already extended `CommonViewModifierProps` and `Host/index.tsx` already forwarded `modifiers` to the native view, but `HostViewProps` (Swift) never declared the field. The prop got dropped during deserialization and every typechecked modifier on `Host` was a no-op no matter what you passed. The fix is one Swift field plus one `applyModifiers(...)` chain in `HostView.body`, and the entire `ViewModifierRegistry` becomes available at the `Host` root.

The template passes `modifiers={[tint(...)]}` to the `<Host>` in `src/app/(app)/welcome.tsx`, so the accent tint cascades from the host into the `ProgressView` and the Next / Skip buttons instead of being applied on an inner `VStack` wrapper that exists only to carry the environment modifier.

Test repro with screenshots: [`ramonclaudio/expo-ui-host-modifiers-45872-repro`](https://github.com/ramonclaudio/expo-ui-host-modifiers-45872-repro).

### [`expo/expo#46509`](https://github.com/expo/expo/pull/46509). Resolve `font` on the `Text` concatenation path

Completes #46007. The `textStyle` Dynamic Type scaling landed on the view path, but the Text-concatenation path still built a fixed `Font.custom(family, size:)` that dropped both `relativeTo` (Dynamic Type) and `weight`. So `font({ textStyle, weight })` scaled and kept its weight standalone, then lost both once nested inside another `<Text>`. The fix makes `FontModifier.resolveFont()` non-private and calls it from both paths.

Not exercised by the template. A brace-aware scan of all 40 `.tsx` files under `src/` found no `<Text modifiers={[font(...)]}>` rendered as a child of another `<Text>`: every `dfont()` call site is a leaf or a `VStack` / `HStack` sibling. The fix is there the moment you concatenate runs, the same way #43228's per-axis `scaleEffect` is there the moment you add an inverted list.

### [`expo/expo#46540`](https://github.com/expo/expo/pull/46540). `dynamicTypeSize` modifier

Bounds how far text grows under Dynamic Type. Pass a single size to pin it, or `{ min, max }` to clamp the range. Caps growth at an accessibility size for layout safety while still honoring the user's setting, the SwiftUI-native path Apple wants for the Larger Text accessibility label.

Wired. Shipped in `@expo/ui` 56.0.16, which the template now pins at `~56.0.16`. The ceilings live in `src/constants/ui.ts` as `DynamicType`: `control` (`accessibility1`) for controls that tolerate one accessibility step, `otp` (`xxLarge`) for the tightest field. A full audit of all 518 text and geometry views across the 33 SwiftUI files found seven fixed-geometry controls that clip rather than reflow at the largest sizes, all now clamped. Three OTP fields at `DynamicType.otp` (24pt monospaced with `kerning(8)` in a capsule that can't wrap): `src/components/auth/otp-verification.tsx`, `src/app/(app)/auth/reset-password.tsx`, and the email-OTP field in `src/app/(app)/profile/index.tsx`. Four at `DynamicType.control`: the segmented auth toggle (`src/components/auth/segmented-toggle.tsx`), the Appearance and Reduce Motion segmented pickers (`src/app/(app)/(tabs)/settings/preferences.tsx`), and the "This device" session badge (`src/app/(app)/sessions.tsx`). Everything else absorbs Dynamic Type freely through `minHeight` wrapping and the `#46007` `textStyle` scaling. The audit deliberately left the `toggleRow` capsule and the offline banner, both of which reflow vertically. It also surfaced a separate issue outside this modifier's reach: decorative SF Symbols sized via `useSymbolSize` (JS `fontScale`, e.g. the welcome icon and the password eye) overran their fixed frames at AX5, but `dynamicTypeSize` bounds the SwiftUI Dynamic Type environment, not a JS-computed point size. Those are now capped by a 1.6x ceiling (`MAX_SYMBOL_SCALE`) in `src/lib/dynamic-symbol-size.ts`, the icon analogue of this clamp. Pairs with `#46007`: that one opts in, this one bounds it. Self-documented inline at each site.

### [`expo/expo#46556`](https://github.com/expo/expo/pull/46556). `accessibilityIdentifier` modifier

Adds the SwiftUI `accessibilityIdentifier` modifier, the stable string XCUITest matches on (`app.buttons["submit-button"]`), distinct from the VoiceOver label. It fills the gap the `testID` prop can't reach: tagging a child inside a modifier chain that has no host-view prop of its own.

The template gets the identifier value without the modifier. On iOS `@expo/ui` already maps a component's `testID` prop to the native `accessibilityIdentifier` (`UIBaseView` calls `.applyAccessibilityIdentifier(props.testID)`), and every view extends `CommonViewModifierProps`, which carries `testID`. Coverage is the full testable surface, not just tap targets: every interactive control (fields, submits, toggles, pickers, Apple buttons, dialog and alert actions), plus the assertable content (error and status messages, dynamic values like name, email, app version, OTA channel and dates, screen titles), the state containers (empty, loading, offline, update-banner, the skeletons), the debug info rows, and a `<screen>-screen` id on each screen root for scoping. 189 unique ids plus 39 per-item dynamic ones (`` `session-revoke-${token}` ``, per search result, per FAQ row), all set as a `testID` prop rather than a modifier, across every screen and layout (including the per-layout loading fallbacks and the global offline and update banners). Ten content and state wrappers forward an optional `testID` so each instance is addressable: the four control wrappers (`ProminentButton`, `PasswordField`, `AppleButton`, `SegmentedToggle`, the last deriving a per-option `${testID}-${value}`) plus `ErrorText`, `SuccessText`, `ContentUnavailable`, `LoadingScreen`, `ConvexErrorView`, the offline and update banners, the skeletons, and `InfoRow`. Pure layout, static labels whose control is already tagged, and silenced decorative icons are left untagged on purpose. The modifier's niche, a modifier-chain child with no host prop, does not occur in the template, so it stays available rather than used.

The only untagged interactive elements are expo-router's native navigation-config components, which do not expose `testID` at all: the three `NativeTabs.Trigger` tab items, the seven `Stack.Screen.BackButton`s, and the two `Stack.Toolbar.Button`s. `tsc` rejects the prop on each (`NativeTabTriggerProps`, `StackScreenBackButtonProps`, and `StackToolbarButtonProps` carry no `testID` or `identifier`). They render as native bar items and are matched in a UI test by their visible label or route name. Tagging them would take an upstream change to those prop types.

Exercised across every screen and shared component. Grep `testID=` under `src/`.

### [`expo/expo#46579`](https://github.com/expo/expo/pull/46579). `accessibilityHidden` modifier

Adds the SwiftUI `accessibilityHidden` modifier to drop a decorative view from the accessibility tree, so VoiceOver skips a presentational icon instead of announcing it or having its label overloaded with the surrounding heading.

Wired, with a full sweep. Shipped in `@expo/ui` 56.0.16. Every `@expo/ui` `<Image>` now drops its decorative SF Symbol from the accessibility tree with `accessibilityHidden(true)`: 23 sites swapped from the old `accessibilityLabel("")` workaround (the pattern documented at `src/components/ui/skeleton.tsx` from the 0.1.1 audit), plus 6 that had no treatment at all and that VoiceOver would have announced. The 6 gaps were the leading row icons in `(search)/index.tsx`, `help.tsx`, and `settings/index.tsx`, the two `settings` avatar fallback glyphs, and the password eye toggle inside its already-labeled `Button`. A follow-on audit of all 511 announced views across the 33 SwiftUI files caught one more, a non-icon case: the footer version stamp in `debug.tsx` that repeats the `BUILD > Version` row, now hidden. 30 sites across 16 files, audited so no decorative `<Image>` or redundant view is left announced. Decorative `ExpoImage` instances stay on the RN path (`accessibilityLabel=""`), the informative ones keep a real label. The offline banner's `Text` was evaluated and deliberately left: its label lives on the RN `Material` wrapper, which does not reliably cross the `Host` bridge, so hiding the `Text` would risk silencing the alert. Self-documented at `src/components/ui/skeleton.tsx`.

## `expo-modules-core`

### [`expo/expo#43958`](https://github.com/expo/expo/pull/43958). Serialize `PersistentFileLog` reads on the dispatch queue

`PersistentFileLog.readEntries` bypassed the serial dispatch queue that guards every write, so reads could land before queued writes flushed to disk. Caused flaky `UpdatesLogReaderTests.PurgeOldLogs` failures where `entries1.count` was 1 instead of 2. Wrap `readEntries` in `serialQueue.sync`. No deadlock risk since every caller is external to the queue.

The template's debug screen reads the `expo-updates` log via `readLogEntries` (`src/lib/updates.ts`). Without this fix the log card could miss the most recent write when an OTA event lands while the screen is opening.

## `expo-tools`

### [`expo/expo#45403`](https://github.com/expo/expo/pull/45403). Resolve scoped packages by name when directory differs

`getPackageByName` looked for `packages/<name>/package.json`, which misses for `@expo/ui` (lives at `packages/expo-ui/`) and `@expo/app-integrity` (at `packages/expo-app-integrity/`). When the path lookup missed, `Workspace.getInfoAsync` recorded an empty `workspacePeerDependencies` for those packages, so `updateWorkspaceProjects` never rewrote `workspace:*` to the published version. Result: published tarballs shipped with `peerDependencies.expo: "workspace:*"` literal. Bun and npm error out on `EUNSUPPORTEDPROTOCOL`. Same root cause as #44412 at a different call site the earlier fix didn't reach.

The template runs on Expo SDK 56 and `expo install`-ed `@expo/ui` early in the cycle when the published tarballs still leaked `workspace:*`. Before this fix, `npx expo install @expo/ui` on a fresh SDK 56 project failed with `Workspace dependency "expo" not found`.

## CI workflows

### [`expo/expo#45782`](https://github.com/expo/expo/pull/45782). Fork-safe scheduled workflows

Five auto-firing scheduled workflows in `expo/expo` failed on every fork. `fingerprint.yml` and `development-client.yml` reached into the checkout from a sibling temp project with `../expo/...`, which only resolves on a repo named `expo`. Forks called anything else (`expo-fork`, `expo-contributions`) hit `No such file or directory` at the write step. Swap `../expo/` for `${{ github.workspace }}/`, same absolute path on upstream, correct path on every fork. `validate-npm-owners.yml`, `check-issues-nightly.yml`, and `publish-canaries.yml` reference secrets (`NPM_TOKEN_READ_ONLY`, `EXPO_BOT_GITHUB_TOKEN`, `EXPO_BOT_NPM_TOKEN`) that don't exist outside `expo/expo`. Added `if: github.repository == 'expo/expo'` so they skip on forks.

Net effect for any vexpo contributor: forking `expo/expo` to validate a fix no longer burns nightly CI on doomed scheduled runs.

### [`expo/expo#45859`](https://github.com/expo/expo/pull/45859). Skip secret-gated workflows on forks

Companion to #45782. Same `if: github.repository == 'expo/expo'` guard applied to every workflow that fires on `pull_request_target`, `issues`, and label events and reaches for an org-only secret: `code-review`, `commentator`, `docs`, `docs-pr`, `docs-pr-destroy`, `issue-closed`, `issue-opened` (both jobs), `issue-triage` (10 jobs), `pr-contributor-labeler`, `pr-labeler`, `sync-template`, plus the two `development-client-e2e` workflows.

### [`expo/expo#46050`](https://github.com/expo/expo/pull/46050). Fork-safety audit

Closes out the sweep #45782 and #45859 started. The same `if: github.repository == 'expo/expo'` guard applied to the rest of the workflows that sit red or burn CI on every fork: the nightly jobs that test org-published artifacts (`test-react-native-nightly`, `test-suite-nightly`), the hourly issue-maintenance crons (`lock`, `issue-stale`), the GCP publish path in `ios-prebuild-external-xcframeworks`, and the Slack-notify steps wired to org-only webhooks across `cli`, `create-expo-app`, `create-expo-module`, `fingerprint`, `sdk`, `ios-static-frameworks`, `bare-diffs`, `native-component-list`, `test-suite`, and `test-suite-macos`. 15 workflows in all, plus a redundant step-level check removed from `development-client-latest-e2e`.

Net effect matches its two predecessors: a fork of `expo/expo` to validate a vexpo fix runs a clean board instead of a wall of doomed red.
