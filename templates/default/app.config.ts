import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  name: string;
  version: string;
};

const IS_DEV = process.env.APP_VARIANT === "development";

const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? `com.example.${pkg.name}`;
const APPLE_TEAM_ID = process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? "ABCDE12345";
const EXPO_OWNER = process.env.EXPO_PUBLIC_EXPO_OWNER ?? undefined;

if (process.env.EAS_BUILD === "true") {
  const missing = [
    !process.env.EXPO_PUBLIC_CONVEX_URL && "EXPO_PUBLIC_CONVEX_URL",
    !process.env.EXPO_PUBLIC_CONVEX_SITE_URL && "EXPO_PUBLIC_CONVEX_SITE_URL",
    !process.env.EXPO_PUBLIC_APP_BUNDLE_ID && "EXPO_PUBLIC_APP_BUNDLE_ID",
    !process.env.EXPO_PUBLIC_APPLE_TEAM_ID && "EXPO_PUBLIC_APPLE_TEAM_ID",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `EAS build is missing required env: ${missing.join(", ")}. ` +
        "Run `npx vexpo env push` to sync them to EAS, then rebuild. " +
        "Shipping without them crashes the app on launch.",
    );
  }
}

type StoreConfig = {
  apple: {
    copyright?: string;
    info?: { "en-US"?: { marketingUrl?: string; supportUrl?: string } };
    review?: { email?: string };
  };
};
const storeConfig: StoreConfig | undefined = (() => {
  try {
    return JSON.parse(
      readFileSync(resolve(process.cwd(), "store.config.json"), "utf8"),
    ) as StoreConfig;
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
  const projectId =
    (config.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    process.env.EAS_PROJECT_ID;

  return {
    ...config,
    name: IS_DEV ? "Vexpo (Dev)" : "Vexpo",
    slug: "vexpo",
    description: "",
    version: pkg.version,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
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
      fallbackToCacheTimeout: 2000,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      requestHeaders: { "expo-channel-name": "development" },
      assetPatternsToBeBundled: [
        "assets/icon.png",
        "assets/splash-image-*.png",
        "assets/brand-icon-*.png",
      ],
      ...(existsSync(resolve(process.cwd(), "certs", "certificate.pem"))
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
      [
        "expo-router",
        {
          sitemap: false,
        },
      ],
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
      "expo-asset",
      "expo-image",
      "expo-sqlite",
      "expo-status-bar",
      "expo-system-ui",
      "expo-secure-store",
      "expo-web-browser",
      ["expo-dev-client", { launchMode: "most-recent" }],
      ["expo-build-properties", { ios: { deploymentTarget: "16.4" } }],
      ["./plugins/with-pod-deployment-target", { target: "16.4" }],
      "./plugins/with-auto-signing",
    ],
    extra: {
      ...config.extra,
      support: SUPPORT,
      ...(projectId
        ? {
            eas: {
              ...(config.extra as { eas?: Record<string, unknown> } | undefined)?.eas,
              projectId,
            },
          }
        : {}),
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      tsconfigPaths: true,
    },
  };
};
