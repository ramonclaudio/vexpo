import { Host, ScrollView, VStack } from "@expo/ui/swift-ui";
import { frame, padding, scrollDismissesKeyboard, tint } from "@expo/ui/swift-ui/modifiers";

import { CapsuleToggleRow } from "@/components/ui/capsule-toggle-row";
import { HelperText } from "@/components/ui/helper-text";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { haptics } from "@/lib/haptics";
import { useColors, useThemeMode } from "@/hooks/use-theme";
import { useDebugEnabled, useHapticsEnabled, useReduceMotionPref } from "@/lib/preferences";

export default function PreferencesScreen() {
  const colors = useColors();
  const { mode, setMode } = useThemeMode();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  const [motion, setMotion] = useReduceMotionPref();
  const [debugOn, setDebugOn] = useDebugEnabled();

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
            <SectionLabel>APPEARANCE</SectionLabel>
            <SegmentedToggle
              testID="preferences-appearance"
              value={mode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              onChange={setMode}
              accessibilityLabel="Appearance"
            />
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>REDUCE MOTION</SectionLabel>
            <SegmentedToggle
              testID="preferences-reduce-motion"
              value={motion}
              options={[
                { value: "system", label: "System" },
                { value: "always", label: "Always" },
                { value: "never", label: "Never" },
              ]}
              onChange={setMotion}
              accessibilityLabel="Reduce motion"
            />
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>HAPTICS</SectionLabel>
            <CapsuleToggleRow
              testID="preferences-haptics"
              systemImage="iphone.radiowaves.left.and.right"
              label="Haptic feedback"
              value={hapticsOn}
              onChange={(v) => {
                setHapticsOn(v);
                if (v) haptics.light();
              }}
            />
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>DEBUG</SectionLabel>
            <CapsuleToggleRow
              testID="preferences-debug"
              systemImage="ant.circle.fill"
              label="Debug mode"
              value={debugOn}
              onChange={(v) => {
                setDebugOn(v);
                haptics.light();
              }}
            />
            <HelperText modifiers={[padding({ horizontal: 8 })]}>
              Reveals a Debug screen with version, device, OTA update, and push diagnostics. Off in
              production builds by default.
            </HelperText>
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
