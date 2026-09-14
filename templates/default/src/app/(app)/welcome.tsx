import { useState } from "react";
import { router } from "expo-router";
import {
  Host,
  VStack,
  Spacer,
  Text,
  Button,
  Image,
  ProgressView,
  TabView,
} from "@expo/ui/swift-ui";
import {
  animation,
  Animation,
  foregroundStyle,
  buttonStyle,
  contentShape,
  clipped,
  multilineTextAlignment,
  opacity,
  progressViewStyle,
  frame,
  padding,
  shapes,
  kerning,
  scaleEffect,
  tint,
  accessibilityAddTraits,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityValue,
  tabViewStyle,
  dynamicTypeSize,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { ButtonTokens, TouchTarget } from "@/constants/layout";
import { DynamicType, Duration, toSeconds } from "@/constants/ui";
import BrandIcon from "@/components/ui/brand-icon";
import { ProminentButton } from "@/components/ui/capsule-button";

import { haptics } from "@/lib/haptics";
import { Colors } from "@/constants/theme";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

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
    subtitle: "SwiftUI screens, written in TypeScript.",
  },
  {
    id: "ready",
    icon: "checkmark.circle.fill",
    title: "Ready to go",
    subtitle: "The rest is yours to build.",
  },
] as const;

export default function WelcomeScreen() {
  const dfont = useDynamicFont();
  const [step, setStep] = useState(0);
  const { markSeen } = useOnboarding();
  const reduceMotion = useReducedMotion();

  const handleContinue = () => {
    haptics.medium();
    markSeen();
    router.replace("/");
  };

  const handleNext = () => {
    haptics.selection();
    setStep(step + 1);
  };

  const handlePageChange = (nextID: string) => {
    const idx = STEPS.findIndex((s) => s.id === nextID);
    if (idx === step) return;
    haptics.selection();
    setStep(idx);
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Host style={{ flex: 1 }} modifiers={[tint(Colors.primary)]}>
      <VStack spacing={0}>
        <VStack spacing={12} modifiers={[padding({ horizontal: 24, top: 24 })]}>
          <ProgressView
            value={(step + 1) / STEPS.length}
            modifiers={[
              progressViewStyle("linear"),
              ...(reduceMotion
                ? []
                : [animation(Animation.easeOut({ duration: toSeconds(Duration.normal) }), step)]),
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
                  <BrandIcon size={96} />
                ) : (
                  <VStack spacing={0} modifiers={[accessibilityHidden(true)]}>
                    <Image
                      systemName={s.icon}
                      color={Colors.primary}
                      modifiers={[
                        frame({ width: 80, height: 80 }),
                        dfont({ size: 48 }),
                        dynamicTypeSize({ max: DynamicType.control }),
                      ]}
                    />
                    <Image
                      systemName={s.icon}
                      color={Colors.primary}
                      modifiers={[
                        dfont({ size: 48 }),
                        dynamicTypeSize({ max: DynamicType.control }),
                        scaleEffect({ x: 1, y: -1 }),
                        opacity(0.12),
                        frame({ width: 80, height: 28, alignment: "top" }),
                        clipped(),
                      ]}
                    />
                  </VStack>
                )}
                <Text
                  modifiers={[
                    dfont({ size: 34, weight: "bold" }),
                    kerning(-0.5),
                    accessibilityAddTraits(["isHeader"]),
                  ]}
                >
                  {s.title}
                </Text>
                <Text
                  modifiers={[
                    dfont({ size: 17 }),
                    foregroundStyle(Colors.mutedForeground),
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
            label={isLast ? "Get Started" : "Next"}
            onPress={isLast ? handleContinue : handleNext}
          />
          {!isLast && (
            <Button
              label="Skip"
              modifiers={[
                buttonStyle("plain"),
                dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.secondaryFontWeight }),
                foregroundStyle(Colors.mutedForeground),
                frame({ minHeight: TouchTarget.min }),
                contentShape(shapes.rectangle()),
              ]}
              onPress={handleContinue}
            />
          )}
        </VStack>
      </VStack>
    </Host>
  );
}
