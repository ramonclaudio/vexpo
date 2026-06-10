import { useEffect, useState } from "react";
import { Host, ScrollView, Button, Text, VStack, HStack, Spacer, Alert } from "@expo/ui/swift-ui";
import {
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
  refreshable,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { SkeletonSessions } from "@/components/ui/skeleton";
import { useDynamicFont } from "@/lib/dynamic-font";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";
import { useColors } from "@/hooks/use-theme";

type SessionRow = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  expiresAt: Date;
};

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

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return userAgent.slice(0, 40);
}

export default function SessionsScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const { data: current } = authClient.useSession();
  const currentToken = current?.session?.token ?? null;
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await authClient.listSessions();
      if (res.error) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      const rows = (res.data ?? []).map((s) => ({
        id: s.id,
        token: s.token,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        createdAt: new Date(s.createdAt),
        expiresAt: new Date(s.expiresAt),
      }));
      setSessions(rows);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (token: string) => {
    haptics.medium();
    setRevoking(token);
    try {
      // revokeSession resolves with an `error` object (not a throw) on a
      // server-side failure, so check it before announcing success, matching
      // load()'s `res.error` handling above.
      const res = await authClient.revokeSession({ token });
      if (res.error) {
        haptics.error();
        return;
      }
      haptics.success();
      announce("Session revoked");
      await load();
    } catch {
      haptics.error();
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Host testID="sessions-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      {sessions === null ? (
        loadError ? (
          <ContentUnavailable
            testID="sessions-error"
            title="Couldn't load sessions"
            systemImage="exclamationmark.triangle"
            description="Check your connection and try again."
          />
        ) : (
          <SkeletonSessions testID="sessions-loading" />
        )
      ) : sessions.length === 0 ? (
        <ContentUnavailable
          testID="sessions-empty"
          title="No active sessions"
          systemImage="list.bullet.rectangle.portrait"
          description="You have no other active sessions."
        />
      ) : (
        <ScrollView modifiers={[tint(colors.primary as string), refreshable(load)]}>
          <VStack
            spacing={12}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            <Text
              testID="sessions-heading"
              modifiers={[
                dfont({ size: 13, weight: "semibold" }),
                foregroundStyle(colors.mutedForeground as string),
              ]}
            >
              ACTIVE SESSIONS
            </Text>
            {sessions.map((s) => {
              const isCurrent = s.token === currentToken;
              return (
                <HStack
                  key={s.id}
                  testID={`session-row-${s.token}`}
                  spacing={12}
                  alignment="center"
                  modifiers={[
                    frame({ maxWidth: Infinity }),
                    padding({ horizontal: 20, vertical: 14 }),
                    background(colors.muted as string),
                    cornerRadius(20),
                  ]}
                >
                  <VStack alignment="leading" spacing={2}>
                    <HStack spacing={8} alignment="center">
                      <Text
                        testID={`session-device-${s.token}`}
                        modifiers={[dfont({ size: 16, weight: "semibold" }), textSelection(true)]}
                      >
                        {deviceLabel(s.userAgent)}
                      </Text>
                      {isCurrent ? (
                        <Text
                          testID={`session-current-badge-${s.token}`}
                          modifiers={[
                            dfont({ size: 11, weight: "semibold" }),
                            foregroundStyle(colors.primaryForeground as string),
                            padding({ horizontal: 8, vertical: 2 }),
                            background(colors.primary as string),
                            cornerRadius(8),
                            // upstream expo/expo#46540: fixed pill, cap Dynamic
                            // Type so it can't balloon beside the device name.
                            dynamicTypeSize({ max: DynamicType.control }),
                          ]}
                        >
                          This device
                        </Text>
                      ) : null}
                    </HStack>
                    <Text
                      testID={`session-meta-${s.token}`}
                      modifiers={[
                        dfont({ size: 13 }),
                        foregroundStyle(colors.mutedForeground as string),
                        textSelection(true),
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
                          testID={`session-revoke-${s.token}`}
                          modifiers={[
                            buttonStyle("plain"),
                            frame({ minHeight: TouchTarget.min }),
                            contentShape(shapes.rectangle()),
                          ]}
                          onPress={() => {
                            haptics.warning();
                            setConfirmToken(s.token);
                          }}
                        >
                          <Text
                            modifiers={[
                              dfont({ size: 14, weight: "medium" }),
                              foregroundStyle(colors.destructive as string),
                            ]}
                          >
                            Revoke
                          </Text>
                        </Button>
                      </Alert.Trigger>
                      <Alert.Actions>
                        <Button
                          testID={`session-revoke-confirm-${s.token}`}
                          label="Revoke"
                          role="destructive"
                          onPress={() => {
                            setConfirmToken(null);
                            void revoke(s.token);
                          }}
                        />
                        <Button
                          testID={`session-revoke-cancel-${s.token}`}
                          label="Cancel"
                          role="cancel"
                        />
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
                testID="sessions-revoking"
                modifiers={[
                  dfont({ size: 13 }),
                  foregroundStyle(colors.mutedForeground as string),
                  multilineTextAlignment("center"),
                  frame({ maxWidth: Infinity }),
                ]}
              >
                Revoking session...
              </Text>
            ) : null}
          </VStack>
        </ScrollView>
      )}
    </Host>
  );
}
