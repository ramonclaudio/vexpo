import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../scripts/eas-inject-asc-app-id.mjs", import.meta.url));
const EAS = JSON.stringify(
  { submit: { testflight: { ios: { metadataPath: "./store.config.json" } }, production: { ios: {} } } },
  null,
  2,
);

const dirs: string[] = [];
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "inject-asc-"));
  writeFileSync(join(dir, "eas.json"), EAS);
  dirs.push(dir);
  return dir;
}
function run(dir: string, ascAppId?: string): Record<string, { ios?: { ascAppId?: string } }> {
  const env = { ...process.env };
  if (ascAppId === undefined) delete env.ASC_APP_ID;
  else env.ASC_APP_ID = ascAppId;
  execFileSync("node", [SCRIPT], { cwd: dir, env });
  return JSON.parse(readFileSync(join(dir, "eas.json"), "utf8")).submit;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("eas-inject-asc-app-id", () => {
  it("writes ASC_APP_ID into every submit profile when set", () => {
    const submit = run(sandbox(), "6763961390");
    expect(submit.testflight.ios?.ascAppId).toBe("6763961390");
    expect(submit.production.ios?.ascAppId).toBe("6763961390");
  });

  it("is a no-op when ASC_APP_ID is unset (committed id, if any, stays)", () => {
    const submit = run(sandbox(), undefined);
    expect(submit.testflight.ios?.ascAppId).toBeUndefined();
    expect(submit.production.ios?.ascAppId).toBeUndefined();
  });
});
