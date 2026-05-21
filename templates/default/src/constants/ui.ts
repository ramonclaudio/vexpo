export const Opacity = {
  pressed: 0.7,
  active: 0.8,
  disabled: 0.5,
  muted: 0.6,
} as const;

export const Material = {
  ultraThin: 20,
  thin: 40,
  regular: 60,
  thick: 80,
  ultraThick: 95,
  bar: 50,
} as const;

export type MaterialLevel = keyof typeof Material;

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
