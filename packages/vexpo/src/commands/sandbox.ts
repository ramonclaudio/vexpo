/**
 * `vexpo sandbox` group. Sandbox testers for In-App Purchase testing.
 * eas-cli does not cover this. Apple requires sandbox accounts to test
 * IAP flows on device.
 */

import { ascBootstrap } from "../lib/asc-state.ts";
import { sandbox } from "../lib/asc-sandbox.ts";
import { BOLD, DIM, RESET, bad, line, nop, ok, section } from "../lib/output.ts";

async function client() {
  const { client: ascClient } = await ascBootstrap();
  return sandbox(ascClient);
}

export async function runSandboxList(opts: { json?: boolean } = {}): Promise<number> {
  try {
    const s = await client();
    const list = await s.sandboxTesters.list();
    if (opts.json) {
      process.stdout.write(JSON.stringify(list, null, 2) + "\n");
      return 0;
    }
    section("Sandbox testers");
    if (list.length === 0) {
      nop("none");
      return 0;
    }
    for (const t of list) {
      const name = `${t.attributes.firstName ?? ""} ${t.attributes.lastName ?? ""}`.trim();
      line(
        `  ${BOLD}${t.attributes.email ?? "(no email)"}${RESET}  ${DIM}${t.attributes.territory ?? ""}  ${name}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runSandboxCreate(opts: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  territory: string;
}): Promise<number> {
  try {
    const s = await client();
    const created = await s.sandboxTesters.create(opts);
    section(`Sandbox tester ${opts.email}`);
    ok(`id ${created.id}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runSandboxDelete(id: string): Promise<number> {
  try {
    const s = await client();
    await s.sandboxTesters.delete(id);
    section(`Deleted sandbox tester ${id}`);
    ok("done");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
