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

export const DynamicType = {
  control: "accessibility1",
  otp: "xxLarge",
} as const;
