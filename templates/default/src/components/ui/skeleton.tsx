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

import { Colors } from "@/constants/theme";
import { useDynamicFont } from "@/lib/dynamic-font";

function FieldBox() {
  return (
    <VStack
      modifiers={[
        frame({ maxWidth: Infinity, height: 44 }),
        background(Colors.muted),
        cornerRadius(22),
        unredacted(),
      ]}
    >
      <Text> </Text>
    </VStack>
  );
}

function Circle({ size }: { size: number }) {
  return (
    <VStack
      modifiers={[
        frame({ width: size, height: size }),
        background(Colors.muted),
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
    <VStack alignment="leading" spacing={12}>
      <Text modifiers={[dfont({ size: 14 })]}>{label}</Text>
      <FieldBox />
    </VStack>
  );
}

export function SkeletonProfile() {
  const dfont = useDynamicFont();
  return (
    <VStack
      alignment="leading"
      spacing={20}
      modifiers={[
        padding({ all: 24 }),
        redacted("placeholder"),
        accessibilityElement("ignore"),
        accessibilityLabel("Loading profile"),
      ]}
    >
      <HStack spacing={16}>
        <Circle size={72} />
        <VStack alignment="leading" spacing={8}>
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

export function SkeletonSessions() {
  return (
    <VStack
      alignment="leading"
      spacing={12}
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
  return (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[padding({ all: 16 }), background(Colors.card), cornerRadius(12)]}
    >
      <HStack spacing={12}>
        <Text modifiers={[dfont({ size: 16, weight: "semibold" })]}>iPhone 15 Pro</Text>
        <Spacer />
        <Text modifiers={[dfont({ size: 14 })]}>Revoke</Text>
      </HStack>
      <Text modifiers={[dfont({ size: 14 })]}>192.168.1.100 · 2 hours ago</Text>
    </VStack>
  );
}
