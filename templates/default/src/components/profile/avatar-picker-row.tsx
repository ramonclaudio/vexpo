import {
  Button,
  ConfirmationDialog,
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  buttonStyle,
  clipShape,
  contentShape,
  dynamicTypeSize,
  foregroundStyle,
  frame,
  privacySensitive,
  progressViewStyle,
  shapes,
  strokeBorder,
} from "@expo/ui/swift-ui/modifiers";

import { RemoteAvatar } from "@/components/ui/remote-avatar";
import { DynamicType } from "@/constants/ui";
import { TouchTarget } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

const AVATAR_SIZE = 96;

type AvatarSource = "library" | "camera";

export function AvatarPickerRow({
  me,
  avatarPicker,
  setAvatarPicker,
  avatarUpdating,
  onPick,
  onRemove,
}: {
  me: { name: string; email: string; avatarUrl: string | null; hasUploadedAvatar: boolean };
  avatarPicker: boolean;
  setAvatarPicker: (v: boolean) => void;
  avatarUpdating: boolean;
  onPick: (source: AvatarSource) => void;
  onRemove: () => void;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <ConfirmationDialog
      title="Profile photo"
      isPresented={avatarPicker}
      onIsPresentedChange={setAvatarPicker}
      titleVisibility="visible"
    >
      <ConfirmationDialog.Trigger>
        <Button
          testID="profile-avatar"
          modifiers={[
            buttonStyle("plain"),
            frame({ maxWidth: Infinity, minHeight: TouchTarget.min }),
            contentShape(shapes.rectangle()),
            accessibilityLabel("Change profile photo"),
          ]}
          onPress={() => {
            haptics.light();
            setAvatarPicker(true);
          }}
        >
          <HStack spacing={16} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <AvatarView avatarUrl={me.avatarUrl} loading={avatarUpdating} />
            <VStack alignment="leading" spacing={4}>
              <Text
                testID="profile-name-value"
                modifiers={[dfont({ size: 17, weight: "semibold" })]}
              >
                {me.name}
              </Text>
              <Text
                testID="profile-email-value"
                modifiers={[
                  dfont({ size: 14 }),
                  foregroundStyle(colors.mutedForeground as string),
                  privacySensitive(),
                ]}
              >
                {me.email}
              </Text>
            </VStack>
            <Spacer />
            <Image
              systemName="camera.circle.fill"
              color={colors.primary as string}
              modifiers={[
                dfont({ size: 28 }),
                dynamicTypeSize({ max: DynamicType.control }),
                accessibilityHidden(true),
              ]}
            />
          </HStack>
        </Button>
      </ConfirmationDialog.Trigger>
      <ConfirmationDialog.Actions>
        <Button
          testID="profile-avatar-choose"
          label="Choose Photo"
          systemImage="photo.on.rectangle"
          onPress={() => onPick("library")}
        />
        <Button
          testID="profile-avatar-take"
          label="Take Photo"
          systemImage="camera"
          onPress={() => onPick("camera")}
        />
        {me.hasUploadedAvatar && (
          <Button
            testID="profile-avatar-remove"
            label="Remove Photo"
            role="destructive"
            onPress={onRemove}
          />
        )}
        <Button testID="profile-avatar-cancel" label="Cancel" role="cancel" />
      </ConfirmationDialog.Actions>
    </ConfirmationDialog>
  );
}

function AvatarView({ avatarUrl, loading }: { avatarUrl: string | null; loading: boolean }) {
  const colors = useColors();
  if (loading) {
    return (
      <VStack
        alignment="center"
        modifiers={[
          frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }),
          clipShape("circle"),
          // upstream expo/expo#47426: a dashed round-cap circle stroke keeps
          // the slot's footprint while the photo gives way to a bare spinner.
          strokeBorder({
            color: colors.mutedForeground as string,
            shape: "circle",
            style: { lineWidth: 2, lineCap: "round", dash: [4, 6] },
          }),
        ]}
      >
        <ProgressView
          modifiers={[progressViewStyle("circular"), accessibilityLabel("Updating profile photo")]}
        />
      </VStack>
    );
  }
  if (avatarUrl) {
    return <RemoteAvatar key={avatarUrl} url={avatarUrl} size={AVATAR_SIZE} />;
  }
  return (
    <Image
      systemName="person.crop.circle.fill"
      size={AVATAR_SIZE}
      color={colors.mutedForeground as string}
      modifiers={[frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }), accessibilityHidden(true)]}
    />
  );
}
