import { deploymentSlug, envMap, envSet, type ConvexTarget } from "../lib/convex-env.ts";
import { readEnvFile } from "../lib/env-files.ts";
import { fileExists } from "../lib/fs.ts";
import { BOLD, RESET, bad, line, note, ok, section } from "../lib/output.ts";

export type ConvexMigrateOptions = {
  from?: string;
  prod?: boolean;
  dryRun?: boolean;
};

export function selectMigratableEnv(
  src: Map<string, string>,
  dst: Map<string, string>,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of src) {
    if (key.startsWith("CONVEX_")) continue;
    if (dst.get(key) === value) continue;
    out.push([key, value]);
  }
  return out;
}

export async function runConvexMigrate(options: ConvexMigrateOptions): Promise<number> {
  const channel = options.prod ? "prod" : "dev";
  section(`Convex migrate (${channel})`);

  if (!options.from) {
    bad("--from <deployment> is required (the source deployment slug)");
    return 1;
  }
  const fromSlug = deploymentSlug(options.from) ?? options.from;

  let target: ConvexTarget | undefined;
  if (options.prod) {
    const prodFile = (await fileExists(".env.prod")) ? ".env.prod" : ".env.production";
    const prodEnv = await readEnvFile(prodFile);
    const deployKey = prodEnv.get("CONVEX_DEPLOY_KEY") ?? "";
    const selector = prodEnv.get("CONVEX_DEPLOYMENT") ?? "";
    if (!deployKey.startsWith("prod:") && !selector.startsWith("prod:")) {
      bad(`${prodFile} has no prod-scoped CONVEX_DEPLOY_KEY or CONVEX_DEPLOYMENT`);
      note("the copy would land on the DEV deployment (the dev key shadows --prod)");
      return 1;
    }
    target = { prod: true, envFile: prodFile };
  }

  const src = await envMap({ deployment: fromSlug });
  if (!src || src.size === 0) {
    bad(`no env on source deployment ${fromSlug} (unreachable or empty)`);
    note("pass a deployment slug your account can reach, e.g. `--from old-deployment-123`");
    return 1;
  }
  const dst = await envMap(target);
  if (!dst) {
    bad("couldn't read the target deployment's env (auth/CLI failure)");
    note("run `npx convex login` (or check the prod deploy key) and re-run");
    return 1;
  }
  const toMove = selectMigratableEnv(src, dst);

  if (toMove.length === 0) {
    ok(`target already matches ${fromSlug} (nothing to copy)`);
    return 0;
  }

  line();
  note(
    `${BOLD}${toMove.length}${RESET} server-side var${toMove.length === 1 ? "" : "s"} to copy from ${fromSlug}:`,
  );
  for (const [key] of toMove) note(`  ${key}`);

  if (options.dryRun) {
    line();
    note("--dry-run; exiting without changes");
    return 0;
  }

  let failed = 0;
  for (const [key, value] of toMove) {
    try {
      await envSet(key, value, target);
      ok(`copied ${key}`);
    } catch (err) {
      bad(`${key} failed: ${err instanceof Error ? err.message : err}`);
      failed += 1;
    }
  }

  line();
  if (failed > 0) {
    bad(`${failed} write${failed === 1 ? "" : "s"} failed`);
    return 1;
  }
  ok(
    `migrated ${toMove.length} var${toMove.length === 1 ? "" : "s"} onto the ${channel} deployment`,
  );
  note(`next: ${BOLD}vexpo env convex-key${RESET} (EAS deploy key + selector)`);
  note(`      ${BOLD}vexpo resend --repoint${options.prod ? " --prod" : ""}${RESET} (webhook)`);
  note(`then: ${BOLD}vexpo doctor --channel ${channel}${RESET}`);
  return 0;
}
