import { VStack, HStack, Spacer, Text } from "@expo/ui/swift-ui";
import { background, clipShape, cornerRadius, frame, padding } from "@expo/ui/swift-ui/modifiers";

import { Spacing } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

// Skeleton placeholders for initial query loads. SwiftUI-native: filled
// muted-color boxes laid out in the shape of the screen they're standing
// in for. No animation. SwiftUI's `Host` doesn't ergonomically support
// per-tick opacity tweens, and static skeletons satisfy the
// Reduce Motion accessibility setting automatically.

type BarProps = {
  width: number | "fill";
  height: number;
  radius?: number;
};

function Bar({ width, height, radius = 6 }: BarProps): React.ReactNode {
  const colors = useColors();
  return (
    <VStack
      modifiers={[
        frame(width === "fill" ? { maxWidth: Infinity, height } : { width, height }),
        background(colors.muted as string),
        cornerRadius(radius),
      ]}
    >
      <Text> </Text>
    </VStack>
  );
}

function Circle({ size }: { size: number }): React.ReactNode {
  const colors = useColors();
  return (
    <VStack
      modifiers={[
        frame({ width: size, height: size }),
        background(colors.muted as string),
        clipShape("circle"),
      ]}
    >
      <Text> </Text>
    </VStack>
  );
}

// Profile screen skeleton. Mirrors the layout of `app/(app)/profile.tsx`:
// avatar row + display-name row + email row + sign-in-method row.
export function SkeletonProfile(): React.ReactNode {
  return (
    <VStack alignment="leading" spacing={Spacing.xl} modifiers={[padding({ all: 24 })]}>
      <HStack spacing={Spacing.lg}>
        <Circle size={72} />
        <VStack alignment="leading" spacing={Spacing.sm}>
          <Bar width={160} height={20} />
          <Bar width={120} height={14} />
        </VStack>
        <Spacer />
      </HStack>
      <VStack alignment="leading" spacing={Spacing.md}>
        <Bar width={80} height={14} />
        <Bar width="fill" height={44} radius={22} />
      </VStack>
      <VStack alignment="leading" spacing={Spacing.md}>
        <Bar width={80} height={14} />
        <Bar width="fill" height={44} radius={22} />
      </VStack>
      <VStack alignment="leading" spacing={Spacing.md}>
        <Bar width={120} height={14} />
        <Bar width="fill" height={44} radius={22} />
      </VStack>
    </VStack>
  );
}

// Sessions screen skeleton. Three placeholder rows mirroring the
// device-by-device shape in `app/(app)/sessions.tsx`.
export function SkeletonSessions(): React.ReactNode {
  return (
    <VStack alignment="leading" spacing={Spacing.md} modifiers={[padding({ all: 24 })]}>
      <SkeletonSessionRow />
      <SkeletonSessionRow />
      <SkeletonSessionRow />
    </VStack>
  );
}

function SkeletonSessionRow(): React.ReactNode {
  const colors = useColors();
  return (
    <VStack
      alignment="leading"
      spacing={Spacing.md}
      modifiers={[padding({ all: 16 }), background(colors.card as string), cornerRadius(12)]}
    >
      <HStack spacing={Spacing.md}>
        <Bar width={140} height={18} />
        <Spacer />
        <Bar width={60} height={14} />
      </HStack>
      <Bar width={200} height={14} />
      <Bar width={180} height={14} />
    </VStack>
  );
}
