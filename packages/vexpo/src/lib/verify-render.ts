import { BOLD, DIM, GREEN, RED, RESET, YELLOW, line, section } from "./output.ts";
import type { Category, Check, Severity } from "./verify.ts";

const RENDER_ORDER: Category[] = ["files", "convex", "resend", "apple", "eas", "coherence"];

function glyph(severity: Severity): string {
  switch (severity) {
    case "ok":
      return `${GREEN}✓${RESET}`;
    case "warn":
      return `${YELLOW}⚠${RESET}`;
    case "fail":
      return `${RED}✗${RESET}`;
    case "skip":
      return `${DIM}-${RESET}`;
  }
}

// doctor prints each category under its own section rule and pads names per
// category; env push nests a lighter bold label under one Verify section and
// pads across every check. Same glyphs, colors, and order either way.
export function renderVerifyResults(checks: Check[], style: "section" | "compact"): void {
  const byCategory = new Map<Category, Check[]>();
  for (const c of checks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category)!.push(c);
  }
  const globalWidth = Math.max(...checks.map((c) => c.name.length));
  for (const cat of RENDER_ORDER) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    if (style === "section") section(cat.charAt(0).toUpperCase() + cat.slice(1));
    else line(`  ${BOLD}${cat}${RESET}`);
    const w = style === "section" ? Math.max(...items.map((c) => c.name.length)) : globalWidth;
    for (const c of items) {
      line(
        style === "section"
          ? `  ${glyph(c.severity)} ${BOLD}${c.name.padEnd(w)}${RESET}  ${c.message}`
          : `    ${glyph(c.severity)} ${c.name.padEnd(w)}  ${c.message}`,
      );
      if (c.details) {
        line(
          style === "section"
            ? `       ${DIM}${c.details}${RESET}`
            : `        ${DIM}${c.details}${RESET}`,
        );
      }
    }
  }
}
