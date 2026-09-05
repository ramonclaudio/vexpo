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

export const toSeconds = (ms: number) => ms / 1000;

// Caps on how far a piece of type may grow. Apple's Larger Text bar is 200%,
// which iOS reaches at AX3, so anything a user has to read stops no lower than
// that. `control` sits below it on purpose: it caps decorative glyphs and the
// segmented picker, which Apple's own criteria exempt as controls that cannot
// reasonably grow.
export const DynamicType = {
  control: "accessibility1",
  otp: "accessibility3",
} as const;

// Six monospaced digits at AX3 fill most of the capsule, so the tracking that
// separates them at the default size has to give way as the size climbs.
export const OTP_KERNING = 8;
export const otpKerning = (fontScale: number): number =>
  Math.max(2, OTP_KERNING / Math.max(fontScale, 1));
