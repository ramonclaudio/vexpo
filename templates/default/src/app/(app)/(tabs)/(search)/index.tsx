import { useState } from "react";
import { router, Stack } from "expo-router";
import { Host, ScrollView, Button, Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  foregroundStyle,
  frame,
  imageScale,
  padding,
  scrollDismissesKeyboard,
  scrollTargetBehavior,
  scrollTargetLayout,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { Colors } from "@/constants/theme";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { SectionLabel } from "@/components/ui/section-label";

type Destination = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  href: Parameters<typeof router.push>[0];
  keywords: string;
  accountOnly?: true;
};

const DESTINATIONS: readonly Destination[] = [
  {
    title: "Home",
    subtitle: "Your start screen",
    icon: "house.fill",
    href: "/(app)/(tabs)/(home)",
    keywords: "home start",
  },
  {
    title: "Settings",
    subtitle: "Account, preferences, and devices",
    icon: "gearshape.fill",
    href: "/(app)/(tabs)/settings",
    keywords: "settings options config",
  },
  {
    title: "Preferences",
    subtitle: "Theme, motion, haptics, dynamic type",
    icon: "slider.horizontal.3",
    href: "/(app)/(tabs)/settings/preferences",
    keywords: "preferences theme dark light motion reduced haptics accessibility",
  },
  {
    title: "Profile",
    subtitle: "Name, username, email, bio, avatar",
    icon: "person.crop.circle.fill",
    href: "/(app)/profile",
    keywords: "profile name username email bio avatar account",
  },
  {
    title: "Active sessions",
    subtitle: "Devices currently signed in",
    icon: "list.bullet.rectangle.portrait.fill",
    href: "/(app)/sessions",
    keywords: "sessions devices logout signed in revoke",
    accountOnly: true,
  },
  {
    title: "Linked",
    subtitle: "What the last deep link carried",
    icon: "link.circle.fill",
    href: "/(app)/linked",
    keywords: "linked deep link universal link params",
  },
  {
    title: "Help",
    subtitle: "FAQ and support",
    icon: "questionmark.circle.fill",
    href: "/(app)/help",
    keywords: "help faq support contact email issue",
  },
  {
    title: "Privacy",
    subtitle: "How your data is handled",
    icon: "lock.shield.fill",
    href: "/(app)/privacy",
    keywords: "privacy data tracking apple labels",
  },
];

const SIGN_UP_DESTINATION: Destination = {
  title: "Create an account",
  subtitle: "Keep your data and get it on your next device",
  icon: "person.crop.circle.badge.plus",
  href: "/(app)/auth/sign-up" as Destination["href"],
  keywords: "create account sign up register guest upgrade save data sign in",
};

function score(d: Destination, query: string): number {
  if (query.length === 0) return 0;
  const q = query.toLowerCase();
  const title = d.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (d.subtitle.toLowerCase().includes(q)) return 40;
  if (d.keywords.toLowerCase().includes(q)) return 20;
  return 0;
}

export default function SearchScreen() {
  const dfont = useDynamicFont();
  const [query, setQuery] = useState("");
  const { isGuest } = useAuthStatus();

  const destinations = isGuest
    ? [SIGN_UP_DESTINATION, ...DESTINATIONS.filter((d) => !d.accountOnly)]
    : DESTINATIONS;
  const trimmed = query.trim();
  const results = trimmed
    ? destinations
        .map((d) => ({ d, s: score(d, trimmed) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .map(({ d }) => d)
    : destinations;

  return (
    <>
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search screens"
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
      />
      <Host style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          modifiers={[
            scrollDismissesKeyboard("interactively"),
            tint(Colors.primary),
            scrollTargetBehavior("viewAligned"),
          ]}
        >
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 16, bottom: 40 }), scrollTargetLayout()]}
          >
            {results.length === 0 ? (
              <ContentUnavailable
                title="No results"
                systemImage="magnifyingglass"
                description={`Nothing matches "${trimmed}"`}
              />
            ) : (
              <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <SectionLabel>{trimmed ? "RESULTS" : "JUMP TO"}</SectionLabel>
                {results.map((d) => (
                  <Button
                    key={d.href as string}
                    modifiers={[
                      buttonStyle("plain"),
                      frame({ maxWidth: Infinity }),
                      background(Colors.muted),
                      clipShape("capsule"),
                    ]}
                    onPress={() => router.push(d.href)}
                  >
                    <HStack
                      spacing={14}
                      alignment="center"
                      modifiers={[
                        frame({ maxWidth: Infinity }),
                        padding({ horizontal: 16, vertical: 12 }),
                        contentShape(shapes.capsule()),
                      ]}
                    >
                      <Image
                        systemName={d.icon}
                        color={Colors.foreground}
                        modifiers={[dfont({ size: 20 }), accessibilityHidden(true)]}
                      />
                      <VStack alignment="leading" spacing={2}>
                        <Text
                          modifiers={[
                            dfont({ size: 16, weight: "medium" }),
                            foregroundStyle(Colors.foreground),
                          ]}
                        >
                          {d.title}
                        </Text>
                        <Text
                          modifiers={[dfont({ size: 13 }), foregroundStyle(Colors.mutedForeground)]}
                        >
                          {d.subtitle}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Image
                        systemName="chevron.right"
                        color={Colors.mutedForeground}
                        modifiers={[
                          dfont({ size: 16 }),
                          imageScale("small"),
                          accessibilityHidden(true),
                        ]}
                      />
                    </HStack>
                  </Button>
                ))}
              </VStack>
            )}

            {trimmed ? null : (
              <Text
                modifiers={[
                  dfont({ size: 13 }),
                  foregroundStyle(Colors.mutedForeground),
                  padding({ horizontal: 8, top: 4 }),
                ]}
              >
                Type to find any screen.
              </Text>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
