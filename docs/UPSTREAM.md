# Upstream contributions

A lot of what the template uses landed upstream in PRs we wrote and got merged into `expo/expo`. Ledger of every contribution that powers vexpo. Each entry has: what it does, what part of the template depends on it, the upstream PR, and the file in the template where the surface is exercised.

## SwiftUI modifiers and components in `@expo/ui/swift-ui`

### [`expo/expo#43158`](https://github.com/expo/expo/pull/43158). Fix `clipShape` and `mask` ignoring capsule and ellipse

`ClipShapeModifier` and `MaskModifier` carried a raw `String` shape field instead of the `ShapeType` enum, so anything outside `"circle"` and `"roundedRectangle"` silently fell through to `Rectangle()`. Switched to exhaustive `ShapeType` cases and aligned with `BackgroundModifier` / `ContentShapeModifier` / `ContainerShapeModifier`.

Without this, `clipShape("capsule")` rendered as a rectangle. vexpo uses the capsule shape for the rounded primary buttons, the privacy and help screen header chips, the active-session revoke buttons, and the OTA "Download & install" button.

Used in `templates/default/app/(app)/debug.tsx:377`, `templates/default/app/(app)/privacy.tsx:60`, `templates/default/app/(app)/help.tsx:108`, `templates/default/app/(app)/(tabs)/settings/index.tsx`.

### [`expo/expo#43228`](https://github.com/expo/expo/pull/43228). Per-axis `scaleEffect`

`scaleEffect` accepts `number | { x: number; y: number }` so `scaleEffect({ x: 1, y: -1 })` flips a list vertically, the canonical inverted-message-list pattern. Existing `scaleEffect(0.5)` calls normalize to `{ x: 0.5, y: 0.5 }` so the change is back-compat.

Not directly exercised by the template today (no chat surface). Available the moment you bolt one on.

### [`expo/expo#43914`](https://github.com/expo/expo/pull/43914). `defaultScrollAnchor` modifier

SwiftUI's `.defaultScrollAnchor(_:)` (iOS 17+) as a modifier. Lands a `ScrollView` or `List` at a `UnitPoint` of your choice without `scaleEffect(y: -1)` flip hacks or reversed data. Accepts `top`, `bottom`, `center`, `leading`, `trailing`, `topLeading`, `topTrailing`, `bottomLeading`, `bottomTrailing`, `zero`, or `null` to opt out.

Used in `templates/default/app/(app)/debug.tsx` for the OTA update log card so the newest entry is the one you see first when you open the screen.

### [`expo/expo#43923`](https://github.com/expo/expo/pull/43923). `defaultScrollAnchorForRole` modifier

SwiftUI's `.defaultScrollAnchor(_:for:)` (iOS 18+) with the `ScrollAnchorRole` parameter: `initialOffset`, `sizeChanges`, `alignment`. Each role can be set independently. Also extended `#43914`'s plain `defaultScrollAnchor` with `null` support and `@platform macos 14.0+` JSDoc.

vexpo uses `defaultScrollAnchorForRole("center", "sizeChanges")` on every long auth and profile form so the keyboard-driven content reflow keeps the active field centered, not pinned to the top.

Used in `templates/default/app/(auth)/sign-in.tsx:255`, `templates/default/app/(auth)/reset-password.tsx:190`, `templates/default/app/(app)/profile/index.tsx:350`, `templates/default/app/(app)/profile/change-password.tsx:126`.

### [`expo/expo#43955`](https://github.com/expo/expo/pull/43955). `scrollTargetBehavior` and `scrollTargetLayout`

`scrollTargetBehavior("paging")` snaps a `ScrollView` page-by-page. `scrollTargetLayout()` marks the row container as the snap layout. Same surface as SwiftUI's `.scrollTargetBehavior(.paging)` and `.scrollTargetLayout()`. iOS 17+.

vexpo wires both on the onboarding carousel: a single horizontal `ScrollView` containing three full-width steps, each step a `containerRelativeFrame({ axes: "horizontal" })` slide, the parent `HStack` marked with `scrollTargetLayout()`. No `FlatList`, no `react-native-snap-carousel`, just SwiftUI.

Used in `templates/default/app/(app)/welcome.tsx:119` and `templates/default/app/(auth)/sign-up.tsx:355`.

### [`expo/expo#44547`](https://github.com/expo/expo/pull/44547). `textInputAutocapitalization` modifier

SwiftUI's `.textInputAutocapitalization(_:)` (iOS 15+). Four modes: `never`, `words`, `sentences`, `characters`. Without this, the only way to disable autocapitalization on `TextField` was `keyboardType="ascii-capable"` which also changes the keyboard layout.

vexpo uses `never` on every email, username, password, and OTP field, and `words` on the display-name field. The keyboard's shift key stops fighting the user on sign-in.

Used in `templates/default/app/(auth)/sign-in.tsx:326`, `templates/default/app/(auth)/sign-up.tsx`, `templates/default/app/(auth)/forgot-password.tsx`, `templates/default/app/(auth)/reset-password.tsx`, `templates/default/app/(app)/profile/index.tsx:485`.

### [`expo/expo#44548`](https://github.com/expo/expo/pull/44548). `textContentType` modifier

SwiftUI's `.textContentType(_:)` (iOS 13+) wired to all 45 `UITextContentType` values. Enables keychain autofill for passwords, emails, addresses, credit cards, OTP codes. iOS 17+ values (`creditCardExpiration`, `birthdate`, etc.) and iOS 17.4+ values (`cellularEID`, `cellularIMEI`) include `#available` guards with sensible fallbacks.

vexpo uses `emailAddress`, `username`, `password`, `newPassword`, `oneTimeCode`, and `name` across the auth forms and profile editor. The system password manager picks up every field correctly, the strong-password generator fires on sign-up, OTP autofill kicks in on the verification screen.

Used in `templates/default/app/(auth)/sign-in.tsx`, `templates/default/app/(auth)/sign-up.tsx`, `templates/default/app/(auth)/forgot-password.tsx`, `templates/default/app/(auth)/reset-password.tsx`, `templates/default/app/(app)/profile/index.tsx:435`, `templates/default/app/(app)/profile/change-password.tsx:156`.

### [`expo/expo#44652`](https://github.com/expo/expo/pull/44652). `scrollPosition` and `id` on `ScrollView`

SwiftUI's iOS 17 `.scrollPosition(id:anchor:)` as a modifier. Reading `state.value` returns the id of the leading scroll target. Writing it scrolls the container. The optional `onChange` callback fires on the JS thread when the leading target changes. The `id(string)` modifier marks each child as a scroll target. Built on top of the worklet `.value` write path from #44215 and `useNativeState` / `ObservableState` from #44214.

vexpo uses `scrollPosition` two ways:

1. Onboarding carousel: `setNativeValue(activeID, STEPS[step + 1].id)` to jump to the next step from the "Next" button, plus `onChange` to update the step counter when the user drags.
2. Sign-up validation: writing the first invalid field's `id("field-name")` scrolls that field into view automatically.

Used in `templates/default/app/(app)/welcome.tsx:120` and `templates/default/app/(auth)/sign-up.tsx:345`.

### [`expo/expo#45700`](https://github.com/expo/expo/pull/45700). `Alert` component

Wraps SwiftUI's iOS 15 `.alert(_:isPresented:actions:message:)`. Mirrors the `Trigger` / `Actions` / `Message` slot model from `ConfirmationDialog` (#43366). Two-way `isPresented` binding with the `props.isPresented != newValue` guard that prevents double-fire when SwiftUI auto-dismisses on action tap.

vexpo uses `Alert` for the sign-out confirmation on the settings screen, the account-deletion confirmation, and the per-session revoke confirmation, with `destructive` button roles on the confirm actions.

Used in `templates/default/app/(app)/(tabs)/settings/index.tsx:286` and `templates/default/app/(app)/sessions.tsx:164`.

### [`expo/expo#45872`](https://github.com/expo/expo/pull/45872). Apply `<Host>` modifiers prop (open)

Fixes the `<Host modifiers={...}>` prop being silently dropped on iOS. `HostProps` (TS) already extended `CommonViewModifierProps` and `Host/index.tsx` already forwarded `modifiers` to the native view, but `HostViewProps` (Swift) never declared the field. The prop got dropped during deserialization and every typechecked modifier on `Host` was a no-op no matter what you passed. The fix is one Swift field plus one `applyModifiers(...)` chain in `HostView.body` and the entire `ViewModifierRegistry` becomes available at the `Host` root.

vexpo doesn't pass modifiers to `<Host>` today (the bug would eat them anyway). Once merged the template can collapse a layer of `VStack` wrappers that exist only to apply environment modifiers like `tint`, `font`, and `foregroundStyle` at the root.

Test repro with screenshots: [`ramonclaudio/expo-ui-host-modifiers-45872-repro`](https://github.com/ramonclaudio/expo-ui-host-modifiers-45872-repro).

## `expo-modules-core`

### [`expo/expo#43958`](https://github.com/expo/expo/pull/43958). Serialize `PersistentFileLog` reads on the dispatch queue

`PersistentFileLog.readEntries` bypassed the serial dispatch queue that guards every write, so reads could land before queued writes flushed to disk. Caused flaky `UpdatesLogReaderTests.PurgeOldLogs` failures where `entries1.count` was 1 instead of 2. Wrap `readEntries` in `serialQueue.sync`. No deadlock risk since every caller is external to the queue.

vexpo's debug screen reads the `expo-updates` log via `readLogEntries()` (see `templates/default/lib/updates.ts`). Without this fix the log card could miss the most recent write when an OTA event lands while the screen is opening.

## `expo-tools`

### [`expo/expo#45403`](https://github.com/expo/expo/pull/45403). Resolve scoped packages by name when directory differs

`getPackageByName` looked for `packages/<name>/package.json`, which misses for `@expo/ui` (lives at `packages/expo-ui/`) and `@expo/app-integrity` (at `packages/expo-app-integrity/`). When the path lookup missed, `Workspace.getInfoAsync` recorded an empty `workspacePeerDependencies` for those packages, so `updateWorkspaceProjects` never rewrote `workspace:*` to the canary version. Result: canary tarballs shipped with `peerDependencies.expo: "workspace:*"` literal. Bun and npm error out on `EUNSUPPORTEDPROTOCOL`. Same root cause as #44412 at a different call site the earlier fix didn't reach.

vexpo runs on Expo SDK 56 preview and `expo install`-ed `@expo/ui` early in the SDK 56 cycle when canary tarballs still leaked `workspace:*`. Before this fix, `bunx expo install @expo/ui` on a fresh canary project failed with `Workspace dependency "expo" not found`.

## CI workflows

### [`expo/expo#45782`](https://github.com/expo/expo/pull/45782). Fork-safe scheduled workflows

Five auto-firing scheduled workflows in `expo/expo` failed on every fork. `fingerprint.yml` and `development-client.yml` reached into the checkout from a sibling temp project with `../expo/...`, which only resolves on a repo named `expo`. Forks called anything else (`expo-fork`, `expo-contributions`) hit `No such file or directory` at the write step. Swap `../expo/` for `${{ github.workspace }}/`, same absolute path on upstream, correct path on every fork. `validate-npm-owners.yml`, `check-issues-nightly.yml`, and `publish-canaries.yml` reference secrets (`NPM_TOKEN_READ_ONLY`, `EXPO_BOT_GITHUB_TOKEN`, `EXPO_BOT_NPM_TOKEN`) that don't exist outside `expo/expo`. Added `if: github.repository == 'expo/expo'` so they skip on forks.

Net effect for any vexpo contributor: forking `expo/expo` to validate a fix no longer burns nightly CI on doomed scheduled runs.

### [`expo/expo#45859`](https://github.com/expo/expo/pull/45859). Skip secret-gated workflows on forks

Companion to #45782. Same `if: github.repository == 'expo/expo'` guard applied to every workflow that fires on `pull_request_target`, `issues`, and label events and reaches for an org-only secret: `code-review`, `commentator`, `docs`, `docs-pr`, `docs-pr-destroy`, `issue-closed`, `issue-opened` (both jobs), `issue-triage` (10 jobs), `pr-contributor-labeler`, `pr-labeler`, `sync-template`, plus the two `development-client-e2e` workflows.

Net effect: forks of `expo/expo` open PRs without a red Checks tab full of "secret not found" errors.
