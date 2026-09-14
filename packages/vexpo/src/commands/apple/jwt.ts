import { CLIENT_SECRET_DAYS, signClientSecret } from "../../lib/apple-jwt.ts";
import { deploymentSlug, envMap, envSet } from "../../lib/convex-env.ts";
import { readOne } from "../../lib/env-local.ts";
import { fileExists } from "../../lib/fs.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  errText,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../../lib/output.ts";
import { expandTilde, stagedP8 } from "../../lib/path.ts";
import { load as loadState, recordStep, type SetupState } from "../../lib/state.ts";

type AppleJwtOptions = {
  rotate?: boolean;
  copyFrom?: string;
};

const APPLE_ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_CLIENT_SECRET",
] as const;

async function setIfChanged(
  env: Map<string, string>,
  key: string,
  value: string,
): Promise<boolean> {
  if (env.get(key) === value) return false;
  await envSet(key, value);
  return true;
}

async function copyAppleEnv(from: string): Promise<number> {
  section("Apple Sign In");
  const slug = deploymentSlug(from) ?? from;
  const src = (await envMap({ deployment: slug })) ?? new Map<string, string>();
  const present = APPLE_ENV_KEYS.filter((k) => src.has(k) && src.get(k));
  if (present.length === 0) {
    bad(`no APPLE_* vars on deployment ${slug} (unreachable or never set up)`);
    note("pass a deployment slug your account can reach, like `--copy-from old-deployment-123`");
    return 1;
  }
  const dst = (await envMap()) ?? new Map<string, string>();
  let copied = 0;
  for (const key of present) {
    if (await setIfChanged(dst, key, src.get(key)!)) {
      ok(`copied ${key} from ${slug}`);
      copied += 1;
    } else nop(`${key} already matches`);
  }
  line();
  ok(`Apple env copied from ${slug} (${copied} changed)`);
  if (!present.includes("APPLE_CLIENT_SECRET")) {
    yep("the source had no APPLE_CLIENT_SECRET, sign one with `vexpo apple jwt`");
  } else {
    note("the copied secret keeps the source's expiry date, sign a new one before then");
  }
  return 0;
}

async function cachedP8Path(state: SetupState): Promise<string | undefined> {
  const raw = state.steps["apple-sign-in"]?.outputs?.p8Path;
  if (typeof raw !== "string") return undefined;
  const path = expandTilde(raw);
  return (await fileExists(path)) ? path : undefined;
}

async function resolveP8Path(state: SetupState): Promise<string> {
  if (process.env.APPLE_P8_PATH) return expandTilde(process.env.APPLE_P8_PATH);
  const cachedP8 = (await cachedP8Path(state)) ?? stagedP8();
  if (!process.stdin.isTTY) return cachedP8 ?? "";
  const hint = cachedP8 ? `[${cachedP8}]` : "";
  const typed = (await ask(`  Path to the Sign in with Apple .p8 ${DIM}${hint}${RESET} > `)).trim();
  const raw = typed || cachedP8;
  return raw ? expandTilde(raw) : "";
}

async function promptOrEnv(envName: string, prompt: string): Promise<string | undefined> {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return undefined;
  const v = (await ask(`  ${envName} ${DIM}(${prompt}, paste or Enter to skip) >${RESET} `)).trim();
  return v || undefined;
}

type AppleIdentity = { servicesId: string; teamId: string; keyId: string };

async function resolveIdentity(
  env: Map<string, string>,
  rotateOnly: boolean,
): Promise<AppleIdentity | null> {
  let servicesId = env.get("APPLE_CLIENT_ID");
  let teamId = env.get("APPLE_TEAM_ID");
  let keyId = env.get("APPLE_KEY_ID");

  if (!rotateOnly) {
    const fromLocal = await readOne("APPLE_CLIENT_ID");
    if (fromLocal) ok(`reading APPLE_CLIENT_ID from .env.local: ${fromLocal}`);
    servicesId =
      fromLocal ??
      (await promptOrEnv("APPLE_CLIENT_ID", "Services ID, e.g. com.you.app.signin")) ??
      servicesId;
    teamId = (await promptOrEnv("APPLE_TEAM_ID", "10-char team ID")) ?? teamId;
    keyId = (await promptOrEnv("APPLE_KEY_ID", "10-char key ID")) ?? keyId;
  }

  if (!servicesId || !teamId || !keyId) {
    yep("missing one of APPLE_CLIENT_ID, APPLE_TEAM_ID or APPLE_KEY_ID, stopping");
    note("run this again with the values, or set them as env vars");
    return null;
  }
  return { servicesId, teamId, keyId };
}

async function walkThroughAppleConsole(): Promise<void> {
  note("Sign in with Apple needs four values. Create them in Apple Developer:");
  note(
    "  1. a Services ID with Sign in with Apple on (return URL: <convex-site>/api/auth/sign-in/apple/callback)",
  );
  note("  2. a Sign in with Apple key (download the .p8 once, Apple only shows it once)");
  note("  3. the Team ID and Key ID, ten characters each");
  line();
  await helpAndWait({
    body: "Open the Apple Developer Console:",
    urls: [
      {
        label: "Identifiers (Services ID)",
        url: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
      },
      {
        label: "Keys (Sign In with Apple key)",
        url: "https://developer.apple.com/account/resources/authkeys/list",
      },
    ],
    allowSkip: true,
  });
}

export async function runAppleJwt(options: AppleJwtOptions): Promise<number> {
  if (options.copyFrom) return await copyAppleEnv(options.copyFrom);

  section("Apple Sign In");

  const env = (await envMap()) ?? new Map<string, string>();
  const rotateOnly = options.rotate === true;

  if (rotateOnly) {
    const missing = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID"].filter((k) => !env.has(k));
    if (missing.length) {
      bad(`--rotate needs ${missing.join(", ")} on the deployment. run without --rotate first`);
      return 1;
    }
  } else {
    await walkThroughAppleConsole();
  }

  const identity = await resolveIdentity(env, rotateOnly);
  if (!identity) return 1;
  const { servicesId, teamId, keyId } = identity;

  for (const [key, value] of [
    ["APPLE_CLIENT_ID", servicesId],
    ["APPLE_TEAM_ID", teamId],
    ["APPLE_KEY_ID", keyId],
  ] as const) {
    if (await setIfChanged(env, key, value)) ok(`set ${key}=${value}`);
    else nop(`${key} already set`);
  }

  const p8Path = await resolveP8Path(await loadState());
  if (!p8Path) {
    yep("no .p8 path given, APPLE_CLIENT_SECRET unchanged");
    note("run again with APPLE_P8_PATH=/path/to/AuthKey.p8, or paste the path when asked");
    return 1;
  }

  let jwt: string;
  try {
    jwt = await signClientSecret({ p8Path, teamId, keyId, servicesId });
  } catch (err) {
    bad(errText(err));
    return 1;
  }
  await envSet("APPLE_CLIENT_SECRET", jwt);
  const expiresAt = new Date(Date.now() + CLIENT_SECRET_DAYS * 86_400_000);
  ok(`signed and set APPLE_CLIENT_SECRET, good until ${expiresAt.toDateString()}`);
  note(`before then, run ${BOLD}vexpo apple jwt --rotate${RESET} to sign a new one`);

  await recordStep("apple-sign-in", { p8Path });
  return 0;
}
