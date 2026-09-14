import { useLocalSearchParams } from "expo-router";
import { Host, ScrollView, Text, VStack, LabeledContent } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
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
import { Colors } from "@/constants/theme";

export default function LinkedScreen() {
  const dfont = useDynamicFont();
  const params = useLocalSearchParams();

  const entries = Object.entries(params).filter(([, v]) => v != null);

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView modifiers={[scrollDismissesKeyboard("interactively"), tint(Colors.primary)]}>
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={6} alignment="leading">
            <Text
              modifiers={[
                dfont({ size: 22, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              You got here via a deep link
            </Text>
            <Text modifiers={[dfont({ size: 14 }), foregroundStyle(Colors.mutedForeground)]}>
              Parameters parsed from the URL are listed below.
            </Text>
          </VStack>

          {entries.length > 0 ? (
            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text
                modifiers={[
                  dfont({ size: 13, weight: "semibold" }),
                  foregroundStyle(Colors.mutedForeground),
                  padding({ horizontal: 8 }),
                  accessibilityAddTraits(["isHeader"]),
                ]}
              >
                PARAMS
              </Text>
              <VStack
                spacing={0}
                alignment="leading"
                modifiers={[
                  frame({ maxWidth: Infinity }),
                  background(Colors.muted),
                  cornerRadius(20),
                ]}
              >
                {entries.map(([key, value]) => (
                  <LabeledContent
                    key={key}
                    label={
                      <Text
                        modifiers={[dfont({ size: 15 }), foregroundStyle(Colors.mutedForeground)]}
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
                        foregroundStyle(Colors.foreground),
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
