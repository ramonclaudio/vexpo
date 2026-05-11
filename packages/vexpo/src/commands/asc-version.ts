/**
 * `vexpo asc:version` group. Inspect App Store version + review submission
 * state via the ASC API. Doctor uses this to surface stalled submissions.
 */

import { ascBootstrap } from "../lib/asc-state.ts";
import { versions, type AppStoreVersionState, type Platform } from "../lib/asc-versions.ts";
import { BOLD, DIM, RESET, bad, line, nop, ok, section } from "../lib/output.ts";

async function bootstrap() {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    throw new Error(
      `no ASC app for bundle id ${bundleId ?? "(unset)"}; run \`vexpo apple credentials\` first`,
    );
  }
  return { v: versions(client), ascAppId };
}

export async function runVersionList(opts: {
  platform?: Platform;
  state?: AppStoreVersionState;
  limit?: number;
  json?: boolean;
}): Promise<number> {
  try {
    const { v, ascAppId } = await bootstrap();
    const list = await v.appStoreVersions.list({
      appId: ascAppId,
      platform: opts.platform,
      state: opts.state,
      limit: opts.limit,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(list, null, 2) + "\n");
      return 0;
    }
    section("App Store versions");
    if (list.length === 0) {
      nop("none");
      return 0;
    }
    for (const ver of list) {
      line(
        `  ${BOLD}${ver.attributes.versionString ?? "?"}${RESET}  ${ver.attributes.platform ?? "?"}  ${DIM}${ver.attributes.appStoreState ?? "?"}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runVersionView(versionId: string, opts: { json?: boolean }): Promise<number> {
  try {
    const { v } = await bootstrap();
    const ver = await v.appStoreVersions.get(versionId);
    const phased = await v.phasedReleases.getForVersion(versionId).catch(() => null);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ version: ver, phasedRelease: phased }, null, 2) + "\n");
      return 0;
    }
    section(`Version ${ver.attributes.versionString ?? versionId}`);
    line(`  state:    ${ver.attributes.appStoreState ?? "?"}`);
    line(`  platform: ${ver.attributes.platform ?? "?"}`);
    if (ver.attributes.releaseType) line(`  release:  ${ver.attributes.releaseType}`);
    if (ver.attributes.earliestReleaseDate)
      line(`  earliest: ${ver.attributes.earliestReleaseDate}`);
    if (phased) {
      line(`  phased:   ${phased.attributes.phasedReleaseState ?? "?"}`);
      if (phased.attributes.startDate) line(`            started ${phased.attributes.startDate}`);
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runSubmissionsList(opts: {
  platform?: Platform;
  state?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const { v, ascAppId } = await bootstrap();
    const submissions = await v.reviewSubmissions.list({
      appId: ascAppId,
      platform: opts.platform,
      state: opts.state,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(submissions, null, 2) + "\n");
      return 0;
    }
    section("Review submissions");
    if (submissions.length === 0) {
      nop("none");
      return 0;
    }
    for (const s of submissions) {
      line(
        `  ${BOLD}${s.id.slice(0, 8)}${RESET}  ${s.attributes.state ?? "?"}  ${DIM}${s.attributes.submittedDate ?? ""}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runPhasedRelease(opts: {
  versionId: string;
  action: "pause" | "resume" | "complete";
}): Promise<number> {
  try {
    const { v } = await bootstrap();
    const phased = await v.phasedReleases.getForVersion(opts.versionId);
    if (!phased) {
      bad(`no phased release for version ${opts.versionId}`);
      return 1;
    }
    const next =
      opts.action === "pause"
        ? await v.phasedReleases.pause(phased.id)
        : opts.action === "resume"
          ? await v.phasedReleases.resume(phased.id)
          : await v.phasedReleases.complete(phased.id);
    section(`Phased release ${opts.action}d`);
    ok(next.attributes.phasedReleaseState ?? "ok");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
