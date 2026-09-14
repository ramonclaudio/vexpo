import { useState } from "react";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { openURL, canOpenURL } from "expo-linking";
import { Host, ScrollView, VStack, Text, DisclosureGroup } from "@expo/ui/swift-ui";
import {
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
import { SectionLabel } from "@/components/ui/section-label";
import { TouchTarget } from "@/constants/layout";

import { ErrorText } from "@/components/ui/status-text";
import { fail } from "@/lib/form-result";
import { haptics } from "@/lib/haptics";
import { Colors } from "@/constants/theme";

type SupportConfig = {
  githubUrl?: string;
  issuesUrl?: string;
  email?: string;
};

const support = (Constants.expoConfig?.extra?.support ?? {}) as SupportConfig;

const FAQ_ITEMS = [
  {
    question: "Can I use the app without an account?",
    answer:
      "Yes. Tap Continue as guest on the sign-in screen. A guest session expires after 7 days away. Create an account any time and your bio and photo move with you.",
  },
  {
    question: "Do the links in emails open the app?",
    answer:
      "Yes. The sign-in, verification and password reset emails have an Open in app button. It lands on the right screen with the code filled in.",
  },
  {
    question: "How do I change my email?",
    answer:
      "Open Profile, edit the email and save. A 6-digit code goes to the new address, and the change lands once you enter it.",
  },
  {
    question: "How do I change my password?",
    answer:
      "Open Profile, then Change password. It asks for your current password. If you forgot it, sign out and use Forgot password on the sign-in screen.",
  },
  {
    question: "Which devices are signed in?",
    answer:
      "Settings, then Sessions lists every device with an active session. Revoke any of them from there.",
  },
  {
    question: "How do I turn off haptics or animations?",
    answer: "Settings, then Preferences. Theme, reduced motion and haptics are all there.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Settings, then Delete account. Face ID or your passcode confirms it. You have 30 days to sign back in and restore it. After that it's permanent.",
  },
];

export default function HelpScreen() {
  const dfont = useDynamicFont();
  const [searchText, setSearchText] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [linkError, setLinkError] = useState<string | null>(null);
  const raiseLinkError = (message: string) => setLinkError(fail(message).error);
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
    setLinkError(null);
    const canOpen = await canOpenURL(issuesUrl);
    if (canOpen) {
      openURL(issuesUrl);
    } else {
      raiseLinkError("Couldn't open the issues page.");
    }
  };

  const handleOpenEmail = async () => {
    if (!support.email) return;
    setLinkError(null);
    const url = `mailto:${support.email}?subject=${encodeURIComponent("App Support")}`;
    const canOpen = await canOpenURL(url);
    if (canOpen) {
      openURL(url);
    } else {
      raiseLinkError(`No email app configured. Contact ${support.email} directly.`);
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
            tintColor={Colors.primary}
            accessibilityLabel="Email support"
          />
        </Stack.Toolbar>
      ) : null}
      <Host style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView modifiers={[tint(Colors.primary)]}>
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            {linkError ? <ErrorText>{linkError}</ErrorText> : null}

            {(support.email || issuesUrl) && (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                {support.email ? (
                  <CapsuleRowButton
                    label="Email Support"
                    hint="Opens a new message in your email app"
                    systemImage="envelope.fill"
                    onPress={handleOpenEmail}
                  />
                ) : null}
                {issuesUrl ? (
                  <CapsuleRowButton
                    label="Report an Issue"
                    hint="Opens the issue tracker in your browser"
                    systemImage="exclamationmark.bubble.fill"
                    onPress={handleOpenIssues}
                  />
                ) : null}
              </VStack>
            )}

            {filteredFaq.length === 0 ? (
              <ContentUnavailable
                title="No results"
                systemImage="magnifyingglass"
                description="Try a different search term"
              />
            ) : (
              <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
                <SectionLabel>FREQUENTLY ASKED</SectionLabel>
                {filteredFaq.map((item) => (
                  <VStack
                    key={item.question}
                    alignment="leading"
                    modifiers={[
                      frame({ maxWidth: Infinity }),
                      padding({ horizontal: 20, vertical: 4 }),
                      background(Colors.muted),
                      cornerRadius(20),
                    ]}
                  >
                    <DisclosureGroup
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
                          foregroundStyle(Colors.mutedForeground),
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
