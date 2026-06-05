import { router, Stack } from "expo-router";
import { Host, VStack, Spacer } from "@expo/ui/swift-ui";
import { padding, tint } from "@expo/ui/swift-ui/modifiers";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { useColors } from "@/hooks/use-theme";
import { FontFamily } from "@/constants/layout";

export default function NotFoundScreen() {
  const colors = useColors();
  return (
    <>
      <Stack.Header>
        <Stack.Screen.Title
          style={{ color: colors.foreground as string, fontFamily: FontFamily.semiBold }}
        >
          Lost?
        </Stack.Screen.Title>
      </Stack.Header>
      <Host testID="not-found-screen" style={{ flex: 1 }}>
        <VStack
          spacing={20}
          alignment="center"
          modifiers={[padding({ horizontal: 24, vertical: 32 }), tint(colors.primary as string)]}
        >
          <Spacer />
          <ContentUnavailable
            testID="not-found-empty"
            title="This page doesn't exist"
            systemImage="questionmark.circle"
            description="The page you were looking for moved or was never here."
          />
          <ProminentButton
            testID="not-found-home"
            label="Take me home"
            onPress={() => router.replace("/")}
          />
          <Spacer />
        </VStack>
      </Host>
    </>
  );
}
