// Runtime asset registry. The five files referenced below live in ./assets/.
// To rebrand, replace the PNGs in place with your own renders at the same
// dimensions and file names. See DESIGN.md for the surface specs.
//
// Surfaces:
//   icon           iOS bundle icon, 1024x1024 (iOS rounds the corners)
//   brandIcon*     in-app chiclet (welcome, sign-in, sign-up, loading)
//   splash*        expo-splash-screen image, sits on configured bg color
export const assets = {
  icon: require("@/assets/icon.png"),
  brandIconLight: require("@/assets/brand-icon-light.png"),
  brandIconDark: require("@/assets/brand-icon-dark.png"),
  splashLight: require("@/assets/splash-image-light.png"),
  splashDark: require("@/assets/splash-image-dark.png"),
} as const;

export const assetModules = Object.values(assets);
