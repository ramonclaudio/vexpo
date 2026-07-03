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
