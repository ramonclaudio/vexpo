import { Platform } from "react-native";
import { ContentUnavailableView, Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityHidden,
  dynamicTypeSize,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

import { DynamicType } from "@/constants/ui";
import { Colors } from "@/constants/theme";
import { useDynamicFont } from "@/lib/dynamic-font";

const NATIVE = Number.parseInt(String(Platform.Version), 10) >= 17;

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
  return (
    <VStack
      spacing={8}
      alignment="center"
      modifiers={[
        frame({ maxWidth: Infinity }),
        padding({ vertical: 40, horizontal: 24 }),
        accessibilityElement("combine"),
      ]}
    >
      <Image
        systemName={systemImage}
        color={Colors.mutedForeground}
        modifiers={[
          dfont({ size: 40 }),
          dynamicTypeSize({ max: DynamicType.control }),
          accessibilityHidden(true),
        ]}
      />
      <Text modifiers={[dfont({ size: 17, weight: "semibold" }), multilineTextAlignment("center")]}>
        {title}
      </Text>
      {description ? (
        <Text
          modifiers={[
            dfont({ size: 14 }),
            foregroundStyle(Colors.mutedForeground),
            multilineTextAlignment("center"),
          ]}
        >
          {description}
        </Text>
      ) : null}
    </VStack>
  );
}
