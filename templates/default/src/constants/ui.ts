export const ZIndex = {
  updateBanner: 999,
  offlineBanner: 1000,
} as const;

export const Duration = {
  fast: 150,
  normal: 200,
  splash: 1000,
} as const;

export const toSeconds = (ms: number) => ms / 1000;

export const DynamicType = {
  control: "accessibility1",
  otp: "accessibility3",
} as const;

const OTP_KERNING = 8;
export const otpKerning = (fontScale: number): number =>
  Math.max(2, OTP_KERNING / Math.max(fontScale, 1));
