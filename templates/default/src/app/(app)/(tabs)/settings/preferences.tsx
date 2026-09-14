import { Host, ScrollView, VStack } from "@expo/ui/swift-ui";
import { frame, padding, scrollDismissesKeyboard, tint } from "@expo/ui/swift-ui/modifiers";

import { CapsuleToggleRow } from "@/components/ui/capsule-toggle-row";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { haptics } from "@/lib/haptics";
import { useThemeMode } from "@/hooks/use-theme";
import { Colors } from "@/constants/theme";
import { useHapticsEnabled, useReduceMotionPref } from "@/lib/preferences";

export default function PreferencesScreen() {
  const { mode, setMode } = useThemeMode();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  const [motion, setMotion] = useReduceMotionPref();

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView modifiers={[scrollDismissesKeyboard("interactively"), tint(Colors.primary)]}>
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <SectionLabel>APPEARANCE</SectionLabel>
            <SegmentedToggle
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
              systemImage="iphone.radiowaves.left.and.right"
              label="Haptic feedback"
              value={hapticsOn}
              onChange={(v) => {
                setHapticsOn(v);
                if (v) haptics.selection();
              }}
            />
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
