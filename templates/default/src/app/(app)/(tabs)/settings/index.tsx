import { useState } from "react";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { useDeleteAccount } from "@/hooks/use-delete-account";
import { router, type Href } from "expo-router";
import { useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  Button,
  Text,
  HStack,
  VStack,
  Spacer,
  Image,
  Alert,
  ConfirmationDialog,
} from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  imageScale,
  padding,
  accessibilityHidden,
  accessibilityHint,
  lineLimit,
  privacySensitive,
  truncationMode,
  textSelection,
  scrollDismissesKeyboard,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";

import { api } from "@/convex/_generated/api";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";
import { CapsuleRowButton } from "@/components/ui/capsule-row-button";
import { RemoteAvatar } from "@/components/ui/remote-avatar";
import { ErrorText } from "@/components/ui/status-text";
import { useColors } from "@/hooks/use-theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";
import { useSignOut } from "@/hooks/use-sign-out";
import { useDebugEnabled } from "@/lib/preferences";

const PROFILE_HREF = "/profile" as Href;
const DEBUG_HREF = "/debug" as Href;

const HEADER_AVATAR_SIZE = 56;

export default function SettingsScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const scenePrivacy = useScenePrivacy();
  const me = useQuery(api.users.getMe);
  const { deleteAccount, deleteError } = useDeleteAccount();
  const handleSignOut = useSignOut();

  const [showSignOut, setShowSignOut] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [debugOn] = useDebugEnabled();

  const navigate = (path: Href) => {
    haptics.light();
    router.push(path);
  };

  const version = Constants.expoConfig?.version ?? "1.0.0";

  const handleCopyVersion = async () => {
    haptics.light();
    await Clipboard.setStringAsync(`v${version}`);
    haptics.success();
    announce("Version copied");
  };

  return (
    <Host
      testID="settings-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      // upstream expo/expo#47269: raises redacted("privacy") when the app
      // resigns, hiding privacySensitive leaves in the app-switcher snapshot
      modifiers={scenePrivacy}
    >
      <ScrollView
        modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
      >
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <Button
            testID="settings-profile"
            modifiers={[
              buttonStyle("plain"),
              frame({ maxWidth: Infinity }),
              background(colors.muted as string),
              clipShape("capsule"),
              accessibilityHint("Opens your profile"),
            ]}
            onPress={() => navigate(PROFILE_HREF)}
          >
            <HStack
              spacing={16}
              alignment="center"
              modifiers={[
                frame({ maxWidth: Infinity, minHeight: 80 }),
                padding({ leading: 8, trailing: 16 }),
              ]}
            >
              <ProfileHeaderAvatar avatarUrl={me?.avatarUrl ?? null} />
              <VStack alignment="leading" spacing={2}>
                <Text
                  testID="settings-profile-name"
                  modifiers={[
                    dfont({ size: 17, weight: "semibold" }),
                    foregroundStyle(colors.foreground as string),
                    lineLimit(2),
                    truncationMode("tail"),
                  ]}
                >
                  {me?.name ?? "Loading..."}
                </Text>
                {me?.email ? (
                  <Text
                    testID="settings-profile-email"
                    modifiers={[
                      dfont({ size: 14 }),
                      foregroundStyle(colors.mutedForeground as string),
                      lineLimit(1),
                      truncationMode("middle"),
                      textSelection(true),
                      privacySensitive(),
                    ]}
                  >
                    {me.email}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
              <Image
                systemName="chevron.right"
                color={colors.mutedForeground as string}
                modifiers={[dfont({ size: 17 }), imageScale("small"), accessibilityHidden(true)]}
              />
            </HStack>
          </Button>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <CapsuleRowButton
              testID="settings-sessions"
              label="Sessions"
              systemImage="list.bullet.rectangle.portrait"
              onPress={() => navigate("/sessions")}
            />
            <CapsuleRowButton
              testID="settings-preferences"
              label="Preferences"
              systemImage="slider.horizontal.3"
              onPress={() => navigate("/settings/preferences")}
            />
          </VStack>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <CapsuleRowButton
              testID="settings-help"
              label="Help & Feedback"
              inputLabels={["Help and Feedback", "Help", "Feedback"]}
              systemImage="questionmark.bubble.fill"
              onPress={() => navigate("/help")}
            />
            <CapsuleRowButton
              testID="settings-privacy"
              label="Privacy"
              systemImage="lock.shield.fill"
              onPress={() => navigate("/privacy")}
            />
            <CapsuleRowButton
              testID="settings-copy-version"
              label="Copy version"
              systemImage="doc.on.doc"
              onPress={handleCopyVersion}
            />
            {debugOn ? (
              <CapsuleRowButton
                testID="settings-debug"
                label="Debug"
                systemImage="ant.circle"
                onPress={() => navigate(DEBUG_HREF)}
              />
            ) : null}
          </VStack>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <ConfirmationDialog
              title="Sign out?"
              isPresented={showSignOut}
              onIsPresentedChange={setShowSignOut}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                <CapsuleRowButton
                  testID="settings-sign-out"
                  label="Sign out"
                  systemImage="rectangle.portrait.and.arrow.right"
                  onPress={() => setShowSignOut(true)}
                  role="destructive"
                />
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button
                  testID="settings-sign-out-confirm"
                  label="Sign Out"
                  role="destructive"
                  onPress={handleSignOut}
                />
                <Button testID="settings-sign-out-cancel" label="Cancel" role="cancel" />
              </ConfirmationDialog.Actions>
              <ConfirmationDialog.Message>
                <Text modifiers={[dfont({ size: 16 })]}>
                  You will need to sign in again to access your account.
                </Text>
              </ConfirmationDialog.Message>
            </ConfirmationDialog>

            {/* upstream expo/expo#45700: Alert component, SwiftUI .alert(...) on iOS 15+ */}
            <Alert
              title="Delete account?"
              isPresented={showDeleteAccount}
              onIsPresentedChange={setShowDeleteAccount}
            >
              <Alert.Trigger>
                <CapsuleRowButton
                  testID="settings-delete-account"
                  label="Delete account"
                  systemImage="trash"
                  onPress={() => setShowDeleteAccount(true)}
                  role="destructive"
                />
              </Alert.Trigger>
              <Alert.Actions>
                <Button
                  testID="settings-delete-account-confirm"
                  label="Delete Account"
                  role="destructive"
                  onPress={deleteAccount}
                />
                <Button testID="settings-delete-account-cancel" label="Cancel" role="cancel" />
              </Alert.Actions>
              <Alert.Message>
                <Text modifiers={[dfont({ size: 16 })]}>
                  Your account is scheduled for permanent deletion in 30 days. Sign in within that
                  window to restore it.
                </Text>
              </Alert.Message>
            </Alert>
          </VStack>

          {deleteError ? <ErrorText testID="settings-delete-error">{deleteError}</ErrorText> : null}

          <HStack modifiers={[frame({ maxWidth: Infinity }), padding({ top: 16 })]}>
            <Spacer />
            <Text
              testID="settings-version"
              modifiers={[dfont({ size: 12 }), foregroundStyle(colors.tertiaryLabel as string)]}
            >
              v{version}
            </Text>
            <Spacer />
          </HStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}

function ProfileHeaderAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const colors = useColors();
  if (avatarUrl) {
    return <RemoteAvatar key={avatarUrl} url={avatarUrl} size={HEADER_AVATAR_SIZE} />;
  }
  return (
    <Image
      systemName="person.crop.circle.fill"
      size={HEADER_AVATAR_SIZE}
      color={colors.mutedForeground as string}
      modifiers={[
        frame({ width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE }),
        accessibilityHidden(true),
      ]}
    />
  );
}
