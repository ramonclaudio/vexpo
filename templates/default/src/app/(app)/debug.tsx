import { useEffect, useRef, useState } from "react";
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
  LabeledContent,
  ShareLink,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityInputLabels,
  accessibilityLabel,
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

import { announce } from "@/lib/a11y";
import { executionEnvironment, expoRuntimeVersion, sessionId, debugMode } from "@/lib/device";
import { isEnabled as updatesEnabled, readLogEntries, type UpdatesLogEntry } from "@/lib/updates";
import { useAppUpdates } from "@/hooks/use-updates";
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
  testID?: string;
};

function InfoRow({ label, value, valueModifiers, valueColor, testID }: InfoRowProps) {
  const colors = useColors();
  const dfont = useDynamicFont();
  return (
    <LabeledContent
      label={
        <Text modifiers={[dfont({ size: 15 }), foregroundStyle(colors.mutedForeground as string)]}>
          {label}
        </Text>
      }
      modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 16, vertical: 12 })]}
    >
      <Text
        testID={testID}
        modifiers={[
          dfont({ size: 15, weight: "medium" }),
          foregroundStyle((valueColor ?? colors.foreground) as string),
          textSelection(true),
          ...(valueModifiers ?? []),
        ]}
      >
        {value}
      </Text>
    </LabeledContent>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <VStack
      spacing={0}
      alignment="leading"
      modifiers={[
        frame({ maxWidth: Infinity }),
        background(colors.muted as string),
        cornerRadius(20),
      ]}
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

  // OTA status rows render silently; announce check outcomes to VoiceOver.
  // Download errors/progress stay unannounced here, the global UpdateBanner owns them.
  const wasCheckingRef = useRef(false);
  useEffect(() => {
    if (updates.checkError) announce(`Update check failed: ${updates.checkError.message}`);
  }, [updates.checkError]);
  useEffect(() => {
    if (wasCheckingRef.current && !updates.isChecking && !updates.checkError) {
      announce(updates.isUpdateAvailable ? "Update available" : "Up to date");
    }
    wasCheckingRef.current = updates.isChecking;
  }, [updates.isChecking, updates.checkError, updates.isUpdateAvailable]);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber = Application.nativeBuildVersion ?? "1";
  const deviceInfo = Device.modelName
    ? `${Device.manufacturer ?? ""} ${Device.modelName}`.trim()
    : "iOS";
  const osVersion = Device.osVersion ? `iOS ${Device.osVersion}` : "iOS";

  const sectionLabelModifiers = [
    dfont({ size: 13, weight: "semibold" }),
    foregroundStyle(colors.mutedForeground as string),
    padding({ horizontal: 8, top: 4 }),
  ];

  return (
    <Host testID="debug-screen" style={{ flex: 1, backgroundColor: colors.background }}>
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
              <InfoRow
                testID="debug-version-value"
                label="Version"
                value={`${appVersion} (${buildNumber})`}
              />
              <InfoRow
                testID="debug-sdk-value"
                label="Expo SDK"
                value={Constants.expoConfig?.sdkVersion ?? "Unknown"}
              />
              <InfoRow
                testID="debug-app-name-value"
                label="App name"
                value={Application.applicationName ?? "N/A"}
              />
              <InfoRow
                testID="debug-bundle-id-value"
                label="Bundle id"
                value={Application.applicationId ?? "N/A"}
              />
              <InfoRow
                testID="debug-environment-value"
                label="Environment"
                value={executionEnvironment}
              />
              {appInfo.installTime ? (
                <InfoRow
                  testID="debug-installed-value"
                  label="Installed"
                  value={appInfo.installTime}
                />
              ) : null}
            </InfoCard>
          </VStack>

          {updatesEnabled && !__DEV__ ? (
            <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text modifiers={sectionLabelModifiers}>OTA UPDATES</Text>
              <InfoCard>
                <InfoRow
                  testID="debug-ota-status-value"
                  label="Status"
                  value={updates.statusText}
                />
                <InfoRow
                  testID="debug-ota-channel-value"
                  label="Channel"
                  value={updates.currentlyRunning.channel ?? "N/A"}
                />
                <InfoRow
                  testID="debug-ota-runtime-value"
                  label="Runtime"
                  value={updates.currentlyRunning.runtimeVersion ?? expoRuntimeVersion ?? "N/A"}
                />
                <InfoRow
                  testID="debug-ota-update-id-value"
                  label="Update id"
                  value={updates.currentlyRunning.updateId?.slice(0, 8) ?? "Embedded"}
                  valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
                />
                <InfoRow
                  testID="debug-ota-created-value"
                  label="Created"
                  value={updates.currentlyRunning.createdAt?.toLocaleDateString() ?? "N/A"}
                />
                <InfoRow
                  testID="debug-ota-source-value"
                  label="Source"
                  value={updates.currentlyRunning.isEmbeddedLaunch ? "Embedded" : "OTA Update"}
                />
                {updates.currentlyRunning.launchDuration != null ? (
                  <InfoRow
                    testID="debug-ota-launch-time-value"
                    label="Launch time"
                    value={`${updates.currentlyRunning.launchDuration}ms`}
                  />
                ) : null}
                {updates.currentlyRunning.isEmergencyLaunch ? (
                  <InfoRow
                    testID="debug-ota-emergency-launch-value"
                    label="Emergency launch"
                    value={updates.currentlyRunning.emergencyLaunchReason ?? "Unknown error"}
                    valueColor={colors.warning as string}
                  />
                ) : null}
                {updates.isDownloading ? (
                  <HStack
                    modifiers={[
                      frame({ maxWidth: Infinity }),
                      padding({ horizontal: 16, vertical: 12 }),
                    ]}
                  >
                    <ProgressView
                      testID="debug-ota-download-progress"
                      value={updates.downloadProgress ?? undefined}
                      modifiers={[
                        progressViewStyle("linear"),
                        frame({ maxWidth: Infinity }),
                        accessibilityLabel("Downloading update"),
                      ]}
                    />
                  </HStack>
                ) : null}
                {(updates.checkError ?? updates.downloadError) ? (
                  <InfoRow
                    testID="debug-ota-error"
                    label="Error"
                    value={(updates.checkError ?? updates.downloadError)?.message ?? "Unknown"}
                    valueColor={colors.destructive as string}
                  />
                ) : null}
                {updates.lastCheckForUpdateTimeSinceRestart ? (
                  <InfoRow
                    testID="debug-ota-last-checked-value"
                    label="Last checked"
                    value={updates.lastCheckForUpdateTimeSinceRestart.toLocaleTimeString()}
                  />
                ) : null}
              </InfoCard>
              {updates.isUpdateAvailable && !updates.isDownloading ? (
                <UpdateActionButton
                  testID="debug-update-download"
                  label="Download & install"
                  inputLabels={["download and install", "install update"]}
                  onPress={updates.downloadAndApply}
                  colors={colors}
                  dfont={dfont}
                />
              ) : !updates.isChecking && !updates.isDownloading ? (
                <UpdateActionButton
                  testID="debug-update-check"
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
                        testID={`debug-ota-log-${entry.timestamp}-${entry.code}`}
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
                  <InfoRow
                    testID="debug-ios-release-type-value"
                    label="Release type"
                    value={appInfo.iosReleaseType}
                  />
                ) : null}
                {appInfo.iosPushEnv ? (
                  <InfoRow
                    testID="debug-ios-push-env-value"
                    label="Push env"
                    value={appInfo.iosPushEnv}
                  />
                ) : null}
                {appInfo.iosVendorId ? (
                  <InfoRow
                    testID="debug-ios-vendor-id-value"
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
                testID="debug-session-id-value"
                label="Session id"
                value={sessionId.slice(0, 8)}
                valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
              />
              <InfoRow
                testID="debug-build-mode-value"
                label="Build mode"
                value={debugMode ? "Debug" : "Release"}
              />
            </InfoCard>
          </VStack>

          <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={sectionLabelModifiers}>DEVICE</Text>
            <InfoCard>
              <InfoRow testID="debug-device-model-value" label="Model" value={deviceInfo} />
              <InfoRow testID="debug-device-os-value" label="OS" value={osVersion} />
            </InfoCard>
          </VStack>

          <ShareLink
            testID="debug-share-build-info"
            item={`App v${appVersion} (${buildNumber})`}
            subject="Build info"
            modifiers={[frame({ maxWidth: Infinity })]}
          >
            <HStack
              alignment="center"
              modifiers={[
                frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                padding({ horizontal: 16 }),
                background(colors.muted as string),
                clipShape("capsule"),
              ]}
            >
              <Spacer />
              <Text
                modifiers={[
                  dfont({ size: 16, weight: "medium" }),
                  foregroundStyle(colors.foreground as string),
                ]}
              >
                Share build info
              </Text>
              <Spacer />
            </HStack>
          </ShareLink>

          <HStack modifiers={[frame({ maxWidth: Infinity }), padding({ top: 8 })]}>
            <Spacer />
            <Text
              testID="debug-footer-version-value"
              // duplicates the BUILD > Version row above, so hide the footer
              // stamp from VoiceOver instead of announcing the version twice.
              modifiers={[
                dfont({ size: 12 }),
                foregroundStyle(colors.mutedForeground as string),
                accessibilityHidden(true),
              ]}
            >
              v{appVersion} ({buildNumber})
            </Text>
            <Spacer />
          </HStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}

function UpdateActionButton({
  testID,
  label,
  inputLabels,
  onPress,
  colors,
  dfont,
}: {
  testID: string;
  label: string;
  inputLabels?: string[];
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  dfont: ReturnType<typeof useDynamicFont>;
}) {
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.muted as string),
        // upstream expo/expo#43158: capsule (and ellipse) were silently rendering
        // as a rectangle before. The fix wires the ShapeType enum through both
        // ClipShapeModifier and MaskModifier.
        clipShape("capsule"),
        ...(inputLabels ? [accessibilityInputLabels(inputLabels)] : []),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          dfont({ size: 16, weight: "medium" }),
          foregroundStyle(colors.foreground as string),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}
