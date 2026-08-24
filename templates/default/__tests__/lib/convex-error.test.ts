import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { formatError } from "@/lib/convex-error";

const GENERIC = "Something went wrong. Please try again.";

// Every string this returns goes on screen. Convex errors are ours and carry
// copy written for the user; anything else came from the transport and would
// put "Network request failed" or a raw stack under a form.
describe("formatError", () => {
  it("uses the message a ConvexError carries in its data", () => {
    expect(formatError(new ConvexError({ message: "Username already taken" }))).toBe(
      "Username already taken",
    );
  });

  it("falls back to a ConvexError's own message when data has none", () => {
    expect(formatError(new ConvexError("Not authenticated"))).toContain("Not authenticated");
    expect(formatError(new ConvexError({ code: 401 }))).not.toBe("");
  });

  it("never surfaces a plain Error's message", () => {
    for (const err of [
      new Error("Network request failed"),
      new TypeError("Cannot read properties of undefined"),
      new Error("Upload failed: 413"),
    ]) {
      expect(formatError(err)).toBe(GENERIC);
    }
  });

  it("handles anything that is not an Error at all", () => {
    for (const value of [undefined, null, "boom", 500, { message: "nope" }]) {
      expect(formatError(value)).toBe(GENERIC);
    }
  });
});
