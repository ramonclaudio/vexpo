import { useMemo, useState } from "react";
import { router, Stack } from "expo-router";
import { Host, ScrollView, Button, Text, VStack, HStack, Spacer, Image } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  imageScale,
  padding,
  scrollDismissesKeyboard,
  scrollTargetBehavior,
  scrollTargetLayout,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

import { useDynamicFont } from "@/lib/dynamic-font";
import { accessibilityAddTraits } from "@/lib/ui-traits";
import { useColors } from "@/hooks/use-theme";
import { useDebounce } from "@/hooks/use-debounce";
import { useDebugEnabled } from "@/lib/preferences";
import { haptics } from "@/lib/haptics";
import { ContentUnavailable } from "@/components/ui/content-unavailable";

type Destination = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  href: Parameters<typeof router.push>[0];
  keywords: string;
};

const DESTINATIONS: readonly Destination[] = [
  {
    title: "Home",
    subtitle: "Recent activity and updates",
    icon: "house.fill",
    href: "/(app)/(tabs)/(home)",
    keywords: "home dashboard activity feed",
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
  },
  {
    title: "Linked accounts",
    subtitle: "Apple, email, social providers",
    icon: "link.circle.fill",
    href: "/(app)/linked",
    keywords: "linked apple sign in social providers oauth",
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

const DEBUG_DESTINATION: Destination = {
  title: "Debug",
  subtitle: "Version, build, OTA update, device, push diagnostics",
  icon: "ant.circle.fill",
  href: "/(app)/debug" as Destination["href"],
  keywords: "debug diagnostics version build sdk runtime release update vendor push session",
};

const DEBOUNCE_MS = 120;

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
  const colors = useColors();
  const [raw, setRaw] = useState("");
  const query = useDebounce(raw, DEBOUNCE_MS);
  const [debugOn] = useDebugEnabled();

  const destinations = useMemo<readonly Destination[]>(
    () => (debugOn ? [...DESTINATIONS, DEBUG_DESTINATION] : DESTINATIONS),
    [debugOn],
  );

  const results = useMemo(() => {
    if (query.trim().length === 0) return destinations;
    const trimmed = query.trim();
    const scored = destinations.map((d) => ({ d, s: score(d, trimmed) })).filter(({ s }) => s > 0);
    // `.toSorted` is ES2023 and not in Hermes V1 (default in SDK 56); `.sort`
    // mutates in place, and `.filter` above already returned a fresh array.
    scored.sort((a, b) => b.s - a.s);
    return scored.map(({ d }) => d);
  }, [query, destinations]);

  const open = (href: Destination["href"]) => {
    haptics.light();
    router.push(href);
  };

  const sectionLabelModifiers = [
    dfont({ size: 13, weight: "semibold" }),
    foregroundStyle(colors.mutedForeground as string),
    padding({ horizontal: 8, top: 4 }),
    accessibilityAddTraits(["isHeader"]),
  ];

  return (
    <>
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search screens"
        onChangeText={(e) => setRaw(e.nativeEvent.text)}
      />
      <Host testID="search-screen" style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          modifiers={[
            scrollDismissesKeyboard("interactively"),
            tint(colors.primary as string),
            // upstream expo/expo#43955: viewAligned settles a flick on row
            // boundaries so no capsule rests half-clipped at the top; plain
            // scrolling below iOS 17
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
                testID="search-empty"
                title="No results"
                systemImage="magnifyingglass"
                description={`Nothing matches "${query.trim()}"`}
              />
            ) : (
              <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={sectionLabelModifiers}>
                  {query.trim() ? "RESULTS" : "JUMP TO"}
                </Text>
                {results.map((d) => (
                  <Button
                    key={d.href as string}
                    testID={`search-result-${d.title.toLowerCase().replace(/\s+/g, "-")}`}
                    modifiers={[
                      buttonStyle("plain"),
                      frame({ maxWidth: Infinity }),
                      background(colors.muted as string),
                      clipShape("capsule"),
                    ]}
                    onPress={() => open(d.href)}
                  >
                    <HStack
                      spacing={14}
                      alignment="center"
                      modifiers={[
                        frame({ maxWidth: Infinity }),
                        padding({ horizontal: 16, vertical: 12 }),
                      ]}
                    >
                      <Image
                        systemName={d.icon}
                        color={colors.foreground as string}
                        modifiers={[dfont({ size: 20 }), accessibilityHidden(true)]}
                      />
                      <VStack alignment="leading" spacing={2}>
                        <Text
                          modifiers={[
                            dfont({ size: 16, weight: "medium" }),
                            foregroundStyle(colors.foreground as string),
                          ]}
                        >
                          {d.title}
                        </Text>
                        <Text
                          modifiers={[
                            dfont({ size: 13 }),
                            foregroundStyle(colors.mutedForeground as string),
                          ]}
                        >
                          {d.subtitle}
                        </Text>
                      </VStack>
                      <Spacer />
                      <Image
                        systemName="chevron.right"
                        color={colors.mutedForeground as string}
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

            {query.trim() === "" ? (
              <Text
                modifiers={[
                  dfont({ size: 13 }),
                  foregroundStyle(colors.mutedForeground as string),
                  padding({ horizontal: 8, top: 4 }),
                ]}
              >
                Type to find any screen.
              </Text>
            ) : null}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
