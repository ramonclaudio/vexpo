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
    // Full id, not a prefix. `groups view`, `groups delete` and `invite --group`
    // all take this value straight from here, and Apple 404s a shortened one.
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
  const groups = await tf.betaGroups.list({ appId: ascAppId });
  const internal = groups.find((g) => g.attributes.isInternalGroup);
  const autoResolved = !opts.groupId;
  let groupId = opts.groupId ?? (internal ?? groups[0])?.id;
  if (!groupId) {
    throw new Error(
      'no beta group to invite into; create one first: `vexpo testflight groups create "Internal"`',
    );
  }
  if (autoResolved) {
    nop(`no --group given; using ${internal ? "internal group" : "group"} ${groupId}`);
  }

  const assign = async (gid: string): Promise<string> => {
    const existing = await tf.betaTesters.list({ email: opts.email, appId: ascAppId });
    if (existing[0]) {
      ok(`tester ${opts.email} already exists (${existing[0].id})`);
      // Re-adding a member 409s (STATE_ERROR), so check membership first.
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
    // Internal groups only take App Store Connect TEAM MEMBERS; an outside
    // email fails the assignment with STATE_ERROR "Tester(s) cannot be
    // assigned". When we picked the internal group ourselves, fall through to
    // the external group; an explicit --group gets the explanation instead.
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
  try {
    const inv = await tf.betaTesterInvitations.create({ appId: ascAppId, testerId });
    ok(`invitation ${inv.id}`);
  } catch (err) {
    // The tester is durably in the group; Apple just can't send the email
    // until the group has an installable build (external groups wait on beta
    // review). Not a failure: access flows automatically once a build clears.
    if (err instanceof AscApiError && err.code?.includes("NO_INSTALLABLE_BUILDS")) {
      ok("tester is in the group; the invite email sends once a build is installable");
      note("external groups wait on Beta App Review for their first build");
    } else {
      throw err;
    }
  }
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
