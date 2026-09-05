import { describe, expect, it, vi } from "vitest";

// theme.ts calls DynamicColorIOS at module load, which needs the native side.
// TONES is plain data and is what this file measures.
vi.mock("react-native", () => ({ DynamicColorIOS: (t: unknown) => t }));
vi.mock("expo-router", () => ({ DefaultTheme: { fonts: {} } }));

const { TONES } = await import("@/constants/theme");

type Appearance = "light" | "dark" | "highContrastLight" | "highContrastDark";
const APPEARANCES: Appearance[] = ["light", "dark", "highContrastLight", "highContrastDark"];

// WCAG 2.1 relative luminance and contrast ratio.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not an opaque hex colour: ${hex}`);
  const [r, g, b] = [1, 2, 3].map((i) => channel(parseInt(m[i]!, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// AA wants 4.5:1 for body text and 3:1 for large text, which iOS counts as
// 18pt and up, or 14pt and up when it is bold. The size in each `where` is the
// `dfont` size at the call site.
const BODY = 4.5;
const LARGE = 3;

type Pair = [keyof typeof TONES, keyof typeof TONES, string, number];

const PAIRS: Pair[] = [
  ["foreground", "background", "screen copy, 15 to 28", BODY],
  ["foreground", "muted", "capsule row label, 16 medium", BODY],
  ["foreground", "card", "session device name, 16 semibold", BODY],
  ["mutedForeground", "background", "subtitles, HelperText, the version footer, 12 to 16", BODY],
  ["mutedForeground", "muted", "HelperText on a capsule, 13", BODY],
  ["mutedForeground", "card", "session IP and age, 13", BODY],
  ["destructive", "background", "ErrorText, 14", BODY],
  ["destructive", "muted", "destructive row label, 16 medium", BODY],
  ["success", "background", "SuccessText, 14", BODY],
  ["warning", "muted", "the debug emergency launch value, 15 medium", BODY],
  ["primaryForeground", "primary", "prominent button label, 17", BODY],
  ["destructiveForeground", "destructive", "the offline banner, 18 bold", LARGE],
];

describe.each(APPEARANCES)("%s", (appearance) => {
  it.each(PAIRS)("%s on %s clears AA (%s)", (fg, bg, _where, min) => {
    const ratio = contrastRatio(TONES[fg][appearance], TONES[bg][appearance]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});
