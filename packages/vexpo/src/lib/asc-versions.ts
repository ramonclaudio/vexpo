/**
 * App Store Connect API: App Store versions, review submissions, phased
 * releases, age rating declarations.
 *
 * `eas submit` triggers a submission, but reading the post-submission state
 * (review status, version state, phased release progress) is missing from
 * eas-cli. These wrappers fill that gap.
 */

import type { AscClient } from "./asc-api.ts";

export type Platform = "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS";

export type AppStoreVersionState =
  | "DEVELOPER_REMOVED_FROM_SALE"
  | "DEVELOPER_REJECTED"
  | "IN_REVIEW"
  | "INVALID_BINARY"
  | "METADATA_REJECTED"
  | "PENDING_APPLE_RELEASE"
  | "PENDING_CONTRACT"
  | "PENDING_DEVELOPER_RELEASE"
  | "PREPARE_FOR_SUBMISSION"
  | "PREORDER_READY_FOR_SALE"
  | "PROCESSING_FOR_APP_STORE"
  | "READY_FOR_REVIEW"
  | "READY_FOR_SALE"
  | "REJECTED"
  | "REMOVED_FROM_SALE"
  | "WAITING_FOR_EXPORT_COMPLIANCE"
  | "WAITING_FOR_REVIEW"
  | "REPLACED_WITH_NEW_VERSION";

export type AppStoreVersion = {
  type: "appStoreVersions";
  id: string;
  attributes: {
    platform?: Platform;
    versionString?: string;
    appStoreState?: AppStoreVersionState;
    copyright?: string;
    earliestReleaseDate?: string;
    releaseType?: string;
    createdDate?: string;
    downloadable?: boolean;
  };
};

export type ReviewSubmission = {
  type: "reviewSubmissions";
  id: string;
  attributes: { state?: string; submittedDate?: string };
};

export type AppStoreVersionPhasedRelease = {
  type: "appStoreVersionPhasedReleases";
  id: string;
  attributes: { phasedReleaseState?: string; startDate?: string; totalPauseDuration?: number };
};

export type AgeRatingDeclaration = {
  type: "ageRatingDeclarations";
  id: string;
  attributes: Record<string, unknown>;
};

export function versions(client: AscClient) {
  return {
    /* app store versions ------------------------------------------------ */
    appStoreVersions: {
      list(filter?: {
        appId?: string;
        platform?: Platform;
        versionString?: string;
        state?: AppStoreVersionState;
        limit?: number;
      }): Promise<AppStoreVersion[]> {
        const query: Record<string, string> = {};
        if (filter?.platform) query["filter[platform]"] = filter.platform;
        if (filter?.versionString) query["filter[versionString]"] = filter.versionString;
        if (filter?.state) query["filter[appStoreState]"] = filter.state;
        const path = filter?.appId
          ? `/v1/apps/${filter.appId}/appStoreVersions`
          : "/v1/appStoreVersions";
        return client.paginatedList<AppStoreVersion>(path, query, filter?.limit ?? 25);
      },
      async get(id: string): Promise<AppStoreVersion> {
        const res = await client.request<{ data: AppStoreVersion }>(
          "GET",
          `/v1/appStoreVersions/${id}`,
        );
        return res.data;
      },
      async getBuild(versionId: string): Promise<{ data: { id: string } } | null> {
        try {
          return await client.request<{ data: { id: string } }>(
            "GET",
            `/v1/appStoreVersions/${versionId}/relationships/build`,
          );
        } catch {
          return null;
        }
      },
    },

    /* review submissions ------------------------------------------------ */
    reviewSubmissions: {
      list(filter?: {
        appId?: string;
        platform?: Platform;
        state?: string;
      }): Promise<ReviewSubmission[]> {
        const query: Record<string, string> = {};
        if (filter?.appId) query["filter[app]"] = filter.appId;
        if (filter?.platform) query["filter[platform]"] = filter.platform;
        if (filter?.state) query["filter[state]"] = filter.state;
        return client.paginatedList<ReviewSubmission>("/v1/reviewSubmissions", query);
      },
      async get(id: string): Promise<ReviewSubmission> {
        const res = await client.request<{ data: ReviewSubmission }>(
          "GET",
          `/v1/reviewSubmissions/${id}`,
        );
        return res.data;
      },
    },

    /* phased release ---------------------------------------------------- */
    phasedReleases: {
      async getForVersion(versionId: string): Promise<AppStoreVersionPhasedRelease | null> {
        try {
          const res = await client.request<{ data: AppStoreVersionPhasedRelease }>(
            "GET",
            `/v1/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`,
          );
          return res.data;
        } catch {
          return null;
        }
      },
      async pause(id: string): Promise<AppStoreVersionPhasedRelease> {
        const body = {
          data: {
            type: "appStoreVersionPhasedReleases",
            id,
            attributes: { phasedReleaseState: "PAUSED" },
          },
        };
        const res = await client.request<{ data: AppStoreVersionPhasedRelease }>(
          "PATCH",
          `/v1/appStoreVersionPhasedReleases/${id}`,
          body,
        );
        return res.data;
      },
      async resume(id: string): Promise<AppStoreVersionPhasedRelease> {
        const body = {
          data: {
            type: "appStoreVersionPhasedReleases",
            id,
            attributes: { phasedReleaseState: "ACTIVE" },
          },
        };
        const res = await client.request<{ data: AppStoreVersionPhasedRelease }>(
          "PATCH",
          `/v1/appStoreVersionPhasedReleases/${id}`,
          body,
        );
        return res.data;
      },
      async complete(id: string): Promise<AppStoreVersionPhasedRelease> {
        const body = {
          data: {
            type: "appStoreVersionPhasedReleases",
            id,
            attributes: { phasedReleaseState: "COMPLETE" },
          },
        };
        const res = await client.request<{ data: AppStoreVersionPhasedRelease }>(
          "PATCH",
          `/v1/appStoreVersionPhasedReleases/${id}`,
          body,
        );
        return res.data;
      },
    },
  };
}
