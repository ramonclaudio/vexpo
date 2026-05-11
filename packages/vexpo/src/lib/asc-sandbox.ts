/**
 * App Store Connect API: sandbox testers (for In-App Purchase testing).
 * eas-cli does not touch this.
 */

import type { AscClient } from "./asc-api.ts";

export type SandboxTester = {
  type: "sandboxTesters";
  id: string;
  attributes: {
    firstName?: string;
    lastName?: string;
    email?: string;
    territory?: string;
    subscriptionRenewalRate?: string;
    interruptPurchases?: boolean;
  };
};

export function sandbox(client: AscClient) {
  return {
    sandboxTesters: {
      list(): Promise<SandboxTester[]> {
        return client.paginatedList<SandboxTester>("/v1/sandboxTesters");
      },
      async get(id: string): Promise<SandboxTester> {
        const res = await client.request<{ data: SandboxTester }>(
          "GET",
          `/v1/sandboxTesters/${id}`,
        );
        return res.data;
      },
      async create(args: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        territory: string;
      }): Promise<SandboxTester> {
        const body = {
          data: {
            type: "sandboxTesters",
            attributes: {
              firstName: args.firstName,
              lastName: args.lastName,
              email: args.email,
              password: args.password,
              territory: args.territory,
            },
          },
        };
        const res = await client.request<{ data: SandboxTester }>(
          "POST",
          "/v1/sandboxTesters",
          body,
        );
        return res.data;
      },
      async delete(id: string): Promise<void> {
        await client.request<void>("DELETE", `/v1/sandboxTesters/${id}`);
      },
    },
  };
}
