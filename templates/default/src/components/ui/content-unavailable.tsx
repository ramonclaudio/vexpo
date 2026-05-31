import { Platform } from "react-native";
import { ContentUnavailableView, Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";

// `@expo/ui`'s ContentUnavailableView wraps SwiftUI's iOS 17+ view with no
// `else`, so it renders blank on the iOS 16.4-16.7 deployment floor. Branch to
// a hand-built layout there so every empty state still shows; iOS 17+ keeps the
// native view.
const NATIVE = Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 17;

type Props = {
  title: string;
  systemImage: SFSymbol;
  description?: string;
};

export function ContentUnavailable({ title, systemImage, description }: Props) {
  if (NATIVE) {
    return (
      <ContentUnavailableView title={title} systemImage={systemImage} description={description} />
    );
  }
  return <Fallback title={title} systemImage={systemImage} description={description} />;
}

function Fallback({ title, systemImage, description }: Props) {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  return (
    <VStack
      spacing={8}
      alignment="center"
      modifiers={[frame({ maxWidth: Infinity }), padding({ vertical: 40, horizontal: 24 })]}
    >
      <Image
        systemName={systemImage}
        size={symbolSize(40)}
        color={colors.mutedForeground as string}
      />
      <Text modifiers={[dfont({ size: 17, weight: "semibold" }), multilineTextAlignment("center")]}>
        {title}
      </Text>
      {description ? (
        <Text
          modifiers={[
            dfont({ size: 14 }),
            foregroundStyle(colors.mutedForeground as string),
            multilineTextAlignment("center"),
          ]}
        >
          {description}
        </Text>
      ) : null}
    </VStack>
  );
}
