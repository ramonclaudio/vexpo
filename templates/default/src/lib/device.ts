import Constants, { ExecutionEnvironment } from "expo-constants";

/** Current execution environment: Bare, Standalone, or StoreClient. */
export const executionEnvironment = Constants.executionEnvironment;

/** Production/release build created with or without EAS Build. */
export const isStandalone = executionEnvironment === ExecutionEnvironment.Standalone;

/** Running in Expo Go or a development build with expo-dev-client. */
export const isStoreClient = executionEnvironment === ExecutionEnvironment.StoreClient;

/** True when running in debug mode (__DEV__). */
export const debugMode = Constants.debugMode;

/** Unique per app session. Changes on every fresh launch. */
export const sessionId = Constants.sessionId;

/** True if the app is running headless (background task, no UI). */
export const isHeadless = Constants.isHeadless;

/** Default status bar height in points. Does not account for calls or location tracking. */
export const statusBarHeight = Constants.statusBarHeight;

/** Runtime version string. Null on web. */
export const expoRuntimeVersion = Constants.expoRuntimeVersion;

/** Human-readable device name (e.g. "Ramon's iPhone"). */
export const deviceName = Constants.deviceName;

/** System font names available on this device. */
export const systemFonts = Constants.systemFonts;

/** EAS config object. Non-null when built with EAS Build. */
export const easConfig = Constants.easConfig;

/** iOS-specific manifest: buildNumber, model, systemVersion, etc. */
export const iosManifest = Constants.platform?.ios;

/** Resolves the user agent string a webview would send from this device. */
export const getWebViewUserAgentAsync = Constants.getWebViewUserAgentAsync;
