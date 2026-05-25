import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clipboard, PlayCircle, RefreshCw } from "lucide-react-native";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import type { DoctorCheck, DoctorStatusResponse } from "../bridgeContracts";
import {
  AuxToolbar,
  Card,
  EmptyState,
  MiniBadge,
  PaneScroll,
  PortalModal,
  SectionHeader,
  SecondaryButton,
} from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type DoctorPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  doctorStatus: DoctorStatusResponse | null;
  onRefresh: () => void;
  onRunCommand?: (command: string) => Promise<unknown>;
};

type GuideStep = {
  title: string;
  body: string;
  command?: string;
};

type DoctorGuide = {
  overview: string;
  steps: GuideStep[];
  doneSteps: GuideStep[];
};

function statusLabel(status: DoctorCheck["status"]) {
  if (status === "ok") return "OK";
  if (status === "warning") return "Needs attention";
  return "Fix needed";
}

function statusExplanation(status: DoctorCheck["status"]) {
  if (status === "ok") return "Ready";
  if (status === "warning") return "Usable, but setup could be improved";
  return "This can block a smooth Hermes GUI experience";
}

function actionLabel(status: DoctorCheck["status"]) {
  if (status === "ok") return "Review guide";
  if (status === "warning") return "Walk through setup";
  return "Fix with guide";
}

function copyCommand(command: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(command);
  }
}

function fallbackGuide(check: DoctorCheck): DoctorGuide {
  const commandStep = check.command
    ? [{ title: "Run the recommended command", body: "Use this command from the project or Hermes environment, then re-run Doctor to verify the result.", command: check.command }]
    : [];
  return {
    overview: "This guided check explains what Doctor found, what to do next, and how to verify it.",
    steps: [
      { title: "Read the diagnosis", body: check.detail },
      ...commandStep,
      { title: "Verify", body: "Click Run Doctor again. The card should change to OK once the setup is complete." },
    ],
    doneSteps: [
      { title: "What was checked", body: check.detail },
      { title: "Keep it healthy", body: "If this changes after updating Hermes, Node, Python, or provider settings, re-run Doctor and follow the card guide." },
    ],
  };
}

function guideForCheck(check: DoctorCheck): DoctorGuide {
  const command = check.command;
  const guides: Record<string, DoctorGuide> = {
    hermes_installed: {
      overview: "Hermes Native GUI needs the Hermes Agent gateway package available locally so the bridge can expose structured RPC to the React app.",
      steps: [
        { title: "Locate or install Hermes Agent", body: "Doctor looks for the Hermes source/package that contains tui_gateway/ws.py. If it cannot find it, run setup or point HERMES_AGENT_ROOT at the checkout." },
        { title: "Run setup", body: "Use the Hermes installer/setup flow, then restart the bridge so it picks up the package path.", command },
        { title: "Verify", body: "Run Doctor again. This card should report that the gateway package was found." },
      ],
      doneSteps: [
        { title: "Gateway package found", body: check.detail },
        { title: "Next", body: "Keep Hermes Agent updated with your normal Hermes update flow, then re-run Doctor after major upgrades." },
      ],
    },
    config_valid: {
      overview: "Hermes needs a readable config.yaml before the GUI can reliably load providers, models, tools, skills, and runtime preferences.",
      steps: [
        { title: "Open the current config", body: "Inspect the config so you can see whether it loads cleanly or where parsing/setup fails.", command },
        { title: "Repair via setup if needed", body: "If the command fails or the config is missing, run hermes setup and accept the defaults or fill in your preferred provider settings.", command: "hermes setup" },
        { title: "Verify", body: "Run Doctor again. The config card should change to OK once config.yaml loads as a mapping." },
      ],
      doneSteps: [
        { title: "Config loaded", body: check.detail },
        { title: "Next", body: "Use the Settings, Models, Tools, and Keys sections for normal changes instead of editing config by hand unless needed." },
      ],
    },
    provider_configured: {
      overview: "At least one model provider must be configured before Hermes can answer prompts.",
      steps: [
        { title: "Choose a provider", body: "Pick the provider you want to use in Hermes setup or in the Models/Keys sections of this GUI." },
        { title: "Add credentials", body: "Run setup and add the provider key, or add credentials through ~/.hermes/.env if you manage keys manually.", command },
        { title: "Verify models", body: "Open Models after setup and confirm Hermes reports a selected provider/model. Then run Doctor again." },
      ],
      doneSteps: [
        { title: "Provider detected", body: check.detail },
        { title: "Next", body: "If prompts fail later, open Keys and Models to confirm the provider is still connected." },
      ],
    },
    credentials_present: {
      overview: "Credentials are the provider keys or environment entries Hermes uses to call configured model backends.",
      steps: [
        { title: "Open guided setup", body: "Use Hermes setup to add or refresh provider credentials.", command },
        { title: "Avoid pasting secrets into chat", body: "Use the setup/Keys flow or ~/.hermes/.env. Do not paste API keys into a normal chat prompt." },
        { title: "Verify", body: "Run Doctor again. Then open Keys to see which providers are available without exposing secret values." },
      ],
      doneSteps: [
        { title: "Credentials found", body: check.detail },
        { title: "Next", body: "Rotate or update provider keys in your provider dashboard and Hermes setup/Keys flow when needed." },
      ],
    },
    node_version: {
      overview: "The web GUI and Expo build tooling require Node 20.19+ or 22.12+. On this Mac, Homebrew node@22 is usually the safe path.",
      steps: [
        { title: "Use the supported Node", body: "Prefer Homebrew node@22 for Hermes Native GUI commands on this machine.", command: 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --version' },
        { title: "Build or typecheck with that PATH", body: "Run the project command using the supported Node path so Expo and TypeScript use the correct runtime.", command },
        { title: "Make it persistent if needed", body: "If your shell keeps finding an older node, add /opt/homebrew/opt/node@22/bin before /usr/local/bin in your shell profile." },
      ],
      doneSteps: [
        { title: "Supported Node found", body: check.detail },
        { title: "Next", body: "Keep using the node@22 PATH prefix for build/typecheck commands if your default node is older." },
      ],
    },
    python_deps: {
      overview: "The bridge runs on Python and needs FastAPI, Uvicorn, and the Hermes gateway imports available in the environment that launches it.",
      steps: [
        { title: "Start with the Hermes virtualenv", body: "Run the bridge with the Hermes virtualenv Python so it can import both server dependencies and Hermes gateway code.", command },
        { title: "Install missing deps if the bridge fails", body: "If FastAPI or Uvicorn are missing, install bridge dependencies in the same virtualenv, then restart the bridge." },
        { title: "Verify", body: "Reconnect the GUI and run Doctor again. This card should report that bridge Python dependencies imported successfully." },
      ],
      doneSteps: [
        { title: "Python imports succeeded", body: check.detail },
        { title: "Next", body: "If you change virtualenvs or move Hermes Agent, restart the bridge and re-run Doctor." },
      ],
    },
    computer_use_cua_driver: {
      overview: "Computer Use depends on the CuaDriver background-control service. Hermes can still chat without it, but desktop automation will be limited until it is installed and healthy.",
      steps: [
        { title: "Install or upgrade CuaDriver", body: "Run the Hermes Computer Use installer. macOS may ask for accessibility/screen-recording permissions after install.", command },
        { title: "Grant macOS permissions", body: "If prompted, allow the driver/app in System Settings Privacy & Security for Accessibility and Screen Recording." },
        { title: "Verify", body: "Run Doctor again, or run hermes computer-use status, and confirm the output says installed/healthy." },
      ],
      doneSteps: [
        { title: "Computer Use is available", body: check.detail },
        { title: "Next", body: "If background desktop control stops working, rerun this guide and check macOS permissions first." },
      ],
    },
    bridge_reachable: {
      overview: "The React GUI is talking to the local bridge over WebSocket. This is the basic connection all live panes use.",
      steps: [
        { title: "Bridge is reachable", body: check.detail },
        { title: "If it disconnects later", body: "Start the bridge with npm run bridge, reconnect from the header, then run Doctor again." },
      ],
      doneSteps: [
        { title: "Bridge connected", body: check.detail },
        { title: "Next", body: "Keep the bridge running while using live GUI features like sessions, tools, skills, and Doctor." },
      ],
    },
  };
  return guides[check.id] ?? fallbackGuide(check);
}

function commandResultText(result: unknown) {
  const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const stdout = String(record.stdout ?? record.output ?? record.message ?? "").trim();
  const stderr = String(record.stderr ?? "").trim();
  const exit = record.code ?? record.exit_code;
  const chunks = [stdout, stderr ? "stderr:\n" + stderr : "", exit == null ? "" : "Exit code: " + String(exit)].filter(Boolean);
  return chunks.join("\n\n") || "Command completed.";
}

function GuideStepView({ index, step }: { index: number; step: GuideStep }) {
  const { colors, styles } = useDashboardTheme();
  return (
    <View style={styles.listRow}>
      <View style={styles.inlineIconText}>
        <MiniBadge label={String(index + 1)} active />
        <Text selectable style={styles.settingRowTitle}>{step.title}</Text>
      </View>
      <Text selectable style={styles.settingHelp}>{step.body}</Text>
      {step.command ? <Text selectable style={styles.emptyCode}>{step.command}</Text> : null}
      {step.command ? (
        <Pressable style={styles.choiceChip} onPress={() => copyCommand(step.command!)} accessibilityRole="button" accessibilityLabel="Copy step command">
          <Clipboard color={colors.midgroundMuted} size={14} />
          <Text style={styles.choiceChipText}>Copy command</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DoctorPane({ connected, loading, message, doctorStatus, onRefresh, onRunCommand }: DoctorPaneProps) {
  const { colors, styles } = useDashboardTheme();
  const checks = doctorStatus?.checks ?? [];
  const okCount = checks.filter((check) => check.status === "ok").length;
  const issueCount = checks.length - okCount;
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [commandResults, setCommandResults] = useState<Record<string, string>>({});
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);

  const activeCheck = useMemo(
    () => checks.find((check) => check.id === activeCheckId) ?? null,
    [activeCheckId, checks],
  );
  const activeGuide = activeCheck ? guideForCheck(activeCheck) : null;
  const activeSteps = activeCheck?.status === "ok" ? activeGuide?.doneSteps ?? [] : activeGuide?.steps ?? [];

  const runFixCommand = async (command: string) => {
    if (!onRunCommand || runningCommand) return;
    setRunningCommand(command);
    try {
      const result = await onRunCommand(command);
      setCommandResults((prev) => ({ ...prev, [command]: commandResultText(result) }));
      onRefresh();
    } catch (error: any) {
      setCommandResults((prev) => ({ ...prev, [command]: error?.message ?? "Command failed." }));
    } finally {
      setRunningCommand(null);
    }
  };

  return (
    <PaneScroll>
      <AuxToolbar
        connected={connected}
        loading={loading}
        message={message}
        onRefresh={onRefresh}
        actions={<SecondaryButton label="Run Doctor" onPress={onRefresh} disabled={!connected || loading} icon={<RefreshCw color={colors.midground} size={16} />} />}
      />
      <Card>
        <SectionHeader
          title="Hermes Doctor"
          subtitle="A guided setup walkthrough for installation, config, providers, runtime dependencies, bridge health, and credentials."
        />
        <View style={styles.chipWrap}>
          <MiniBadge label={okCount + "/" + (checks.length || 0) + " passing"} active={issueCount === 0 && checks.length > 0} />
          <MiniBadge label={issueCount ? issueCount + " setup item(s)" : "All set"} active={issueCount === 0 && checks.length > 0} />
        </View>
      </Card>

      <Card>
        <SectionHeader title="Guided checklist" subtitle="Open any card for a step-by-step walkthrough. Unfinished items include the recommended command and verification step inside the modal." />
        {checks.length ? (
          <View style={styles.toolsetGrid}>
            {checks.map((check) => {
              const pending = check.status !== "ok";
              return (
                <View key={check.id} style={[styles.toolsetCard, check.status === "ok" && styles.toolsetCardOn]}>
                  <View style={styles.panelHeaderRow}>
                    <View style={styles.settingRowText}>
                      <Text selectable style={styles.settingRowTitle}>{check.label}</Text>
                      <Text selectable style={styles.settingHelp}>{statusExplanation(check.status)}</Text>
                    </View>
                    <MiniBadge label={statusLabel(check.status)} active={check.status === "ok"} />
                  </View>
                  <Text selectable style={styles.toolPreview}>{check.detail}</Text>
                  {check.command && pending ? <Text selectable style={styles.emptyCode}>{check.command}</Text> : null}
                  <View style={styles.chipWrap}>
                    <SecondaryButton
                      label={actionLabel(check.status)}
                      onPress={() => setActiveCheckId(check.id)}
                      icon={pending ? <BookOpen color={colors.midground} size={16} /> : <CheckCircle2 color={colors.midground} size={16} />}
                    />
                    {check.command && pending ? (
                      <SecondaryButton
                        label="Copy"
                        onPress={() => copyCommand(check.command!)}
                        icon={<Clipboard color={colors.midground} size={16} />}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState title="Doctor has not run yet" message="Connect to the bridge, then run Doctor to inspect this local Hermes setup. Each result will open into a guided walkthrough." />
        )}
      </Card>

      <PortalModal
        visible={Boolean(activeCheck && activeGuide)}
        title={activeCheck ? activeCheck.label + " walkthrough" : "Doctor walkthrough"}
        subtitle={activeCheck ? statusLabel(activeCheck.status) + " · " + statusExplanation(activeCheck.status) : undefined}
        onClose={() => setActiveCheckId(null)}
        footer={activeCheck ? (
          <View style={styles.panelHeaderRow}>
            <View style={styles.settingRowText}>
              <Text selectable style={styles.settingHelp}>After completing the steps, run Doctor again to refresh this card.</Text>
            </View>
            <View style={styles.chipWrap}>
              {activeCheck.command ? (
                <SecondaryButton
                  label="Copy command"
                  onPress={() => copyCommand(activeCheck.command!)}
                  icon={<Clipboard color={colors.midground} size={16} />}
                />
              ) : null}
              {activeCheck.command && onRunCommand && activeCheck.status !== "ok" ? (
                <SecondaryButton
                  label={runningCommand === activeCheck.command ? "Running…" : "Run command"}
                  onPress={() => void runFixCommand(activeCheck.command!)}
                  disabled={!connected || loading || Boolean(runningCommand)}
                  icon={runningCommand === activeCheck.command ? <ActivityIndicator color={colors.midground} /> : <PlayCircle color={colors.midground} size={16} />}
                />
              ) : null}
              <SecondaryButton label="Run Doctor" onPress={onRefresh} disabled={!connected || loading} icon={<RefreshCw color={colors.midground} size={16} />} />
            </View>
          </View>
        ) : null}
      >
        {activeCheck && activeGuide ? (
          <>
            <View style={styles.listRow}>
              <View style={styles.inlineIconText}>
                <MiniBadge label={statusLabel(activeCheck.status)} active={activeCheck.status === "ok"} />
                <Text selectable style={styles.settingRowTitle}>Diagnosis</Text>
              </View>
              <Text selectable style={styles.settingHelp}>{activeGuide.overview}</Text>
              <Text selectable style={styles.toolPreview}>{activeCheck.detail}</Text>
            </View>
            {activeSteps.map((step, index) => (
              <GuideStepView key={step.title + "-" + index} index={index} step={step} />
            ))}
            {activeCheck.command && commandResults[activeCheck.command] ? (
              <View style={styles.listRow}>
                <Text selectable style={styles.settingRowTitle}>Last command result</Text>
                <Text selectable style={styles.toolPreview}>{commandResults[activeCheck.command]}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </PortalModal>
    </PaneScroll>
  );
}
