import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// A SwiftUI Button only hit-tests what it draws. A `Spacer` draws nothing and
// `frame({ minHeight })` reserves height the content does not fill, so either
// one leaves a strip of the button dead to taps unless `contentShape` claims
// it. On a settings row that strip is most of the row's width.
//
// Nothing in JavaScript can see a native hit test, so this reads the source the
// way the contrast test reads the palette.

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
