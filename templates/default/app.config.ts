import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import pkg from "./package.json";

const IS_DEV = process.env.APP_VARIANT === "development";

// Identity comes from .env.local (written by `bun run setup:convex`). Fallbacks
// keep `expo prebuild` from crashing on a fresh checkout, but a real build
// requires real values.
const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? `com.example.${pkg.name}`;
const APPLE_TEAM_ID = process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? "ABCDE12345";
const EXPO_OWNER = process.env.EXPO_PUBLIC_EXPO_OWNER ?? undefined;

// Support contact surface. Populated by `vexpo rebrand` from `store.config.json`
// once the user creates one (needed only for App Store submission). On a fresh
// checkout these are empty and `app/(app)/help.tsx` hides the corresponding
// buttons gracefully.
type StoreConfig = {
  apple: {
    copyright?: string;
    info?: { "en-US"?: { marketingUrl?: string; supportUrl?: string } };
    review?: { email?: string };
  };
};
const storeConfig: StoreConfig | undefined = (() => {
  try {
    return require("./store.config.json") as StoreConfig;
  } catch {
    return undefined;
  }
})();
const cleanPlaceholder = (value: string | undefined): string =>
  !value || /YOUR_|example\.com|REPLACE_/.test(value) ? "" : value;
const SUPPORT = {
  githubUrl: cleanPlaceholder(storeConfig?.apple.info?.["en-US"]?.marketingUrl),
  issuesUrl: cleanPlaceholder(storeConfig?.apple.info?.["en-US"]?.supportUrl),
  email: cleanPlaceholder(storeConfig?.apple.review?.email),
};

export default ({ config }: ConfigContext): ExpoConfig => {
  // `eas init` writes `extra.eas.projectId` into app.json. The static config
  // is merged into our return value via `...config`, so reading from
  // `config.extra?.eas?.projectId` here picks up the EAS project id without
  // hand-editing this file every time `eas init` runs.
  const projectId = (config.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  return {
    ...config,
    name: IS_DEV ? "Vexpo (Dev)" : "Vexpo",
    slug: "vexpo",
    description: "",
    version: pkg.version,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    // Aligned with the shadcn neutral palette: light bg = #FFFFFF
    // (oklch(1 0 0)), dark bg = #0A0A0A (oklch(0.145 0 0)). Deck color
    // matches dark mode so cold-launches in the dark theme don't flash.
    backgroundColor: "#0A0A0A",
    primaryColor: "#171717",
    platforms: ["ios"],
    scheme: "vexpo",
    icon: "./assets/icon.png",
    ...(EXPO_OWNER ? { owner: EXPO_OWNER } : {}),
    runtimeVersion: { policy: "fingerprint" },
    developmentClient: {
      silentLaunch: true,
    },
    updates: {
      enabled: !!projectId,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      enableBsdiffPatchSupport: true,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      // `expo-channel-name` request header is required for runtime channel
      // surfing via `Updates.setUpdateRequestHeadersOverride`. Baseline
      // value is overwritten per-build by EAS Build (it reads the channel
      // from the eas.json build profile). Without this baseline declared
      // here, override calls reject with "unknown header".
      requestHeaders: { "expo-channel-name": "production" },
      // Only ship icon + splash with each OTA. Fonts, sounds, and other
      // build-baked assets stay in the .ipa and never download. Shrinks
      // bundle by ~95% on diff-able updates.
      assetPatternsToBeBundled: ["assets/icon.png", "assets/splash-image-*.png"],
      // End-to-end OTA code signing. The cert is committed at
      // `./certs/certificate.pem` and bundled with each .ipa; the device
      // verifies every update against it before applying. The matching
      // private key lives ONLY as an EAS file-type secret
      // (`EAS_UPDATE_PRIVATE_KEY`) and never lands in the repo.
      // Generate the keypair once with `bun run updates:gen-cert`, upload
      // the key to EAS, and every subsequent `eas update` signs locally
      // before publishing. A compromised CDN or EAS account cannot ship
      // arbitrary JS. Until the cert exists the block stays off and
      // updates ship unsigned (fine for prototyping; not for production).
      // https://docs.expo.dev/eas-update/code-signing/
      ...(existsSync(resolve(__dirname, "certs", "certificate.pem"))
        ? {
            codeSigningCertificate: "./certs/certificate.pem",
            codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
          }
        : {}),
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: BUNDLE_ID,
      appleTeamId: APPLE_TEAM_ID,
      userInterfaceStyle: "automatic",
      backgroundColor: "#0A0A0A",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: ["mailto", "tel", "sms", "itms-apps"],
      },
      associatedDomains: [
        `applinks:${process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/^https?:\/\//, "") ?? "example.convex.site"}`,
      ],
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyCollectedDataTypes: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["C617.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
            NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
            NSPrivacyAccessedAPITypeReasons: ["E174.1"],
          },
        ],
      },
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-image-light.png",
          resizeMode: "contain",
          backgroundColor: "#FFFFFF",
          imageWidth: 200,
          dark: {
            image: "./assets/splash-image-dark.png",
            backgroundColor: "#0A0A0A",
          },
        },
      ],
      ["expo-font", { fonts: ["./assets/fonts"] }],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#171717",
          sounds: ["./assets/sounds/notification.wav"],
          enableBackgroundRemoteNotifications: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos for profile pictures.",
          cameraPermission: "Allow $(PRODUCT_NAME) to take photos for profile pictures.",
        },
      ],
      [
        "expo-local-authentication",
        {
          faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID to confirm sensitive actions.",
        },
      ],
      "expo-system-ui",
      "expo-secure-store",
      "expo-web-browser",
      "expo-sharing",
      ["expo-dev-client", { launchMode: "most-recent" }],
      ["expo-build-properties", { ios: { deploymentTarget: "16.4" } }],
      ["./plugins/with-pod-deployment-target", { target: "16.4" }],
      "./plugins/with-auto-signing",
    ],
    extra: {
      ...config.extra,
      support: SUPPORT,
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      tsconfigPaths: true,
    },
  };
};
