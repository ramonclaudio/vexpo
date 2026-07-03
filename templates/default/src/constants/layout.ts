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

export const Button = {
  height: 50,
  fontSize: 17,
  fontWeight: "semibold",
  secondaryFontWeight: "medium",
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
