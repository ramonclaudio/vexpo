import { VStack } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import type { TextFieldState } from "@/components/ui/capsule-text-field";
import { HelperText } from "@/components/ui/helper-text";
import { LabeledField } from "@/components/ui/labeled-field";
import { OtpField } from "@/components/ui/otp-field";
import { PlainButton, ProminentButton } from "@/components/ui/capsule-button";

export function EmailOtpVerify({
  pendingEmail,
  code,
  codeState,
  onCodeChange,
  onVerify,
  onCancel,
  isVerifying,
  invalidCode,
}: {
  pendingEmail: string;
  code: string;
  codeState: TextFieldState;
  onCodeChange: (digits: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  isVerifying: boolean;
  invalidCode: boolean;
}) {
  return (
    <>
      <LabeledField label="Verify new email">
        <OtpField
          text={codeState}
          hint="Enter the 6 digit code sent to your new email"
          onChange={onCodeChange}
          onVerify={onVerify}
          isVerifying={isVerifying}
          invalidCode={invalidCode}
        />
        <HelperText>{`A 6-digit code was sent to ${pendingEmail}.`}</HelperText>
      </LabeledField>

      <ProminentButton
        label={isVerifying ? "Verifying..." : "Verify"}
        onPress={onVerify}
        disabled={isVerifying || code.length !== 6}
      />

      <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
        <PlainButton label="Cancel" onPress={onCancel} disabled={isVerifying} />
      </VStack>
    </>
  );
}
