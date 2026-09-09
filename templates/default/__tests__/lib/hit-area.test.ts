import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => join(SRC, f));

type Block = { file: string; line: number; source: string };

function buttonBlocks(file: string): Block[] {
  const source = readFileSync(file, "utf8");
  const out: Block[] = [];

  for (const match of source.matchAll(/<Button\b/g)) {
    const start = match.index;
    const end = source.indexOf("</Button>", start);
    if (end === -1) continue;
    out.push({
      file: file.slice(SRC.length + 1),
      line: source.slice(0, start).split("\n").length,
      source: source.slice(start, end),
    });
  }

  return out;
}

const RESERVES_SPACE = [/<Spacer\b/, /frame\(\{[^}]*minHeight/];

const needsContentShape = files
  .flatMap(buttonBlocks)
  .filter((b) => RESERVES_SPACE.some((re) => re.test(b.source)));

describe("button hit areas", () => {
  it("finds the buttons that reserve space", () => {
    expect(needsContentShape.length).toBeGreaterThan(0);
  });

  it.each(needsContentShape.map((b) => [`${b.file}:${b.line}`, b] as const))(
    "%s claims its whole frame",
    (_label, block) => {
      expect(block.source).toMatch(/contentShape\(/);
    },
  );
});
