import { Button, ConfirmationDialog, Spacer, Text } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";

export function DiscardChangesDialog({
  message,
  pendingNavAction,
  onDiscard,
  onDismiss,
}: {
  message: string;
  pendingNavAction: unknown;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  const dfont = useDynamicFont();
  return (
    <ConfirmationDialog
      title="Discard changes?"
      isPresented={pendingNavAction !== null}
      onIsPresentedChange={(v) => {
        if (!v) onDismiss();
      }}
      titleVisibility="visible"
    >
      <ConfirmationDialog.Trigger>
        <Spacer modifiers={[frame({ width: 0, height: 0 })]} />
      </ConfirmationDialog.Trigger>
      <ConfirmationDialog.Actions>
        <Button label="Discard" role="destructive" onPress={onDiscard} />
        <Button label="Keep Editing" role="cancel" />
      </ConfirmationDialog.Actions>
      <ConfirmationDialog.Message>
        <Text modifiers={[dfont({ size: 16 })]}>{message}</Text>
      </ConfirmationDialog.Message>
    </ConfirmationDialog>
  );
}
