/**
 * `vexpo testflight` group. Manages beta groups + testers via the ASC API
 * because eas-cli stops at uploading the build.
 *
 *   vexpo testflight groups (list|create|view|delete)
 *   vexpo testflight testers (list|add|remove)
 *   vexpo testflight invite <email> --group <id>
 *   vexpo testflight whats-new <buildId> --locale en-US "release notes"
 */

import { ascBootstrap } from "../lib/asc-state.ts";
import { testflight } from "../lib/asc-testflight.ts";
import { BOLD, DIM, RESET, bad, line, nop, ok, section } from "../lib/output.ts";

async function bootstrap() {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    throw new Error(
      `no ASC app found for bundle id ${bundleId ?? "(unset)"}; run \`vexpo apple credentials\` first`,
    );
  }
  return { tf: testflight(client), ascAppId };
}

/* groups -------------------------------------------------------------- */

export async function runTestflightGroupsList(opts: { json?: boolean } = {}): Promise<number> {
  try {
    const { tf, ascAppId } = await bootstrap();
    const groups = await tf.betaGroups.list({ appId: ascAppId });
    if (opts.json) {
      process.stdout.write(JSON.stringify(groups, null, 2) + "\n");
      return 0;
    }
    section("Beta groups");
    if (groups.length === 0) {
      nop("no groups");
      return 0;
    }
    for (const g of groups) {
      const internal = g.attributes.isInternalGroup ? "internal" : "external";
      const name = g.attributes.name ?? "(unnamed)";
      line(`  ${BOLD}${g.id.slice(0, 8)}${RESET}  ${name}  ${DIM}${internal}${RESET}`);
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runTestflightGroupsCreate(opts: {
  name: string;
  publicLink?: boolean;
  publicLimit?: number;
  feedback?: boolean;
}): Promise<number> {
  try {
    const { tf, ascAppId } = await bootstrap();
    const created = await tf.betaGroups.create({
      name: opts.name,
      appId: ascAppId,
      publicLinkEnabled: opts.publicLink,
      publicLinkLimit: opts.publicLimit,
      feedbackEnabled: opts.feedback,
    });
    section(`Beta group ${created.attributes.name}`);
    ok(`id ${created.id}`);
    if (created.attributes.publicLink) line(`  public link: ${created.attributes.publicLink}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runTestflightGroupsView(
  groupId: string,
  opts: { json?: boolean },
): Promise<number> {
  try {
    const { tf } = await bootstrap();
    const [group, testers] = await Promise.all([
      tf.betaGroups.get(groupId),
      tf.betaGroups.listTesters(groupId).catch(() => []),
    ]);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ group, testers }, null, 2) + "\n");
      return 0;
    }
    section(`Group ${group.attributes.name ?? groupId}`);
    line(`  id: ${group.id}`);
    line(`  internal: ${group.attributes.isInternalGroup ? "yes" : "no"}`);
    if (group.attributes.publicLink) line(`  public link: ${group.attributes.publicLink}`);
    line(`  testers: ${testers.length}`);
    for (const t of testers) {
      line(
        `    ${t.attributes.email ?? "(no email)"}  ${DIM}${t.attributes.firstName ?? ""} ${t.attributes.lastName ?? ""}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runTestflightGroupsDelete(groupId: string): Promise<number> {
  try {
    const { tf } = await bootstrap();
    await tf.betaGroups.delete(groupId);
    section(`Group ${groupId} deleted`);
    ok("done");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

/* testers ------------------------------------------------------------- */

export async function runTestflightTestersList(opts: {
  email?: string;
  json?: boolean;
}): Promise<number> {
  try {
    const { tf, ascAppId } = await bootstrap();
    const testers = await tf.betaTesters.list({ appId: ascAppId, email: opts.email });
    if (opts.json) {
      process.stdout.write(JSON.stringify(testers, null, 2) + "\n");
      return 0;
    }
    section("Beta testers");
    if (testers.length === 0) {
      nop("none");
      return 0;
    }
    for (const t of testers) {
      const name = `${t.attributes.firstName ?? ""} ${t.attributes.lastName ?? ""}`.trim();
      line(
        `  ${BOLD}${t.attributes.email ?? "(no email)"}${RESET}  ${name ? DIM + name + RESET + "  " : ""}${DIM}${t.attributes.state ?? ""}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runTestflightInvite(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  groupId?: string;
}): Promise<number> {
  try {
    const { tf, ascAppId } = await bootstrap();

    const existing = await tf.betaTesters.list({ email: opts.email, appId: ascAppId });
    let testerId = existing[0]?.id;
    if (!testerId) {
      const created = await tf.betaTesters.create({
        email: opts.email,
        firstName: opts.firstName,
        lastName: opts.lastName,
        appIds: [ascAppId],
        groupIds: opts.groupId ? [opts.groupId] : [],
      });
      testerId = created.id;
      ok(`tester ${opts.email} added`);
    } else {
      ok(`tester ${opts.email} already exists (${testerId})`);
      if (opts.groupId) await tf.betaGroups.addTesters(opts.groupId, [testerId]);
    }

    const inv = await tf.betaTesterInvitations.create({ appId: ascAppId, testerId });
    section(`Invited ${opts.email}`);
    ok(`invitation ${inv.id}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runTestflightRemove(email: string): Promise<number> {
  try {
    const { tf, ascAppId } = await bootstrap();
    const matches = await tf.betaTesters.list({ email, appId: ascAppId });
    if (matches.length === 0) {
      bad(`no tester with email ${email}`);
      return 1;
    }
    for (const t of matches) await tf.betaTesters.delete(t.id);
    section(`Removed ${matches.length} tester${matches.length === 1 ? "" : "s"}`);
    ok("done");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

/* "what's new" release notes ----------------------------------------- */

export async function runTestflightWhatsNew(opts: {
  buildId: string;
  locale: string;
  text: string;
}): Promise<number> {
  try {
    const { tf } = await bootstrap();
    const loc = await tf.betaBuildLocalizations.upsert({
      buildId: opts.buildId,
      locale: opts.locale,
      whatsNew: opts.text,
    });
    section(`What's new for build ${opts.buildId}`);
    ok(`upserted (${loc.attributes.locale})`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
