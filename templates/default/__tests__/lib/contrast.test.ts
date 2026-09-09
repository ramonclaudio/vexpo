import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ DynamicColorIOS: (t: unknown) => t }));
vi.mock("expo-router", () => ({ DefaultTheme: { fonts: {} } }));

const { TONES } = await import("@/constants/theme");

type Appearance = "light" | "dark" | "highContrastLight" | "highContrastDark";
const APPEARANCES: Appearance[] = ["light", "dark", "highContrastLight", "highContrastDark"];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

type Rgba = { r: number; g: number; b: number; a: number };

function parse(hex: string): Rgba {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(hex);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
    a: m[4] ? parseInt(m[4], 16) / 255 : 1,
  };
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrastRatio(fg: string, bg: string): number {
  const back = parse(bg);
  const [x, y] = [luminance(over(parse(fg), back)), luminance(back)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// WCAG AA wants 4.5:1 for text, 3:1 for large text (18pt+ or 14pt bold+) and non-text.
const BODY = 4.5;
const LARGE = 3;
const NON_TEXT = 3;

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

const CONTROL_PAIRS: Pair[] = [
  ["primary", "background", "the filled prominent button", NON_TEXT],
  ["mutedForeground", "secondary", "control glyphs on a secondary surface", NON_TEXT],
  ["mutedForeground", "background", "the dashed avatar-picker ring", NON_TEXT],
  ["destructive", "card", "the invalid-code capsule stroke", NON_TEXT],
  ["success", "muted", "a success symbol on a capsule", NON_TEXT],
  ["warning", "background", "a warning symbol", NON_TEXT],
];

describe.each(APPEARANCES)("%s", (appearance) => {
  it.each(PAIRS)("%s on %s clears AA (%s)", (fg, bg, _where, min) => {
    const ratio = contrastRatio(TONES[fg][appearance], TONES[bg][appearance]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });

  it.each(CONTROL_PAIRS)("%s on %s clears non-text contrast (%s)", (fg, bg, _where, min) => {
    const ratio = contrastRatio(TONES[fg][appearance], TONES[bg][appearance]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

it("measures a translucent tone against what is behind it", () => {
  expect(contrastRatio("#FFFFFF1A", "#0A0A0A")).toBeLessThan(1.6);
});
