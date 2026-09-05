# Accessibility audit

What Apple's own docs ask for, and where this repo does or does not do it.

The docs are pulled to `refs/xcode-docs` by `.pull.sh`: 425 pages, covering the
eleven App Store Connect nutrition label pages, the nine evaluation criteria
among them, the Human Interface Guidelines accessibility set, every SwiftUI
accessibility modifier, the Accessibility framework guides, the UIKit
accessibility hubs, and the App Store Connect API schema for declarations.

Scope is the whole repo: 422 tracked files, of which the 100 under
`templates/default/src` are the app, 119 are the CLI, and 12 are the scaffolder.

Read the last section first if you only read one. Most of what follows passes,
and the reason that is worth less than it sounds is at the bottom.

## The declaration this repo publishes

`templates/default/app-store/accessibility.config.json` claims seven of the nine
for iPhone. Captions and audio descriptions are false because nothing here plays
media, which is what Apple's own criteria say to do when there is no content.

Verified against the schema pulled from Apple on 2026-09-05:

| Apple's schema                                                                                           | Where the CLI matches it                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccessibilityDeclarationCreateRequest.Data.Attributes` requires `deviceFamily`, takes the nine booleans | `asc-accessibility.ts:154` sends exactly that, plus the app relationship                                                                                                         |
| `AccessibilityDeclarationUpdateRequest.Data.Attributes` has no `deviceFamily`, adds `publish`            | `asc-accessibility.ts:168` patches flags only, `:178` sends `{publish: true}`                                                                                                    |
| `state` is DRAFT, PUBLISHED or REPLACED, and only a draft is writable                                    | `planAccessibilityPush` blocks anything that is not DRAFT                                                                                                                        |
| `deviceFamily` is IPHONE, IPAD, APPLE_TV, APPLE_WATCH, MAC, VISION                                       | the same six in `asc-accessibility.ts`                                                                                                                                           |
| Voice Control is absent on tvOS and watchOS, Larger Text on macOS                                        | the `UNAVAILABLE` map, which the linter enforces                                                                                                                                 |
| `accessibilityUrl` is a `uri` on `PATCH /v1/apps/{id}`, and `fields[apps]` accepts it                    | `vexpo asc accessibility url`, added in this pass. **Clearing is not verified**: it sends `null`, which is the App Store Connect convention, and Apple's schema says neither way |

## VoiceOver

| Apple asks                                                            | Verdict                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every control carries a concise label                                 | pass. 19 SF Symbol sites, all `accessibilityHidden(true)`, and every button has visible `Text` or an explicit label                                                                                                                                                                    |
| Labels make sense out of context, and destructive ones say which item | pass. `sessions.tsx:257` labels each row `Revoke <device>`                                                                                                                                                                                                                             |
| Interactions described consistently                                   | pass, after a fix this pass. One email field had four hint wordings across sign in, sign up and forgot password, a username three, a new password three. Nine now match. Two labels still carry more than one hint, because choosing an address is not the same act as recalling one   |
| Labels don't carry the control type or its state                      | pass. No label in the tree contains "button", "checkbox", "selected" or "checked"                                                                                                                                                                                                      |
| Decorative images ignored completely                                  | pass, see the 19 above                                                                                                                                                                                                                                                                 |
| Status banners announced in a timely, non-disruptive way              | pass, after a fix this pass. `fail()` and `succeed()` announce, and a repeat is heard as a repeat. The offline banner announced going offline and said nothing on the way back, which is the half that changes what you do next                                                        |
| Element type and state spoken                                         | pass by construction, with one exception. `@expo/ui` maps onto SwiftUI controls, which carry their own traits. The debug download bar now says its own percentage rather than trusting SwiftUI's to survive the bridge, because nothing on the JavaScript side can see whether it does |
| Navigation is complete and in a logical order                         | **not verified.** Needs a device                                                                                                                                                                                                                                                       |
| Reading position survives a background reload                         | **not verified.** The lists are live Convex queries, so this is exactly where it would break                                                                                                                                                                                           |
| Modal views trap VoiceOver and can be dismissed                       | pass by construction. `Alert` and `ConfirmationDialog` are native SwiftUI, and the five router modals are native stack presentations                                                                                                                                                   |
| Grouped actions reachable, or offered as custom actions               | pass. The one combined element, `sessions.tsx:206`, is text only. Its button is a sibling                                                                                                                                                                                              |

Headings: 14 files set `isHeader`, and settings gained three
`SectionLabel`s so the rotor has something on the busiest screen.

## Voice Control

| Apple asks                                       | Verdict                                                                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Show names" gives every control a label         | pass, same evidence as VoiceOver                                                                                                                                                                                      |
| The input label matches the visible text         | **fixed this pass.** The revoke button reads "Revoke" and answered only to "Revoke <device>". The avatar row reads "Tap to add a photo" for a guest and answered only to "Change profile photo". Both now take either |
| Swipes and long presses have a spoken equivalent | pass. There are none. Every action is a button                                                                                                                                                                        |
| Dictation works in every text field              | pass by construction. All fields are SwiftUI `TextField` and `SecureField`                                                                                                                                            |
| Scrolling works                                  | **not verified.** Needs a device                                                                                                                                                                                      |

## Larger Text

| Apple asks                                         | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text reaches 200% or the system maximum            | pass, after a fix this pass. `useDynamicFont` leaves body text uncapped, so it scales to AX5. Three things are capped: the verification code field stops at AX3, which is where iOS clears 200%, and it stopped at xxLarge, roughly 1.24x, until this pass. The segmented picker and the decorative glyphs stop at AX1, which Apple exempts as controls that cannot reasonably grow. The "This device" badge at `sessions.tsx:224` also stops at AX1, and Apple says to deprioritise repeated secondary markers, so it stays |
| Don't lean on Zoom or Hover Text                   | pass. Nothing does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| No overlap, no truncation that loses information   | pass. One `lineLimit(1)`, on the settings email at `settings/index.tsx:144`, and the full address is on the profile screen one tap away. That is Apple's own carve-out                                                                                                                                                                                                                                                                                                                                                       |
| Tab bars are exempt                                | noted. Apple says so outright, so the fixed tab bar was never the problem                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Custom type stays at or above the platform minimum | pass. The smallest size in the tree is 11pt at `sessions.tsx:219`, exactly the iOS floor, and it is a badge whose sibling device name scales freely                                                                                                                                                                                                                                                                                                                                                                          |
| Layout holds at every size, in every language      | **not verified.** Needs a device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Sufficient Contrast

| Apple asks                                                        | Verdict                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.5:1 for text                                                    | pass, measured. `__tests__/lib/contrast.test.ts` asserts 12 pairings across four appearances                                                                                                    |
| 3:1 for controls and non-text state                               | pass, measured. Six more pairings, same four appearances                                                                                                                                        |
| Check both light and dark                                         | pass. All four appearances, including the two high-contrast variants                                                                                                                            |
| Test with Bold Text, Increase Contrast and Reduce Transparency on | partly. Increase Contrast is covered by the high-contrast tones. `Material` drops the blur for a solid fill when Reduce Transparency is on, at `material.tsx:59`. **Bold Text is not verified** |
| Translucency counted, not just colour                             | pass. The test composites translucent tones over what is behind them before measuring                                                                                                           |

## Dark Interface

| Apple asks                                       | Verdict                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark by default, or a setting that keeps it dark | pass, with the caveat below                                                                                                                                                                                                                                                                                      |
| No temporary flashes of bright content           | **gap.** `app.config.ts` sets `userInterfaceStyle: "automatic"` and the splash picks its light or dark image from the system appearance. The in-app appearance preference runs in JavaScript, after the splash. So a user who sets the app to Dark while the system is Light gets a white splash on every launch |
| Keep contrast in dark, not just light            | pass, measured, see above                                                                                                                                                                                                                                                                                        |

The splash gap is structural. Forcing `userInterfaceStyle: "dark"` would fix it
by deleting the light theme. The honest handling is the accessibility URL, which
is what Apple says it is for: "areas of your app that don't support an
accessibility feature."

## Differentiate Without Color Alone

| Apple asks                      | Verdict                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Colour is never the only signal | pass. Status rows pair the colour with a symbol and a word, and the CLI keeps a two-character tag on every line so `NO_COLOR` output still reads |
| Test with the Grayscale filter  | **not verified.** Nobody has run it                                                                                                              |

## Reduced Motion

| Apple asks                                     | Verdict                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Detect the system setting                      | pass. `use-reduced-motion.ts`, with a three-way in-app preference over it, which Apple allows |
| Stylistic animation stopped entirely           | pass                                                                                          |
| Meaningful animation replaced with a dissolve  | pass. `use-banner-motion.ts` swaps the directional slides for a plain fade                    |
| No depth, parallax, spinning or vortex effects | pass. There are none                                                                          |
| Nothing auto-advances on a timer               | pass. No banner carries a timeout. Dismissal is always an explicit action                     |

## Captions and Audio Descriptions

Both false. Apple's guidance is to not indicate support when there is no media,
and there is none.

## The CLI and the scaffolder

Not covered by the nutrition labels, which are about the app. Included because
the ask was every file.

| Rule                                                     | Verdict                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing depends on colour alone                          | pass. `ok` / `xx` / `!!` / `--` on every line, measured in `output.test.ts`                                                                                                                                                                                                                                                              |
| No repainting line for a screen reader to re-announce    | pass. The scaffolder's spinner prints once when `NO_COLOR` is set or `TERM=dumb`                                                                                                                                                                                                                                                         |
| Box-drawing decoration dropped when there is no terminal | pass, measured                                                                                                                                                                                                                                                                                                                           |
| `clean.mjs` gated the same way                           | pass, measured                                                                                                                                                                                                                                                                                                                           |
| Severity carried in words, not a glyph                   | pass, after a fix this pass, measured. `doctor` and `env push` marked each line with a check mark or a ballot x, which most screen readers read as nothing at the default punctuation level, so a pass and a fail came out identical. `setup-plan`'s arrow and the scaffolder's tick stay: the word beside them already says which it is |

## What is actually measured, and what is not

Measured: the 18 contrast pairings across four appearances, the repeat-announce,
and the colour and animation gates in both the CLI and the scaffolder.

Everything else in the VoiceOver, Voice Control and Larger Text tables above is
read from source. No label, hint, trait or announcement in this app has been
heard. Maestro reads the iOS accessibility hierarchy and an `@expo/ui` `Text`
never reaches it, so no end-to-end test in this repo can stand in for that.

The rows marked not verified all need the same thing: a walk through Apple's
common tasks, which for this app are first launch, sign in, settings and the
profile and session screens, with the feature switched on, on a device. Plus one
grayscale pass, one Bold Text pass, and one look at six digits at AX3 on both
screens with a verification code. That last one is arithmetic, not a
measurement: the digits should fit the capsule once the tracking gives way, and
no test and no device has seen it.

Until that happens, the declaration is a claim about the code, not about the
experience.
