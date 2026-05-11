import { Picker, Text } from "@expo/ui/swift-ui";
import { controlSize, frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { haptics } from "@/lib/haptics";

// Native iOS segmented control via @expo/ui's SwiftUI Picker. Mirrors the
// affordance of tanvex's web SegmentedToggle (Sign in/Sign up, Email/Username
// /Email OTP) but renders as the platform-native control on iOS.

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
};

export function SegmentedToggle<T extends string>({ value, options, onChange }: Props<T>) {
  const dfont = useDynamicFont();
  return (
    <Picker
      modifiers={[
        pickerStyle("segmented"),
        controlSize("large"),
        frame({ maxWidth: 10000, height: ButtonTokens.height }),
      ]}
      selection={value}
      onSelectionChange={(selection) => {
        const next = selection as T;
        if (next === value) return;
        haptics.light();
        onChange(next);
      }}
    >
      {options.map((opt) => (
        <Text key={opt.value} modifiers={[tag(opt.value), dfont({ size: 14, weight: "medium" })]}>
          {opt.label}
        </Text>
      ))}
    </Picker>
  );
}
