/**
 * App Store Connect API: sandbox testers (In-App Purchase testing). eas-cli
 * does not cover this. Apple's public REST API has no create/get-by-id/delete
 * for sandbox testers, you add them in App Store Connect (Users and Access ->
 * Sandbox). It only lists testers and modifies their behaviour, so this exposes
 * exactly the v2 operations the API supports: list, update (renewal rate /
 * interrupt purchases / territory), and clear purchase history.
 */

import type { AscClient } from "./asc-api.ts";

export type SandboxTester = {
  type: "sandboxTesters";
  id: string;
  attributes: {
    acAccountName?: string;
    firstName?: string;
    lastName?: string;
    territory?: string;
    subscriptionRenewalRate?: string;
    interruptPurchases?: boolean;
    applePayCompatible?: boolean;
  };
};

export type SandboxTesterUpdate = {
  subscriptionRenewalRate?: string;
  interruptPurchases?: boolean;
  territory?: string;
};

export function sandbox(client: AscClient) {
  return {
    sandboxTesters: {
      list(): Promise<SandboxTester[]> {
        return client.paginatedList<SandboxTester>("/v2/sandboxTesters");
      },
      async update(id: string, attributes: SandboxTesterUpdate): Promise<SandboxTester> {
        const res = await client.request<{ data: SandboxTester }>(
          "PATCH",
          `/v2/sandboxTesters/${id}`,
          { data: { type: "sandboxTesters", id, attributes } },
        );
        return res.data;
      },
      // Clear purchase history for one or more testers (async on Apple's side;
      // a 2xx means the request was accepted). Identifies testers by id.
      async clearPurchaseHistory(ids: string[]): Promise<void> {
        await client.request<unknown>("POST", "/v2/sandboxTestersClearPurchaseHistoryRequest", {
          data: {
            type: "sandboxTestersClearPurchaseHistoryRequest",
            relationships: {
              sandboxTesters: { data: ids.map((id) => ({ type: "sandboxTesters", id })) },
            },
          },
        });
      },
    },
  };
}
