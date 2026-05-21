// SDK 56 bans application-code imports from @react-navigation/* in favor of
// the expo-router re-exports. Theme types come from expo-router/react-navigation,
// DefaultTheme from expo-router itself. Don't add @react-navigation/native back.
import { DefaultTheme as RNDefaultTheme } from "expo-router";
import type { Theme as RNTheme } from "expo-router/react-navigation";
import { DynamicColorIOS } from "react-native";

import { FontFamily } from "@/constants/layout";

// `DynamicColorIOS` returns an `OpaqueColorValue`. React Native's StyleSheet
// processor resolves it natively, but several @expo/ui props and our own
// `as string` call-sites expect a string. The runtime payload behaves like
// any other ColorValue for RN, so we cast at the boundary instead of
// littering every call-site with `as unknown as string`.

// Shadcn `b1VlJDbW` preset (luma + neutral + Geist + Hugeicons + radius default).
// Source: shadcn-ui/ui apps/v4/registry/themes.ts, "neutral" entry.
// OKLCH values converted to sRGB hex via the standard Björn Ottosson matrix.
// Each token carries a light + dark variant plus a high-contrast pair for the
// iOS Increase Contrast accessibility setting (HIG: "If you define a custom
// color, make sure to supply light and dark variants, and an increased
// contrast option for each variant.").
type Tone = {
  light: string;
  dark: string;
  highContrastLight: string;
  highContrastDark: string;
};

const tone = (t: Tone): string => DynamicColorIOS(t) as unknown as string;

// Shadcn neutral palette in hex. Indexed by Tailwind v4 neutral step.
const NEUTRAL = {
  white: "#FFFFFF",
  black: "#000000",
  n50: "#FAFAFA", // oklch(0.985)
  n100: "#F5F5F5", // oklch(0.97)
  n150: "#EBEBEB", // contrast bump for n100
  n200: "#E5E5E5", // oklch(0.922)
  n300: "#D4D4D4", // oklch(0.87)
  n400: "#A1A1A1", // oklch(0.708)
  n500: "#737373", // oklch(0.556)
  n600: "#525252", // oklch(0.439)
  n700: "#404040", // oklch(0.371)
  n800: "#262626", // oklch(0.269)
  n850: "#1C1C1C", // contrast bump for n900 in dark mode
  n900: "#171717", // oklch(0.205)
  n950: "#0A0A0A", // oklch(0.145)
} as const;

const DESTRUCTIVE = {
  light: "#E7000B", // oklch(0.577 0.245 27.325)
  dark: "#FF6467", // oklch(0.704 0.191 22.216)
  hcLight: "#B30009",
  hcDark: "#FFA0A2",
} as const;

// shadcn dark `border` is `oklch(1 0 0 / 10%)`, `input` is `15%`. These need
// the alpha to hover over translucent layers. iOS DynamicColorIOS accepts
// 8-digit hex, so we encode RGBA inline.
const ALPHA_DARK = {
  border: "#FFFFFF1A", // 10%
  borderHC: "#FFFFFF40", // ~25% bump for high contrast
  input: "#FFFFFF26", // 15%
  inputHC: "#FFFFFF59", // ~35% bump
} as const;

const t = {
  background: tone({
    light: NEUTRAL.white,
    dark: NEUTRAL.n950,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  }),
  foreground: tone({
    light: NEUTRAL.n950,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  card: tone({
    light: NEUTRAL.white,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.n850,
  }),
  cardForeground: tone({
    light: NEUTRAL.n950,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  popover: tone({
    light: NEUTRAL.white,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.n850,
  }),
  popoverForeground: tone({
    light: NEUTRAL.n950,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  primary: tone({
    light: NEUTRAL.n900,
    dark: NEUTRAL.n200,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  primaryForeground: tone({
    light: NEUTRAL.n50,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  }),
  secondary: tone({
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  }),
  secondaryForeground: tone({
    light: NEUTRAL.n900,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  muted: tone({
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  }),
  mutedForeground: tone({
    light: NEUTRAL.n500,
    dark: NEUTRAL.n400,
    highContrastLight: NEUTRAL.n600,
    highContrastDark: NEUTRAL.n300,
  }),
  accent: tone({
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  }),
  accentForeground: tone({
    light: NEUTRAL.n900,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  destructive: tone({
    light: DESTRUCTIVE.light,
    dark: DESTRUCTIVE.dark,
    highContrastLight: DESTRUCTIVE.hcLight,
    highContrastDark: DESTRUCTIVE.hcDark,
  }),
  border: tone({
    light: NEUTRAL.n200,
    dark: ALPHA_DARK.border,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: ALPHA_DARK.borderHC,
  }),
  input: tone({
    light: NEUTRAL.n200,
    dark: ALPHA_DARK.input,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: ALPHA_DARK.inputHC,
  }),
  ring: tone({
    light: NEUTRAL.n400,
    dark: NEUTRAL.n500,
    highContrastLight: NEUTRAL.n500,
    highContrastDark: NEUTRAL.n400,
  }),

  chart1: tone({
    light: NEUTRAL.n300,
    dark: NEUTRAL.n300,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: NEUTRAL.n200,
  }),
  chart2: tone({
    light: NEUTRAL.n500,
    dark: NEUTRAL.n500,
    highContrastLight: NEUTRAL.n600,
    highContrastDark: NEUTRAL.n400,
  }),
  chart3: tone({
    light: NEUTRAL.n600,
    dark: NEUTRAL.n600,
    highContrastLight: NEUTRAL.n700,
    highContrastDark: NEUTRAL.n500,
  }),
  chart4: tone({
    light: NEUTRAL.n700,
    dark: NEUTRAL.n700,
    highContrastLight: NEUTRAL.n800,
    highContrastDark: NEUTRAL.n600,
  }),
  chart5: tone({
    light: NEUTRAL.n800,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n900,
    highContrastDark: NEUTRAL.n700,
  }),

  sidebar: tone({
    light: NEUTRAL.n50,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.n850,
  }),
  sidebarForeground: tone({
    light: NEUTRAL.n950,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  sidebarPrimary: tone({
    light: NEUTRAL.n900,
    dark: "#1447E6", // oklch(0.488 0.243 264.376), shadcn dark sidebar accent
    highContrastLight: NEUTRAL.black,
    highContrastDark: "#3D6FFA",
  }),
  sidebarPrimaryForeground: tone({
    light: NEUTRAL.n50,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.white,
  }),
  sidebarAccent: tone({
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  }),
  sidebarAccentForeground: tone({
    light: NEUTRAL.n900,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  }),
  sidebarBorder: tone({
    light: NEUTRAL.n200,
    dark: ALPHA_DARK.border,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: ALPHA_DARK.borderHC,
  }),
  sidebarRing: tone({
    light: NEUTRAL.n400,
    dark: NEUTRAL.n500,
    highContrastLight: NEUTRAL.n500,
    highContrastDark: NEUTRAL.n400,
  }),

  // Translucent fills. Same hue as primary, layered for surface tinting,
  // press states, focus glows.
  primaryFill: tone({
    light: "rgba(23,23,23,0.06)",
    dark: "rgba(229,229,229,0.10)",
    highContrastLight: "rgba(0,0,0,0.10)",
    highContrastDark: "rgba(255,255,255,0.18)",
  }),
  primaryFillEmphasized: tone({
    light: "rgba(23,23,23,0.12)",
    dark: "rgba(229,229,229,0.18)",
    highContrastLight: "rgba(0,0,0,0.20)",
    highContrastDark: "rgba(255,255,255,0.30)",
  }),
  destructiveFill: tone({
    light: "rgba(231,0,11,0.10)",
    dark: "rgba(255,100,103,0.15)",
    highContrastLight: "rgba(179,0,9,0.18)",
    highContrastDark: "rgba(255,160,162,0.25)",
  }),
  destructiveBorder: tone({
    light: "rgba(231,0,11,0.30)",
    dark: "rgba(255,100,103,0.35)",
    highContrastLight: "rgba(179,0,9,0.55)",
    highContrastDark: "rgba(255,160,162,0.55)",
  }),
  shadow: tone({
    light: "rgba(0,0,0,0.06)",
    dark: "rgba(0,0,0,0.40)",
    highContrastLight: "rgba(0,0,0,0.14)",
    highContrastDark: "rgba(0,0,0,0.60)",
  }),
  overlay: tone({
    light: "rgba(0,0,0,0.40)",
    dark: "rgba(0,0,0,0.60)",
    highContrastLight: "rgba(0,0,0,0.55)",
    highContrastDark: "rgba(0,0,0,0.75)",
  }),
} as const;

// Shadcn neutral tokens plus the handful of aliases the app actually
// references. Add an entry here the first time you need it. don't ship
// dead palette rows.
export const Colors = {
  ...t,

  // Separator is a fork of the border token so navigation chrome can swap
  // it independently without touching shadcn `border`.
  separator: t.border,

  // Tab bar inactive/active states. Mapped to muted-foreground / primary
  // so the bar reads as part of the navigation chrome.
  tabIconDefault: t.mutedForeground,
  tabIconSelected: t.primary,

  // Tertiary label (third-rank caption text) sits between muted and
  // background. too faint for body copy, dark enough to read.
  tertiaryLabel: tone({
    light: NEUTRAL.n400,
    dark: NEUTRAL.n500,
    highContrastLight: NEUTRAL.n500,
    highContrastDark: NEUTRAL.n400,
  }),

  // Inverse of destructive (white text on destructive fill).
  destructiveForeground: tone({
    light: NEUTRAL.white,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  }),

  // Status green for "available" / "completed" markers (HIG-aligned, not
  // shadcn. shadcn doesn't define a success token).
  success: tone({
    light: "#16A34A",
    dark: "#22C55E",
    highContrastLight: "#15803D",
    highContrastDark: "#4ADE80",
  }),
} as const;

export const HeaderTint = Colors.foreground;

export type ColorPalette = typeof Colors;

// React Navigation `Theme` consumers (NavigationThemeProvider, header tint,
// back chevron, screen background) read flat color strings, not
// DynamicColorIOS values. We export one theme per appearance and pick at
// the root layout based on `useColorScheme()` so every nav-rendered surface
// (back chevron, badge, header text) tracks the shadcn neutral palette
// instead of iOS systemBlue and the React Navigation defaults.
export const NavigationLight: RNTheme = {
  dark: false,
  colors: {
    primary: NEUTRAL.n900,
    background: NEUTRAL.white,
    card: NEUTRAL.white,
    text: NEUTRAL.n950,
    border: NEUTRAL.n200,
    notification: DESTRUCTIVE.light,
  },
  fonts: RNDefaultTheme.fonts,
};

export const NavigationDark: RNTheme = {
  dark: true,
  colors: {
    primary: NEUTRAL.n200,
    background: NEUTRAL.n950,
    card: NEUTRAL.n900,
    text: NEUTRAL.n50,
    border: ALPHA_DARK.border,
    notification: DESTRUCTIVE.dark,
  },
  fonts: RNDefaultTheme.fonts,
};

// shadcn radius scale, --radius = 0.625rem = 10px.
//   sm  = radius * 0.6  =  6
//   md  = radius * 0.8  =  8
//   lg  = radius * 1.0  = 10  (shadcn default)
//   xl  = radius * 1.4  = 14
//   2xl = radius * 1.8  = 18
//   3xl = radius * 2.2  = 22
//   4xl = radius * 2.6  = 26
const RADIUS_BASE = 10;
export const Radius = {
  none: 0,
  sm: Math.round(RADIUS_BASE * 0.6),
  md: Math.round(RADIUS_BASE * 0.8),
  DEFAULT: RADIUS_BASE,
  lg: RADIUS_BASE,
  xl: Math.round(RADIUS_BASE * 1.4),
  "2xl": Math.round(RADIUS_BASE * 1.8),
  "3xl": Math.round(RADIUS_BASE * 2.2),
  "4xl": Math.round(RADIUS_BASE * 2.6),
  full: 9999,
} as const;

export const Typography = {
  default: { fontSize: 16, lineHeight: 24, fontFamily: FontFamily.regular },
  defaultSemiBold: { fontSize: 16, lineHeight: 24, fontFamily: FontFamily.semiBold },
  title: { fontSize: 30, lineHeight: 38, fontFamily: FontFamily.bold, letterSpacing: -0.5 },
  subtitle: { fontSize: 20, lineHeight: 26, fontFamily: FontFamily.semiBold },
  link: { fontSize: 16, lineHeight: 24, fontFamily: FontFamily.regular },
};
