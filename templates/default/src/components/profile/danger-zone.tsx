import { router } from "expo-router";
import { Alert, Button, ConfirmationDialog, Text } from "@expo/ui/swift-ui";

import { SecondaryButton } from "@/components/ui/secondary-button";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

export function DangerZone({
  hasPassword,
  signOutConfirm,
  setSignOutConfirm,
  deleteAccountConfirm,
  setDeleteAccountConfirm,
  onSignOut,
  onDeleteAccount,
}: {
  hasPassword: boolean | undefined;
  signOutConfirm: boolean;
  setSignOutConfirm: (v: boolean) => void;
  deleteAccountConfirm: boolean;
  setDeleteAccountConfirm: (v: boolean) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  const dfont = useDynamicFont();
  return (
    <>
      {hasPassword ? (
        <SecondaryButton
          testID="profile-change-password"
          label="Change password"
          onPress={() => {
            haptics.light();
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
            testID="profile-sign-out"
            label="Sign out"
            destructive
            onPress={() => {
              haptics.medium();
              setSignOutConfirm(true);
            }}
          />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <Button
            testID="profile-sign-out-confirm"
            label="Sign Out"
            role="destructive"
            onPress={onSignOut}
          />
          <Button testID="profile-sign-out-cancel" label="Cancel" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <Text modifiers={[dfont({ size: 16 })]}>
            You will need to sign in again to access your account.
          </Text>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>

      <Alert
        title="Delete account?"
        isPresented={deleteAccountConfirm}
        onIsPresentedChange={setDeleteAccountConfirm}
      >
        <Alert.Trigger>
          <SecondaryButton
            testID="profile-delete-account"
            label="Delete account"
            destructive
            filled={false}
            onPress={() => {
              haptics.warning();
              setDeleteAccountConfirm(true);
            }}
          />
        </Alert.Trigger>
        <Alert.Actions>
          <Button
            testID="profile-delete-account-confirm"
            label="Delete Account"
            role="destructive"
            onPress={onDeleteAccount}
          />
          <Button testID="profile-delete-account-cancel" label="Cancel" role="cancel" />
        </Alert.Actions>
        <Alert.Message>
          <Text modifiers={[dfont({ size: 16 })]}>
            Your account is scheduled for permanent deletion in 30 days. Sign in within that window
            to restore it.
          </Text>
        </Alert.Message>
      </Alert>
    </>
  );
}
