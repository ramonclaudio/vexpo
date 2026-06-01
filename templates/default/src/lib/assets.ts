export const assets = {
  icon: require("@/assets/icon.png"),
  brandIconLight: require("@/assets/brand-icon-light.png"),
  brandIconDark: require("@/assets/brand-icon-dark.png"),
  splashLight: require("@/assets/splash-image-light.png"),
  splashDark: require("@/assets/splash-image-dark.png"),
} as const;

export const assetModules = Object.values(assets);
