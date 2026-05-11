/**
 * `vexpo reviews` group. Customer reviews + responses via the ASC API.
 *
 *   vexpo reviews list [--territory US] [--rating 1]
 *   vexpo reviews unanswered [--days 7]
 *   vexpo reviews respond <reviewId> "<body>"
 *   vexpo reviews delete-response <responseId>
 */

import { ascBootstrap } from "../lib/asc-state.ts";
import { reviews, unansweredOlderThan } from "../lib/asc-reviews.ts";
import { BOLD, DIM, RESET, bad, line, nop, ok, section } from "../lib/output.ts";

async function bootstrap() {
  const { client, ascAppId, bundleId } = await ascBootstrap();
  if (!ascAppId) {
    throw new Error(
      `no ASC app for bundle id ${bundleId ?? "(unset)"}; run \`vexpo apple credentials\` first`,
    );
  }
  return { r: reviews(client), ascAppId };
}

function stars(n?: number): string {
  if (!n) return "";
  const filled = "★".repeat(n);
  const empty = "☆".repeat(5 - n);
  return `${filled}${empty}`;
}

export async function runReviewsList(opts: {
  territory?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  limit?: number;
  json?: boolean;
}): Promise<number> {
  try {
    const { r, ascAppId } = await bootstrap();
    const list = await r.customerReviews.list({
      appId: ascAppId,
      territory: opts.territory,
      rating: opts.rating,
      limit: opts.limit,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(list, null, 2) + "\n");
      return 0;
    }
    section("Customer reviews");
    if (list.length === 0) {
      nop("none");
      return 0;
    }
    for (const rev of list) {
      const responded = rev.relationships?.response?.data ? "✓" : " ";
      const created = rev.attributes.createdDate?.slice(0, 10) ?? "";
      line(
        `  ${responded} ${stars(rev.attributes.rating)}  ${DIM}${created} ${rev.attributes.territory ?? ""}${RESET}  ${BOLD}${rev.attributes.title ?? ""}${RESET}`,
      );
      if (rev.attributes.body) {
        const truncated = rev.attributes.body.split("\n")[0];
        line(
          `        ${DIM}${truncated.slice(0, 100)}${truncated.length > 100 ? "…" : ""}${RESET}`,
        );
      }
      line(`        ${DIM}id ${rev.id}${RESET}`);
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runReviewsUnanswered(opts: {
  days?: number;
  limit?: number;
  json?: boolean;
}): Promise<number> {
  try {
    const { r, ascAppId } = await bootstrap();
    const all = await r.customerReviews.list({ appId: ascAppId, limit: opts.limit ?? 200 });
    const unresponded = unansweredOlderThan(all, opts.days ?? 0);
    if (opts.json) {
      process.stdout.write(JSON.stringify(unresponded, null, 2) + "\n");
      return 0;
    }
    section(
      `Unanswered reviews${opts.days ? ` (older than ${opts.days} day${opts.days === 1 ? "" : "s"})` : ""}`,
    );
    if (unresponded.length === 0) {
      ok("all caught up");
      return 0;
    }
    for (const rev of unresponded) {
      const created = rev.attributes.createdDate?.slice(0, 10) ?? "";
      line(
        `  ${stars(rev.attributes.rating)}  ${DIM}${created} ${rev.attributes.territory ?? ""}${RESET}  ${BOLD}${rev.attributes.title ?? ""}${RESET}`,
      );
      line(`        ${DIM}respond: vexpo reviews respond ${rev.id} "..."${RESET}`);
    }
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runReviewsRespond(opts: { reviewId: string; body: string }): Promise<number> {
  try {
    const { r } = await bootstrap();
    const response = await r.customerReviewResponses.create({
      reviewId: opts.reviewId,
      responseBody: opts.body,
    });
    section(`Responded to ${opts.reviewId}`);
    ok(`response ${response.id}  ${DIM}${response.attributes.state ?? ""}${RESET}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runReviewsDeleteResponse(responseId: string): Promise<number> {
  try {
    const { r } = await bootstrap();
    await r.customerReviewResponses.delete(responseId);
    section(`Deleted response ${responseId}`);
    ok("done");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
