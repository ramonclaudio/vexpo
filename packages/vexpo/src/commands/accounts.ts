import { isLoggedIn as convexLoggedIn } from "../lib/convex-env.ts";
import { whoami as easWhoami } from "../lib/eas-env.ts";
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

export type AccountsOptions = {
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
    what: "logged-in EAS CLI",
    status: who ? "ok" : "missing",
    detail: who ?? undefined,
  };
}

async function statusConvex(): Promise<AccountRow> {
  const yes = await convexLoggedIn();
  return {
    name: "Convex",
    what: "logged-in Convex CLI",
    status: yes ? "ok" : "missing",
  };
}

async function statusResend(): Promise<AccountRow> {
  const k = process.env.RESEND_FULL_ACCESS_KEY;
  if (!k) {
    return {
      name: "Resend",
      what: "full-access API key in RESEND_FULL_ACCESS_KEY env",
      status: "missing",
      detail: "no env var",
    };
  }
  const access = await probeAccess(k);
  if (access === "full") return { name: "Resend", what: "full-access API key", status: "ok" };
  return {
    name: "Resend",
    what: "full-access API key in RESEND_FULL_ACCESS_KEY env",
    status: "missing",
    detail: access === "sending" ? "key has only sending access" : "key invalid",
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
          : `${DIM}manual confirm${RESET}`;
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

async function walkApple(): Promise<{ enrolled: boolean }> {
  whereBlock({
    title: "Apple Developer Program",
    lines: [
      `${BOLD}what:${RESET}   active membership`,
      `${BOLD}cost:${RESET}   $99/yr, 24-48h to verify (Apple-side, can't be hurried)`,
      `${BOLD}notes:${RESET}  org accounts also need a D-U-N-S number (free, ~1-2d)`,
      "vexpo can't enroll you (Apple requires identity verification + agreements).",
    ],
    urls: [{ label: "enroll", url: "https://developer.apple.com/programs/enroll/" }],
  });
  if (!process.stdin.isTTY) {
    nop("non-TTY: assuming enrolled");
    return { enrolled: true };
  }
  const enrolled = await askYesNo("Are you enrolled?", true);
  if (enrolled) ok("enrollment confirmed");
  else yep("enrollment incomplete; iOS distribution + Sign In with Apple will be blocked");
  return { enrolled };
}

async function walkDomain(): Promise<{ ready: boolean }> {
  whereBlock({
    title: "Domain + DNS access",
    lines: [
      `${BOLD}what:${RESET}   a domain you control DNS for`,
      `${BOLD}where:${RESET}  any registrar (Cloudflare, GoDaddy, Route 53, Namecheap, Vercel, …)`,
      `${BOLD}notes:${RESET}  after \`npx vexpo resend\`, you'll add SPF/DKIM/DMARC records at your registrar`,
      "        Resend's dashboard shows them and verifies. vexpo doesn't automate this.",
      "vexpo doesn't register domains for you.",
    ],
    urls: [],
  });
  if (!process.stdin.isTTY) {
    nop("non-TTY: assuming ready");
    return { ready: true };
  }
  const ready = await askYesNo("Do you have a domain you can edit DNS for?", true);
  if (ready) ok("domain access confirmed");
  else yep("no domain; transactional email will be blocked until one is set up");
  return { ready };
}

async function walkConvex(): Promise<void> {
  if ((await statusConvex()).status === "ok") {
    ok("Convex CLI logged in");
    return;
  }
  whereBlock({
    title: "Convex",
    lines: [
      `${BOLD}what:${RESET}   logged-in Convex CLI session`,
      `${BOLD}where:${RESET}  free tier at dashboard.convex.dev (instant signup)`,
      `${BOLD}how:${RESET}    \`npx convex login\` (browser-based OAuth)`,
    ],
    urls: [{ label: "dashboard", url: "https://dashboard.convex.dev" }],
  });
  if (!process.stdin.isTTY) {
    bad("non-TTY: run `npx convex login` then re-run");
    return;
  }
  if (await askYesNo(`Run \`${dlx()} convex login\` now?`, false)) {
    const proc = spawn([dlx(), "convex", "login"], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    if ((await proc.exited) !== 0) {
      yep("convex login did not complete; run `npx convex login` later");
      return;
    }
    if ((await statusConvex()).status === "ok") ok("Convex authenticated");
    else yep("still not signed in; run `npx convex login` later");
  } else {
    nop("`npx convex login` will prompt automatically when `npx vexpo convex` runs");
  }
}

async function walkExpo(): Promise<void> {
  const cur = await statusExpo();
  if (cur.status === "ok") {
    ok(`Expo CLI logged in as ${cur.detail}`);
    return;
  }
  whereBlock({
    title: "Expo",
    lines: [
      `${BOLD}what:${RESET}   logged-in EAS CLI session`,
      `${BOLD}where:${RESET}  free tier at expo.dev/signup (instant signup)`,
      `${BOLD}how:${RESET}    \`npx eas login\` (browser-based OAuth)`,
    ],
    urls: [
      { label: "signup", url: "https://expo.dev/signup" },
      { label: "dashboard", url: "https://expo.dev" },
    ],
  });
  if (!process.stdin.isTTY) {
    bad("non-TTY: run `npx eas login` then re-run");
    return;
  }
  if (await askYesNo(`Run \`${dlx()} eas login\` now?`, false)) {
    const proc = spawn([dlx(), "eas", "login"], { stdio: ["inherit", "inherit", "inherit"] });
    if ((await proc.exited) !== 0) {
      yep("eas login did not complete; run `npx eas login` later");
      return;
    }
    const after = await statusExpo();
    if (after.status === "ok") ok(`signed in as ${after.detail}`);
    else yep("still not signed in; run `npx eas login` later");
  } else {
    nop("`npx eas login` will prompt automatically when the EAS phase of `npx vexpo full` runs");
  }
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
      `${BOLD}what:${RESET}   full-access API key in ${BOLD}RESEND_FULL_ACCESS_KEY${RESET} env`,
      `${BOLD}where:${RESET}  free tier at resend.com (instant signup)`,
      `${BOLD}how:${RESET}    Create API Key → Permission: ${BOLD}Full Access${RESET} → copy → export`,
      `${BOLD}notes:${RESET}  used once to provision a scoped sending key, then discarded.`,
      "        `npx vexpo resend` will prompt for it interactively if env isn't set.",
    ],
    urls: [
      { label: "signup", url: "https://resend.com/signup" },
      { label: "API keys", url: "https://resend.com/api-keys" },
    ],
  });
  nop("`npx vexpo resend` handles the key prompt. Nothing to do here");
}

export async function runAccounts(options: AccountsOptions): Promise<number> {
  try {
    section(options.lite ? "Accounts (lite mode. Convex only)" : "Accounts");

    if (options.lite) {
      const convex = await statusConvex();
      printTable([convex]);
      if (options.check) return convex.status === "ok" ? 0 : 1;
      await walkConvex();
      await recordStep("accounts", {
        lite: true,
        convex: { signedIn: (await statusConvex()).status === "ok" },
      });
      line();
      ok("accounts step complete (lite)");
      return 0;
    }

    const [expo, convex, resend] = await Promise.all([
      statusExpo(),
      statusConvex(),
      statusResend(),
    ]);
    const rows: AccountRow[] = [ROW_APPLE, ROW_DOMAIN, convex, expo, resend];

    printTable(rows);

    if (options.check) {
      const allOk = [convex, expo, resend].every((r) => r.status === "ok");
      return allOk ? 0 : 1;
    }

    const apple = await walkApple();
    const domain = await walkDomain();
    await walkConvex();
    await walkExpo();
    await walkResend();

    section("What you'll be prompted for later");
    note(
      `${BOLD}vexpo apple asc-key${RESET}        App Store Connect API key (issuer ID, key ID, .p8)`,
    );
    note(
      `                           where: ${DIM}https://appstoreconnect.apple.com/access/integrations/api${RESET}`,
    );
    note(`${BOLD}vexpo apple jwt${RESET}            Sign In with Apple key (.p8 + key ID)`);
    note(
      `                           where: ${DIM}https://developer.apple.com/account/resources/authkeys/list${RESET}`,
    );
    note(
      `${BOLD}DNS records${RESET}                added at your registrar after \`npx vexpo resend\``,
    );
    note(`                           Resend dashboard shows them + verifies them`);

    await recordStep("accounts", {
      apple: { enrolled: apple.enrolled },
      domain: { ready: domain.ready },
      expo: { signedIn: (await statusExpo()).status === "ok" },
      convex: { signedIn: (await statusConvex()).status === "ok" },
      resend: { fullAccessKeyInEnv: (await statusResend()).status === "ok" },
    });

    line();
    ok("accounts step complete");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
