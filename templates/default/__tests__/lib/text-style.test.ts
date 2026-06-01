import { describe, expect, test } from "vitest";

import { textStyleForSize } from "@/lib/text-style";

describe("textStyleForSize", () => {
  test("maps every point size in the template's type scale to a Font.TextStyle", () => {
    expect(textStyleForSize(34)).toBe("largeTitle");
    expect(textStyleForSize(32)).toBe("largeTitle");
    expect(textStyleForSize(30)).toBe("title");
    expect(textStyleForSize(28)).toBe("title");
    expect(textStyleForSize(24)).toBe("title2");
    expect(textStyleForSize(22)).toBe("title2");
    expect(textStyleForSize(20)).toBe("title3");
    expect(textStyleForSize(18)).toBe("title3");
    expect(textStyleForSize(17)).toBe("body");
    expect(textStyleForSize(16)).toBe("callout");
    expect(textStyleForSize(15)).toBe("subheadline");
    expect(textStyleForSize(14)).toBe("footnote");
    expect(textStyleForSize(13)).toBe("footnote");
    expect(textStyleForSize(12)).toBe("caption");
    expect(textStyleForSize(11)).toBe("caption2");
  });

  test("clamps sizes below the scale to caption2", () => {
    expect(textStyleForSize(8)).toBe("caption2");
  });

  test("clamps sizes above the scale to largeTitle", () => {
    expect(textStyleForSize(64)).toBe("largeTitle");
  });
});
