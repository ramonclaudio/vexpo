import { ascBootstrap } from "../lib/asc-state.ts";
import { testflight } from "../lib/asc-testflight.ts";
import { BOLD, DIM, RESET, line, nop, ok, section } from "../lib/output.ts";

async function bootstrap() {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    throw new Error(
      `no ASC app found for bundle id ${bundleId ?? "(unset)"}; run \`vexpo apple credentials\` first`,
    );
  }
  return { tf: testflight(client), ascAppId };
}

export async function runTestflightGroupsList(opts: { json?: boolean } = {}): Promise<number> {
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
}

export async function runTestflightGroupsCreate(opts: {
  name: string;
  feedback?: boolean;
}): Promise<number> {
  const { tf, ascAppId } = await bootstrap();
  const created = await tf.betaGroups.create({
    name: opts.name,
    appId: ascAppId,
    feedbackEnabled: opts.feedback,
  });
  section(`Beta group ${created.attributes.name}`);
  ok(`id ${created.id}`);
  return 0;
}

export async function runTestflightGroupsView(
  groupId: string,
  opts: { json?: boolean },
): Promise<number> {
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
}

export async function runTestflightGroupsDelete(groupId: string): Promise<number> {
  const { tf } = await bootstrap();
  await tf.betaGroups.delete(groupId);
  section(`Group ${groupId} deleted`);
  ok("done");
  return 0;
}

export async function runTestflightTestersList(opts: {
  email?: string;
  json?: boolean;
}): Promise<number> {
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
}

export async function runTestflightInvite(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  groupId?: string;
}): Promise<number> {
  const { tf, ascAppId } = await bootstrap();

  // A tester only reaches an app through a beta group (ASC forbids an `apps`
  // relationship on tester creation), so resolve one up front: the flag, or
  // the app's single internal group.
  let groupId = opts.groupId;
  if (!groupId) {
    const groups = await tf.betaGroups.list({ appId: ascAppId });
    const internal = groups.find((g) => g.attributes.isInternalGroup);
    groupId = (internal ?? groups[0])?.id;
    if (!groupId) {
      throw new Error(
        'no beta group to invite into; create one first: `vexpo testflight groups create "Internal"`',
      );
    }
    nop(`no --group given; using ${internal ? "internal group" : "group"} ${groupId}`);
  }

  const existing = await tf.betaTesters.list({ email: opts.email, appId: ascAppId });
  let testerId = existing[0]?.id;
  if (!testerId) {
    const created = await tf.betaTesters.create({
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      groupIds: [groupId],
    });
    testerId = created.id;
    ok(`tester ${opts.email} added`);
  } else {
    ok(`tester ${opts.email} already exists (${testerId})`);
    await tf.betaGroups.addTesters(groupId, [testerId]);
  }

  const inv = await tf.betaTesterInvitations.create({ appId: ascAppId, testerId });
  section(`Invited ${opts.email}`);
  ok(`invitation ${inv.id}`);
  return 0;
}

export async function runTestflightWhatsNew(opts: {
  buildId: string;
  locale: string;
  text: string;
}): Promise<number> {
  const { tf } = await bootstrap();
  const loc = await tf.betaBuildLocalizations.upsert({
    buildId: opts.buildId,
    locale: opts.locale,
    whatsNew: opts.text,
  });
  section(`What's new for build ${opts.buildId}`);
  ok(`upserted (${loc.attributes.locale})`);
  return 0;
}
