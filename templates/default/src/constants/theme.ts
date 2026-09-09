import { DefaultTheme as RNDefaultTheme } from "expo-router";
import type { Theme as RNTheme } from "expo-router/react-navigation";
import { DynamicColorIOS } from "react-native";

type Tone = {
  light: string;
  dark: string;
  highContrastLight: string;
  highContrastDark: string;
};

// DynamicColorIOS returns an OpaqueColorValue. @expo/ui types colors as string.
const tone = (t: Tone): string => DynamicColorIOS(t) as unknown as string;

const NEUTRAL = {
  white: "#FFFFFF",
  black: "#000000",
  n50: "#FAFAFA",
  n100: "#F5F5F5",
  n150: "#EBEBEB",
  n200: "#E5E5E5",
  n300: "#D4D4D4",
  n400: "#A1A1A1",
  n500: "#737373",
  n600: "#525252",
  n700: "#404040",
  n800: "#262626",
  n850: "#1C1C1C",
  n900: "#171717",
  n950: "#0A0A0A",
} as const;

const DESTRUCTIVE = {
  light: "#B30009",
  dark: "#FF6467",
  hcLight: "#990007",
  hcDark: "#FFA0A2",
} as const;

const WARNING = {
  light: "#B45309",
  dark: "#F59E0B",
  hcLight: "#92400E",
  hcDark: "#FCD34D",
} as const;

const ALPHA_DARK = {
  border: "#FFFFFF1A",
  borderHC: "#FFFFFF40",
  input: "#FFFFFF26",
  inputHC: "#FFFFFF59",
} as const;

export const TONES = {
  background: {
    light: NEUTRAL.white,
    dark: NEUTRAL.n950,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  },
  foreground: {
    light: NEUTRAL.n950,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  },
  card: {
    light: NEUTRAL.white,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.n850,
  },
  primary: {
    light: NEUTRAL.n900,
    dark: NEUTRAL.n200,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  },
  primaryForeground: {
    light: NEUTRAL.n50,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  },
  secondary: {
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  },
  secondaryForeground: {
    light: NEUTRAL.n900,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  },
  muted: {
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  },
  mutedForeground: {
    light: NEUTRAL.n600,
    dark: NEUTRAL.n400,
    highContrastLight: NEUTRAL.n700,
    highContrastDark: NEUTRAL.n300,
  },
  accent: {
    light: NEUTRAL.n100,
    dark: NEUTRAL.n800,
    highContrastLight: NEUTRAL.n150,
    highContrastDark: NEUTRAL.n850,
  },
  accentForeground: {
    light: NEUTRAL.n900,
    dark: NEUTRAL.n50,
    highContrastLight: NEUTRAL.black,
    highContrastDark: NEUTRAL.white,
  },
  destructive: {
    light: DESTRUCTIVE.light,
    dark: DESTRUCTIVE.dark,
    highContrastLight: DESTRUCTIVE.hcLight,
    highContrastDark: DESTRUCTIVE.hcDark,
  },
  destructiveForeground: {
    light: NEUTRAL.white,
    dark: NEUTRAL.n900,
    highContrastLight: NEUTRAL.white,
    highContrastDark: NEUTRAL.black,
  },
  border: {
    light: NEUTRAL.n200,
    dark: ALPHA_DARK.border,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: ALPHA_DARK.borderHC,
  },
  input: {
    light: NEUTRAL.n200,
    dark: ALPHA_DARK.input,
    highContrastLight: NEUTRAL.n400,
    highContrastDark: ALPHA_DARK.inputHC,
  },
  success: {
    light: "#15803D",
    dark: "#22C55E",
    highContrastLight: "#166534",
    highContrastDark: "#4ADE80",
  },
  warning: {
    light: WARNING.light,
    dark: WARNING.dark,
    highContrastLight: WARNING.hcLight,
    highContrastDark: WARNING.hcDark,
  },
  primaryFill: {
    light: "rgba(23,23,23,0.06)",
    dark: "rgba(229,229,229,0.10)",
    highContrastLight: "rgba(0,0,0,0.10)",
    highContrastDark: "rgba(255,255,255,0.18)",
  },
  destructiveFill: {
    light: "rgba(231,0,11,0.10)",
    dark: "rgba(255,100,103,0.15)",
    highContrastLight: "rgba(179,0,9,0.18)",
    highContrastDark: "rgba(255,160,162,0.25)",
  },
  overlay: {
    light: "rgba(0,0,0,0.40)",
    dark: "rgba(0,0,0,0.60)",
    highContrastLight: "rgba(0,0,0,0.55)",
    highContrastDark: "rgba(0,0,0,0.75)",
  },
} as const satisfies Record<string, Tone>;

const t = Object.fromEntries(Object.entries(TONES).map(([key, value]) => [key, tone(value)])) as {
  [K in keyof typeof TONES]: string;
};

export const Colors = {
  ...t,

  separator: t.border,

  tabIconDefault: t.mutedForeground,
  tabIconSelected: t.primary,
} as const;

export const HeaderTint = Colors.foreground;

export type ColorPalette = typeof Colors;

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

export const Radius = {
  full: 9999,
} as const;
