import { router } from "expo-router";
import { startTransition, useActionState, useState } from "react";
import { Host, ScrollView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  defaultScrollAnchor,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useMutation, useQuery } from "convex/react";

import BrandIcon from "@/components/ui/brand-icon";
import { ProminentButton, SecondaryButton } from "@/components/ui/capsule-button";
import { ErrorText } from "@/components/ui/status-text";
import { api } from "@/convex/_generated/api";
import { ACCOUNT_DELETION_GRACE_MS } from "@/convex/constants";
import { Colors } from "@/constants/theme";
import { signOut } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";
import { fail, succeed } from "@/lib/form-result";

type ActionState = { error?: string };
const initialState: ActionState = {};

export default function RestoreAccountScreen() {
  const dfont = useDynamicFont();
  const me = useQuery(api.users.getMe);
  const restoreMutation = useMutation(api.users.restoreAccount);

  const [signingOut, setSigningOut] = useState(false);

  const [restoreState, restore, restorePending] = useActionState<ActionState, void>(async () => {
    haptics.medium();
    try {
      await restoreMutation();
      succeed("Account restored");
      router.replace("/");
      return {};
    } catch (err) {
      return fail(formatError(err));
    }
  }, initialState);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (!me?.deletedAt) {
    return (
      <Host style={{ flex: 1, backgroundColor: Colors.background }}>
        <Spacer />
      </Host>
    );
  }

  const permanentDeleteAt = new Date(me.deletedAt + ACCOUNT_DELETION_GRACE_MS);
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(permanentDeleteAt);

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView modifiers={[defaultScrollAnchor("center")]}>
        <VStack
          spacing={24}
          alignment="center"
          modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 24, vertical: 48 })]}
        >
          <BrandIcon size={72} />

          <VStack spacing={12} alignment="center">
            <Text
              modifiers={[
                dfont({ size: 24, weight: "bold" }),
                foregroundStyle(Colors.foreground),
                multilineTextAlignment("center"),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Account scheduled for deletion
            </Text>
            <Text
              modifiers={[
                dfont({ size: 15 }),
                foregroundStyle(Colors.mutedForeground),
                multilineTextAlignment("center"),
              ]}
            >
              {`Your account is set to be permanently deleted on ${formattedDate}. Restore now to keep your account and all of its data.`}
            </Text>
          </VStack>

          <VStack spacing={12} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <ProminentButton
              label={restorePending ? "Restoring..." : "Restore account"}
              onPress={() => startTransition(() => restore())}
              disabled={restorePending || signingOut}
            />
            <SecondaryButton
              label={signingOut ? "Signing out..." : "Sign out"}
              destructive
              disabled={restorePending || signingOut}
              onPress={handleSignOut}
            />
          </VStack>

          {restoreState.error ? <ErrorText>{restoreState.error}</ErrorText> : null}
        </VStack>
      </ScrollView>
    </Host>
  );
}
