import { useState } from "react";
import { router } from "expo-router";
import { Button, ConfirmationDialog, Text } from "@expo/ui/swift-ui";

import { SecondaryButton } from "@/components/ui/capsule-button";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

export function AccountActions({
  hasPassword,
  onSignOut,
}: {
  hasPassword: boolean | undefined;
  onSignOut: () => void;
}) {
  const dfont = useDynamicFont();
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  return (
    <>
      {hasPassword ? (
        <SecondaryButton
          label="Change password"
          onPress={() => {
            router.push("/profile/change-password");
          }}
        />
      ) : null}

      <ConfirmationDialog
        title="Sign out?"
        isPresented={signOutConfirm}
        onIsPresentedChange={setSignOutConfirm}
        titleVisibility="visible"
      >
        <ConfirmationDialog.Trigger>
          <SecondaryButton
            label="Sign out"
            destructive
            onPress={() => {
              haptics.medium();
              setSignOutConfirm(true);
            }}
          />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <Button label="Sign Out" role="destructive" onPress={onSignOut} />
          <Button label="Cancel" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <Text modifiers={[dfont({ size: 16 })]}>
            You will need to sign in again to access your account.
          </Text>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </>
  );
}
