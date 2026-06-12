export const Opacity = {
  pressed: 0.7,
  active: 0.8,
  disabled: 0.5,
  muted: 0.6,
} as const;

export const Shadow = {
  sm: "0 1px 2px",
  md: "0 2px 4px",
  lg: "0 4px 8px",
} as const;

export const ZIndex = {
  base: 0,
  statusBar: 1,
  dropdown: 10,
  modal: 100,
  toast: 500,
  updateBanner: 999,
  offlineBanner: 1000,
} as const;

export const Duration = {
  instant: 0,
  fast: 150,
  normal: 200,
  slow: 300,
  splash: 1000,
} as const;

// Dynamic Type ceilings for fixed-geometry controls. upstream expo/expo#46007
// opts the app into native Dynamic Type through the `textStyle` font path, this
// bounds it where a control can't reflow. `dynamicTypeSize({ max })` from
// upstream expo/expo#46540 caps growth while still honoring the user's setting.
export const DynamicType = {
  // Segmented toggle and the "This device" session badge: small controls that
  // tolerate one accessibility step, then stop.
  control: "accessibility1",
  // The OTP field is tightest: six 24pt monospaced glyphs with kerning(8) in a
  // capsule that can't wrap, so it caps below the accessibility sizes.
  otp: "xxLarge",
} as const;

export const Size = {
  checkbox: 24,
  iconContainer: 40,
  iconContainerSm: 32,
  divider: 0.5,
  dividerThick: 1,
  dividerMargin: 50,
  dragHandle: { width: 36, height: 5, radius: 3 },
  badge: 32,
} as const;

export const Responsive = {
  header: {
    minHeight: 200,
    maxHeight: 300,
    screenRatio: 0.25,
  },
  avatar: {
    phone: 100,
    tablet: 110,
    desktop: 120,
  },
} as const;

export const Keyboard = {
  verticalOffset: 100,
} as const;

export const EmptyState = {
  paddingVertical: 60,
} as const;
