import { startTransition } from "react";
import { VStack } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { SecondaryButton } from "@/components/ui/capsule-button";
import { HelperText } from "@/components/ui/helper-text";
import { dismissAuth, type useGuestSignIn } from "@/hooks/use-guest-sign-in";

export function GuestOptions({
  testIDPrefix,
  showGuest,
  isGuest,
  isLoading,
  guest,
}: {
  testIDPrefix: "sign-in" | "sign-up";
  showGuest: boolean;
  isGuest: boolean;
  isLoading: boolean;
  guest: ReturnType<typeof useGuestSignIn>;
}) {
  if (showGuest) {
    const skipLabel = testIDPrefix === "sign-in" ? "Skip sign in" : "Skip sign up";
    return (
      <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
        <SecondaryButton
          testID={`${testIDPrefix}-guest`}
          label={guest.isPending ? "Starting..." : "Continue as guest"}
          onPress={() => startTransition(() => guest.signIn())}
          disabled={isLoading}
          inputLabels={["Continue as guest", "Guest", skipLabel]}
        />
        <HelperText>You can create an account later and keep what you did.</HelperText>
      </VStack>
    );
  }
  if (!isGuest) return null;
  return (
    <SecondaryButton
      testID={`${testIDPrefix}-dismiss`}
      label="Not now"
      onPress={dismissAuth}
      disabled={isLoading}
      filled={false}
    />
  );
}
