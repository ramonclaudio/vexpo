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
  accessibilityHint,
  accessibilityInputLabels,
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

import { Avatar } from "@/components/ui/remote-avatar";
import { DynamicType } from "@/constants/ui";
import { TouchTarget } from "@/constants/layout";
import { Colors } from "@/constants/theme";
import { useDynamicFont } from "@/lib/dynamic-font";

const AVATAR_SIZE = 96;

type AvatarSource = "library" | "camera";

export function AvatarPickerRow({
  me,
  isGuest,
  avatarPicker,
  setAvatarPicker,
  avatarUpdating,
  onPick,
  onRemove,
}: {
  me: { name: string; email: string; avatarUrl: string | null; hasUploadedAvatar: boolean };
  isGuest: boolean;
  avatarPicker: boolean;
  setAvatarPicker: (v: boolean) => void;
  avatarUpdating: boolean;
  onPick: (source: AvatarSource) => void;
  onRemove: () => void;
}) {
  const dfont = useDynamicFont();
  return (
    <ConfirmationDialog
      title="Profile photo"
      isPresented={avatarPicker}
      onIsPresentedChange={setAvatarPicker}
      titleVisibility="visible"
    >
      <ConfirmationDialog.Trigger>
        <Button
          modifiers={[
            buttonStyle("plain"),
            frame({ maxWidth: Infinity, minHeight: TouchTarget.min }),
            contentShape(shapes.rectangle()),
            // A label here would replace the name and email the children announce.
            accessibilityHint("Change your profile photo"),
            accessibilityInputLabels(["Change profile photo", "Profile photo", "Add a photo"]),
          ]}
          onPress={() => {
            setAvatarPicker(true);
          }}
        >
          <HStack spacing={16} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <AvatarView avatarUrl={me.avatarUrl} loading={avatarUpdating} />
            <VStack alignment="leading" spacing={4}>
              <Text modifiers={[dfont({ size: 17, weight: "semibold" })]}>{me.name}</Text>
              <Text
                modifiers={[
                  dfont({ size: 14 }),
                  foregroundStyle(Colors.mutedForeground),
                  privacySensitive(),
                ]}
              >
                {isGuest ? "Tap to add a photo" : me.email}
              </Text>
            </VStack>
            <Spacer />
            <Image
              systemName="camera.circle.fill"
              color={Colors.primary}
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
          label="Choose Photo"
          systemImage="photo.on.rectangle"
          onPress={() => onPick("library")}
        />
        <Button label="Take Photo" systemImage="camera" onPress={() => onPick("camera")} />
        {me.hasUploadedAvatar && (
          <Button label="Remove Photo" role="destructive" onPress={onRemove} />
        )}
        <Button label="Cancel" role="cancel" />
      </ConfirmationDialog.Actions>
    </ConfirmationDialog>
  );
}

function AvatarView({ avatarUrl, loading }: { avatarUrl: string | null; loading: boolean }) {
  if (loading) {
    return (
      <VStack
        alignment="center"
        modifiers={[
          frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }),
          clipShape("circle"),
          strokeBorder({
            color: Colors.mutedForeground,
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
  return <Avatar url={avatarUrl} size={AVATAR_SIZE} />;
}
