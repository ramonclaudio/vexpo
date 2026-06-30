import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appName, appleTeamIdFallback, bundleIdFallback, pkgName, scheme } from "../../src/lib/app";

// `app.ts` reads `package.json` + `app.config.ts` from the current working
// directory. Tests chdir into a temp dir + write fixtures.

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "app-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("pkgName", () => {
  it("returns the package name from package.json", async () => {
    await writeFile("package.json", JSON.stringify({ name: "my-cool-app" }));
    expect(await pkgName()).toBe("my-cool-app");
  });

  it("returns 'app' fallback when package.json is missing", async () => {
    expect(await pkgName()).toBe("app");
  });

  it("returns 'app' fallback when package.json has no name field", async () => {
    await writeFile("package.json", JSON.stringify({ version: "1.0.0" }));
    expect(await pkgName()).toBe("app");
  });

  it("returns 'app' when package.json name is empty string", async () => {
    await writeFile("package.json", JSON.stringify({ name: "" }));
    expect(await pkgName()).toBe("app");
  });
});

describe("appName", () => {
  it("prefers app.config.ts `name:` field over package.json", async () => {
    await writeFile("package.json", JSON.stringify({ name: "my-package-kebab" }));
    await writeFile("app.config.ts", `export default { name: "My Display Name" };`);
    expect(await appName()).toBe("My Display Name");
  });

  it("falls back to title-cased pkgName when app.config.ts is missing", async () => {
    await writeFile("package.json", JSON.stringify({ name: "my-cool-app" }));
    expect(await appName()).toBe("My Cool App");
  });

  it("falls back to title-cased pkgName when app.config.ts has no name", async () => {
    await writeFile("package.json", JSON.stringify({ name: "foo-bar" }));
    await writeFile("app.config.ts", `export default { slug: "foo-bar" };`);
    expect(await appName()).toBe("Foo Bar");
  });

  it("title-cases underscored names", async () => {
    await writeFile("package.json", JSON.stringify({ name: "my_other_app" }));
    expect(await appName()).toBe("My Other App");
  });

  it("strips npm scope from the package name", async () => {
    await writeFile("package.json", JSON.stringify({ name: "@scope/my-app" }));
    expect(await appName()).toBe("My App");
  });

  it("returns 'App' when neither source produces a name", async () => {
    expect(await appName()).toBe("App");
  });

  it("matches single quotes in app.config.ts", async () => {
    await writeFile("app.config.ts", `export default { name: 'Single Quoted' };`);
    expect(await appName()).toBe("Single Quoted");
  });

  it("ignores app.config.ts `name:` inside a different object", async () => {
    // Top-level name only. Nested `name:` in plugin config shouldn't win.
    await writeFile(
      "app.config.ts",
      `export default {
  name: "Top Level",
  plugins: [["something", { name: "nested-do-not-pick" }]],
};`,
    );
    expect(await appName()).toBe("Top Level");
  });
});

describe("scheme", () => {
  it("extracts the scheme from app.config.ts", async () => {
    await writeFile("app.config.ts", `export default { scheme: "myapp" };`);
    expect(await scheme()).toBe("myapp");
  });

  it("returns 'app' fallback when app.config.ts is missing", async () => {
    expect(await scheme()).toBe("app");
  });

  it("returns 'app' fallback when app.config.ts has no scheme", async () => {
    await writeFile("app.config.ts", `export default { name: "x" };`);
    expect(await scheme()).toBe("app");
  });

  it("matches single quotes", async () => {
    await writeFile("app.config.ts", `export default { scheme: 'singlequoted' };`);
    expect(await scheme()).toBe("singlequoted");
  });
});

describe("bundleIdFallback", () => {
  it('extracts the bundle id from the `EXPO_PUBLIC_APP_BUNDLE_ID ?? "..."` pattern', async () => {
    // Matches the actual shape of app.config.ts in the template: a const
    // declaration that reads from process.env with a string fallback.
    await writeFile(
      "app.config.ts",
      `const APP_BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? "com.example.myapp";`,
    );
    expect(await bundleIdFallback()).toBe("com.example.myapp");
  });

  it("resolves the committed backtick/template form to a bundle id", async () => {
    await writeFile(
      "app.config.ts",
      "const APP_BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? `com.example.${pkg.name}`;",
    );
    expect(await bundleIdFallback()).toBe("com.example.${pkg.name}");
  });

  it("returns null when app.config.ts is missing", async () => {
    expect(await bundleIdFallback()).toBeNull();
  });

  it("returns null when no fallback pattern is present", async () => {
    await writeFile("app.config.ts", `export default { name: "x" };`);
    expect(await bundleIdFallback()).toBeNull();
  });
});

describe("appleTeamIdFallback", () => {
  it("extracts a non-placeholder team id from the env-fallback pattern", async () => {
    await writeFile(
      "app.config.ts",
      `const APPLE_TEAM_ID = process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? "REAL000000";`,
    );
    expect(await appleTeamIdFallback()).toBe("REAL000000");
  });

  it("returns null for the template placeholder `ABCDE12345`", async () => {
    await writeFile(
      "app.config.ts",
      `const APPLE_TEAM_ID = process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? "ABCDE12345";`,
    );
    expect(await appleTeamIdFallback()).toBeNull();
  });

  it("returns null when no team id pattern is present", async () => {
    await writeFile("app.config.ts", `export default { name: "x" };`);
    expect(await appleTeamIdFallback()).toBeNull();
  });

  it("returns null when app.config.ts is missing", async () => {
    expect(await appleTeamIdFallback()).toBeNull();
  });
});
