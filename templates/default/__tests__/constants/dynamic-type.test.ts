import { describe, expect, it } from "vitest";

import { DynamicType, OTP_KERNING, otpKerning } from "@/constants/ui";

describe("DynamicType", () => {
  it("lets the verification code reach Apple's 200% size", () => {
    expect(DynamicType.otp).toBe("accessibility3");
  });

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

  it("never closes the gap entirely", () => {
    expect(otpKerning(10)).toBe(2);
  });

  it("does not widen below the default size", () => {
    expect(otpKerning(0.8)).toBe(OTP_KERNING);
  });
});
