import { Host, ScrollView, VStack, Text } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  foregroundStyle,
  kerning,
  padding,
  frame,
  refreshable,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { GUEST_NAME } from "@/convex/constants";
import { authClient } from "@/lib/auth-client";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Colors } from "@/constants/theme";

export default function HomeScreen() {
  const dfont = useDynamicFont();
  const { data: session, refetch } = authClient.useSession();

  const rawName = session?.user?.name;
  const name = !rawName || rawName === GUEST_NAME ? "there" : rawName.split(" ")[0];
  const now = new Date();

  return (
    <Host style={{ flex: 1 }}>
      <ScrollView modifiers={[tint(Colors.primary), refreshable(async () => refetch())]}>
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
            <Text modifiers={[dfont({ size: 14 }), foregroundStyle(Colors.mutedForeground)]}>
              <Text date={now} dateStyle="date" />
            </Text>
            <Text
              modifiers={[
                dfont({ size: 32, design: "rounded" }),
                kerning(-0.5),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Hey,{" "}
              <Text modifiers={[dfont({ size: 32, weight: "bold", design: "rounded" })]}>
                {name}
              </Text>
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
