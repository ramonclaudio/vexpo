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

type RenderStyle = "section" | "compact";

function groupByCategory(checks: Check[]): Map<Category, Check[]> {
  const byCategory = new Map<Category, Check[]>();
  for (const check of checks) {
    const items = byCategory.get(check.category) ?? [];
    byCategory.set(check.category, items);
    items.push(check);
  }
  return byCategory;
}

function renderCheck(check: Check, style: RenderStyle, width: number): void {
  line(
    style === "section"
      ? `  ${glyph(check.severity)} ${BOLD}${check.name.padEnd(width)}${RESET}  ${check.message}`
      : `    ${glyph(check.severity)} ${check.name.padEnd(width)}  ${check.message}`,
  );
  if (!check.details) return;
  line(
    style === "section"
      ? `       ${DIM}${check.details}${RESET}`
      : `        ${DIM}${check.details}${RESET}`,
  );
}

export function renderVerifyResults(checks: Check[], style: RenderStyle): void {
  const byCategory = groupByCategory(checks);
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
