import Constants from "expo-constants";

export const executionEnvironment = Constants.executionEnvironment;

export const debugMode = Constants.debugMode;

export const sessionId = Constants.sessionId;

export const expoRuntimeVersion = Constants.expoRuntimeVersion;

export function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/CFNetwork|Darwin/i.test(userAgent)) return "iPhone";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return userAgent.slice(0, 40);
}
