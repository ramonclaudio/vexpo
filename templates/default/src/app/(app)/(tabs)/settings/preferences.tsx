import {
  Host,
  ScrollView,
  Picker,
  Toggle,
  Text,
  VStack,
  HStack,
  Spacer,
  Image,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  background,
  clipShape,
  controlSize,
  dynamicTypeSize,
  foregroundStyle,
  frame,
  padding,
  pickerStyle,
  scrollDismissesKeyboard,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Button as ButtonTokens } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { haptics } from "@/lib/haptics";
import { useColors, useThemeMode, type ThemeMode } from "@/hooks/use-theme";
import {
  useDebugEnabled,
  useHapticsEnabled,
  useReduceMotionPref,
  type ReduceMotionPref,
} from "@/lib/preferences";
import { useDynamicFont } from "@/lib/dynamic-font";
import { accessibilityAddTraits } from "@/lib/ui-traits";

const MODE_BY_INDEX: ThemeMode[] = ["light", "dark", "system"];
const INDEX_BY_MODE: Record<ThemeMode, number> = { light: 0, dark: 1, system: 2 };

const MOTION_BY_INDEX: ReduceMotionPref[] = ["system", "always", "never"];
const INDEX_BY_MOTION: Record<ReduceMotionPref, number> = {
  system: 0,
  always: 1,
  never: 2,
};

export default function PreferencesScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const { mode, setMode } = useThemeMode();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  const [motion, setMotion] = useReduceMotionPref();
  const [debugOn, setDebugOn] = useDebugEnabled();

  const sectionLabelModifiers = [
    dfont({ size: 13, weight: "semibold" }),
    foregroundStyle(colors.mutedForeground as string),
    padding({ horizontal: 8 }),
    accessibilityAddTraits(["isHeader"]),
  ];

  const helperModifiers = [
    dfont({ size: 13 }),
    foregroundStyle(colors.mutedForeground as string),
    padding({ horizontal: 8 }),
  ];

  const toggleRow = ({
    testID,
    icon,
    label,
    value,
    onChange,
  }: {
    testID: string;
    icon: NonNullable<React.ComponentProps<typeof Image>["systemName"]>;
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <HStack
      spacing={12}
      alignment="center"
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        padding({ horizontal: 16 }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
    >
      <Image
        systemName={icon}
        color={colors.foreground as string}
        modifiers={[dfont({ size: 18 }), accessibilityHidden(true)]}
      />
      <Text
        modifiers={[
          dfont({ size: 16, weight: "medium" }),
          foregroundStyle(colors.foreground as string),
          accessibilityHidden(true),
        ]}
      >
        {label}
      </Text>
      <Spacer />
      <Toggle
        testID={testID}
        isOn={value}
        onIsOnChange={onChange}
        modifiers={[tint(colors.primary as string), accessibilityLabel(label)]}
      />
    </HStack>
  );

  return (
    <Host testID="preferences-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={sectionLabelModifiers}>APPEARANCE</Text>
            <Picker
              testID="preferences-appearance"
              modifiers={[
                pickerStyle("segmented"),
                controlSize("large"),
                frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                // upstream expo/expo#46540: fixed segments can't reflow, so cap
                // Dynamic Type before the labels truncate at AX sizes.
                dynamicTypeSize({ max: DynamicType.control }),
                accessibilityLabel("Appearance"),
              ]}
              selection={INDEX_BY_MODE[mode]}
              onSelectionChange={(v) => {
                haptics.selection();
                setMode(MODE_BY_INDEX[v as number] ?? "system");
              }}
            >
              <Text
                testID="preferences-appearance-light"
                modifiers={[tag(0), dfont({ size: 14, weight: "medium" })]}
              >
                Light
              </Text>
              <Text
                testID="preferences-appearance-dark"
                modifiers={[tag(1), dfont({ size: 14, weight: "medium" })]}
              >
                Dark
              </Text>
              <Text
                testID="preferences-appearance-system"
                modifiers={[tag(2), dfont({ size: 14, weight: "medium" })]}
              >
                System
              </Text>
            </Picker>
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={sectionLabelModifiers}>REDUCE MOTION</Text>
            <Picker
              testID="preferences-reduce-motion"
              modifiers={[
                pickerStyle("segmented"),
                controlSize("large"),
                frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                // upstream expo/expo#46540: fixed segments can't reflow, so cap
                // Dynamic Type before the labels truncate at AX sizes.
                dynamicTypeSize({ max: DynamicType.control }),
                accessibilityLabel("Reduce motion"),
              ]}
              selection={INDEX_BY_MOTION[motion]}
              onSelectionChange={(v) => {
                haptics.selection();
                setMotion(MOTION_BY_INDEX[v as number] ?? "system");
              }}
            >
              <Text
                testID="preferences-reduce-motion-system"
                modifiers={[tag(0), dfont({ size: 14, weight: "medium" })]}
              >
                System
              </Text>
              <Text
                testID="preferences-reduce-motion-always"
                modifiers={[tag(1), dfont({ size: 14, weight: "medium" })]}
              >
                Always
              </Text>
              <Text
                testID="preferences-reduce-motion-never"
                modifiers={[tag(2), dfont({ size: 14, weight: "medium" })]}
              >
                Never
              </Text>
            </Picker>
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={sectionLabelModifiers}>HAPTICS</Text>
            {toggleRow({
              testID: "preferences-haptics",
              icon: "iphone.radiowaves.left.and.right",
              label: "Haptic feedback",
              value: hapticsOn,
              onChange: (v) => {
                setHapticsOn(v);
                if (v) haptics.light();
              },
            })}
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={sectionLabelModifiers}>DEBUG</Text>
            {toggleRow({
              testID: "preferences-debug",
              icon: "ant.circle.fill",
              label: "Debug mode",
              value: debugOn,
              onChange: (v) => {
                setDebugOn(v);
                haptics.light();
              },
            })}
            <Text modifiers={helperModifiers}>
              Reveals a Debug screen with version, device, OTA update, and push diagnostics. Off in
              production builds by default.
            </Text>
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
