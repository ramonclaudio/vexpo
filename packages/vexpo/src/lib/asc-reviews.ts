/**
 * App Store Connect API: customer reviews + review responses.
 *
 * App Review guideline 5.6 explicitly asks developers to "treat customers
 * with respect when responding to their comments". eas-cli does not surface
 * customer reviews at all.
 *
 * Read reviews, list unanswered reviews, post responses, edit responses.
 */

import type { AscClient } from "./asc-api.ts";

export type CustomerReview = {
  type: "customerReviews";
  id: string;
  attributes: {
    rating?: number;
    title?: string;
    body?: string;
    reviewerNickname?: string;
    createdDate?: string;
    territory?: string;
  };
  relationships?: { response?: { data?: { id: string } | null } };
};

export type CustomerReviewResponse = {
  type: "customerReviewResponses";
  id: string;
  attributes: {
    responseBody?: string;
    state?: "PENDING_PUBLISH" | "PUBLISHED";
    lastModifiedDate?: string;
  };
};

export function reviews(client: AscClient) {
  return {
    customerReviews: {
      list(filter?: {
        appId?: string;
        territory?: string;
        rating?: 1 | 2 | 3 | 4 | 5;
        limit?: number;
      }): Promise<CustomerReview[]> {
        const query: Record<string, string> = {};
        if (filter?.territory) query["filter[territory]"] = filter.territory;
        if (filter?.rating) query["filter[rating]"] = String(filter.rating);
        query["include"] = "response";
        const path = filter?.appId
          ? `/v1/apps/${filter.appId}/customerReviews`
          : "/v1/customerReviews";
        return client.paginatedList<CustomerReview>(path, query, filter?.limit ?? 50);
      },
      async get(id: string): Promise<CustomerReview> {
        const res = await client.request<{ data: CustomerReview }>(
          "GET",
          `/v1/customerReviews/${id}`,
          undefined,
          { include: "response" },
        );
        return res.data;
      },
      async getResponse(reviewId: string): Promise<CustomerReviewResponse | null> {
        try {
          const res = await client.request<{ data: CustomerReviewResponse }>(
            "GET",
            `/v1/customerReviews/${reviewId}/response`,
          );
          return res.data;
        } catch {
          return null;
        }
      },
    },

    customerReviewResponses: {
      async create(args: {
        reviewId: string;
        responseBody: string;
      }): Promise<CustomerReviewResponse> {
        const body = {
          data: {
            type: "customerReviewResponses",
            attributes: { responseBody: args.responseBody },
            relationships: {
              review: { data: { type: "customerReviews", id: args.reviewId } },
            },
          },
        };
        const res = await client.request<{ data: CustomerReviewResponse }>(
          "POST",
          "/v1/customerReviewResponses",
          body,
        );
        return res.data;
      },
      async delete(id: string): Promise<void> {
        await client.request<void>("DELETE", `/v1/customerReviewResponses/${id}`);
      },
    },
  };
}

/**
 * Reviews older than `daysAgo` with no response. Used by `vexpo doctor`
 * to surface neglected reviews and by `vexpo reviews unanswered` directly.
 */
export function unansweredOlderThan(
  list: readonly CustomerReview[],
  daysAgo: number,
): CustomerReview[] {
  const cutoff = Date.now() - daysAgo * 86_400_000;
  return list.filter((r) => {
    const created = r.attributes.createdDate ? Date.parse(r.attributes.createdDate) : NaN;
    if (!Number.isFinite(created) || created > cutoff) return false;
    return !r.relationships?.response?.data;
  });
}
