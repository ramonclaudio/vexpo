import { Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  controlSize,
  dynamicTypeSize,
  frame,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";
import { haptics } from "@/lib/haptics";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  // Group label spoken by VoiceOver before the segments. Required because a
  // bare segmented Picker reads only the segment labels and would otherwise
  // leave the user without context for what the group controls.
  accessibilityLabel: string;
  testID?: string;
};

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel: a11yLabel,
  testID,
}: Props<T>) {
  const dfont = useDynamicFont();
  return (
    <Picker
      testID={testID}
      modifiers={[
        pickerStyle("segmented"),
        controlSize("large"),
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        // upstream expo/expo#46540: the two segments sit side by side and can't
        // reflow, so cap Dynamic Type before the labels overflow at AX sizes.
        dynamicTypeSize({ max: DynamicType.control }),
        accessibilityLabel(a11yLabel),
      ]}
      selection={value}
      onSelectionChange={(selection) => {
        const next = selection as T;
        if (next === value) return;
        haptics.selection();
        onChange(next);
      }}
    >
      {options.map((opt) => (
        <Text
          key={opt.value}
          testID={testID ? `${testID}-${opt.value}` : undefined}
          modifiers={[tag(opt.value), dfont({ size: 14, weight: "medium" })]}
        >
          {opt.label}
        </Text>
      ))}
    </Picker>
  );
}
