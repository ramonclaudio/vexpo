import { Host, ScrollView, VStack, Text } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  kerning,
  padding,
  frame,
  refreshable,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { authClient } from "@/lib/auth-client";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";

export default function HomeScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const { data: session, refetch } = authClient.useSession();

  const name = session?.user?.name?.split(" ")[0] ?? "there";
  const now = new Date();

  const onRefresh = async () => {
    await refetch?.();
  };

  return (
    <Host style={{ flex: 1 }}>
      <ScrollView modifiers={[tint(colors.primary as string), refreshable(onRefresh)]}>
        <VStack
          spacing={24}
          alignment="leading"
          modifiers={[padding({ horizontal: 20, top: 16, bottom: 40 })]}
        >
          <VStack
            spacing={4}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
          >
            <Text
              modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              <Text date={now} dateStyle="date" />
            </Text>
            <Text
              modifiers={[dfont({ size: 32, weight: "bold", design: "rounded" }), kerning(-0.5)]}
            >
              Hey, {name}
            </Text>
          </VStack>

          <ContentUnavailable
            title="Nothing here yet"
            systemImage="square.dashed"
            description="Home screen is ready to build."
          />
        </VStack>
      </ScrollView>
    </Host>
  );
}
