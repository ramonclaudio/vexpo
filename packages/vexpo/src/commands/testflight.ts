import { AscApiError } from "../lib/asc-api.ts";
import { ascBootstrap } from "../lib/asc-state.ts";
import { testflight } from "../lib/asc-testflight.ts";
import { BOLD, DIM, RESET, line, nop, note, ok, section } from "../lib/output.ts";

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
    line(`  ${BOLD}${g.id}${RESET}  ${name}  ${DIM}${internal}${RESET}`);
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

type TestflightClient = Awaited<ReturnType<typeof bootstrap>>["tf"];
type BetaGroup = Awaited<ReturnType<TestflightClient["betaGroups"]["list"]>>[number];

async function resolveBetaGroup(
  tf: TestflightClient,
  ascAppId: string,
  requested: string | undefined,
): Promise<{ groupId: string; groups: BetaGroup[]; internal?: BetaGroup; autoResolved: boolean }> {
  const groups = await tf.betaGroups.list({ appId: ascAppId });
  const internal = groups.find((g) => g.attributes.isInternalGroup);
  const groupId = requested ?? (internal ?? groups[0])?.id;
  if (!groupId) {
    throw new Error(
      'no beta group to invite into; create one first: `vexpo testflight groups create "Internal"`',
    );
  }
  const autoResolved = !requested;
  if (autoResolved) {
    nop(`no --group given; using ${internal ? "internal group" : "group"} ${groupId}`);
  }
  return { groupId, groups, internal, autoResolved };
}

async function sendInvitation(
  tf: TestflightClient,
  ascAppId: string,
  testerId: string,
): Promise<void> {
  try {
    const inv = await tf.betaTesterInvitations.create({ appId: ascAppId, testerId });
    ok(`invitation ${inv.id}`);
  } catch (err) {
    if (!(err instanceof AscApiError) || !err.code?.includes("NO_INSTALLABLE_BUILDS")) throw err;
    ok("tester is in the group; the invite email sends once a build is installable");
    note("external groups wait on Beta App Review for their first build");
  }
}

export async function runTestflightInvite(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  groupId?: string;
}): Promise<number> {
  const { tf, ascAppId } = await bootstrap();
  const { groups, internal, autoResolved, ...resolved } = await resolveBetaGroup(
    tf,
    ascAppId,
    opts.groupId,
  );
  let groupId = resolved.groupId;

  const assign = async (gid: string): Promise<string> => {
    const existing = await tf.betaTesters.list({ email: opts.email, appId: ascAppId });
    if (existing[0]) {
      ok(`tester ${opts.email} already exists (${existing[0].id})`);
      const members = await tf.betaGroups.listTesters(gid);
      if (members.some((m) => m.id === existing[0]!.id)) {
        nop("already in the group");
      } else {
        await tf.betaGroups.addTesters(gid, [existing[0].id]);
      }
      return existing[0].id;
    }
    const created = await tf.betaTesters.create({
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      groupIds: [gid],
    });
    ok(`tester ${opts.email} added`);
    return created.id;
  };

  let testerId: string;
  try {
    testerId = await assign(groupId);
  } catch (err) {
    const stateError = err instanceof AscApiError && err.code?.startsWith("STATE_ERROR");
    const external = groups.find((g) => !g.attributes.isInternalGroup);
    const blockedByInternal = stateError && groupId === internal?.id;
    if (!blockedByInternal || !autoResolved || !external) {
      if (blockedByInternal) {
        note("internal groups only accept App Store Connect team members;");
        note("invite outside emails into an external group (`--group <id>`)");
      }
      throw err;
    }
    nop(`${opts.email} isn't a team member; using external group ${external.id}`);
    groupId = external.id;
    testerId = await assign(groupId);
  }

  section(`Invited ${opts.email}`);
  await sendInvitation(tf, ascAppId, testerId);
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

type FeedbackOpts = { limit: number; json?: boolean };

function feedbackLine(a: {
  createdDate?: string;
  email?: string;
  deviceModel?: string;
  osVersion?: string;
  comment?: string;
}): void {
  const when = a.createdDate?.slice(0, 16).replace("T", " ") ?? "";
  const who = a.email ?? "(anonymous)";
  const device = [a.deviceModel, a.osVersion].filter(Boolean).join(" ");
  line(`  ${BOLD}${when}${RESET}  ${who}  ${DIM}${device}${RESET}`);
  for (const l of (a.comment ?? "").split("\n").filter(Boolean)) line(`    ${l}`);
}

export async function runTestflightFeedback(opts: FeedbackOpts): Promise<number> {
  const { tf, ascAppId } = await bootstrap();
  const items = await tf.betaFeedback.screenshots(ascAppId, opts.limit);
  if (opts.json) {
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return 0;
  }
  section("TestFlight feedback");
  if (items.length === 0) {
    nop("no screenshot feedback yet");
    return 0;
  }
  for (const item of items) {
    feedbackLine(item.attributes);
    for (const shot of item.attributes.screenshots ?? []) {
      if (shot.url) note(`    ${shot.url}`);
    }
  }
  return 0;
}

export async function runTestflightCrashes(opts: FeedbackOpts): Promise<number> {
  const { tf, ascAppId } = await bootstrap();
  const items = await tf.betaFeedback.crashes(ascAppId, opts.limit);
  if (opts.json) {
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return 0;
  }
  section("TestFlight crashes");
  if (items.length === 0) {
    nop("no crash reports yet");
    return 0;
  }
  for (const item of items) feedbackLine(item.attributes);
  note("full crash logs live in App Store Connect > TestFlight > Crashes");
  return 0;
}
