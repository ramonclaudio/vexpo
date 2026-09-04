import type { AscClient } from "./asc-api.ts";

export type BetaGroup = {
  type: "betaGroups";
  id: string;
  attributes: {
    name?: string;
    isInternalGroup?: boolean;
    publicLink?: string;
    feedbackEnabled?: boolean;
    createdDate?: string;
  };
  relationships?: { app?: { data?: { id: string } } };
};

export type BetaTester = {
  type: "betaTesters";
  id: string;
  attributes: {
    firstName?: string;
    lastName?: string;
    email?: string;
    inviteType?: "EMAIL" | "PUBLIC_LINK";
    state?: string;
  };
};

export type BetaTesterInvitation = {
  type: "betaTesterInvitations";
  id: string;
  attributes: { state?: string };
};

export type BetaBuildLocalization = {
  type: "betaBuildLocalizations";
  id: string;
  attributes: { whatsNew?: string; locale?: string };
};

type BetaFeedbackAttributes = {
  createdDate?: string;
  comment?: string;
  email?: string;
  deviceModel?: string;
  osVersion?: string;
  locale?: string;
  appPlatform?: string;
  buildBundleId?: string;
};

export type BetaFeedbackScreenshotSubmission = {
  type: "betaFeedbackScreenshotSubmissions";
  id: string;
  attributes: BetaFeedbackAttributes & {
    screenshots?: Array<{ url?: string; expirationDate?: string; fileName?: string }>;
  };
};

export type BetaFeedbackCrashSubmission = {
  type: "betaFeedbackCrashSubmissions";
  id: string;
  attributes: BetaFeedbackAttributes;
};

export function testflight(client: AscClient) {
  const feedback =
    <T>(path: string) =>
    async (appId: string, limit: number): Promise<T[]> => {
      const res = await client.request<{ data: T[] }>(
        "GET",
        `/v1/apps/${appId}/${path}?sort=-createdDate&limit=${Math.min(limit, 200)}`,
      );
      return res.data;
    };

  return {
    betaFeedback: {
      screenshots: feedback<BetaFeedbackScreenshotSubmission>("betaFeedbackScreenshotSubmissions"),
      crashes: feedback<BetaFeedbackCrashSubmission>("betaFeedbackCrashSubmissions"),
    },
    betaGroups: {
      list(filter?: { appId?: string; name?: string }): Promise<BetaGroup[]> {
        const query: Record<string, string> = {};
        if (filter?.appId) query["filter[app]"] = filter.appId;
        if (filter?.name) query["filter[name]"] = filter.name;
        return client.paginatedList<BetaGroup>("/v1/betaGroups", query);
      },
      async get(id: string): Promise<BetaGroup> {
        const res = await client.request<{ data: BetaGroup }>("GET", `/v1/betaGroups/${id}`);
        return res.data;
      },
      async create(args: {
        name: string;
        appId: string;
        feedbackEnabled?: boolean;
      }): Promise<BetaGroup> {
        const body = {
          data: {
            type: "betaGroups",
            attributes: {
              name: args.name,
              ...(args.feedbackEnabled !== undefined
                ? { feedbackEnabled: args.feedbackEnabled }
                : {}),
            },
            relationships: {
              app: { data: { type: "apps", id: args.appId } },
            },
          },
        };
        const res = await client.request<{ data: BetaGroup }>("POST", "/v1/betaGroups", body);
        return res.data;
      },
      async delete(id: string): Promise<void> {
        await client.request<void>("DELETE", `/v1/betaGroups/${id}`);
      },
      async listTesters(groupId: string): Promise<BetaTester[]> {
        return client.paginatedList<BetaTester>(`/v1/betaGroups/${groupId}/betaTesters`);
      },
      async addTesters(groupId: string, testerIds: readonly string[]): Promise<void> {
        const body = { data: testerIds.map((id) => ({ type: "betaTesters", id })) };
        await client.request<void>(
          "POST",
          `/v1/betaGroups/${groupId}/relationships/betaTesters`,
          body,
        );
      },
    },

    betaTesters: {
      list(filter?: { email?: string; appId?: string }): Promise<BetaTester[]> {
        const query: Record<string, string> = {};
        if (filter?.email) query["filter[email]"] = filter.email;
        if (filter?.appId) query["filter[apps]"] = filter.appId;
        return client.paginatedList<BetaTester>("/v1/betaTesters", query);
      },
      async create(args: {
        email: string;
        firstName?: string;
        lastName?: string;
        groupIds: readonly string[];
      }): Promise<BetaTester> {
        const body = {
          data: {
            type: "betaTesters",
            attributes: {
              email: args.email,
              ...(args.firstName ? { firstName: args.firstName } : {}),
              ...(args.lastName ? { lastName: args.lastName } : {}),
            },
            relationships: {
              betaGroups: {
                data: args.groupIds.map((id) => ({ type: "betaGroups", id })),
              },
            },
          },
        };
        const res = await client.request<{ data: BetaTester }>("POST", "/v1/betaTesters", body);
        return res.data;
      },
    },

    betaTesterInvitations: {
      async create(args: { appId: string; testerId: string }): Promise<BetaTesterInvitation> {
        const body = {
          data: {
            type: "betaTesterInvitations",
            relationships: {
              app: { data: { type: "apps", id: args.appId } },
              betaTester: { data: { type: "betaTesters", id: args.testerId } },
            },
          },
        };
        const res = await client.request<{ data: BetaTesterInvitation }>(
          "POST",
          "/v1/betaTesterInvitations",
          body,
        );
        return res.data;
      },
    },

    betaBuildLocalizations: {
      async upsert(args: {
        buildId: string;
        locale: string;
        whatsNew: string;
      }): Promise<BetaBuildLocalization> {
        const all = await client.paginatedList<BetaBuildLocalization>(
          `/v1/builds/${args.buildId}/betaBuildLocalizations`,
        );
        const existing = all.find((l) => l.attributes.locale === args.locale);
        if (existing) {
          const body = {
            data: {
              type: "betaBuildLocalizations",
              id: existing.id,
              attributes: { whatsNew: args.whatsNew },
            },
          };
          const res = await client.request<{ data: BetaBuildLocalization }>(
            "PATCH",
            `/v1/betaBuildLocalizations/${existing.id}`,
            body,
          );
          return res.data;
        }
        const body = {
          data: {
            type: "betaBuildLocalizations",
            attributes: { whatsNew: args.whatsNew, locale: args.locale },
            relationships: {
              build: { data: { type: "builds", id: args.buildId } },
            },
          },
        };
        const res = await client.request<{ data: BetaBuildLocalization }>(
          "POST",
          "/v1/betaBuildLocalizations",
          body,
        );
        return res.data;
      },
    },
  };
}
