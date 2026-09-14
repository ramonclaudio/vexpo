import { isLoggedIn as convexLoggedIn } from "../lib/convex-env.ts";
import { easSpawn } from "../lib/eas-cli.ts";
import { whoami as easWhoami } from "../lib/eas-project.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { spawn } from "../lib/proc.ts";
import { probeAccess } from "../lib/resend-api.ts";
import {
  BOLD,
  DIM,
  GREEN,
  RESET,
  YELLOW,
  askYesNo,
  bad,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

type AccountsOptions = {
  check?: boolean;
  lite?: boolean;
};

type AccountStatus = "ok" | "missing" | "manual";

type AccountRow = {
  name: string;
  what: string;
  status: AccountStatus;
  detail?: string;
};

async function statusExpo(): Promise<AccountRow> {
  const who = await easWhoami();
  return {
    name: "Expo",
    what: "signed-in EAS CLI",
    status: who ? "ok" : "missing",
    detail: who ?? undefined,
  };
}

async function statusConvex(): Promise<AccountRow> {
  const yes = await convexLoggedIn();
  return {
    name: "Convex",
    what: "signed-in Convex CLI",
    status: yes ? "ok" : "missing",
  };
}

async function statusResend(): Promise<AccountRow> {
  const k = process.env.RESEND_FULL_ACCESS_KEY;
  if (!k) {
    return {
      name: "Resend",
      what: "full-access API key in RESEND_FULL_ACCESS_KEY",
      status: "missing",
      detail: "env var not set",
    };
  }
  const access = await probeAccess(k);
  if (access === "full") return { name: "Resend", what: "full-access API key", status: "ok" };
  return {
    name: "Resend",
    what: "full-access API key in RESEND_FULL_ACCESS_KEY",
    status: "missing",
    detail: access === "sending" ? "key only has sending access" : "key rejected",
  };
}

const ROW_APPLE: AccountRow = {
  name: "Apple Developer",
  what: "active Apple Developer Program membership",
  status: "manual",
};

const ROW_DOMAIN: AccountRow = {
  name: "Domain + DNS",
  what: "a domain you control DNS for",
  status: "manual",
};

function printTable(rows: AccountRow[]): void {
  const w = Math.max(...rows.map((r) => r.name.length));
  const wWhat = Math.max(...rows.map((r) => r.what.length));
  for (const r of rows) {
    const status =
      r.status === "ok"
        ? `${GREEN}ok${RESET}${r.detail ? ` ${DIM}(${r.detail})${RESET}` : ""}`
        : r.status === "missing"
          ? `${YELLOW}missing${RESET}${r.detail ? ` ${DIM}(${r.detail})${RESET}` : ""}`
          : `${DIM}you confirm${RESET}`;
    line(`  ${BOLD}${r.name.padEnd(w)}${RESET}  ${r.what.padEnd(wWhat)}  ${status}`);
  }
}

function whereBlock(opts: {
  title: string;
  lines: string[];
  urls: { label: string; url: string }[];
}): void {
  section(opts.title);
  for (const l of opts.lines) note(l);
  if (opts.urls.length > 0) {
    line();
    for (const { label, url } of opts.urls) note(`  ${label}: ${BOLD}${url}${RESET}`);
  }
}

function walkApple(): void {
  whereBlock({
    title: "Apple Developer Program",
    lines: [
      `${BOLD}what:${RESET}   active membership`,
      `${BOLD}cost:${RESET}   $99 a year, and Apple takes a day or two to verify you`,
      `${BOLD}notes:${RESET}  company accounts also need a D-U-N-S number (free, a day or two)`,
      "vexpo can't enroll you. Apple checks your identity and has you sign agreements.",
    ],
    urls: [{ label: "enroll", url: "https://developer.apple.com/programs/enroll/" }],
  });
}

function walkDomain(): void {
  whereBlock({
    title: "Domain + DNS access",
    lines: [
      `${BOLD}what:${RESET}   a domain you control DNS for`,
      `${BOLD}where:${RESET}  any registrar (Cloudflare, GoDaddy, Route 53, Namecheap, Vercel)`,
      `${BOLD}notes:${RESET}  after \`npx vexpo resend\`, you add the SPF, DKIM and DMARC records at your registrar.`,
      "        Resend's dashboard shows them and checks them. vexpo doesn't do this part.",
    ],
    urls: [],
  });
}

async function walkConvex(): Promise<AccountStatus> {
  if ((await statusConvex()).status === "ok") {
    ok("Convex CLI logged in");
    return "ok";
  }
  whereBlock({
    title: "Convex",
    lines: [
      `${BOLD}what:${RESET}   signed-in Convex CLI`,
      `${BOLD}where:${RESET}  free tier at dashboard.convex.dev`,
      `${BOLD}how:${RESET}    \`npx convex login\` opens the browser`,
    ],
    urls: [{ label: "dashboard", url: "https://dashboard.convex.dev" }],
  });
  if (!process.stdin.isTTY) {
    bad("no terminal to sign in from. run `npx convex login`, then try again");
    return "missing";
  }
  if (await askYesNo(`Run \`${dlx()} convex login\` now?`, false)) {
    const proc = spawn([dlx(), "convex", "login"]);
    if ((await proc.exited) !== 0) {
      yep("convex login did not complete. Run `npx convex login` later");
      return "missing";
    }
    const after = (await statusConvex()).status;
    if (after === "ok") ok("signed in to Convex");
    else yep("still not signed in. run `npx convex login` later");
    return after;
  }
  nop("`npx vexpo convex` will ask you to sign in when it runs");
  return "missing";
}

async function walkExpo(): Promise<AccountStatus> {
  const cur = await statusExpo();
  if (cur.status === "ok") {
    ok(`Expo CLI logged in as ${cur.detail}`);
    return "ok";
  }
  whereBlock({
    title: "Expo",
    lines: [
      `${BOLD}what:${RESET}   signed-in EAS CLI`,
      `${BOLD}where:${RESET}  free tier at expo.dev/signup`,
      `${BOLD}how:${RESET}    \`npx eas-cli login\` opens the browser`,
    ],
    urls: [
      { label: "signup", url: "https://expo.dev/signup" },
      { label: "dashboard", url: "https://expo.dev" },
    ],
  });
  if (!process.stdin.isTTY) {
    bad("no terminal to sign in from. run `npx eas-cli login`, then try again");
    return "missing";
  }
  if (await askYesNo(`Run \`${dlx()} eas login\` now?`, false)) {
    if ((await easSpawn(["login"])) !== 0) {
      yep("eas login did not complete. Run `npx eas-cli login` later");
      return "missing";
    }
    const after = await statusExpo();
    if (after.status === "ok") ok(`signed in as ${after.detail}`);
    else yep("still not signed in. run `npx eas-cli login` later");
    return after.status;
  }
  nop("the EAS step of `npx vexpo full` will ask you to sign in when it runs");
  return "missing";
}

async function walkResend(): Promise<void> {
  const cur = await statusResend();
  if (cur.status === "ok") {
    ok("Resend full-access key in env");
    return;
  }
  whereBlock({
    title: "Resend",
    lines: [
      `${BOLD}what:${RESET}   a full-access API key in the ${BOLD}RESEND_FULL_ACCESS_KEY${RESET} env var`,
      `${BOLD}where:${RESET}  free tier at resend.com`,
      `${BOLD}how:${RESET}    Create API Key, permission ${BOLD}Full Access${RESET}, copy it, export it`,
      `${BOLD}notes:${RESET}  used once to create the sending key, then thrown away.`,
      "        `npx vexpo resend` asks for it if the env var isn't set.",
    ],
    urls: [
      { label: "signup", url: "https://resend.com/signup" },
      { label: "API keys", url: "https://resend.com/api-keys" },
    ],
  });
  nop("`npx vexpo resend` asks for the key. nothing to do here");
}

export async function runAccounts(options: AccountsOptions): Promise<number> {
  section(options.lite ? "Accounts (lite, Convex only)" : "Accounts");

  if (options.lite) {
    const convex = await statusConvex();
    printTable([convex]);
    if (options.check) return convex.status === "ok" ? 0 : 1;
    await walkConvex();
    await recordStep("accounts");
    line();
    ok("accounts done (lite)");
    return 0;
  }

  const [expo, convex, resend] = await Promise.all([statusExpo(), statusConvex(), statusResend()]);
  const rows: AccountRow[] = [ROW_APPLE, ROW_DOMAIN, convex, expo, resend];

  printTable(rows);

  if (options.check) {
    const allOk = [convex, expo, resend].every((r) => r.status === "ok");
    return allOk ? 0 : 1;
  }

  walkApple();
  walkDomain();
  await walkConvex();
  await walkExpo();
  await walkResend();

  section("What you'll be asked for later");
  note(
    `${BOLD}vexpo apple asc-key${RESET}        App Store Connect API key (issuer ID, key ID, .p8)`,
  );
  note(
    `                           where: ${DIM}https://appstoreconnect.apple.com/access/integrations/api${RESET}`,
  );
  note(`${BOLD}vexpo apple jwt${RESET}            Sign in with Apple key (.p8 and key ID)`);
  note(
    `                           where: ${DIM}https://developer.apple.com/account/resources/authkeys/list${RESET}`,
  );
  note(
    `${BOLD}DNS records${RESET}                added at your registrar after \`npx vexpo resend\``,
  );
  note(`                           the Resend dashboard shows them and checks them`);

  await recordStep("accounts");

  line();
  ok("accounts done");
  return 0;
}
