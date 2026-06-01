import { useLocalSearchParams } from "expo-router";
import { Host, ScrollView, Text, VStack, LabeledContent } from "@expo/ui/swift-ui";
import {
  background,
  cornerRadius,
  foregroundStyle,
  frame,
  padding,
  scrollDismissesKeyboard,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";

import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { useColors } from "@/hooks/use-theme";

export default function LinkedScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const params = useLocalSearchParams();

  const entries = Object.entries(params).filter(([, v]) => v != null);

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={6} alignment="leading">
            <Text modifiers={[dfont({ size: 22, weight: "bold" })]}>
              You got here via a deep link
            </Text>
            <Text
              modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Parameters parsed from the URL are listed below.
            </Text>
          </VStack>

          {entries.length > 0 ? (
            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text
                modifiers={[
                  dfont({ size: 13, weight: "semibold" }),
                  foregroundStyle(colors.mutedForeground as string),
                  padding({ horizontal: 8 }),
                ]}
              >
                PARAMS
              </Text>
              <VStack
                spacing={0}
                alignment="leading"
                modifiers={[
                  frame({ maxWidth: Infinity }),
                  background(colors.muted as string),
                  cornerRadius(20),
                ]}
              >
                {entries.map(([key, value]) => (
                  <LabeledContent
                    key={key}
                    label={
                      <Text
                        modifiers={[
                          dfont({ size: 15 }),
                          foregroundStyle(colors.mutedForeground as string),
                        ]}
                      >
                        {key}
                      </Text>
                    }
                    modifiers={[
                      frame({ maxWidth: Infinity }),
                      padding({ horizontal: 16, vertical: 12 }),
                    ]}
                  >
                    <Text
                      modifiers={[
                        dfont({ size: 13, design: "monospaced" }),
                        foregroundStyle(colors.foreground as string),
                        textSelection(true),
                      ]}
                    >
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </Text>
                  </LabeledContent>
                ))}
              </VStack>
            </VStack>
          ) : (
            <ContentUnavailable
              title="No params"
              systemImage="link.badge.plus"
              description="This deep link didn't include any parameters."
            />
          )}
        </VStack>
      </ScrollView>
    </Host>
  );
}
