import { useState, type ComponentProps } from "react";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { openURL, canOpenURL } from "expo-linking";
import {
  Host,
  ScrollView,
  Button,
  HStack,
  VStack,
  Spacer,
  Image,
  Text,
  ContentUnavailableView,
} from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  cornerRadius,
  foregroundStyle,
  frame,
  onTapGesture,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

import { ErrorText } from "@/components/ui/status-text";
import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";

type SupportConfig = {
  githubUrl?: string;
  issuesUrl?: string;
  email?: string;
};

const support = (Constants.expoConfig?.extra?.support ?? {}) as SupportConfig;

const FAQ_ITEMS = [
  {
    question: "How do I delete my account?",
    answer: "Go to Settings, then Delete Account. This will permanently remove all your data.",
  },
  {
    question: "Why aren't notifications working?",
    answer:
      "Make sure notifications are enabled in Settings, then Notifications. You must use a physical device.",
  },
];

export default function HelpScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const [searchText, setSearchText] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [emailError, setEmailError] = useState<string | null>(null);

  const filteredFaq = searchText
    ? FAQ_ITEMS.filter(
        (item) =>
          item.question.toLowerCase().includes(searchText.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchText.toLowerCase()),
      )
    : FAQ_ITEMS;

  const issuesUrl = support.issuesUrl || support.githubUrl;

  const handleOpenIssues = () => {
    if (!issuesUrl) return;
    haptics.light();
    openURL(issuesUrl);
  };

  const handleOpenEmail = async () => {
    if (!support.email) return;
    haptics.light();
    setEmailError(null);
    const url = `mailto:${support.email}?subject=App Support`;
    const canOpen = await canOpenURL(url);
    if (canOpen) {
      openURL(url);
    } else {
      haptics.error();
      setEmailError(`No email app configured. Contact ${support.email} directly.`);
    }
  };

  type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

  const rowButton = ({
    label,
    systemImage,
    onPress,
  }: {
    label: string;
    systemImage: SFSymbol;
    onPress: () => void;
  }) => (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: 10000 }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
      onPress={onPress}
    >
      <HStack
        spacing={12}
        alignment="center"
        modifiers={[
          frame({ maxWidth: 10000, height: ButtonTokens.height }),
          padding({ horizontal: 16 }),
        ]}
      >
        <Image systemName={systemImage} size={18} color={colors.foreground as string} />
        <Text
          modifiers={[
            dfont({ size: 16, weight: "medium" }),
            foregroundStyle(colors.foreground as string),
          ]}
        >
          {label}
        </Text>
        <Spacer />
        <Image systemName="chevron.right" size={13} color={colors.mutedForeground as string} />
      </HStack>
    </Button>
  );

  return (
    <>
      <Stack.SearchBar
        placeholder="Search help..."
        onChangeText={(e) => setSearchText(e.nativeEvent.text)}
        hideWhenScrolling
      />
      {support.email ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="envelope.fill"
            onPress={handleOpenEmail}
            tintColor={colors.primary}
            accessibilityLabel="Email support"
          />
        </Stack.Toolbar>
      ) : null}
      <Host style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView modifiers={[tint(colors.primary as string)]}>
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            {emailError ? <ErrorText>{emailError}</ErrorText> : null}

            {(support.email || issuesUrl) && (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                {support.email
                  ? rowButton({
                      label: "Email Support",
                      systemImage: "envelope.fill",
                      onPress: handleOpenEmail,
                    })
                  : null}
                {issuesUrl
                  ? rowButton({
                      label: "Report an Issue",
                      systemImage: "exclamationmark.bubble.fill",
                      onPress: handleOpenIssues,
                    })
                  : null}
              </VStack>
            )}

            {filteredFaq.length === 0 ? (
              <ContentUnavailableView
                title="No results"
                systemImage="magnifyingglass"
                description="Try a different search term"
              />
            ) : (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                <Text
                  modifiers={[
                    dfont({ size: 13, weight: "semibold" }),
                    foregroundStyle(colors.mutedForeground as string),
                    padding({ horizontal: 8, top: 4 }),
                  ]}
                >
                  FREQUENTLY ASKED
                </Text>
                {filteredFaq.map((item) => {
                  const isOpen = !!expanded[item.question];
                  return (
                    <VStack
                      key={item.question}
                      alignment="leading"
                      spacing={isOpen ? 8 : 0}
                      modifiers={[
                        frame({ maxWidth: 10000 }),
                        background(colors.muted as string),
                        cornerRadius(20),
                        padding({ horizontal: 20, vertical: 12 }),
                        onTapGesture(() => {
                          haptics.selection();
                          setExpanded((m) => ({ ...m, [item.question]: !m[item.question] }));
                        }),
                      ]}
                    >
                      <HStack
                        spacing={12}
                        alignment="center"
                        modifiers={[frame({ maxWidth: 10000 })]}
                      >
                        <Text
                          modifiers={[
                            dfont({ size: 15, weight: "medium" }),
                            foregroundStyle(colors.foreground as string),
                          ]}
                        >
                          {item.question}
                        </Text>
                        <Spacer />
                        <Image
                          systemName={isOpen ? "chevron.up" : "chevron.down"}
                          size={13}
                          color={colors.mutedForeground as string}
                        />
                      </HStack>
                      {isOpen ? (
                        <Text
                          modifiers={[
                            dfont({ size: 14 }),
                            foregroundStyle(colors.mutedForeground as string),
                          ]}
                        >
                          {item.answer}
                        </Text>
                      ) : null}
                    </VStack>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
