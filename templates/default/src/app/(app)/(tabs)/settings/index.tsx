import { useState } from "react";
import Constants from "expo-constants";
import { useDeleteAccount } from "@/hooks/use-delete-account";
import { useSignOutMutation } from "@/hooks/use-sign-out-mutation";
import { router } from "expo-router";
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
} from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  contentShape,
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
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";

import { api } from "@/convex/_generated/api";
import { GUEST_NAME } from "@/convex/constants";
import { CapsuleRowButton } from "@/components/ui/capsule-row-button";
import { Avatar } from "@/components/ui/remote-avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { ErrorText } from "@/components/ui/status-text";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { Colors } from "@/constants/theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";

const HEADER_AVATAR_SIZE = 56;

// A guest starts as GUEST_NAME with no photo, so the row asks for whatever is still missing.
function guestSubtitle(name: string | undefined, hasPhoto: boolean): string {
  const needsName = !name || name === GUEST_NAME;
  if (needsName && !hasPhoto) return "Add a name and a photo";
  if (needsName) return "Add a name";
  if (!hasPhoto) return "Add a photo";
  return "Guest session";
}

export default function SettingsScreen() {
  const dfont = useDynamicFont();
  const scenePrivacy = useScenePrivacy();
  const me = useQuery(api.users.getMe);
  const { isGuest } = useAuthStatus();
  const { deleteAccount, deleteError } = useDeleteAccount();
  const [discardGuest, discardError] = useSignOutMutation(api.users.discardGuest);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showDiscardGuest, setShowDiscardGuest] = useState(false);

  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }} modifiers={scenePrivacy}>
      <ScrollView modifiers={[scrollDismissesKeyboard("interactively"), tint(Colors.primary)]}>
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <Button
            modifiers={[
              buttonStyle("plain"),
              frame({ maxWidth: Infinity }),
              background(Colors.muted),
              clipShape("capsule"),
              accessibilityHint("Opens your profile"),
            ]}
            onPress={() => router.push("/profile")}
          >
            <HStack
              spacing={16}
              alignment="center"
              modifiers={[
                frame({ maxWidth: Infinity, minHeight: 80 }),
                padding({ leading: 8, trailing: 16 }),
                contentShape(shapes.capsule()),
              ]}
            >
              <Avatar url={me?.avatarUrl ?? null} size={HEADER_AVATAR_SIZE} />
              <VStack alignment="leading" spacing={2}>
                <Text
                  modifiers={[
                    dfont({ size: 17, weight: "semibold" }),
                    foregroundStyle(Colors.foreground),
                    lineLimit(2),
                    truncationMode("tail"),
                  ]}
                >
                  {me?.name ?? "Loading..."}
                </Text>
                {isGuest ? (
                  <Text
                    modifiers={[
                      dfont({ size: 14 }),
                      foregroundStyle(Colors.mutedForeground),
                      lineLimit(2),
                    ]}
                  >
                    {guestSubtitle(me?.name, me?.hasUploadedAvatar === true)}
                  </Text>
                ) : me?.email ? (
                  <Text
                    modifiers={[
                      dfont({ size: 14 }),
                      foregroundStyle(Colors.mutedForeground),
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
                color={Colors.mutedForeground}
                modifiers={[dfont({ size: 17 }), imageScale("small"), accessibilityHidden(true)]}
              />
            </HStack>
          </Button>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>ACCOUNT</SectionLabel>
            {isGuest ? (
              <CapsuleRowButton
                label="Create an account"
                inputLabels={["Create an account", "Sign up"]}
                systemImage="person.crop.circle.badge.plus"
                onPress={() => router.push("/auth/sign-up")}
              />
            ) : (
              <CapsuleRowButton
                label="Sessions"
                systemImage="list.bullet.rectangle.portrait"
                onPress={() => router.push("/sessions")}
              />
            )}
            <CapsuleRowButton
              label="Preferences"
              systemImage="slider.horizontal.3"
              onPress={() => router.push("/settings/preferences")}
            />
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>SUPPORT</SectionLabel>
            <CapsuleRowButton
              label="Help & Feedback"
              inputLabels={["Help and Feedback", "Help", "Feedback"]}
              systemImage="questionmark.bubble.fill"
              onPress={() => router.push("/help")}
            />
            <CapsuleRowButton
              label="Privacy"
              systemImage="lock.shield.fill"
              onPress={() => router.push("/privacy")}
            />
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>DANGER ZONE</SectionLabel>
            {isGuest ? (
              <Alert
                title="Discard guest data?"
                isPresented={showDiscardGuest}
                onIsPresentedChange={setShowDiscardGuest}
              >
                <Alert.Trigger>
                  <CapsuleRowButton
                    label="Discard guest data"
                    systemImage="trash"
                    onPress={() => setShowDiscardGuest(true)}
                    role="destructive"
                  />
                </Alert.Trigger>
                <Alert.Actions>
                  <Button label="Discard" role="destructive" onPress={discardGuest} />
                  <Button label="Cancel" role="cancel" />
                </Alert.Actions>
                <Alert.Message>
                  <Text modifiers={[dfont({ size: 16 })]}>
                    This deletes everything from this guest session right away. There is no account
                    to sign back into, so it cannot be undone.
                  </Text>
                </Alert.Message>
              </Alert>
            ) : null}

            {isGuest ? null : (
              <Alert
                title="Delete account?"
                isPresented={showDeleteAccount}
                onIsPresentedChange={setShowDeleteAccount}
              >
                <Alert.Trigger>
                  <CapsuleRowButton
                    label="Delete account"
                    systemImage="trash"
                    onPress={() => setShowDeleteAccount(true)}
                    role="destructive"
                  />
                </Alert.Trigger>
                <Alert.Actions>
                  <Button label="Delete Account" role="destructive" onPress={deleteAccount} />
                  <Button label="Cancel" role="cancel" />
                </Alert.Actions>
                <Alert.Message>
                  <Text modifiers={[dfont({ size: 16 })]}>
                    Your account is scheduled for permanent deletion in 30 days. Sign in within that
                    window to restore it.
                  </Text>
                </Alert.Message>
              </Alert>
            )}
          </VStack>

          {deleteError ? <ErrorText>{deleteError}</ErrorText> : null}
          {discardError ? <ErrorText>{discardError}</ErrorText> : null}

          <HStack modifiers={[frame({ maxWidth: Infinity }), padding({ top: 16 })]}>
            <Spacer />
            <Text modifiers={[dfont({ size: 12 }), foregroundStyle(Colors.mutedForeground)]}>
              v{version}
            </Text>
            <Spacer />
          </HStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
