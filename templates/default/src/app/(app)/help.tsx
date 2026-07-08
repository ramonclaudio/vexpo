import { useState } from "react";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { openURL, canOpenURL } from "expo-linking";
import { Host, ScrollView, VStack, Text, DisclosureGroup } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  background,
  cornerRadius,
  foregroundStyle,
  frame,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { CapsuleRowButton } from "@/components/ui/capsule-row-button";
import { TouchTarget } from "@/constants/layout";

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
    id: "delete-account",
    question: "How do I delete my account?",
    answer: "Go to Settings, then Delete Account. This will permanently remove all your data.",
  },
  {
    id: "notifications",
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
  const [linkError, setLinkError] = useState<string | null>(null);
  const toggleExpanded = (question: string, next: boolean) => {
    haptics.selection();
    setExpanded((m) => ({ ...m, [question]: next }));
  };

  const filteredFaq = searchText
    ? FAQ_ITEMS.filter(
        (item) =>
          item.question.toLowerCase().includes(searchText.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchText.toLowerCase()),
      )
    : FAQ_ITEMS;

  const issuesUrl = support.issuesUrl || support.githubUrl;

  const handleOpenIssues = async () => {
    if (!issuesUrl) return;
    haptics.light();
    setLinkError(null);
    const canOpen = await canOpenURL(issuesUrl);
    if (canOpen) {
      openURL(issuesUrl);
    } else {
      haptics.error();
      setLinkError("Couldn't open the issues page.");
    }
  };

  const handleOpenEmail = async () => {
    if (!support.email) return;
    haptics.light();
    setLinkError(null);
    const url = `mailto:${support.email}?subject=${encodeURIComponent("App Support")}`;
    const canOpen = await canOpenURL(url);
    if (canOpen) {
      openURL(url);
    } else {
      haptics.error();
      setLinkError(`No email app configured. Contact ${support.email} directly.`);
    }
  };

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
      <Host testID="help-screen" style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView modifiers={[tint(colors.primary as string)]}>
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            {linkError ? <ErrorText testID="help-link-error">{linkError}</ErrorText> : null}

            {(support.email || issuesUrl) && (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                {support.email ? (
                  <CapsuleRowButton
                    testID="help-email-support"
                    label="Email Support"
                    systemImage="envelope.fill"
                    onPress={handleOpenEmail}
                  />
                ) : null}
                {issuesUrl ? (
                  <CapsuleRowButton
                    testID="help-report-issue"
                    label="Report an Issue"
                    systemImage="exclamationmark.bubble.fill"
                    onPress={handleOpenIssues}
                  />
                ) : null}
              </VStack>
            )}

            {filteredFaq.length === 0 ? (
              <ContentUnavailable
                testID="help-faq-empty"
                title="No results"
                systemImage="magnifyingglass"
                description="Try a different search term"
              />
            ) : (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                <Text
                  testID="help-faq-heading"
                  modifiers={[
                    dfont({ size: 13, weight: "semibold" }),
                    foregroundStyle(colors.mutedForeground as string),
                    padding({ horizontal: 8, top: 4 }),
                    accessibilityAddTraits(["isHeader"]),
                  ]}
                >
                  FREQUENTLY ASKED
                </Text>
                {filteredFaq.map((item) => (
                  <VStack
                    key={item.question}
                    alignment="leading"
                    modifiers={[
                      frame({ maxWidth: Infinity }),
                      padding({ horizontal: 20, vertical: 4 }),
                      background(colors.muted as string),
                      cornerRadius(20),
                    ]}
                  >
                    <DisclosureGroup
                      testID={`help-faq-${item.id}`}
                      label={item.question}
                      isExpanded={!!expanded[item.question]}
                      onIsExpandedChange={(v) => toggleExpanded(item.question, v)}
                      modifiers={[
                        frame({ minHeight: TouchTarget.min }),
                        dfont({ size: 16, weight: "medium" }),
                      ]}
                    >
                      <Text
                        modifiers={[
                          dfont({ size: 14 }),
                          foregroundStyle(colors.mutedForeground as string),
                          padding({ vertical: 8 }),
                        ]}
                      >
                        {item.answer}
                      </Text>
                    </DisclosureGroup>
                  </VStack>
                ))}
              </VStack>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
