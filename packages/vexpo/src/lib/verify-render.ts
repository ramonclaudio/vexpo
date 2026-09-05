import { BOLD, DIM, GREEN, RED, RESET, YELLOW, line, section } from "./output.ts";
import type { Category, Check, Severity } from "./verify.ts";

const RENDER_ORDER: Category[] = ["files", "convex", "resend", "apple", "eas", "coherence"];

// The same two-character tags the rest of the CLI uses. A check mark and a
// ballot x are outside most screen readers' symbol dictionaries, so at default
// punctuation they are read as nothing at all and a passing check and a failing
// one come out identical. Colour cannot carry it either.
function glyph(severity: Severity): string {
  switch (severity) {
    case "ok":
      return `${GREEN}ok${RESET}`;
    case "warn":
      return `${YELLOW}!!${RESET}`;
    case "fail":
      return `${RED}xx${RESET}`;
    case "skip":
      return `${DIM}--${RESET}`;
  }
}

type RenderStyle = "section" | "compact";

// Two for the tag and one for the space after it. The details line is derived
// from those so it keeps sitting under the name if the tag changes width again.
const TAG_WIDTH = 3;
const INDENT: Record<RenderStyle, number> = { section: 2, compact: 4 };

function renderCheck(check: Check, style: RenderStyle, width: number): void {
  const lead = " ".repeat(INDENT[style]);
  line(
    style === "section"
      ? `${lead}${glyph(check.severity)} ${BOLD}${check.name.padEnd(width)}${RESET}  ${check.message}`
      : `${lead}${glyph(check.severity)} ${check.name.padEnd(width)}  ${check.message}`,
  );
  if (!check.details) return;
  const pad = " ".repeat(INDENT[style] + TAG_WIDTH + 2);
  line(`${pad}${DIM}${check.details}${RESET}`);
}

export function renderVerifyResults(checks: Check[], style: RenderStyle): void {
  const byCategory = Map.groupBy(checks, (c) => c.category);
  const globalWidth = Math.max(...checks.map((c) => c.name.length));
  for (const category of RENDER_ORDER) {
    const items = byCategory.get(category);
    if (!items || items.length === 0) continue;
    if (style === "section") section(category.charAt(0).toUpperCase() + category.slice(1));
    else line(`  ${BOLD}${category}${RESET}`);
    const width = style === "section" ? Math.max(...items.map((c) => c.name.length)) : globalWidth;
    for (const check of items) renderCheck(check, style, width);
  }
}
