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

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
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
