import { useState, useCallback } from "react";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import {
  Host,
  VStack,
  Spacer,
  Text,
  Button,
  Image,
  ProgressView,
  RNHostView,
  TabView,
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
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { Button as ButtonTokens } from "@/constants/layout";
import { ProminentButton } from "@/components/ui/prominent-button";

import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
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
  const symbolSize = useSymbolSize();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const [step, setStep] = useState(0);
  const { markSeen } = useOnboarding();

  const handleContinue = useCallback(() => {
    haptics.medium();
    markSeen();
    router.replace("/");
  }, [markSeen]);

  const handleNext = useCallback(() => {
    haptics.light();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  // TabView page style drives selection by the step's id; a swipe reports the
  // new id here and we mirror it back into `step` so the progress bar and the
  // Next/Get Started button stay in sync.
  const handlePageChange = useCallback((nextID: string) => {
    const idx = STEPS.findIndex((s) => s.id === nextID);
    if (idx < 0) return;
    setStep((current) => {
      if (current !== idx) haptics.selection();
      return idx;
    });
  }, []);

  const isLast = step === STEPS.length - 1;

  return (
    // upstream expo/expo#45872: Host modifiers now apply, so the accent tint
    // cascades from the Host into the ProgressView and buttons below.
    <Host testID="welcome-screen" style={{ flex: 1 }} modifiers={[tint(colors.primary as string)]}>
      <VStack spacing={0}>
        <VStack spacing={12} modifiers={[padding({ horizontal: 24, top: 24 })]}>
          <ProgressView
            testID="welcome-progress"
            value={(step + 1) / STEPS.length}
            modifiers={[
              progressViewStyle("linear"),
              accessibilityLabel("Onboarding progress"),
              accessibilityValue(`Step ${step + 1} of ${STEPS.length}`),
            ]}
          />
        </VStack>

        <TabView
          selection={STEPS[step].id}
          onSelectionChange={handlePageChange}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
            tabViewStyle({ type: "page", indexDisplayMode: "never" }),
          ]}
        >
          {STEPS.map((s) => (
            <TabView.Tab key={s.id} value={s.id}>
              <VStack
                spacing={20}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: Infinity, maxHeight: Infinity }),
                  padding({ horizontal: 24 }),
                ]}
              >
                <Spacer />
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
                    size={symbolSize(48)}
                    color={colors.primary as string}
                    modifiers={[frame({ width: 80, height: 80 }), accessibilityLabel("")]}
                  />
                )}
                <Text
                  testID={`welcome-step-${s.id}-title`}
                  modifiers={[dfont({ size: 34, weight: "bold" }), kerning(-0.5)]}
                >
                  {s.title}
                </Text>
                <Text
                  testID={`welcome-step-${s.id}-subtitle`}
                  modifiers={[
                    dfont({ size: 17 }),
                    foregroundStyle(colors.mutedForeground as string),
                    multilineTextAlignment("center"),
                  ]}
                >
                  {s.subtitle}
                </Text>
                <Spacer />
              </VStack>
            </TabView.Tab>
          ))}
        </TabView>

        <VStack spacing={12} modifiers={[padding({ horizontal: 24, bottom: 24 })]}>
          <ProminentButton
            testID="welcome-continue"
            label={isLast ? "Get Started" : "Next"}
            onPress={isLast ? handleContinue : handleNext}
          />
          {!isLast && (
            <Button
              testID="welcome-skip"
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
