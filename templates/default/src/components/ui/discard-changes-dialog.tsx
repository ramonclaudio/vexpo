import { Button, ConfirmationDialog, Spacer, Text } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";

// The "Discard changes?" sheet paired with useUnsavedChanges. The hidden
// zero-size Spacer is the required Trigger anchor; presentation is driven by
// `pendingNavAction` instead of a tap.
export function DiscardChangesDialog({
  testIDPrefix,
  message,
  pendingNavAction,
  onDiscard,
  onDismiss,
}: {
  testIDPrefix: string;
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
        <Button
          testID={`${testIDPrefix}-discard`}
          label="Discard"
          role="destructive"
          onPress={onDiscard}
        />
        <Button testID={`${testIDPrefix}-keep-editing`} label="Keep Editing" role="cancel" />
      </ConfirmationDialog.Actions>
      <ConfirmationDialog.Message>
        <Text modifiers={[dfont({ size: 16 })]}>{message}</Text>
      </ConfirmationDialog.Message>
    </ConfirmationDialog>
  );
}
