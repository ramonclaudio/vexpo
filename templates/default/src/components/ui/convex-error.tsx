import { ConvexError } from "convex/values";

export function formatError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "object" && data !== null && "message" in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}
