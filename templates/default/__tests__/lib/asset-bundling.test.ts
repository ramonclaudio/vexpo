import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";
import { describe, expect, it } from "vitest";

import getConfig from "../../app.config";

const ASSET_PATHS = (() => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/assets.ts"), "utf8");
  return [...source.matchAll(/require\("@\/assets\/([^"]+)"\)/g)].map(
    ([, file]) => `assets/${file}`,
  );
})();

const PATTERNS = (() => {
  const config = getConfig({ config: {} } as ConfigContext) as ExpoConfig;
  return config.updates?.assetPatternsToBeBundled ?? [];
})();

const globToRegExp = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);

const isBundled = (path: string): boolean =>
  PATTERNS.some((pattern) => globToRegExp(pattern).test(path));

describe("assetPatternsToBeBundled", () => {
  it("finds the runtime asset graph", () => {
    expect(ASSET_PATHS.length).toBeGreaterThan(0);
    expect(PATTERNS.length).toBeGreaterThan(0);
  });

  it.each(ASSET_PATHS)("bundles %s for OTA", (path) => {
    expect(isBundled(path)).toBe(true);
  });
});
