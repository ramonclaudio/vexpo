import { useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { ApplicationReleaseType } from "expo-application";
import * as Device from "expo-device";
import {
  Host,
  ScrollView,
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
  accessibilityLabel,
  background,
  clipShape,
  cornerRadius,
  defaultScrollAnchor,
  foregroundStyle,
  frame,
  invalidatableContent,
  padding,
  privacySensitive,
  progressViewStyle,
  redacted,
  scrollDismissesKeyboard,
  textSelection,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { announce } from "@/lib/a11y";
import { executionEnvironment, expoRuntimeVersion, sessionId, debugMode } from "@/lib/device";
import { isEnabled as updatesEnabled, readLogEntries, type UpdatesLogEntry } from "@/lib/updates";
import { useAppUpdates } from "@/hooks/use-updates";
import { useColors } from "@/hooks/use-theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { SectionLabel } from "@/components/ui/section-label";

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
        <Text modifiers={[dfont({ size: 15 }), foregroundStyle(colors.mutedForeground)]}>
          {label}
        </Text>
      }
      modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 16, vertical: 12 })]}
    >
      <Text
        testID={testID}
        modifiers={[
          dfont({ size: 15, weight: "medium" }),
          foregroundStyle(valueColor ?? colors.foreground),
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
      modifiers={[frame({ maxWidth: Infinity }), background(colors.muted), cornerRadius(20)]}
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

type AppInfo = ReturnType<typeof useApplicationInfo>;
type Updates = ReturnType<typeof useAppUpdates>;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <VStack spacing={8} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
      <SectionLabel>{label}</SectionLabel>
      <InfoCard>{children}</InfoCard>
    </VStack>
  );
}

function BuildSection({
  appInfo,
  appVersion,
  buildNumber,
}: {
  appInfo: AppInfo;
  appVersion: string;
  buildNumber: string;
}) {
  return (
    <Section label="BUILD">
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
      <InfoRow testID="debug-environment-value" label="Environment" value={executionEnvironment} />
      {appInfo.installTime ? (
        <InfoRow testID="debug-installed-value" label="Installed" value={appInfo.installTime} />
      ) : null}
    </Section>
  );
}

function otaValues(running: Updates["currentlyRunning"]) {
  return {
    channel: running.channel ?? "N/A",
    runtime: running.runtimeVersion ?? expoRuntimeVersion ?? "N/A",
    updateId: running.updateId?.slice(0, 8) ?? "Embedded",
    created: running.createdAt?.toLocaleDateString() ?? "N/A",
    source: running.isEmbeddedLaunch ? "Embedded" : "OTA Update",
    emergencyReason: running.emergencyLaunchReason ?? "Unknown error",
  };
}

function OtaStatusCard({ updates }: { updates: Updates }) {
  const colors = useColors();
  const dfont = useDynamicFont();
  const running = updates.currentlyRunning;
  const values = otaValues(running);
  const error = updates.checkError ?? updates.downloadError;
  return (
    <InfoCard>
      <InfoRow
        testID="debug-ota-status-value"
        label="Status"
        value={updates.statusText}
        valueModifiers={[invalidatableContent()]}
      />
      <InfoRow testID="debug-ota-channel-value" label="Channel" value={values.channel} />
      <InfoRow testID="debug-ota-runtime-value" label="Runtime" value={values.runtime} />
      <InfoRow
        testID="debug-ota-update-id-value"
        label="Update id"
        value={values.updateId}
        valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
      />
      <InfoRow testID="debug-ota-created-value" label="Created" value={values.created} />
      <InfoRow testID="debug-ota-source-value" label="Source" value={values.source} />
      {running.launchDuration != null ? (
        <InfoRow
          testID="debug-ota-launch-time-value"
          label="Launch time"
          value={`${running.launchDuration}ms`}
        />
      ) : null}
      {running.isEmergencyLaunch ? (
        <InfoRow
          testID="debug-ota-emergency-launch-value"
          label="Emergency launch"
          value={values.emergencyReason}
          valueColor={colors.warning}
        />
      ) : null}
      {updates.isDownloading ? (
        <HStack
          modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 16, vertical: 12 })]}
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
      {error ? (
        <InfoRow
          testID="debug-ota-error"
          label="Error"
          value={error.message ?? "Unknown"}
          valueColor={colors.destructive}
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
  );
}

function UpdateAction({ updates }: { updates: Updates }) {
  if (updates.isDownloading) return null;
  if (updates.isUpdateAvailable) {
    return (
      <SecondaryButton
        testID="debug-update-download"
        label="Download & install"
        inputLabels={["download and install", "install update"]}
        onPress={updates.downloadAndApply}
      />
    );
  }
  if (updates.isChecking) return null;
  return (
    <SecondaryButton
      testID="debug-update-check"
      label="Check for updates"
      onPress={updates.checkForUpdate}
    />
  );
}

function UpdateLog({ entries }: { entries: UpdatesLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ScrollView modifiers={[frame({ height: 240 }), defaultScrollAnchor("bottom")]}>
      <InfoCard>
        {entries.map((entry) => (
          <InfoRow
            key={`${entry.timestamp}-${entry.code}`}
            testID={`debug-ota-log-${entry.timestamp}-${entry.code}`}
            label={entry.level.toUpperCase()}
            value={`${entry.code}: ${entry.message}`}
          />
        ))}
      </InfoCard>
    </ScrollView>
  );
}

function OtaSection({ updates, log }: { updates: Updates; log: UpdatesLogEntry[] }) {
  if (!updatesEnabled || __DEV__) return null;
  return (
    <VStack
      spacing={8}
      alignment="leading"
      modifiers={[
        frame({ maxWidth: Infinity }),
        ...(updates.isChecking ? [redacted("invalidated")] : []),
      ]}
    >
      <SectionLabel>OTA UPDATES</SectionLabel>
      <OtaStatusCard updates={updates} />
      <UpdateAction updates={updates} />
      <UpdateLog entries={log} />
    </VStack>
  );
}

function IosSection({ appInfo }: { appInfo: AppInfo }) {
  const dfont = useDynamicFont();
  if (!appInfo.iosReleaseType && !appInfo.iosPushEnv && !appInfo.iosVendorId) return null;
  return (
    <Section label="iOS">
      {appInfo.iosReleaseType ? (
        <InfoRow
          testID="debug-ios-release-type-value"
          label="Release type"
          value={appInfo.iosReleaseType}
        />
      ) : null}
      {appInfo.iosPushEnv ? (
        <InfoRow testID="debug-ios-push-env-value" label="Push env" value={appInfo.iosPushEnv} />
      ) : null}
      {appInfo.iosVendorId ? (
        <InfoRow
          testID="debug-ios-vendor-id-value"
          label="Vendor id"
          value={appInfo.iosVendorId}
          valueModifiers={[dfont({ size: 13, design: "monospaced" })]}
        />
      ) : null}
    </Section>
  );
}

function RuntimeSection() {
  const dfont = useDynamicFont();
  return (
    <Section label="RUNTIME">
      <InfoRow
        testID="debug-session-id-value"
        label="Session id"
        value={sessionId.slice(0, 8)}
        valueModifiers={[dfont({ size: 13, design: "monospaced" }), privacySensitive()]}
      />
      <InfoRow
        testID="debug-build-mode-value"
        label="Build mode"
        value={debugMode ? "Debug" : "Release"}
      />
    </Section>
  );
}

function DeviceSection() {
  const model = Device.modelName
    ? `${Device.manufacturer ?? ""} ${Device.modelName}`.trim()
    : "iOS";
  return (
    <Section label="DEVICE">
      <InfoRow testID="debug-device-model-value" label="Model" value={model} />
      <InfoRow
        testID="debug-device-os-value"
        label="OS"
        value={Device.osVersion ? `iOS ${Device.osVersion}` : "iOS"}
      />
    </Section>
  );
}

function ShareBuildInfo({ build }: { build: string }) {
  const colors = useColors();
  const dfont = useDynamicFont();
  return (
    <ShareLink
      testID="debug-share-build-info"
      item={`App v${build}`}
      subject="Build info"
      modifiers={[frame({ maxWidth: Infinity })]}
    >
      <HStack
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          padding({ horizontal: 16 }),
          background(colors.muted),
          clipShape("capsule"),
        ]}
      >
        <Spacer />
        <Text
          modifiers={[dfont({ size: 16, weight: "medium" }), foregroundStyle(colors.foreground)]}
        >
          Share build info
        </Text>
        <Spacer />
      </HStack>
    </ShareLink>
  );
}

function VersionFooter({ build }: { build: string }) {
  const colors = useColors();
  const dfont = useDynamicFont();
  return (
    <HStack modifiers={[frame({ maxWidth: Infinity }), padding({ top: 8 })]}>
      <Spacer />
      <Text
        testID="debug-footer-version-value"
        modifiers={[
          dfont({ size: 12 }),
          foregroundStyle(colors.mutedForeground),
          accessibilityHidden(true),
        ]}
      >
        v{build}
      </Text>
      <Spacer />
    </HStack>
  );
}

function useUpdateAnnouncements(updates: Updates): void {
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
}

export default function DebugScreen() {
  const colors = useColors();
  const scenePrivacy = useScenePrivacy();
  const appInfo = useApplicationInfo();
  const updates = useAppUpdates();
  const updateLog = useUpdateLogEntries(updates.isUpdatePending, updates.restartCount);
  useUpdateAnnouncements(updates);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber = Application.nativeBuildVersion ?? "1";
  const build = `${appVersion} (${buildNumber})`;

  return (
    <Host
      testID="debug-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      modifiers={scenePrivacy}
    >
      <ScrollView modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary)]}>
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <BuildSection appInfo={appInfo} appVersion={appVersion} buildNumber={buildNumber} />
          <OtaSection updates={updates} log={updateLog} />
          <IosSection appInfo={appInfo} />
          <RuntimeSection />
          <DeviceSection />
          <ShareBuildInfo build={build} />
          <VersionFooter build={build} />
        </VStack>
      </ScrollView>
    </Host>
  );
}
