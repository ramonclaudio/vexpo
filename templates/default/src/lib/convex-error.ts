import { ConvexError } from "convex/values";

export function formatError(err: unknown): string {
  return err instanceof ConvexError ? err.message : "Something went wrong. Please try again.";
}
