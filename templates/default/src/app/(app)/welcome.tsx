import { useState, useCallback } from "react";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import {
  Host,
  VStack,
  HStack,
  ScrollView,
  Text,
  Button,
  Image,
  ProgressView,
  RNHostView,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  multilineTextAlignment,
  progressViewStyle,
  frame,
  padding,
  kerning,
  tint,
  accessibilityLabel,
  accessibilityValue,
  containerRelativeFrame,
  scrollTargetBehavior,
  scrollTargetLayout,
  scrollPosition,
  id,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { ProminentButton } from "@/components/ui/prominent-button";

import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { setNativeValue } from "@/lib/native-state";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { useOnboarding } from "@/hooks/use-onboarding";

type WelcomeStep =
  | { id: string; brand: true; title: string; subtitle: string }
  | {
      id: string;
      icon: "hammer.fill" | "checkmark.circle.fill";
      title: string;
      subtitle: string;
    };

const STEPS: readonly WelcomeStep[] = [
  { id: "welcome", brand: true, title: "Welcome", subtitle: "Your new app starts here." },
  {
    id: "built",
    icon: "hammer.fill",
    title: "Built with Expo",
    subtitle: "Universal, fast, native.",
  },
  {
    id: "ready",
    icon: "checkmark.circle.fill",
    title: "Ready to Go",
    subtitle: "Start building something great.",
  },
] as const;

export default function WelcomeScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const activeID = useNativeState<string | null>(STEPS[0].id);
  const [step, setStep] = useState(0);
  const { markSeen } = useOnboarding();

  const handleContinue = useCallback(async () => {
    haptics.medium();
    await markSeen();
    router.replace("/");
  }, [markSeen]);

  const handleNext = useCallback(() => {
    if (step >= STEPS.length - 1) return;
    haptics.light();
    setNativeValue(activeID, STEPS[step + 1].id);
  }, [activeID, step]);

  const handlePageChange = useCallback((nextID: string | null) => {
    if (!nextID) return;
    const idx = STEPS.findIndex((s) => s.id === nextID);
    if (idx < 0) return;
    setStep((current) => {
      if (current !== idx) haptics.selection();
      return idx;
    });
  }, []);

  const isLast = step === STEPS.length - 1;

  return (
    <Host style={{ flex: 1 }}>
      <VStack spacing={0} modifiers={[tint(colors.primary as string)]}>
        <VStack spacing={12} modifiers={[padding({ horizontal: 24, top: 24 })]}>
          <ProgressView
            value={(step + 1) / STEPS.length}
            modifiers={[
              progressViewStyle("linear"),
              accessibilityLabel("Onboarding progress"),
              accessibilityValue(`Step ${step + 1} of ${STEPS.length}`),
            ]}
          />
        </VStack>

        <ScrollView
          axes="horizontal"
          showsIndicators={false}
          modifiers={[
            frame({ maxWidth: 10000, maxHeight: 10000 }),
            // upstream expo/expo#43955: scrollTargetBehavior("paging") + scrollTargetLayout()
            scrollTargetBehavior("paging"),
            // upstream expo/expo#44652: scrollPosition + id() for two-way binding
            scrollPosition(activeID, { anchor: "center", onChange: handlePageChange }),
          ]}
        >
          <HStack spacing={0} modifiers={[scrollTargetLayout()]}>
            {STEPS.map((s) => (
              <VStack
                key={s.id}
                spacing={20}
                alignment="center"
                modifiers={[
                  id(s.id),
                  containerRelativeFrame({ axes: "horizontal" }),
                  padding({ horizontal: 24 }),
                ]}
              >
                {"brand" in s ? (
                  <RNHostView matchContents>
                    <ExpoImage
                      source={brandIcon}
                      style={{ width: 96, height: 96 }}
                      contentFit="contain"
                      accessibilityLabel="App icon"
                    />
                  </RNHostView>
                ) : (
                  <Image
                    systemName={s.icon}
                    size={48}
                    color={colors.primary as string}
                    modifiers={[frame({ width: 80, height: 80 })]}
                  />
                )}
                <Text modifiers={[dfont({ size: 34, weight: "bold" }), kerning(-0.5)]}>
                  {s.title}
                </Text>
                <Text
                  modifiers={[
                    dfont({ size: 17 }),
                    foregroundStyle(colors.mutedForeground as string),
                    multilineTextAlignment("center"),
                  ]}
                >
                  {s.subtitle}
                </Text>
              </VStack>
            ))}
          </HStack>
        </ScrollView>

        <VStack spacing={12} modifiers={[padding({ horizontal: 24, bottom: 24 })]}>
          <ProminentButton
            label={isLast ? "Get Started" : "Next"}
            onPress={isLast ? handleContinue : handleNext}
          />
          {!isLast && (
            <Button
              label="Skip"
              modifiers={[
                buttonStyle("plain"),
                dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.secondaryFontWeight }),
                foregroundStyle(colors.mutedForeground as string),
              ]}
              onPress={handleContinue}
            />
          )}
        </VStack>
      </VStack>
    </Host>
  );
}
