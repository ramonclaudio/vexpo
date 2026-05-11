import { useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import {
  Host,
  VStack,
  Text,
  Button,
  Spacer,
  Image,
  ProgressView,
  RNHostView,
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
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { ProminentButton } from "@/components/ui/prominent-button";

import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { useOnboarding } from "@/hooks/use-onboarding";

type WelcomeStep =
  | { brand: true; title: string; subtitle: string }
  | { icon: "hammer.fill" | "checkmark.circle.fill"; title: string; subtitle: string };

const STEPS: readonly WelcomeStep[] = [
  { brand: true, title: "Welcome", subtitle: "Your new app starts here." },
  { icon: "hammer.fill", title: "Built with Expo", subtitle: "Universal, fast, native." },
  {
    icon: "checkmark.circle.fill",
    title: "Ready to Go",
    subtitle: "Start building something great.",
  },
] as const;

export default function WelcomeScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const [step, setStep] = useState(0);
  const { markSeen } = useOnboarding();

  const handleContinue = async () => {
    haptics.medium();
    await markSeen();
    router.replace("/");
  };

  const handleNext = () => {
    haptics.light();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Host style={{ flex: 1 }}>
      <VStack spacing={0} modifiers={[padding({ horizontal: 24 }), tint(colors.primary as string)]}>
        <VStack spacing={12} modifiers={[padding({ top: 24 })]}>
          <ProgressView
            value={(step + 1) / STEPS.length}
            modifiers={[
              progressViewStyle("linear"),
              accessibilityLabel("Onboarding progress"),
              accessibilityValue(`Step ${step + 1} of ${STEPS.length}`),
            ]}
          />
        </VStack>

        <Spacer />

        <VStack key={step} spacing={12} alignment="center">
          {"brand" in current ? (
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
              systemName={current.icon}
              size={48}
              color={colors.primary as string}
              modifiers={[frame({ width: 80, height: 80 })]}
            />
          )}
          <Text modifiers={[dfont({ size: 34, weight: "bold" }), kerning(-0.5)]}>
            {current.title}
          </Text>
          <Text
            modifiers={[
              dfont({ size: 17 }),
              foregroundStyle(colors.mutedForeground as string),
              multilineTextAlignment("center"),
            ]}
          >
            {current.subtitle}
          </Text>
        </VStack>

        <Spacer />

        <VStack spacing={12} modifiers={[padding({ bottom: 24 })]}>
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
