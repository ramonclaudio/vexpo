import Constants from "expo-constants";

export const executionEnvironment = Constants.executionEnvironment;

export const debugMode = Constants.debugMode;

export const sessionId = Constants.sessionId;

export const expoRuntimeVersion = Constants.expoRuntimeVersion;

/**
 * A readable name for the device behind a session's User-Agent.
 *
 * The app's own requests do not say "iPhone". They come off iOS's networking
 * stack as `<AppName>/1 CFNetwork/3860.600.12 Darwin/25.0.0`, so the sessions
 * list showed users a raw UA string for the very sessions they most needed to
 * recognise.
 *
 * CFNetwork is tested first, before the platform words, because the app name
 * leads that string: an app called Machine or Macchiato matches `/Mac/i` and
 * would label its own iPhone session "Mac".
 *
 * `app.config.ts` is iOS-only with `supportsTablet: false`, so CFNetwork means
 * iPhone here. Widen this when that stops being true.
 */
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
