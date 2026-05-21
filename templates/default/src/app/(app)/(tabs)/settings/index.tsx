import { useState, type ComponentProps } from "react";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import { Image as ExpoImage, useImage } from "expo-image";
import { router, type Href } from "expo-router";

const PROFILE_HREF = "/profile" as Href;
const DEBUG_HREF = "/debug" as Href;
import { useMutation, useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  Button,
  Text,
  HStack,
  VStack,
  Spacer,
  Image,
  RNHostView,
  Alert,
  ConfirmationDialog,
} from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  padding,
  onTapGesture,
  accessibilityLabel,
  lineLimit,
  truncationMode,
  textSelection,
  scrollDismissesKeyboard,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";
import { useColors } from "@/hooks/use-theme";
import { useDebugEnabled } from "@/lib/preferences";

const HEADER_AVATAR_SIZE = 56;

export default function SettingsScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const me = useQuery(api.users.getMe);
  const removeAllTokens = useMutation(api.pushTokens.removeAll);
  const deleteAccountMutation = useMutation(api.users.deleteAccount);

  const [showSignOut, setShowSignOut] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [debugOn] = useDebugEnabled();

  const navigate = (path: Href) => {
    haptics.light();
    router.push(path);
  };

  const handleSignOut = async () => {
    haptics.medium();
    // Push-token cleanup is best-effort. A stale token gets garbage-collected
    // by `pushTokens.cleanupStale` after 30 days, so don't gate sign-out on it.
    try {
      await removeAllTokens();
    } catch (err) {
      if (__DEV__) console.warn("[signOut] removeAllTokens failed:", err);
    }
    await authClient.signOut();
  };

  const handleDeleteAccount = async () => {
    haptics.error();
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm with Face ID",
    });
    if (!result.success) return;
    await deleteAccountMutation();
    await authClient.signOut();
  };

  const version = Constants.expoConfig?.version ?? "1.0.0";

  const handleCopyVersion = async () => {
    haptics.light();
    await Clipboard.setStringAsync(`v${version}`);
    haptics.success();
    announce("Version copied");
  };

  type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;
  const rowButton = ({
    label,
    systemImage,
    onPress,
    role,
    fg,
  }: {
    label: string;
    systemImage: SFSymbol;
    onPress: () => void;
    role?: "destructive";
    fg?: string;
  }) => {
    const labelColor =
      fg ??
      (role === "destructive" ? (colors.destructive as string) : (colors.foreground as string));
    return (
      <Button
        modifiers={[
          buttonStyle("plain"),
          frame({ maxWidth: 10000 }),
          background(colors.muted as string),
          clipShape("capsule"),
        ]}
        onPress={onPress}
      >
        <HStack
          spacing={12}
          alignment="center"
          modifiers={[
            frame({ maxWidth: 10000, height: ButtonTokens.height }),
            padding({ horizontal: 16 }),
          ]}
        >
          <Image systemName={systemImage} size={18} color={labelColor} />
          <Text modifiers={[dfont({ size: 16, weight: "medium" }), foregroundStyle(labelColor)]}>
            {label}
          </Text>
          <Spacer />
          {role !== "destructive" ? (
            <Image
              systemName="chevron.right"
              size={13}
              color={colors.mutedForeground as string}
              modifiers={[accessibilityLabel("")]}
            />
          ) : null}
        </HStack>
      </Button>
    );
  };

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
      >
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          {/* Profile header */}
          <Button
            modifiers={[
              buttonStyle("plain"),
              frame({ maxWidth: 10000 }),
              background(colors.muted as string),
              clipShape("capsule"),
              onTapGesture(() => {
                haptics.light();
                navigate(PROFILE_HREF);
              }),
              accessibilityLabel("Open profile"),
            ]}
            onPress={() => navigate(PROFILE_HREF)}
          >
            <HStack
              spacing={16}
              alignment="center"
              modifiers={[
                frame({ maxWidth: 10000, height: 80 }),
                padding({ leading: 8, trailing: 16 }),
              ]}
            >
              <ProfileHeaderAvatar avatarUrl={me?.avatarUrl ?? null} />
              <VStack alignment="leading" spacing={2}>
                <Text
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
                    modifiers={[
                      dfont({ size: 14 }),
                      foregroundStyle(colors.mutedForeground as string),
                      lineLimit(1),
                      truncationMode("middle"),
                      textSelection(true),
                    ]}
                  >
                    {me.email}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
              <Image
                systemName="chevron.right"
                size={13}
                color={colors.mutedForeground as string}
                modifiers={[accessibilityLabel("")]}
              />
            </HStack>
          </Button>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            {rowButton({
              label: "Sessions",
              systemImage: "list.bullet.rectangle.portrait",
              onPress: () => navigate("/sessions"),
            })}
            {rowButton({
              label: "Preferences",
              systemImage: "slider.horizontal.3",
              onPress: () => navigate("/settings/preferences"),
            })}
          </VStack>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            {rowButton({
              label: "Help & Feedback",
              systemImage: "bubble.left",
              onPress: () => navigate("/help"),
            })}
            {rowButton({
              label: "Privacy",
              systemImage: "hand.raised",
              onPress: () => navigate("/privacy"),
            })}
            {rowButton({
              label: "Copy version",
              systemImage: "doc.on.doc",
              onPress: handleCopyVersion,
            })}
            {debugOn
              ? rowButton({
                  label: "Debug",
                  systemImage: "ant.circle",
                  onPress: () => navigate(DEBUG_HREF),
                })
              : null}
          </VStack>

          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <ConfirmationDialog
              title="Sign out?"
              isPresented={showSignOut}
              onIsPresentedChange={setShowSignOut}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                {rowButton({
                  label: "Sign out",
                  systemImage: "rectangle.portrait.and.arrow.right",
                  onPress: () => setShowSignOut(true),
                  role: "destructive",
                })}
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button label="Sign Out" role="destructive" onPress={handleSignOut} />
                <Button label="Cancel" role="cancel" />
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
                {rowButton({
                  label: "Delete account",
                  systemImage: "trash",
                  onPress: () => setShowDeleteAccount(true),
                  role: "destructive",
                })}
              </Alert.Trigger>
              <Alert.Actions>
                <Button label="Delete Account" role="destructive" onPress={handleDeleteAccount} />
                <Button label="Cancel" role="cancel" />
              </Alert.Actions>
              <Alert.Message>
                <Text modifiers={[dfont({ size: 16 })]}>
                  Your account is scheduled for permanent deletion in 30 days. Sign in within that
                  window to restore it.
                </Text>
              </Alert.Message>
            </Alert>
          </VStack>

          <HStack modifiers={[frame({ maxWidth: 10000 }), padding({ top: 16 })]}>
            <Spacer />
            <Text
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
      modifiers={[frame({ width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE })]}
    />
  );
}

function RemoteAvatar({ url, size }: { url: string; size: number }) {
  const colors = useColors();
  const image = useImage(url, { maxWidth: size * 4 });
  if (!image) {
    return (
      <Image
        systemName="person.crop.circle.fill"
        size={size}
        color={colors.mutedForeground as string}
        modifiers={[frame({ width: size, height: size })]}
      />
    );
  }
  return (
    <RNHostView matchContents>
      <ExpoImage
        source={image}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        contentFit="cover"
        accessibilityLabel="Profile photo"
      />
    </RNHostView>
  );
}
