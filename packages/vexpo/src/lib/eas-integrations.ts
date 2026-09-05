import { easJson, easText } from "./eas-cli.ts";

export type AscStatus = {
  action: string;
  project: string;
  status: "connected" | "not-connected" | "invalid";
  appStoreConnectApp?: {
    id: string;
    ascAppIdentifier: string;
    name?: string;
    bundleIdentifier?: string;
    appleUrl: string;
  };
};

export async function ascStatus(): Promise<AscStatus> {
  return easJson<AscStatus>(["integrations:asc:status"]);
}

export type ConvexProjectLink = { name: string; dashboard?: string };

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export async function convexProjectLink(): Promise<ConvexProjectLink | null> {
  const { code, stdout, stderr } = await easText(["integrations:convex:project"]);
  const out = `${stdout}\n${stderr}`.replace(ANSI, "");
  if (code !== 0) {
    if (/EAS project not configured|Input is required/i.test(out)) {
      throw new Error(
        "eas integrations:convex:project needs the app linked to EAS. Run `npx eas-cli init` first",
      );
    }
    const tail = out.trim().split("\n").pop()?.trim() || `exit ${code}`;
    throw new Error(`eas integrations:convex:project failed: ${tail}`);
  }
  if (/No Convex project is linked/i.test(out)) return null;
  const name = /^Name:\s*(.+)$/m.exec(out)?.[1]?.trim();
  if (!name) throw new Error(`could not read the Convex project from eas output:\n${out.trim()}`);
  const dashboard = /^Dashboard:\s*(\S+)/m.exec(out)?.[1];
  return dashboard ? { name, dashboard } : { name };
}
