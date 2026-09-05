import { describe, expect, it } from "vitest";

import { DynamicType, OTP_KERNING, otpKerning } from "@/constants/ui";

// Apple's Larger Text bar is 200%, which iOS reaches at AX3. Anything a user
// has to read has to get there.
describe("DynamicType", () => {
  it("lets the verification code reach Apple's 200% size", () => {
    expect(DynamicType.otp).toBe("accessibility3");
  });

  // `control` caps decorative glyphs and the segmented picker, which Apple's
  // criteria exempt as controls that cannot reasonably grow.
  it("keeps the control cap where it is", () => {
    expect(DynamicType.control).toBe("accessibility1");
  });
});

describe("otpKerning", () => {
  it("keeps the full tracking at the default size", () => {
    expect(otpKerning(1)).toBe(OTP_KERNING);
  });

  it("gives tracking back as the type grows", () => {
    expect(otpKerning(2)).toBeLessThan(OTP_KERNING);
    expect(otpKerning(3.1)).toBeLessThan(otpKerning(2));
  });

  // Six digits at AX3 need the room. Two points still reads as separated.
  it("never closes the gap entirely", () => {
    expect(otpKerning(10)).toBe(2);
  });

  // A fontScale below 1 is possible on the smallest text size, and shrinking
  // the type is no reason to widen the tracking past its design value.
  it("does not widen below the default size", () => {
    expect(otpKerning(0.8)).toBe(OTP_KERNING);
  });
});
