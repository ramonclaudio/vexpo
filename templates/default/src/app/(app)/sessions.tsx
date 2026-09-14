import { useEffect, useState } from "react";
import { Host, ScrollView, Button, Text, VStack, HStack, Spacer, Alert } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityInputLabels,
  accessibilityLabel,
  animation,
  Animation,
  background,
  buttonStyle,
  contentShape,
  cornerRadius,
  dynamicTypeSize,
  shapes,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
  privacySensitive,
  refreshable,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { TouchTarget } from "@/constants/layout";
import { DynamicType, Duration, toSeconds } from "@/constants/ui";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { SkeletonSessions } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { fail, succeed } from "@/lib/form-result";
import { Colors } from "@/constants/theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type SessionRow = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
};

// Order matters, an iOS user agent carries Darwin and Mac too.
const DEVICES: [RegExp, string][] = [
  [/CFNetwork|Darwin|iPhone/i, "iPhone"],
  [/iPad/i, "iPad"],
  [/Mac/i, "Mac"],
  [/Android/i, "Android"],
  [/Windows/i, "Windows"],
  [/Linux/i, "Linux"],
];

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  return DEVICES.find(([re]) => re.test(userAgent))?.[1] ?? userAgent.slice(0, 40);
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const delta = Math.max(0, now - date.getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function SessionsScreen() {
  const dfont = useDynamicFont();
  const scenePrivacy = useScenePrivacy();
  const reduceMotion = useReducedMotion();
  const { data: current } = authClient.useSession();
  const currentToken = current?.session?.token ?? null;
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadError, setLoadError] = useState<"network" | "stale" | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await authClient.listSessions();
      if (res.error) {
        setLoadError(res.error.code === "SESSION_NOT_FRESH" ? "stale" : "network");
        return;
      }
      setLoadError(null);
      setSessions((res.data ?? []).map((s) => ({ ...s, createdAt: new Date(s.createdAt) })));
    } catch {
      setLoadError("network");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const revoke = async (token: string) => {
    haptics.medium();
    announce("Revoking session");
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await authClient.revokeSession({ token });
      if (res.error) {
        setRevokeError(fail("Couldn't revoke session").error);
        return;
      }
      succeed("Session revoked");
      await load();
    } catch {
      setRevokeError(fail("Couldn't revoke session").error);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }} modifiers={scenePrivacy}>
      {sessions === null ? (
        loadError === "stale" ? (
          <ContentUnavailable
            title="Sign in again to manage sessions"
            systemImage="lock.shield"
            description="For your security, managing sessions needs a recent sign-in. Sign out, sign back in, and come back here."
          />
        ) : loadError ? (
          <ContentUnavailable
            title="Couldn't load sessions"
            systemImage="exclamationmark.triangle"
            description="Check your connection and try again."
          />
        ) : (
          <SkeletonSessions />
        )
      ) : sessions.length === 0 ? (
        <ContentUnavailable
          title="No active sessions"
          systemImage="list.bullet.rectangle.portrait"
          description="You have no other active sessions."
        />
      ) : (
        <ScrollView modifiers={[tint(Colors.primary), refreshable(load)]}>
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[
              padding({ horizontal: 24, top: 24, bottom: 40 }),
              ...(reduceMotion
                ? []
                : [
                    animation(
                      Animation.easeOut({ duration: toSeconds(Duration.normal) }),
                      sessions.length,
                    ),
                  ]),
            ]}
          >
            <Text
              modifiers={[
                dfont({ size: 13, weight: "semibold" }),
                foregroundStyle(Colors.mutedForeground),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              ACTIVE SESSIONS
            </Text>
            {sessions.map((s) => {
              const isCurrent = s.token === currentToken;
              return (
                <HStack
                  key={s.id}
                  spacing={12}
                  alignment="center"
                  modifiers={[
                    frame({ maxWidth: Infinity }),
                    padding({ horizontal: 20, vertical: 14 }),
                    background(Colors.muted),
                    cornerRadius(20),
                  ]}
                >
                  <VStack
                    alignment="leading"
                    spacing={2}
                    modifiers={[accessibilityElement("combine")]}
                  >
                    <HStack spacing={8} alignment="center">
                      <Text
                        modifiers={[dfont({ size: 16, weight: "semibold" }), textSelection(true)]}
                      >
                        {deviceLabel(s.userAgent)}
                      </Text>
                      {isCurrent ? (
                        <Text
                          modifiers={[
                            dfont({ size: 11, weight: "semibold" }),
                            foregroundStyle(Colors.primaryForeground),
                            padding({ horizontal: 8, vertical: 2 }),
                            background(Colors.primary),
                            cornerRadius(8),
                            dynamicTypeSize({ max: DynamicType.control }),
                          ]}
                        >
                          This device
                        </Text>
                      ) : null}
                    </HStack>
                    <Text
                      modifiers={[
                        dfont({ size: 13 }),
                        foregroundStyle(Colors.mutedForeground),
                        textSelection(true),
                        privacySensitive(),
                      ]}
                    >
                      {s.ipAddress ?? "Unknown IP"} · {formatRelative(s.createdAt)}
                    </Text>
                  </VStack>
                  <Spacer />
                  {isCurrent ? null : (
                    <Alert
                      title="Revoke this session?"
                      isPresented={confirmToken === s.token}
                      onIsPresentedChange={(v) => setConfirmToken(v ? s.token : null)}
                    >
                      <Alert.Trigger>
                        <Button
                          modifiers={[
                            buttonStyle("plain"),
                            frame({ minHeight: TouchTarget.min }),
                            contentShape(shapes.rectangle()),
                            accessibilityLabel(`Revoke ${deviceLabel(s.userAgent)}`),
                            // Voice Control matches the visible word, so "Revoke" has to be here too.
                            accessibilityInputLabels([
                              "Revoke",
                              `Revoke ${deviceLabel(s.userAgent)}`,
                            ]),
                          ]}
                          onPress={() => {
                            haptics.warning();
                            setConfirmToken(s.token);
                          }}
                        >
                          <Text
                            modifiers={[
                              dfont({ size: 14, weight: "medium" }),
                              foregroundStyle(Colors.destructive),
                            ]}
                          >
                            Revoke
                          </Text>
                        </Button>
                      </Alert.Trigger>
                      <Alert.Actions>
                        <Button
                          label="Revoke"
                          role="destructive"
                          onPress={() => {
                            setConfirmToken(null);
                            void revoke(s.token);
                          }}
                        />
                        <Button label="Cancel" role="cancel" />
                      </Alert.Actions>
                      <Alert.Message>
                        <Text modifiers={[dfont({ size: 16 })]}>
                          Signing out {deviceLabel(s.userAgent)} ends the session everywhere it is
                          active.
                        </Text>
                      </Alert.Message>
                    </Alert>
                  )}
                </HStack>
              );
            })}
            {revoking ? (
              <Text
                modifiers={[
                  dfont({ size: 13 }),
                  foregroundStyle(Colors.mutedForeground),
                  multilineTextAlignment("center"),
                  frame({ maxWidth: Infinity }),
                ]}
              >
                Revoking session...
              </Text>
            ) : null}
            {revokeError ? <ErrorText>{revokeError}</ErrorText> : null}
          </VStack>
        </ScrollView>
      )}
    </Host>
  );
}
