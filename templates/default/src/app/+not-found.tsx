import { router, Stack } from "expo-router";
import { Host, VStack, Spacer } from "@expo/ui/swift-ui";
import { padding, tint } from "@expo/ui/swift-ui/modifiers";
import { ProminentButton } from "@/components/ui/capsule-button";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { Colors } from "@/constants/theme";
import { FontFamily } from "@/constants/layout";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Header>
        <Stack.Screen.Title style={{ color: Colors.foreground, fontFamily: FontFamily.semiBold }}>
          Lost?
        </Stack.Screen.Title>
      </Stack.Header>
      <Host style={{ flex: 1 }}>
        <VStack
          spacing={20}
          alignment="center"
          modifiers={[padding({ horizontal: 24, vertical: 32 }), tint(Colors.primary)]}
        >
          <Spacer />
          <ContentUnavailable
            title="This page doesn't exist"
            systemImage="questionmark.circle"
            description="The page you were looking for moved or was never here."
          />
          <ProminentButton label="Take me home" onPress={() => router.replace("/")} />
          <Spacer />
        </VStack>
      </Host>
    </>
  );
}
