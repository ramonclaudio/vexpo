---
version: alpha
name: vexpo
description: >
  Native iOS design system: shadcn neutral palette (preset b1VlJDbW) routed
  through DynamicColorIOS, Geist Variable typography, iOS-native primitives
  via @expo/ui/swift-ui. Brand expression through type, spacing, rounding,
  and material, never through hue.
colors:
  background: { light: "#FFFFFF", dark: "#0A0A0A" }
  foreground: { light: "#0A0A0A", dark: "#FAFAFA" }
  card: { light: "#FFFFFF", dark: "#171717" }
  popover: { light: "#FFFFFF", dark: "#171717" }
  primary: { light: "#171717", dark: "#E5E5E5" }
  primary-foreground: { light: "#FAFAFA", dark: "#171717" }
  secondary: { light: "#F5F5F5", dark: "#262626" }
  muted: { light: "#F5F5F5", dark: "#262626" }
  muted-foreground: { light: "#737373", dark: "#A1A1A1" }
  accent: { light: "#F5F5F5", dark: "#262626" }
  destructive: { light: "#E7000B", dark: "#FF6467" }
  border: { light: "#E5E5E5", dark: "rgba(255,255,255,0.10)" }
  input: { light: "#E5E5E5", dark: "rgba(255,255,255,0.15)" }
  ring: { light: "#A1A1A1", dark: "#737373" }
typography:
  family:
    sans: "Geist Variable"
    mono: "GeistMono"
  brand-hero:
    {
      family: sans,
      weight: 900,
      role: "Standalone wordmark, social card headline, emblem center, cover wordmark",
    }
  brand-mark: { family: sans, weight: 700, role: "Lettermark, chiclet vx, bundle icon" }
  brand-label:
    { family: sans, weight: 600, role: "Combination-mark wordmark (subordinate to chiclet)" }
  in-app-title:
    {
      family: sans,
      weight: 700,
      size: 30,
      lineHeight: 38,
      letterSpacing: -0.5,
      role: "Nav titles, screen headers",
    }
  in-app-subtitle: { family: sans, weight: 600, size: 20, lineHeight: 26, role: "Section headers" }
  in-app-default: { family: sans, weight: 400, size: 16, lineHeight: 24, role: "Body text" }
  in-app-default-emphasis:
    { family: sans, weight: 600, size: 16, lineHeight: 24, role: "Emphasized body" }
  technical: { family: mono, weight: 400, role: "Repo URLs, version strings, technical taglines" }
radius:
  none: 0
  sm: 6
  md: 8
  default: 10
  lg: 10
  xl: 14
  2xl: 18
  3xl: 22
  4xl: 26
  full: 9999
spacing:
  xxs: 2
  xs: 4
  sm: 8
  md: 12
  lg: 16
  xl: 20
  2xl: 24
  3xl: 32
  4xl: 40
  base-unit: 4
sizes:
  touch-target-min: 44
  tab-bar-height: 80
  form-max-width: 440
  content-max-width: 600
materials:
  ultraThin:
    { ios26plus: "GlassView clear", ios164to25: "BlurView systemUltraThinMaterial intensity 30" }
  thin: { ios26plus: "GlassView clear", ios164to25: "BlurView systemThinMaterial intensity 50" }
  regular: { ios26plus: "GlassView regular", ios164to25: "BlurView systemMaterial intensity 70" }
  thick: { ios26plus: "GlassView regular", ios164to25: "BlurView systemThickMaterial intensity 90" }
  chrome:
    { ios26plus: "GlassView regular", ios164to25: "BlurView systemChromeMaterial intensity 100" }
---

## Overview

Calm, monochrome, native. The vexpo system pairs a shadcn neutral palette (preset `b1VlJDbW`) with the iOS-native typography, materials, and primitives surface. The visual character reads as a developer tool: a quiet workspace that adapts to system appearance, scales with Dynamic Type, and respects the user's accessibility preferences.

The brand commits to Geist Variable as the single typeface for both UI and marketing assets. Color carries no brand meaning. `destructive` is the only chromatic token, reserved for irreversible actions and validation errors. Brand expression flows through type weight, spacing, rounding, and the iOS material system.

Ground truth lives in `constants/theme.ts` (color palette as `DynamicColorIOS`), `constants/layout.ts` (spacing, font sizes, line heights, fonts), and `constants/ui.ts` (opacity, materials, shadows, durations, sizes). The tokens here are the public contract for agents and contributors. The constants files are the implementation.

## Colors

The palette is OKLCH grayscale on the neutral axis (`oklch(L 0 0)`) with no hue. Light mode runs from white surfaces through pale chrome to dark ink. Dark mode inverts. The single non-grayscale token is `destructive` (red), used only for irreversible actions and validation errors.

**Background / Foreground**: `#FFFFFF` on `#0A0A0A` (light), `#0A0A0A` on `#FAFAFA` (dark). Pure white, deep ink. No off-white drift.

**Card / Popover**: same as background in light, lifted one neutral step in dark (`#171717`) so surfaces read above the page.

**Primary**: equal to a dark neutral. Buttons are dark in light mode (`#171717`), light in dark mode (`#E5E5E5`). There is no brand color.

**Primary-Foreground**: inverse of `primary` (`#FAFAFA` light, `#171717` dark). Used for text on primary buttons and the "vx" chiclet wordmark.

**Muted / Secondary / Accent**: `#F5F5F5` light, `#262626` dark. Used for secondary buttons, hovered menu items, and field backgrounds.

**Muted-Foreground**: `#737373` light, `#A1A1A1` dark. Used for secondary labels, captions, taglines, the headline soft-fade endpoint on social cards.

**Border / Input**: `#E5E5E5` light, `rgba(255,255,255,0.10)` / `0.15` dark. Border is barely there in light mode. In dark mode it's a subtle alpha overlay rather than a visible neutral, so chrome reads against lifted surfaces.

**Ring**: `#A1A1A1` light, `#737373` dark. Focus ring. Renders as a soft halo at 30% alpha around interactive elements.

**Destructive**: `#E7000B` light, `#FF6467` dark. Reserved for delete actions, error text, validation states.

The dark-mode mapping is a deterministic inversion: backgrounds and inks swap, `card` and `popover` lift one neutral step (`#171717`) so they read above the page, `secondary` / `muted` / `accent` raise to `#262626`, `muted-foreground` lightens to `#A1A1A1`, and `border` / `input` switch to white-at-alpha so chrome reads against the lifted surfaces.

Every color in `constants/theme.ts` is wrapped in `DynamicColorIOS` with a `light`, `dark`, `highContrastLight`, and `highContrastDark` value. The high-contrast pair fires when iOS Settings → Accessibility → Display → Increase Contrast is on. Don't add a custom color without the four-variant set.

Increased Contrast (iOS Accessibility): every `DynamicColorIOS` token includes a `highContrastLight` and `highContrastDark` variant. The high-contrast values are darker / more-saturated counterparts so the kit still reads when the user has enabled the accessibility setting.

## Typography

One face: **Geist Variable** (`@fontsource-variable/geist`-equivalent TTF in `assets/fonts/Geist-Variable.ttf`). The variable axis covers weights 100-900 in a single file. A monospace face, **GeistMono Regular**, is used as a technical accent for code-like content (repo URLs, version strings).

There is no serif, no display face, no fallback typeface drift. Geist carries every hierarchy level.

### Brand asset weight tiers

Brand surfaces (logos, social cards, cover, splash) use a five-tier weight system:

| Tier      | Weight       | Family    | Used for                                                                                                    |
| :-------- | :----------- | :-------- | :---------------------------------------------------------------------------------------------------------- |
| Hero      | 900 Black    | Geist     | Standalone wordmark, social card headline, emblem center, cover wordmark                                    |
| Mark      | 700 Bold     | Geist     | Lettermark, chiclet `vx` (pictorial / brand-icon / mascot / splash / bundle / combination), iOS bundle icon |
| Label     | 600 SemiBold | Geist     | Combination-mark wordmark (subordinate to the chiclet inside a lockup)                                      |
| Secondary | 500 Medium   | Geist     | Social card name top-left, status pill, tech pills row                                                      |
| Body      | 400 Regular  | Geist     | Social card body                                                                                            |
| Technical | 400 Regular  | GeistMono | Repo URL, emblem ring tagline, cover tagline                                                                |

The same word "vexpo" appears at three different weights to signal role:

- **Standalone wordmark** (the logo as a graphic): Black 900. Max impact, the word _is_ the brand.
- **Combination mark wordmark** (next to a chiclet in a lockup): SemiBold 600. Subordinate to the chiclet which carries the mark.
- **Social card name** (top-left corner, label role): Medium 500. Context label, not the focal point.

### In-app weight tiers

In-app typography uses the same Geist face but caps at Bold (700) for nav titles. Sub-headers and body sit at SemiBold (600) and Regular (400) respectively. The Black (900) weight is reserved for brand assets. Using it inside the app reads as marketing-leak, not chrome.

| Role                            | Weight       | Size  | Line Height | Letter Spacing |
| :------------------------------ | :----------- | :---- | :---------- | :------------- |
| Nav title (large title pattern) | 700 Bold     | 30    | 38          | -0.5           |
| Section header                  | 600 SemiBold | 20    | 26          | 0              |
| Body                            | 400 Regular  | 16    | 24          | 0              |
| Body emphasis                   | 600 SemiBold | 16    | 24          | 0              |
| Caption                         | 400 Regular  | 13-14 | 20-22       | 0              |

Every label scales with the user's Larger Text accessibility setting via `src/lib/dynamic-font.ts`. The `useDynamicFont` hook maps the declared point size to a SwiftUI `Font.TextStyle` and passes it to `@expo/ui/swift-ui`'s `font()` modifier (upstream `expo/expo#46007`), so the Geist family rides Apple's Dynamic Type curves natively. SwiftUI rescales the text when the setting changes, no JS re-render. The declared size is the base, so default-size rendering is unchanged. Don't bypass this hook. If you do, your text stops scaling at Larger Text.

Geist's variable axes are not currently exercised at runtime (we use static TTFs for individual weights via `expo-font`). The variable TTF ships in `assets/fonts/` for future use. If runtime needs variable weight interpolation, point `expo-font` at the variable file and use SwiftUI's `.fontWeight()` modifier.

## Layout & Spacing

The base unit is **4px**. Every spacing value in the system is a multiple of 4. The named tokens in `Spacing` are the only valid spacing values. Raw numbers in component code are a smell.

```
xxs   2     (half-base, only for hairline gaps inside chiclets)
xs    4     (1 unit)
sm    8     (2 units)
md    12    (3 units)
lg    16    (4 units)
xl    20    (5 units)
2xl   24    (6 units)
3xl   32    (8 units)
4xl   40    (10 units)
```

**Page padding**: `Spacing.xl` (20px) horizontal on iPhone form factor. Sections use `Spacing.2xl` (24px) vertical between blocks.

**Form max width**: `MaxWidth.form = 440px` so authentication forms feel intentional on iPad. Body content max width is `MaxWidth.content = 600px`.

**Touch targets**: `TouchTarget.min = 44px`. iOS HIG minimum. Buttons, tappable rows, and interactive icons all clear this.

**Hit slop**: when a touch target is visually smaller than 44px (e.g. a 24px close icon), wrap with `HitSlop.lg = 12` so the touchable region expands without changing layout.

**Tab bar**: `TAB_BAR_HEIGHT = 80`, `TAB_BAR_CLEARANCE = 96` (height + lg gap). Add `TAB_BAR_CLEARANCE` as bottom padding to scrollables that sit under the tab bar.

Negative space is generous on purpose. The page is mostly background. UI elements are punctuation, not paragraphs.

## Elevation & Materials

Depth is signaled by surface tint and the iOS material system, not by drop shadows. The system has three elevation levels:

**Level 0 (page)**: flat. `Colors.background`. No shadow, no border. The default for screens, scrollables, list backgrounds.

**Level 1 (card / inline surface)**: `Colors.card`. In light mode equal to background. In dark mode lifted one neutral step. No shadow at this level. The lift is communicated by the color shift only.

**Level 2 (chrome / floating UI)**: the `<Material>` primitive in `components/ui/material.tsx`. Renders as `GlassView` (Liquid Glass) on iOS 26+ and `BlurView` on iOS 16.4 to 25. Reserved for navigation chrome that floats above content: tab bars, navigation bars, toolbars, sheets, popovers, alerts, notification banners. The `<OfflineBanner>` is the canonical example.

**Material variants**:

| Variant     | iOS 26+ glass style | iOS 16.4-25 blur tint     | Use for                             |
| :---------- | :------------------ | :------------------------ | :---------------------------------- |
| `ultraThin` | `clear`             | `systemUltraThinMaterial` | Subtle separation over busy content |
| `thin`      | `clear`             | `systemThinMaterial`      | Pop-up tooltips, hover cards        |
| `regular`   | `regular`           | `systemMaterial`          | Default for tab bars, toolbars      |
| `thick`     | `regular`           | `systemThickMaterial`     | Dense content panels                |
| `chrome`    | `regular`           | `systemChromeMaterial`    | High-density navigation chrome      |

Materials apply a vibrancy effect that lets background content show through with controlled blur and saturation. Apple's HIG calls this the "navigation layer" and explicitly reserves it for chrome. Don't put materials on form sections or content cards.

The blur intensity values are calibrated. Don't lower them. The 35% tint overlay on the `BlurView` fallback path is also calibrated, the smallest tint that still reads as the requested color while preserving the blur.

## Shapes / Radius

The radius ladder, generated from a `0.625rem` (10px) base, the shadcn `--radius` default:

| Token         | Value | Use for                                                            |
| :------------ | :---- | :----------------------------------------------------------------- |
| `Radius.none` | 0     | Hairline rules, full-bleed edges                                   |
| `Radius.sm`   | 6     | Checkboxes, small chips, kbd hints                                 |
| `Radius.md`   | 8     | Apple Sign In button cornerRadius (matches Apple's recommendation) |
| `Radius.lg`   | 10    | Default for input fields, info badges, secondary surfaces          |
| `Radius.xl`   | 14    | Toast banners, hover cards, sheet handles                          |
| `Radius.2xl`  | 18    | Menu items, tertiary buttons                                       |
| `Radius.3xl`  | 22    | Cards, popovers, dropdown surfaces                                 |
| `Radius.4xl`  | 26    | Primary buttons, input groups, large pills                         |
| `Radius.full` | 9999  | Avatars, icon buttons, status badges                               |

**Apple iOS app icon**: rendered at 22.37% of icon side length. The brand chiclet uses `rx = size * 0.2237` to match this exactly (rather than a fixed `Radius` token), so a chiclet at any size reads as an iOS-app-icon shape.

**Buttons**: pill-shaped (`Radius.4xl = 26`) regardless of size. The borderedProminent variant in `@expo/ui/swift-ui` already does this. For custom buttons, match.

**Avatars and icon buttons**: always `Radius.full`.

## Brand assets

Five PNGs in `assets/` carry the brand:

- `icon.png`: 1024×1024 flat full-bleed iOS bundle icon. iOS rounds it on the Home Screen automatically.
- `brand-icon-{light,dark}.png`: 1024×1024 in-app chiclet. Appears on welcome, sign-in, sign-up, and loading screens via `lib/assets.ts`.
- `splash-image-{light,dark}.png`: 1024×1024 transparent canvas with chiclet centered. Configured via `expo-splash-screen` in `app.config.ts` with `imageWidth: 200`.

To rebrand, replace the PNGs in place at the same dimensions and file names. The chiclet shape follows the iOS app icon spec (`rx = size × 0.2237`), so any 1024×1024 PNG with that radius reads as an iOS-app-icon shape.

## Components

The system uses `@expo/ui/swift-ui` primitives exclusively for native rendering. Custom components in `components/ui/` add brand-specific composition on top.

### Native primitives (use directly)

| Primitive                   | What it is                                                                    | Where it lands                         |
| :-------------------------- | :---------------------------------------------------------------------------- | :------------------------------------- |
| `Host`                      | SwiftUI host view, top-level wrapper for any screen using `@expo/ui/swift-ui` | Every screen root                      |
| `VStack` / `HStack`         | SwiftUI stacks with spacing + alignment                                       | Layout primitives                      |
| `Form` / `Section`          | Native iOS Form with grouped sections                                         | Settings, profile editor, preferences  |
| `Picker`                    | Segmented or wheel picker (use `pickerStyle("segmented")` for inline)         | Theme mode, motion preference          |
| `Toggle`                    | Native iOS toggle                                                             | Boolean preferences                    |
| `Button`                    | Native button with role variants (default, cancel, destructive)               | All actions                            |
| `TextField` / `SecureField` | Native text input                                                             | Forms                                  |
| `Text`                      | SwiftUI text with modifier composition                                        | All typography                         |
| `Image`                     | SF Symbol renderer (`systemName="..."`)                                       | All inline icons                       |
| `ConfirmationDialog`        | Native iOS action sheet                                                       | Sign-out, delete account, photo picker |
| `BottomSheet`               | Native sheet with detents                                                     | Password change, secondary forms       |
| `Spacer`                    | Flexible space                                                                | Layout                                 |
| `ProgressView`              | Spinner or determinate progress                                               | Loading states                         |
| `ContentUnavailableView`    | Empty state with SF Symbol + title + description                              | Empty home, no results                 |

Text inputs bind `text` to a `useNativeState("")` and mask synchronously: a `"worklet"` `onTextChange` rewrites the field on the same frame the keystroke lands (digits-only OTP, lowercase usernames), so the raw character never paints. Reusable masks live in `lib/masks.ts`.

### Custom composition (in `components/ui/`)

| Component                              | Purpose                                                                                                                                                                           | Notes                              |
| :------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| `Material`                             | Translucent surface with iOS 26+ Liquid Glass / iOS 16.4-25 BlurView fallback                                                                                                     | Reserve for navigation chrome only |
| `OfflineBanner`                        | Top-of-screen notification banner using `Material` chrome variant                                                                                                                 | Shows when network unavailable     |
| `LoadingScreen`                        | Brand-icon + spinner, themed by appearance                                                                                                                                        | Suspense fallback                  |
| `ErrorBoundary`                        | Top-level crash boundary with brand recovery UI                                                                                                                                   | Wraps each route segment           |
| `ConvexError`                          | Maps Convex errors to user-readable copy                                                                                                                                          | Used in error displays             |
| `SkeletonProfile` / `SkeletonSessions` | Static loading placeholders. No animation, so nothing to suppress under Reduce Motion. Filler bars carry an empty `accessibilityLabel` so VoiceOver skips the placeholder shapes. | Profile loading, sessions loading  |
| `StatusText`                           | `ErrorText` + `SuccessText` with accessibility announcements                                                                                                                      | Form feedback                      |

### Custom hooks (in `hooks/`)

| Hook                              | Purpose                                                                                         |
| :-------------------------------- | :---------------------------------------------------------------------------------------------- |
| `useThemeMode` / `useColorScheme` | App-level light/dark/system override on top of OS appearance                                    |
| `useColors`                       | Returns the `Colors` palette (currently constant, kept as a hook for future per-theme variants) |
| `useThemedAsset`                  | Picks light or dark asset based on active appearance                                            |
| `useDynamicFont`                  | Multiplies declared font sizes by accessibility fontScale before passing to `@expo/ui` `font()` |
| `useReducedMotion`                | Combines OS Reduce Motion + in-app override. Drives animation duration / disable                |
| `useNetwork`                      | Online / offline state for `OfflineBanner`                                                      |
| `useNotifications`                | Push token registration + foreground handler                                                    |
| `useDeepLinkHandler`              | Handles `applinks:` URLs from associated domains                                                |
| `useUpdates`                      | EAS Update check + apply with branded UI                                                        |
| `useOnboarding`                   | First-launch welcome flow gate                                                                  |
| `useDebounce`                     | Standard debounce                                                                               |
| `useNavigationTracking`           | Analytics / route logging                                                                       |

## Do's and Don'ts

**Do** use the existing primitives in `@expo/ui/swift-ui` and `components/ui/` before reaching for `react-native` View/Text. Native primitives encode iOS HIG. Ad-hoc compositions drift from it.

**Do** scale every text size through `useDynamicFont` so Larger Text works. Hard-coded sizes break at the largest accessibility setting.

**Do** wrap every custom color in `DynamicColorIOS` with all four variants (`light`, `dark`, `highContrastLight`, `highContrastDark`) so Increase Contrast works.

**Do** use the radius ladder. If something needs corners, it's almost always one of `Radius.lg` (10), `Radius.2xl` (18), `Radius.3xl` (22), `Radius.4xl` (26), or `Radius.full`.

**Do** put translucent material only on navigation chrome: tab bars, toolbars, banners, sheets, popovers. Apple HIG reserves the navigation layer for materials.

**Do** match icon size to context: `IconSize.sm` (14) for inline chips, `IconSize.md` (16) for menu items, `IconSize.lg` (18) for medium controls, `IconSize.4xl` (32) for headers, `IconSize.5xl` (48) for empty-state hero icons.

**Don't** introduce a second typeface. Geist carries every hierarchy level. If a heading needs more weight, increase `font-weight` from 600 to 700. Don't reach for a serif or a display face.

**Don't** use color to communicate brand. The only chromatic token is `destructive`, and it means "irreversible." Brand expression is through type, spacing, rounding, and material, not hue.

**Don't** add a drop shadow to a content card. Cards lay flat in the vexpo system. Only popovers / menus / sheets / banners are elevated, and they elevate via `<Material>`, not via shadow.

**Don't** use `font-weight: 900` (Black) inside the app. Black is reserved for brand assets. In-app titles cap at Bold (700).

**Don't** define a new spacing value. Use `Spacing.{xs,sm,md,lg,xl,2xl,3xl,4xl}`. If you need a value that isn't in the scale, the scale is wrong. Propose a new token rather than introducing magic numbers.

**Don't** override the system appearance picker. iOS already exposes Auto / Light / Dark in Settings. The in-app picker in `app/(app)/(tabs)/settings/preferences.tsx` is a Ray-specific override. HIG says "Avoid offering an app-specific appearance setting." We carry it as a deliberate choice. Don't add another layer on top.

**Don't** narrow forms by changing the page outer max width. Wrap a narrow form in `MaxWidth.form` (440) inside a wider page so chrome alignment is preserved across screens.

**Don't** add new brand surfaces (App Store screenshots, marketing covers, social cards) by hand-editing the PNGs in `assets/`. Generate them from a single config so light/dark stay in sync. The five PNGs in `assets/` are runtime-only. bundle icon, in-app chiclet, splash screen.

**Don't** delete a logo type because we don't use it today. The seven types (lettermark, wordmark, pictorial, abstract, mascot, combination, emblem) ship together so any future surface, App Store badge, swag, conference talk slide, can pick the right one without a re-render.
