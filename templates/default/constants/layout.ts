export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export const TouchTarget = {
  min: 44,
} as const;

export const HitSlop = {
  sm: 8,
  md: 10,
  lg: 12,
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  "2xl": 17,
  "3xl": 18,
  "4xl": 20,
  "5xl": 24,
  "6xl": 28,
  "7xl": 30,
} as const;

export const LineHeight = {
  tight: 18,
  base: 20,
  relaxed: 22,
  loose: 24,
  "2xl": 26,
  "3xl": 34,
  "4xl": 38,
} as const;

export const MaxWidth = {
  form: 440,
  content: 600,
  wide: 800,
} as const;

export const Breakpoint = {
  phone: 428,
  tablet: 768,
  desktop: 1024,
} as const;

export const TAB_BAR_HEIGHT = 80;
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + Spacing.lg;

// Single source of truth for prominent action buttons across the auth flow,
// onboarding, error states, and OTP. Keeps Sign In, Sign Up, Send Reset
// Code, Reset Password, Verify, Try Again, and Sign in with Apple visually
// identical: same height, same capsule corner radius, same Geist label
// size and weight. Color comes from the shadcn palette (`primary` /
// `primaryForeground`), never hardcoded.
export const Button = {
  height: 50,
  cornerRadius: 25,
  fontSize: 17,
  fontWeight: "semibold",
  secondaryFontWeight: "medium",
} as const;

export const IconSize = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 22,
  "3xl": 24,
  "4xl": 32,
  "5xl": 48,
  "6xl": 64,
} as const;

export const FontFamily = {
  thin: "Geist-Thin",
  extraLight: "Geist-ExtraLight",
  light: "Geist-Light",
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  semiBold: "Geist-SemiBold",
  bold: "Geist-Bold",
  extraBold: "Geist-ExtraBold",
  black: "Geist-Black",
  mono: "GeistMono-Regular",
  monoMedium: "GeistMono-Medium",
  monoBold: "GeistMono-Bold",
} as const;
