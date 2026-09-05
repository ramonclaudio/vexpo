import { easJson } from "./eas-cli.ts";

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
