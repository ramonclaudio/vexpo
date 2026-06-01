import Constants, { ExecutionEnvironment } from "expo-constants";

export const executionEnvironment = Constants.executionEnvironment;

export const isStandalone = executionEnvironment === ExecutionEnvironment.Standalone;

export const isStoreClient = executionEnvironment === ExecutionEnvironment.StoreClient;

export const debugMode = Constants.debugMode;

export const sessionId = Constants.sessionId;

export const isHeadless = Constants.isHeadless;

/** Does not account for calls or location tracking. */
export const statusBarHeight = Constants.statusBarHeight;

export const expoRuntimeVersion = Constants.expoRuntimeVersion;

export const deviceName = Constants.deviceName;

export const systemFonts = Constants.systemFonts;

export const easConfig = Constants.easConfig;

export const iosManifest = Constants.platform?.ios;

export const getWebViewUserAgentAsync = Constants.getWebViewUserAgentAsync;
