import { validate as validateAsc, type AscCredentials } from "../../lib/asc-api.ts";
import { loadAscCreds } from "../../lib/asc-state.ts";
import { fileExists } from "../../lib/fs.ts";
import { expandTilde, stagedP8 } from "../../lib/path.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  plural,
  section,
  yep,
} from "../../lib/output.ts";
import { recordStep } from "../../lib/state.ts";

async function promptCredsInteractive(): Promise<AscCredentials | null> {
  if (!process.stdin.isTTY) return null;
  line();
  note("Create an App Store Connect API key:");
  await helpAndWait({
    body: "1. open App Store Connect, Users and Access, Integrations, App Store Connect API",
    urls: [
      {
        label: "App Store Connect API keys",
        url: "https://appstoreconnect.apple.com/access/integrations/api",
      },
    ],
    allowSkip: false,
  });
  line();
  note("2. click 'Generate API Key' and name it, like 'vexpo'");
  note("3. set the role to 'Admin' or 'App Manager'");
  note("4. click 'Generate' and save the .p8 now, Apple only offers it once");
  note("5. copy the Issuer ID (above the table) and the Key ID");
  line();

  const issuerId = (await ask(`  Issuer ID ${DIM}(UUID) >${RESET} `)).trim();
  if (!issuerId) {
    yep("no issuer id given, stopping");
    return null;
  }
  const keyId = (await ask(`  Key ID ${DIM}(10 chars) >${RESET} `)).trim();
  if (!keyId) {
    yep("no key id given, stopping");
    return null;
  }
  const staged = stagedP8();
  const rawP8 =
    (
      await ask(
        staged
          ? `  Path to the .p8 ${DIM}[${staged}]${RESET} > `
          : `  Path to the .p8 ${DIM}(save it in ./credentials/) >${RESET} `,
      )
    ).trim() ||
    (staged ?? "");
  if (!rawP8) {
    yep("no .p8 path given, stopping");
    return null;
  }
  const p8Path = expandTilde(rawP8);
  if (!(await fileExists(p8Path))) {
    bad(`.p8 not found at ${p8Path}`);
    return null;
  }
  return { issuerId, keyId, p8Path };
}

export function ascCredsFromEnv(): AscCredentials | null {
  const issuerId = process.env.APPLE_ASC_ISSUER_ID;
  const keyId = process.env.APPLE_ASC_KEY_ID;
  const p8Path = process.env.APPLE_ASC_P8_PATH;
  if (!issuerId || !keyId || !p8Path) return null;
  return { issuerId, keyId, p8Path };
}

async function readEnvCreds(): Promise<AscCredentials | null> {
  const creds = ascCredsFromEnv();
  if (!creds) return null;
  if (!(await fileExists(expandTilde(creds.p8Path)))) {
    bad(`APPLE_ASC_P8_PATH=${creds.p8Path} not found`);
    return null;
  }
  return creds;
}

async function cachedKeyWorks(): Promise<boolean> {
  const cached = await loadAscCreds();
  if (!cached) return false;
  nop(`cached key found (issuer ${cached.issuerId.slice(0, 8)}…, key ${cached.keyId})`);
  const result = await validateAsc(cached);
  if (result.ok) {
    ok(`cached key valid (${result.appCount} app${plural(result.appCount)})`);
    return true;
  }
  yep(`cached key failed validation: ${result.reason}`);
  return false;
}

export async function runAscKey(): Promise<number> {
  section("App Store Connect API key");

  if (await cachedKeyWorks()) return 0;

  let creds = await readEnvCreds();
  if (!creds) creds = await promptCredsInteractive();
  if (!creds) {
    bad("no key given");
    return 1;
  }

  const validation = await validateAsc(creds);
  if (!validation.ok) {
    bad(validation.reason);
    return 1;
  }
  ok(`key works (${validation.appCount} app${plural(validation.appCount)} on the team)`);

  await recordStep("asc-key", creds);
  ok("key cached in .setup-state.json");

  line();
  note(`EAS still needs this key. ${BOLD}vexpo apple credentials${RESET} uploads it, or run`);
  note(
    `  ${BOLD}npx eas-cli credentials -p ios${RESET} and pick 'Use existing App Store Connect API Key'`,
  );
  return 0;
}
