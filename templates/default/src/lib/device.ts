import Constants from "expo-constants";

export const executionEnvironment = Constants.executionEnvironment;

export const debugMode = Constants.debugMode;

export const sessionId = Constants.sessionId;

export const expoRuntimeVersion = Constants.expoRuntimeVersion;

// Order matters: an iOS user agent carries Darwin and Mac too, so the narrower
// patterns have to be tried first.
const DEVICES: [RegExp, string][] = [
  [/CFNetwork|Darwin|iPhone/i, "iPhone"],
  [/iPad/i, "iPad"],
  [/Mac/i, "Mac"],
  [/Android/i, "Android"],
  [/Windows/i, "Windows"],
  [/Linux/i, "Linux"],
];

export function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  return DEVICES.find(([re]) => re.test(userAgent))?.[1] ?? userAgent.slice(0, 40);
}
