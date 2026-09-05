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

type Rgba = { r: number; g: number; b: number; a: number };

function parse(hex: string): Rgba {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(hex);
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
    a: m[4] ? parseInt(m[4], 16) / 255 : 1,
  };
}

// Some tones are translucent white, so what the eye gets is the blend over
// whatever is behind. Measuring the raw hex would flatter them.
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

// Apple's Sufficient Contrast criteria are WCAG's: 4.5:1 for text, 3:1 for
// large text (iOS counts 18pt and up, or 14pt bold and up) and 3:1 for non-text
// contrast, meaning controls and anything whose colour carries a state. The
// size in each `where` is the `dfont` size at the call site.
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

// Non-text contrast. Borders and fills are deliberately absent: the app never
// uses one as the only way to tell a control from its background, the way
// Apple's own text fields don't either. Every stroke that does carry meaning
// draws in `mutedForeground` or `destructive`, which the table above measures.
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

// The translucent tones would measure as their own opaque hex without the
// compositing above, which is the mistake this guards.
it("measures a translucent tone against what is behind it", () => {
  expect(contrastRatio("#FFFFFF1A", "#0A0A0A")).toBeLessThan(1.6);
});
