import { useEffect, useState } from "react";
import { Share } from "react-native";
import { Stack } from "expo-router";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { ApplicationReleaseType } from "expo-application";
import * as Device from "expo-device";
import {
  Host,
  ScrollView,
  Button,
  Text,
  VStack,
  HStack,
  Spacer,
  ProgressView,
} from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  cornerRadius,
  defaultScrollAnchor,
  foregroundStyle,
  frame,
  padding,
  progressViewStyle,
  scrollDismissesKeyboard,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { executionEnvironment, expoRuntimeVersion, sessionId, debugMode } from "@/lib/device";
import { isEnabled as updatesEnabled, readLogEntries, type UpdatesLogEntry } from "@/lib/updates";
import { useAppUpdates } from "@/hooks/use-updates";
import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

const RELEASE_TYPE_LABELS: Record<number, string> = {
  [ApplicationReleaseType.UNKNOWN]: "Unknown",
  [ApplicationReleaseType.SIMULATOR]: "Simulator",
  [ApplicationReleaseType.ENTERPRISE]: "Enterprise",
  [ApplicationReleaseType.DEVELOPMENT]: "Development",
  [ApplicationReleaseType.AD_HOC]: "Ad Hoc",
  [ApplicationReleaseType.APP_STORE]: "App Store",
};

type InfoRowProps = {
  label: string;
  value: string;
  valueModifiers?: Parameters<typeof Text>[0]["modifiers"];
  valueColor?: string;
};

function InfoRow({ label, value, valueModifiers, valueColor }: InfoRowProps) {
  const colors = useColors();
  const dfont = useDynamicFont();
  return (
    <HStack
      spacing={12}
      alignment="center"
      modifiers={[frame({ maxWidth: 10000 }), padding({ horizontal: 16, vertical: 12 })]}
    >
      <Text modifiers={[dfont({ size: 15 }), foregroundStyle(colors.mutedForeground as string)]}>
        {label}
      </Text>
      <Spacer />
      <Text
        modifiers={[
          dfont({ size: 15, weight: "medium" }),
          foregroundStyle((valueColor ?? colors.foreground) as string),
          textSelection(true),
          ...(valueModifiers ?? []),
        ]}
      >
        {value}
      </Text>
    </HStack>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <VStack
      spacing={0}
      alignment="leading"
      modifiers={[frame({ maxWidth: 10000 }), background(colors.muted as string), cornerRadius(20)]}
    >
      {children}
    </VStack>
  );
}

function useUpdateLogEntries(isUpdatePending: boolean, restartCount: number) {
  const [entries, setEntries] = useState<UpdatesLogEntry[]>([]);
  useEffect(() => {
    if (!updatesEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await readLogEntries();
        if (!cancelled) setEntries(all);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isUpdatePending, restartCount]);
  return entries;
}

function useApplicationInfo() {
  const [installTime, setInstallTime] = useState<string | null>(null);
  const [iosVendorId, setIosVendorId] = useState<string | null>(null);
  const [iosReleaseType, setIosReleaseType] = useState<string | null>(null);
  const [iosPushEnv, setIosPushEnv] = useState<string | null>(null);
  useEffect(() => {
    Application.getInstallationTimeAsync()
      .then((date) => {
        if (date) setInstallTime(date.toLocaleDateString());
      })
      .catch(() => {});

    Application.getIosIdForVendorAsync()
      .then(setIosVendorId)
      .catch(() => {});
    Application.getIosApplicationReleaseTypeAsync()
      .then((type) => setIosReleaseType(RELEASE_TYPE_LABELS[type] ?? "Unknown"))
      .catch(() => {});
    Application.getIosPushNotificationServiceEnvironmentAsync()
      .then((env) => setIosPushEnv(env ?? "N/A"))
      .catch(() => {});
  }, []);

  return { installTime, iosVendorId, iosReleaseType, iosPushEnv };
}

export default function DebugScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const appInfo = useApplicationInfo();
  const updates = useAppUpdates();
  const updateLog = useUpdateLogEntries(updates.isUpdatePending, updates.restartCount);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber = Application.nativeBuildVersion ?? "1";
  const deviceInfo = Device.modelName
    ? `${Device.manufacturer ?? ""} ${Device.modelName}`.trim()
    : "iOS";
  const osVersion = Device.osVersion ? `iOS ${Device.osVersion}` : "iOS";

  const handleShare = async () => {
    haptics.light();
    // expo-sharing's shareAsync takes a local file URL, not arbitrary text, so
    // it can't share a build string. RN's Share sheet takes a plain message.
    try {
      await Share.share({ message: `App v${appVersion} (${buildNumber})` });
    } catch {}
  };

  const sectionLabelModifiers = [
    dfont({ size: 13, weight: "semibold" }),
    foregroundStyle(colors.mutedForeground as string),
    padding({ horizontal: 8, top: 4 }),
  ];

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          onPress={handleShare}
          tintColor={colors.primary}
          accessibilityLabel="Share build info"
        />
      </Stack.Toolbar>
      <Host style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
        >
          <VStack
            spacing={20}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text modifiers={sectionLabelModifiers}>BUILD</Text>
              <InfoCard>
                <InfoRow label="Version" value={`${appVersion} (${buildNumber})`} />
                <InfoRow label="Expo SDK" value={Constants.expoConfig?.sdkVersion ?? "Unknown"} />
                <InfoRow label="App name" value={Application.applicationName ?? "N/A"} />
                <InfoRow label="Bundle id" value={Application.applicationId ?? "N/A"} />
                <InfoRow label="Environment" value={executionEnvironment} />
                {appInfo.installTime ? (
                  <InfoRow label="Installed" value={appInfo.installTime} />
                ) : null}
              </InfoCard>
            </VStack>

            {updatesEnabled && !__DEV__ ? (
              <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={sectionLabelModifiers}>OTA UPDATES</Text>
                <InfoCard>
                  <InfoRow label="Status" value={updates.statusText} />
                  <InfoRow label="Channel" value={updates.currentlyRunning.channel ?? "N/A"} />
                  <InfoRow
                    label="Runtime"
                    value={updates.currentlyRunning.runtimeVersion ?? expoRuntimeVersion ?? "N/A"}
                  />
                  <InfoRow
                    label="Update id"
                    value={updates.currentlyRunning.updateId?.slice(0, 8) ?? "Embedded"}
                    valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
                  />
                  <InfoRow
                    label="Created"
                    value={updates.currentlyRunning.createdAt?.toLocaleDateString() ?? "N/A"}
                  />
                  <InfoRow
                    label="Source"
                    value={updates.currentlyRunning.isEmbeddedLaunch ? "Embedded" : "OTA Update"}
                  />
                  {updates.currentlyRunning.launchDuration != null ? (
                    <InfoRow
                      label="Launch time"
                      value={`${updates.currentlyRunning.launchDuration}ms`}
                    />
                  ) : null}
                  {updates.currentlyRunning.isEmergencyLaunch ? (
                    <InfoRow
                      label="Emergency launch"
                      value={updates.currentlyRunning.emergencyLaunchReason ?? "Unknown error"}
                      valueColor="orange"
                    />
                  ) : null}
                  {updates.isDownloading ? (
                    <HStack
                      modifiers={[
                        frame({ maxWidth: 10000 }),
                        padding({ horizontal: 16, vertical: 12 }),
                      ]}
                    >
                      <ProgressView
                        value={updates.downloadProgress ?? undefined}
                        modifiers={[progressViewStyle("linear"), frame({ maxWidth: 10000 })]}
                      />
                    </HStack>
                  ) : null}
                  {(updates.checkError ?? updates.downloadError) ? (
                    <InfoRow
                      label="Error"
                      value={(updates.checkError ?? updates.downloadError)?.message ?? "Unknown"}
                      valueColor={colors.destructive as string}
                    />
                  ) : null}
                  {updates.lastCheckForUpdateTimeSinceRestart ? (
                    <InfoRow
                      label="Last checked"
                      value={updates.lastCheckForUpdateTimeSinceRestart.toLocaleTimeString()}
                    />
                  ) : null}
                </InfoCard>
                {updates.isUpdateAvailable && !updates.isDownloading ? (
                  <UpdateActionButton
                    label="Download & install"
                    onPress={updates.downloadAndApply}
                    colors={colors}
                    dfont={dfont}
                  />
                ) : !updates.isChecking && !updates.isDownloading ? (
                  <UpdateActionButton
                    label="Check for updates"
                    onPress={updates.checkForUpdate}
                    colors={colors}
                    dfont={dfont}
                  />
                ) : null}
                {updateLog.length > 0 ? (
                  // upstream expo/expo#43914: defaultScrollAnchor("bottom") anchors
                  // the log view to the newest entry, the standard log-tail UX.
                  <ScrollView modifiers={[frame({ height: 240 }), defaultScrollAnchor("bottom")]}>
                    <InfoCard>
                      {updateLog.map((entry) => (
                        <InfoRow
                          key={`${entry.timestamp}-${entry.code}`}
                          label={entry.level.toUpperCase()}
                          value={`${entry.code}: ${entry.message}`}
                        />
                      ))}
                    </InfoCard>
                  </ScrollView>
                ) : null}
              </VStack>
            ) : null}

            {appInfo.iosReleaseType || appInfo.iosPushEnv || appInfo.iosVendorId ? (
              <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={sectionLabelModifiers}>iOS</Text>
                <InfoCard>
                  {appInfo.iosReleaseType ? (
                    <InfoRow label="Release type" value={appInfo.iosReleaseType} />
                  ) : null}
                  {appInfo.iosPushEnv ? (
                    <InfoRow label="Push env" value={appInfo.iosPushEnv} />
                  ) : null}
                  {appInfo.iosVendorId ? (
                    <InfoRow
                      label="Vendor id"
                      value={appInfo.iosVendorId}
                      valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
                    />
                  ) : null}
                </InfoCard>
              </VStack>
            ) : null}

            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text modifiers={sectionLabelModifiers}>RUNTIME</Text>
              <InfoCard>
                <InfoRow
                  label="Session id"
                  value={sessionId.slice(0, 8)}
                  valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
                />
                <InfoRow label="Build mode" value={debugMode ? "Debug" : "Release"} />
              </InfoCard>
            </VStack>

            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text modifiers={sectionLabelModifiers}>DEVICE</Text>
              <InfoCard>
                <InfoRow label="Model" value={deviceInfo} />
                <InfoRow label="OS" value={osVersion} />
              </InfoCard>
            </VStack>

            <HStack modifiers={[frame({ maxWidth: 10000 }), padding({ top: 8 })]}>
              <Spacer />
              <Text
                modifiers={[dfont({ size: 12 }), foregroundStyle(colors.tertiaryLabel as string)]}
              >
                v{appVersion} ({buildNumber})
              </Text>
              <Spacer />
            </HStack>
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}

function UpdateActionButton({
  label,
  onPress,
  colors,
  dfont,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  dfont: ReturnType<typeof useDynamicFont>;
}) {
  return (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: 10000 }),
        background(colors.muted as string),
        // upstream expo/expo#43158: capsule (and ellipse) were silently rendering
        // as a rectangle before. The fix wires the ShapeType enum through both
        // ClipShapeModifier and MaskModifier.
        clipShape("capsule"),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: 10000, height: ButtonTokens.height }),
          dfont({ size: 16, weight: "medium" }),
          foregroundStyle(colors.foreground as string),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}
