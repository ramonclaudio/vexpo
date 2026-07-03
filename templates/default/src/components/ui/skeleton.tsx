import { VStack, HStack, Spacer, Text } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityLabel,
  background,
  clipShape,
  cornerRadius,
  frame,
  padding,
  redacted,
  unredacted,
} from "@expo/ui/swift-ui/modifiers";

import { Spacing } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";

// Skeleton placeholders for initial query loads. Each root wraps its subtree in
// `redacted("placeholder")` (upstream expo/expo#47269), the canonical SwiftUI
// skeleton: SwiftUI draws native gray capsules over the real Texts, each sized
// to a representative string, so the skeleton tracks the live layout and Dynamic
// Type for free instead of drifting behind hardcoded bar widths. No animation,
// and static placeholders satisfy the Reduce Motion accessibility setting
// trivially (nothing to suppress). The avatar Circle and the field-capsule boxes
// stay literal muted fills (they stand in for geometry, not text) with a
// whitespace `Text` forcing the framed VStack to draw its background; each opts
// out with `unredacted()` so that spacer Text doesn't draw a nub over the fill.
// Each root collapses to one element with `accessibilityElement("ignore")`
// (upstream expo/expo#47156) plus an `accessibilityLabel` ("Loading profile" /
// "Loading sessions"), so VoiceOver speaks a single "Loading" instead of swiping
// a silent screen; "ignore" keeps the fake children (Jane Appleseed, iPhone 15
// Pro) unspoken.

function FieldBox() {
  const colors = useColors();
  return (
    <VStack
      modifiers={[
        frame({ maxWidth: Infinity, height: 44 }),
        background(colors.muted as string),
        cornerRadius(22),
        unredacted(),
      ]}
    >
      <Text> </Text>
    </VStack>
  );
}

function Circle({ size }: { size: number }) {
  const colors = useColors();
  return (
    <VStack
      modifiers={[
        frame({ width: size, height: size }),
        background(colors.muted as string),
        clipShape("circle"),
        unredacted(),
      ]}
    >
      <Text> </Text>
    </VStack>
  );
}

function Field({ label }: { label: string }) {
  const dfont = useDynamicFont();
  return (
    <VStack alignment="leading" spacing={Spacing.md}>
      <Text modifiers={[dfont({ size: 14 })]}>{label}</Text>
      <FieldBox />
    </VStack>
  );
}

export function SkeletonProfile({ testID }: { testID?: string } = {}) {
  const dfont = useDynamicFont();
  return (
    <VStack
      testID={testID}
      alignment="leading"
      spacing={Spacing.xl}
      modifiers={[
        padding({ all: 24 }),
        redacted("placeholder"),
        accessibilityElement("ignore"),
        accessibilityLabel("Loading profile"),
      ]}
    >
      <HStack spacing={Spacing.lg}>
        <Circle size={72} />
        <VStack alignment="leading" spacing={Spacing.sm}>
          <Text modifiers={[dfont({ size: 17, weight: "semibold" })]}>Jane Appleseed</Text>
          <Text modifiers={[dfont({ size: 14 })]}>jane@example.com</Text>
        </VStack>
        <Spacer />
      </HStack>
      <Field label="Name" />
      <Field label="Username" />
      <Field label="Email" />
    </VStack>
  );
}

export function SkeletonSessions({ testID }: { testID?: string } = {}) {
  return (
    <VStack
      testID={testID}
      alignment="leading"
      spacing={Spacing.md}
      modifiers={[
        padding({ all: 24 }),
        redacted("placeholder"),
        accessibilityElement("ignore"),
        accessibilityLabel("Loading sessions"),
      ]}
    >
      <SkeletonSessionRow />
      <SkeletonSessionRow />
      <SkeletonSessionRow />
    </VStack>
  );
}

function SkeletonSessionRow() {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <VStack
      alignment="leading"
      spacing={Spacing.md}
      modifiers={[padding({ all: 16 }), background(colors.card as string), cornerRadius(12)]}
    >
      <HStack spacing={Spacing.md}>
        <Text modifiers={[dfont({ size: 16, weight: "semibold" })]}>iPhone 15 Pro</Text>
        <Spacer />
        <Text modifiers={[dfont({ size: 14 })]}>Revoke</Text>
      </HStack>
      <Text modifiers={[dfont({ size: 14 })]}>192.168.1.100 · 2 hours ago</Text>
    </VStack>
  );
}
