/**
 * `vexpo sandbox` group. Sandbox testers for In-App Purchase testing. eas-cli
 * does not cover this. Apple's public API can't create or delete testers (do
 * that in App Store Connect -> Users and Access -> Sandbox); it lists them and
 * modifies renewal behaviour, which is what CI testing actually needs.
 */

import { sandbox, type SandboxTesterUpdate } from "../lib/asc-sandbox.ts";
import { ascBootstrap } from "../lib/asc-state.ts";
import { BOLD, DIM, RESET, bad, line, nop, note, ok, section } from "../lib/output.ts";

const ASC_SANDBOX_URL = "https://appstoreconnect.apple.com/access/users/sandbox";

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
      note(`add testers in App Store Connect -> Users and Access -> Sandbox: ${ASC_SANDBOX_URL}`);
      return 0;
    }
    for (const t of list) {
      const a = t.attributes;
      const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
      const meta = [
        a.territory,
        a.subscriptionRenewalRate,
        a.interruptPurchases ? "interrupts" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      line(
        `  ${BOLD}${a.acAccountName ?? t.id}${RESET}  ${DIM}${[name, meta].filter(Boolean).join("  ")}${RESET}`,
      );
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runSandboxUpdate(id: string, opts: SandboxTesterUpdate): Promise<number> {
  if (
    opts.subscriptionRenewalRate === undefined &&
    opts.interruptPurchases === undefined &&
    opts.territory === undefined
  ) {
    bad("nothing to update: pass --renewal-rate, --interrupt-purchases, or --territory");
    return 1;
  }
  try {
    const s = await client();
    const updated = await s.sandboxTesters.update(id, opts);
    section(`Sandbox tester ${updated.attributes.acAccountName ?? id}`);
    ok("updated");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runSandboxClearPurchases(ids: string[]): Promise<number> {
  if (ids.length === 0) {
    bad("pass at least one sandbox tester id");
    return 1;
  }
  try {
    const s = await client();
    await s.sandboxTesters.clearPurchaseHistory(ids);
    section("Clear purchase history");
    ok(`requested for ${ids.length} tester${ids.length === 1 ? "" : "s"}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
