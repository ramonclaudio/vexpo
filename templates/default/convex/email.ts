import type { GenericCtx } from "@convex-dev/better-auth";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { Resend, vOnEmailEventArgs } from "@convex-dev/resend";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { env } from "./env";

// testMode defaults to true so dev can't accidentally email real users.
// Set RESEND_TEST_MODE=false in production to send to real addresses.
// Note: @convex-dev/resend's testMode only permits @resend.dev sandbox
// addresses and throws otherwise. To keep dev sign-up working with real-shaped
// emails, sendAuthOTP below short-circuits when testMode is on and logs the
// OTP to the Convex deployment console instead of calling sendEmail.
// Explicit `: Resend` annotation is required because `onEmailEvent` references
// a function in this same module, which would otherwise cause TS inference to
// loop on itself.
const testMode = process.env.RESEND_TEST_MODE !== "false";

export const resend: Resend = new Resend(components.resend, {
  testMode,
  onEmailEvent: internal.email.handleEmailEvent,
});

/**
 * Receives delivery events from the Resend webhook (mounted in convex/http.ts).
 * The event payload is also automatically persisted to the component's
 * `deliveryEvents` table for inspection in the Convex dashboard.
 *
 * Logs the 4 actionable failure events (bounced, complained, suppressed,
 * failed). Extend this handler to flag the user's email as unreachable if
 * you want to stop sending auth OTPs to addresses that will never arrive.
 */
const ACTIONABLE_FAILURE_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.suppressed",
  "email.failed",
]);

export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (_ctx, args) => {
    if (ACTIONABLE_FAILURE_EVENTS.has(args.event.type)) {
      console.warn(`[resend] ${args.event.type} for email ${args.id}`, args.event.data);
    }
    return null;
  },
});

type OTPType = "sign-in" | "email-verification" | "forget-password" | "change-email";

const OTP_COPY: Record<OTPType, { subject: string; heading: string; body: string }> = {
  "sign-in": {
    subject: "Your sign-in code",
    heading: "Sign in",
    body: "Use this code to sign in.",
  },
  "email-verification": {
    subject: "Verify your email",
    heading: "Verify your email",
    body: "Enter this code to confirm your email address.",
  },
  "forget-password": {
    subject: "Reset your password",
    heading: "Reset your password",
    body: "Use this code to reset your password. Ignore this email if you didn't request it.",
  },
  "change-email": {
    subject: "Confirm your new email",
    heading: "Confirm your new email",
    body: "Enter this code to confirm the email change.",
  },
};

/**
 * Send an auth OTP email via Resend. Used by Better Auth's emailOTP plugin
 * inside the `sendVerificationOTP` callback in convex/auth.ts.
 *
 * In test mode (dev default), logs the OTP to the Convex deployment console
 * instead of calling Resend. Read it from `npx convex dev` output or the
 * deployment logs in the Convex dashboard. Production sets RESEND_TEST_MODE
 * to "false" and sends real emails.
 */
export async function sendAuthOTP(
  ctx: GenericCtx<DataModel>,
  { email, otp, type }: { email: string; otp: string; type: OTPType },
) {
  if (testMode) {
    console.log(`[otp] ${type} for ${email}: ${otp}`);
    return;
  }

  const { subject, heading, body } = OTP_COPY[type];
  await resend.sendEmail(requireRunMutationCtx(ctx), {
    from: `${env.appName} <${env.email.from}>`,
    to: email,
    subject: `${env.appName}: ${subject} (${otp})`,
    html: renderHtml(heading, body, otp),
    text: `${heading}\n\n${body}\n\nCode: ${otp}\n\nThis code expires in 5 minutes.`,
  });
}

function renderHtml(heading: string, body: string, otp: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111"><h1 style="font-size:20px;margin:0 0 16px">${heading}</h1><p style="margin:0 0 24px">${body}</p><div style="font-size:28px;letter-spacing:6px;font-weight:600;padding:16px;background:#f5f5f5;border-radius:8px;text-align:center">${otp}</div><p style="margin:24px 0 0;color:#666;font-size:13px">This code expires in 5 minutes.</p></body></html>`;
}
