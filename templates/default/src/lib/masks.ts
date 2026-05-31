import { USERNAME_MAX_LENGTH } from "@/convex/constants";

// Synchronous input masks for `@expo/ui` `TextField`/`SecureField`. Marked
// `"worklet"` so an `onTextChange` worklet can call them on the UI thread and
// rewrite the field's bound `useNativeState` on the same frame the keystroke
// lands. Sanitizing on the JS thread instead paints the raw character first,
// then strips it a frame later once the round-trip completes. that flicker is
// exactly what the worklet path removes (SDK 56 Expo UI worklet integration).

/** Digits only, capped at the 6-character email OTP length. */
export function maskOtp(text: string): string {
  "worklet";
  return text.replace(/\D/g, "").slice(0, 6);
}

/** Lowercase, `[a-z0-9._]` only, capped at the max username length. */
export function maskUsername(text: string): string {
  "worklet";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}
