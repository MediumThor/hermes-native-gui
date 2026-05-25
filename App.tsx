import { StatusBar } from "expo-status-bar";
import { Image as ImageIcon, Menu, Send, Square, Wifi, WifiOff, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useHermesRpc } from "./src/useHermesRpc";
import { useAppSettings } from "./src/useAppSettings";
import type { HermesSettingsState, ProviderOption, ToolsetSetting } from "./src/hermesSettings";
import { DEFAULT_HERMES_SETTINGS, normalizeSettingsPayload } from "./src/hermesSettings";
import { BlockingOverlays } from "./src/components/BlockingOverlays";
import { ChatTranscript, DefaultEmptyTranscript } from "./src/components/ChatTranscript";
import { ConfirmModal } from "./src/components/ConfirmModal";
import { MainMenu, MAIN_MENU_WIDTH, type MainMenuPane } from "./src/components/MainMenu";
import { RunningSessionBanner } from "./src/components/RunningSessionBanner";
import { SessionsSection } from "./src/components/SessionsSection";
import { SessionStatusBadge } from "./src/components/SessionStatusBadge";
import { ToolActivityCard } from "./src/components/ToolActivityCard";
import { MissionControlView } from "./src/components/MissionControlView";
import { PromptQueueStrip } from "./src/components/PromptQueueStrip";
import { useBusyAwareSubmit } from "./src/useBusyAwareSubmit";
import {
  INTERRUPT_TOGGLE_TITLE,
  INTERRUPT_DISABLE_CONFIRM_TITLE,
  INTERRUPT_DISABLE_CONFIRM_MESSAGE,
} from "./src/interruptToggleCopy";
import type { SessionSummary, SlashCompletionResult, SlashCompletionItem } from "./src/types";
import { SettingsPane } from "./src/panes/SettingsPane";
import { ModelsPane } from "./src/panes/ModelsPane";
import { ToolsPane } from "./src/panes/ToolsPane";
import { CommandsPane, CronPane, KeysPane, SystemPane } from "./src/panes/ResourcePanes";
import { PluginsPane } from "./src/panes/PluginsPane";
import { SkillsPane } from "./src/panes/SkillsPane";
import { normalizeModelOptions, normalizePluginsList, normalizeSkillHubBrowse, normalizeSkillsList, normalizeToolsets, pluginRegistryName } from "./src/bridgeContracts";
import type { PluginSummary, SkillHubBrowse, SkillHubItem, SkillSummary } from "./src/bridgeContracts";
import { DashboardThemeProvider, useDashboardTheme } from "./src/themes/DashboardThemeProvider";
import { injectWebScrollbarStyles } from "./src/web/scrollbarStyles";

type Pane = MainMenuPane;

type ClipboardLikeEvent = {
  clipboardData?: {
    files?: ArrayLike<{ type?: string }>;
    items?: ArrayLike<{ kind?: string; type?: string }>;
  };
  preventDefault?: () => void;
};

type ImageAttachment = {
  id: string;
  name: string;
  path: string;
  width?: number;
  height?: number;
  tokenEstimate?: number;
};

function clipboardEventIncludesImage(event: ClipboardLikeEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  if (items.some((item) => item.kind === "file" && item.type?.startsWith("image/"))) {
    return true;
  }
  return Array.from(event.clipboardData?.files ?? []).some((file) => file.type?.startsWith("image/"));
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function imageAttachmentFromPasteResult(value: unknown): ImageAttachment | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (record.attached !== true) return null;
  const path = String(record.path ?? "");
  const fallbackName = path.split(/[\\/]/).pop() || "screenshot.png";
  return {
    id: `${path || fallbackName}-${Date.now()}`,
    name: String(record.name ?? fallbackName),
    path,
    width: optionalNumber(record.width),
    height: optionalNumber(record.height),
    tokenEstimate: optionalNumber(record.token_estimate),
  };
}

function imageAttachmentDetail(attachment: ImageAttachment) {
  const dimensions = attachment.width && attachment.height
    ? `${attachment.width}×${attachment.height}`
    : "";
  const tokens = attachment.tokenEstimate ? `~${attachment.tokenEstimate} tokens` : "";
  return [dimensions, tokens].filter(Boolean).join(" · ");
}

function sessionLabel(sessionId: string | null, sessions: SessionSummary[]) {
  if (!sessionId) return "Unknown session";
  const match = sessions.find((session) => session.id === sessionId);
  return match?.title?.trim() || sessionId.slice(0, 8);
}

function App() {
  const { colors, styles } = useDashboardTheme();
  const settings = useAppSettings();
  const hermes = useHermesRpc({ autoResumeOnConnect: settings.autoResumeOnConnect });
  const [draft, setDraft] = useState("");
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activePane, setActivePane] = useState<Pane>("chat");
  const [switchConfirmVisible, setSwitchConfirmVisible] = useState(false);
  const [interruptDisableConfirmVisible, setInterruptDisableConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ type: "new-chat" } | { type: "session"; sessionId: string } | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [hermesSettings, setHermesSettings] = useState<HermesSettingsState>(DEFAULT_HERMES_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSavingKey, setSettingsSavingKey] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState("Connect to the bridge to load Hermes settings.");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetSetting[]>([]);
  const [setupStatus, setSetupStatus] = useState<any>(null);
  const [configSections, setConfigSections] = useState<any[]>([]);
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [cronState, setCronState] = useState<any>(null);
  const [skillsState, setSkillsState] = useState<SkillSummary[]>([]);
  const [skillsHubBrowse, setSkillsHubBrowse] = useState<SkillHubBrowse>({ items: [], page: 1, total_pages: 1, total: 0 });
  const [skillsHubSearchResults, setSkillsHubSearchResults] = useState<SkillHubItem[]>([]);
  const [skillsSavingKey, setSkillsSavingKey] = useState<string | null>(null);
  const [commandCatalog, setCommandCatalog] = useState<any>(null);
  const [pluginsList, setPluginsList] = useState<PluginSummary[]>([]);
  const [pluginsSavingKey, setPluginsSavingKey] = useState<string | null>(null);
  const [pluginsRescanning, setPluginsRescanning] = useState(false);
  const [profileInfo, setProfileInfo] = useState<any>(null);
  const [browserState, setBrowserState] = useState<any>(null);
  const [auxLoading, setAuxLoading] = useState(false);
  const [auxMessage, setAuxMessage] = useState("");
  const [missionControlDismissed, setMissionControlDismissed] = useState(false);
  const [slashCompletions, setSlashCompletions] = useState<SlashCompletionResult>({ items: [] });
  const [slashCompletionOpen, setSlashCompletionOpen] = useState(false);
  const [slashMessage, setSlashMessage] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);
  const pasteInFlightRef = useRef(false);
  const drawerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hermes.delegationActive) return;
    setMissionControlDismissed(false);
  }, [hermes.delegationActive]);

  const refreshSessionsList = useCallback(async () => {
    if (!hermes.connected) return;
    setSessionsLoading(true);
    try {
      await hermes.refreshSessions();
    } catch (error: any) {
      console.warn(error?.message ?? error);
    } finally {
      setSessionsLoading(false);
    }
  }, [hermes.connected, hermes.refreshSessions]);

  useEffect(() => {
    if (!hermes.connected) return;
    void refreshSessionsList();
  }, [hermes.connected, refreshSessionsList]);

  useEffect(() => {
    Animated.timing(drawerProgress, {
      toValue: drawerOpen ? 1 : 0,
      duration: drawerOpen ? 220 : 180,
      useNativeDriver: false,
    }).start();
  }, [drawerOpen, drawerProgress]);

  const drawerTranslate = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-MAIN_MENU_WIDTH, 0],
  });

  const contentMarginLeft = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MAIN_MENU_WIDTH],
  });

  const attachClipboardImage = useCallback(async () => {
    if (!hermes.connected || hermes.isBlocked || !hermes.sessionId) {
      setAttachmentMessage("Open a connected chat before pasting screenshots.");
      return;
    }
    if (pasteInFlightRef.current) return;
    pasteInFlightRef.current = true;
    setAttachmentMessage("Attaching screenshot…");
    try {
      const result = await hermes.request("clipboard.paste");
      const attachment = imageAttachmentFromPasteResult(result);
      if (!attachment) {
        const message = result && typeof result === "object"
          ? String((result as Record<string, unknown>).message ?? "No image found in clipboard.")
          : "No image found in clipboard.";
        setAttachmentMessage(message);
        return;
      }
      setAttachedImages((prev) => [...prev, attachment]);
      setAttachmentMessage("Screenshot attached. Add a message or press Send.");
    } catch (error: any) {
      setAttachmentMessage(`Could not attach screenshot: ${error.message ?? "unknown error"}`);
    } finally {
      pasteInFlightRef.current = false;
    }
  }, [hermes.connected, hermes.isBlocked, hermes.request, hermes.sessionId]);

  const clearAttachedImages = useCallback(async () => {
    if (attachedImages.length === 0) return;
    try {
      await hermes.request("image.clear");
      setAttachedImages([]);
      setAttachmentMessage("");
    } catch (error: any) {
      setAttachmentMessage(`Could not clear screenshot: ${error.message ?? "unknown error"}`);
    }
  }, [attachedImages.length, hermes.request]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handlePaste = (event: Event) => {
      if (activePane !== "chat" || !composerFocused) return;
      const pasteEvent = event as ClipboardLikeEvent;
      if (!clipboardEventIncludesImage(pasteEvent)) return;
      pasteEvent.preventDefault?.();
      void attachClipboardImage();
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activePane, attachClipboardImage, composerFocused]);

  useEffect(() => {
    if (!hermes.connected || !composerFocused || !draft.startsWith("/")) {
      setSlashCompletionOpen(false);
      setSlashCompletions({ items: [] });
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void hermes.getSlashCompletions(draft).then((result: SlashCompletionResult) => {
        if (cancelled) return;
        setSlashCompletions(result);
        setSlashCompletionOpen(result.items.length > 0);
      }).catch((error: any) => {
        if (cancelled) return;
        setSlashCompletions({ items: [] });
        setSlashCompletionOpen(false);
        setSlashMessage(`Slash completion unavailable: ${error?.message ?? "unknown error"}`);
      });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [composerFocused, draft, hermes.connected, hermes.getSlashCompletions]);

  const applySlashCompletion = (item: SlashCompletionItem) => {
    const replaceFrom = slashCompletions.replace_from ?? (draft.includes(" ") ? draft.lastIndexOf(" ") + 1 : 1);
    const prefix = draft.slice(0, replaceFrom);
    const suffix = draft.slice(replaceFrom);
    const completion = replaceFrom === 1 && item.text.startsWith("/") ? item.text.slice(1) : item.text;
    setDraft(`${prefix}${completion}${suffix}`.trimEnd() + " ");
    setSlashCompletionOpen(false);
  };

  const submitSlashCommand = async (text: string) => {
    setSlashMessage("");
    await hermes.executeSlashCommand(text);
    setSlashCompletionOpen(false);
  };

  const { submitDraft } = useBusyAwareSubmit({
    busy: hermes.busy,
    isBlocked: hermes.isBlocked,
    promptQueue: hermes.promptQueue,
    queuePrompt: hermes.queuePrompt,
    steerNextQueuedPrompt: hermes.steerNextQueuedPrompt,
    sendPrompt: hermes.sendPrompt,
    interruptSession: hermes.interruptSession,
  });

  const submit = async () => {
    if (!hermes.connected) return;
    const text = draft;
    const hasAttachments = attachedImages.length > 0;
    try {
      if (text.trim().startsWith("/")) {
        await submitSlashCommand(text);
        setDraft("");
        setAttachedImages([]);
        setAttachmentMessage("");
        return;
      }

      const result = await submitDraft(text, { hasAttachments });
      if (result.action === "sent") {
        setDraft("");
        setAttachedImages([]);
        setAttachmentMessage("");
      } else if (result.cleared) {
        setDraft("");
      }
    } catch (error: any) {
      console.warn(error?.message ?? error);
    }
  };

  const runSafely = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error: any) {
      console.warn(error?.message ?? error);
    }
  };

  const stopTurn = async () => {
    if (!hermes.connected || (!hermes.busy && !hermes.isBlocked)) return;
    try {
      await hermes.interruptSession();
    } catch (error: any) {
      console.warn(error?.message ?? error);
    }
  };

  const composerAction = async () => {
    if (hermes.isBlocked) {
      await stopTurn();
      return;
    }
    await submit();
  };

  const renderComposer = () => (
    <View style={styles.composerShell}>
      {hermes.promptQueue.length > 0 ? (
        <PromptQueueStrip
          items={hermes.promptQueue}
          onRemove={hermes.removeQueuedPromptAt}
        />
      ) : null}

      {attachedImages.length > 0 || attachmentMessage ? (
        <View style={styles.attachmentTray}>
          {attachedImages.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentChip}>
              <ImageIcon color={colors.success} size={16} />
              <View style={styles.attachmentTextBlock}>
                <Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text>
                {imageAttachmentDetail(attachment) ? (
                  <Text style={styles.attachmentMeta} numberOfLines={1}>
                    {imageAttachmentDetail(attachment)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {attachedImages.length > 0 ? (
            <Pressable
              style={styles.clearAttachmentButton}
              onPress={() => void clearAttachedImages()}
              accessibilityRole="button"
              accessibilityLabel="Clear attached screenshots"
            >
              <X color={colors.destructiveText} size={14} />
              <Text style={styles.clearAttachmentText}>Clear</Text>
            </Pressable>
          ) : null}
          {attachmentMessage ? (
            <Text style={styles.attachmentMessage} numberOfLines={2}>{attachmentMessage}</Text>
          ) : null}
        </View>
      ) : null}

      {slashCompletionOpen ? (
        <View style={styles.slashPalette}>
          <View style={styles.slashPaletteHeader}>
            <Text style={styles.slashPaletteTitle}>Slash commands</Text>
            <Text style={styles.slashPaletteHint}>Enter to run · click to complete</Text>
          </View>
          {slashCompletions.items.slice(0, 8).map((item) => (
            <Pressable
              key={`${item.text}-${item.meta ?? ""}`}
              style={styles.slashCompletionRow}
              onPress={() => applySlashCompletion(item)}
              accessibilityRole="button"
              accessibilityLabel={`Complete ${item.display ?? item.text}`}
            >
              <Text style={styles.slashCompletionText}>{item.display ?? item.text}</Text>
              {item.meta ? <Text style={styles.slashCompletionMeta} numberOfLines={1}>{item.meta}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : slashMessage ? (
        <Text selectable style={styles.slashMessage}>{slashMessage}</Text>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          multiline
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          placeholder={
            hermes.isBlocked
              ? "Respond to the prompt above…"
              : hermes.busy
                ? "Queue a follow-up… Enter twice (empty) sends next queued message now"
                : hermes.connected
                  ? "Ask Hermes, type / for commands, or paste a screenshot…"
                  : "Connect to the bridge first…"
          }
          placeholderTextColor={colors.midgroundMuted}
          editable={hermes.connected && !hermes.isBlocked}
          onKeyPress={(event) => {
            if (Platform.OS !== "web") return;

            const native = event.nativeEvent as any;
            if (native.key !== "Enter") return;

            if (!native.shiftKey && !native.metaKey && !native.ctrlKey && !native.altKey) {
              event.preventDefault?.();
              void submit();
            }
          }}
        />
        {hermes.busy && !hermes.isBlocked ? (
          <Pressable
            style={styles.stopOnlyButton}
            onPress={() => void stopTurn()}
            accessibilityRole="button"
            accessibilityLabel="Stop current turn"
          >
            <Square color={colors.destructiveText} size={18} />
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.sendButton,
            hermes.isBlocked && styles.stopButton,
            (!hermes.connected || (!draft.trim() && attachedImages.length === 0 && !hermes.isBlocked)) && styles.sendDisabled,
          ]}
          disabled={
            !hermes.connected ||
            (!hermes.isBlocked && !draft.trim() && attachedImages.length === 0)
          }
          onPress={composerAction}
        >
          {hermes.isBlocked ? (
            <Square color={colors.destructiveText} size={18} />
          ) : (
            <Send color={colors.onBackground} size={18} />
          )}
          <Text style={[styles.sendText, hermes.isBlocked && styles.stopText]}>
            {hermes.isBlocked ? "Stop" : hermes.busy ? "Queue" : "Send"}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const newChatDisabled = !hermes.connected;
  const sessionSwitchDisabled = !hermes.connected;
  const newChatSubtitle = !hermes.connected
    ? "Connect to the bridge first"
    : (hermes.busy || hermes.isBlocked)
      ? "Start a separate chat while this one keeps running"
      : "Start a fresh session";
  const sessionsMenuDisabled = !hermes.connected;

  const switchSession = async (action: () => Promise<unknown>) => {
    await runSafely(action);
    void refreshSessionsList();
  };

  const loadHermesSettings = useCallback(async () => {
    if (!hermes.connected) {
      setSettingsMessage("Connect to the bridge to load Hermes settings.");
      return;
    }

    setSettingsLoading(true);
    setSettingsMessage("Loading Hermes settings…");
    try {
      const [modelOptions, reasoning, fast, busy, fullConfig, detailsMode, thinkingMode, compact, statusbar, mouse, indicator, voice, tools]: any[] = await Promise.all([
        hermes.getModelOptions(),
        hermes.getConfigValue("reasoning"),
        hermes.getConfigValue("fast"),
        hermes.getConfigValue("busy"),
        hermes.getConfigValue("full"),
        hermes.getConfigValue("details_mode"),
        hermes.getConfigValue("thinking_mode"),
        hermes.getConfigValue("compact"),
        hermes.getConfigValue("statusbar"),
        hermes.getConfigValue("mouse"),
        hermes.getConfigValue("indicator"),
        hermes.toggleVoice("status"),
        hermes.listToolsets(),
      ]);

      const modelSnapshot = normalizeModelOptions(modelOptions);
      const toolsetSnapshot = normalizeToolsets(tools);
      setProviders(modelSnapshot.providers);
      setToolsets(toolsetSnapshot);
      setHermesSettings(normalizeSettingsPayload({
        model: modelSnapshot.model,
        provider: modelSnapshot.provider,
        reasoning: String(reasoning?.value ?? DEFAULT_HERMES_SETTINGS.reasoning),
        reasoningDisplay: reasoning?.display === "show" ? "show" : "hide",
        fast: fast?.value === "fast" ? "fast" : "normal",
        busy: ["queue", "steer", "interrupt"].includes(String(busy?.value)) ? busy.value : DEFAULT_HERMES_SETTINGS.busy,
        verbose: ["off", "new", "all", "verbose"].includes(String(fullConfig?.config?.display?.tool_progress)) ? fullConfig.config.display.tool_progress : DEFAULT_HERMES_SETTINGS.verbose,
        detailsMode: ["hidden", "collapsed", "expanded"].includes(String(detailsMode?.value)) ? detailsMode.value : DEFAULT_HERMES_SETTINGS.detailsMode,
        thinkingMode: ["collapsed", "truncated", "full"].includes(String(thinkingMode?.value)) ? thinkingMode.value : DEFAULT_HERMES_SETTINGS.thinkingMode,
        compact: compact?.value === "on" ? "on" : "off",
        statusbar: ["off", "top", "bottom"].includes(String(statusbar?.value)) ? statusbar.value : DEFAULT_HERMES_SETTINGS.statusbar,
        mouse: mouse?.value === "off" ? "off" : "on",
        indicator: ["ascii", "emoji", "kaomoji", "unicode"].includes(String(indicator?.value)) ? indicator.value : DEFAULT_HERMES_SETTINGS.indicator,
        voiceEnabled: Boolean(voice?.enabled),
        voiceTts: Boolean(voice?.tts),
        voiceAvailable: typeof voice?.available === "boolean" ? voice.available : undefined,
        voiceDetails: typeof voice?.details === "string" ? voice.details : undefined,
      }));
      setSettingsMessage("Settings loaded. Some changes affect new CLI/TUI sessions only.");
    } catch (error: any) {
      setSettingsMessage(`Settings load failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSettingsLoading(false);
    }
  }, [hermes.connected, hermes.getConfigValue, hermes.getModelOptions, hermes.listToolsets, hermes.toggleVoice]);

  useEffect(() => {
    if (activePane === "settings") {
      void loadHermesSettings();
    }
  }, [activePane, hermes.connected, loadHermesSettings]);

  const saveHermesSetting = async (key: string, value: string) => {
    if (!hermes.connected) return;
    const savingKey = `${key}:${value}`;
    setSettingsSavingKey(savingKey);
    setSettingsMessage(`Saving ${key}…`);
    try {
      if (key === "reasoningDisplay") {
        await hermes.setConfigValue("reasoning", value);
      } else {
        const rpcKey = key === "detailsMode" ? "details_mode" : key === "thinkingMode" ? "thinking_mode" : key;
        await hermes.setConfigValue(rpcKey, value);
      }
      await loadHermesSettings();
      setSettingsMessage(`${key} set to ${value}.`);
    } catch (error: any) {
      setSettingsMessage(`Save failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSettingsSavingKey(null);
    }
  };

  const switchModel = async (model: string) => {
    if (!hermes.connected || !model) return;
    setSettingsSavingKey(`model:${model}`);
    setSettingsMessage(`Switching model to ${model}…`);
    try {
      await hermes.setConfigValue("model", model);
      await loadHermesSettings();
      setSettingsMessage(`Model switched to ${model}.`);
    } catch (error: any) {
      setSettingsMessage(`Model switch failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSettingsSavingKey(null);
    }
  };

  const toggleToolset = async (toolset: ToolsetSetting) => {
    if (!hermes.connected) return;
    const action = toolset.enabled ? "disable" : "enable";
    setSettingsSavingKey(`toolset:${toolset.name}`);
    setSettingsMessage(`${action === "enable" ? "Enabling" : "Disabling"} ${toolset.name}…`);
    try {
      await hermes.configureToolsets(action, [toolset.name]);
      await loadHermesSettings();
      setSettingsMessage(`${toolset.name} ${action === "enable" ? "enabled" : "disabled"}. Active sessions may be reset by Hermes.`);
    } catch (error: any) {
      setSettingsMessage(`Toolset update failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSettingsSavingKey(null);
    }
  };

  const setVoiceMode = async (mode: "on" | "off" | "tts") => {
    if (!hermes.connected) return;
    setSettingsSavingKey(`voice:${mode}`);
    setSettingsMessage(`Updating voice ${mode}…`);
    try {
      await hermes.toggleVoice(mode);
      await loadHermesSettings();
      setSettingsMessage("Voice settings updated.");
    } catch (error: any) {
      setSettingsMessage(`Voice update failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSettingsSavingKey(null);
    }
  };


  const loadAuxiliaryData = useCallback(async (pane: Pane = activePane) => {
    if (!hermes.connected) {
      setAuxMessage("Connect to the bridge to load this section.");
      return;
    }
    setAuxLoading(true);
    setAuxMessage("Loading live Hermes data…");
    try {
      if (pane === "models" || pane === "keys") {
        const [options, setup] = await Promise.all([hermes.getModelOptions(), hermes.request("setup.status")]);
        const modelSnapshot = normalizeModelOptions(options);
        setProviders(modelSnapshot.providers);
        setHermesSettings((prev) => normalizeSettingsPayload({ ...prev, model: modelSnapshot.model || prev.model, provider: modelSnapshot.provider || prev.provider }));
        setSetupStatus(setup);
      } else if (pane === "system" || pane === "logs") {
        const [config, profile, agents, browser] = await Promise.all([
          hermes.request("config.show"),
          hermes.getConfigValue("profile"),
          hermes.request("agents.list"),
          hermes.request("browser.manage", { action: "status" }),
        ]);
        setConfigSections(Array.isArray((config as any)?.sections) ? (config as any).sections : []);
        setProfileInfo(profile);
        setAgentsList(Array.isArray((agents as any)?.processes) ? (agents as any).processes : []);
        setBrowserState(browser);
      } else if (pane === "cron") {
        setCronState(await hermes.request("cron.manage", { action: "list" }));
      } else if (pane === "skills") {
        const [installed, browse] = await Promise.all([
          hermes.request("skills.listInstalled"),
          hermes.request("skills.manage", { action: "browse", page: 1 }),
        ]);
        setSkillsState(normalizeSkillsList(installed));
        setSkillsHubBrowse(normalizeSkillHubBrowse(browse));
        setSkillsHubSearchResults([]);
      } else if (pane === "commands") {
        setCommandCatalog(await hermes.request("commands.catalog"));
      } else if (pane === "plugins") {
        try {
          const result = await hermes.request("plugins.listDetailed");
          setPluginsList(normalizePluginsList(result));
        } catch {
          const legacy = await hermes.request("plugins.list");
          setPluginsList(normalizePluginsList(legacy));
        }
      } else if (pane === "tools") {
        const tools = await hermes.listToolsets();
        setToolsets(normalizeToolsets(tools));
      }
      setAuxMessage("Loaded from Hermes bridge.");
    } catch (error: any) {
      setAuxMessage(`Load failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  }, [activePane, hermes.connected, hermes.getConfigValue, hermes.getModelOptions, hermes.listToolsets, hermes.request]);

  useEffect(() => {
    if (!hermes.connected) return;
    if (["models", "tools", "keys", "system", "logs", "cron", "skills", "commands", "plugins"].includes(activePane)) {
      void loadAuxiliaryData(activePane);
    }
  }, [activePane, hermes.connected, loadAuxiliaryData]);

  const reloadEnv = async () => {
    if (!hermes.connected) return;
    setAuxLoading(true);
    setAuxMessage("Reloading .env…");
    try {
      const result: any = await hermes.request("reload.env");
      await loadAuxiliaryData("keys");
      setAuxMessage(`Reloaded ${Number(result?.updated ?? 0)} environment value(s).`);
    } catch (error: any) {
      setAuxMessage(`Reload failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  };

  const reloadSkills = async () => {
    if (!hermes.connected) return;
    setAuxLoading(true);
    setAuxMessage("Reloading skills…");
    try {
      const result: any = await hermes.request("skills.reload");
      await loadAuxiliaryData("skills");
      setAuxMessage(String(result?.output ?? "Skills reloaded."));
    } catch (error: any) {
      setAuxMessage(`Reload failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  };

  const toggleSkill = async (skill: SkillSummary) => {
    if (!hermes.connected || !skill.name) return;
    const enabled = skill.enabled === false;
    setSkillsSavingKey(`skill:${skill.name}`);
    setAuxMessage(`${enabled ? "Enabling" : "Disabling"} ${skill.name}…`);
    try {
      await hermes.request("skills.toggle", { name: skill.name, enabled });
      setSkillsState((prev) => prev.map((entry) => (
        entry.name === skill.name ? { ...entry, enabled } : entry
      )));
      setAuxMessage(`${skill.name} ${enabled ? "enabled" : "disabled"}.`);
    } catch (error: any) {
      setAuxMessage(`Skill update failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSkillsSavingKey(null);
    }
  };

  const searchSkillsHub = async (query: string) => {
    if (!hermes.connected) return;
    setAuxLoading(true);
    setAuxMessage(`Searching skills hub for "${query}"…`);
    try {
      const result: any = await hermes.request("skills.manage", { action: "search", query });
      setSkillsHubSearchResults(Array.isArray(result?.results) ? result.results : []);
      setAuxMessage(`Found ${Array.isArray(result?.results) ? result.results.length : 0} result(s).`);
    } catch (error: any) {
      setAuxMessage(`Search failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  };

  const browseSkillsHub = async (page: number) => {
    if (!hermes.connected) return;
    setAuxLoading(true);
    setAuxMessage(`Loading skills hub page ${page}…`);
    try {
      const result: any = await hermes.request("skills.manage", { action: "browse", page });
      setSkillsHubBrowse(normalizeSkillHubBrowse(result));
      setSkillsHubSearchResults([]);
      setAuxMessage(`Loaded page ${page}.`);
    } catch (error: any) {
      setAuxMessage(`Browse failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  };

  const installSkill = async (name: string) => {
    if (!hermes.connected || !name.trim()) return;
    const trimmed = name.trim();
    setSkillsSavingKey(`install:${trimmed}`);
    setAuxMessage(`Installing ${trimmed}…`);
    try {
      await hermes.request("skills.manage", { action: "install", query: trimmed });
      const reloadResult: any = await hermes.request("skills.reload");
      await loadAuxiliaryData("skills");
      setAuxMessage(String(reloadResult?.output ?? `${trimmed} installed.`));
    } catch (error: any) {
      setAuxMessage(`Install failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setSkillsSavingKey(null);
    }
  };

  const reloadMcp = async () => {
    if (!hermes.connected) return;
    setAuxLoading(true);
    setAuxMessage("Reloading MCP/tools…");
    try {
      const result: any = await hermes.request("reload.mcp", { confirm: true });
      await loadAuxiliaryData("plugins");
      setAuxMessage(String(result?.status ?? "MCP reloaded."));
    } catch (error: any) {
      setAuxMessage(`Reload failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setAuxLoading(false);
    }
  };

  const rescanPlugins = async () => {
    if (!hermes.connected) return;
    setPluginsRescanning(true);
    setAuxMessage("Rescanning plugins…");
    try {
      const result: any = await hermes.request("plugins.listDetailed", { force: true });
      setPluginsList(normalizePluginsList(result));
      setAuxMessage(`Rescanned ${normalizePluginsList(result).length} plugin(s).`);
    } catch (error: any) {
      setAuxMessage(`Rescan failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setPluginsRescanning(false);
    }
  };

  const togglePlugin = async (plugin: PluginSummary) => {
    if (!hermes.connected) return;
    const name = pluginRegistryName(plugin);
    if (!name) return;
    const enabled = plugin.enabled === false;
    setPluginsSavingKey(`plugin:${name}`);
    setAuxMessage(`${enabled ? "Enabling" : "Disabling"} ${name}…`);
    try {
      await hermes.request("plugins.toggle", { name, enabled });
      setPluginsList((prev) => prev.map((entry) => (
        pluginRegistryName(entry) === name ? { ...entry, enabled } : entry
      )));
      setAuxMessage(`${name} ${enabled ? "enabled" : "disabled"}. New sessions pick this up automatically.`);
    } catch (error: any) {
      setAuxMessage(`Plugin update failed: ${error?.message ?? "unknown error"}`);
    } finally {
      setPluginsSavingKey(null);
    }
  };


  const selectPane = (pane: MainMenuPane) => {
    setActivePane(pane);
    setDrawerOpen(false);
    if (pane === "sessions" && hermes.connected) {
      void refreshSessionsList();
    }
    if (pane === "settings" && hermes.connected) {
      void loadHermesSettings();
    }
    if (["models", "tools", "keys", "system", "logs", "cron", "skills", "commands", "plugins"].includes(pane) && hermes.connected) {
      void loadAuxiliaryData(pane);
    }
  };

  const performNewChat = () => {
    setActivePane("chat");
    setDrawerOpen(false);
    void switchSession(hermes.createSession);
  };

  const performResumeSession = (sessionId: string) => {
    setActivePane("chat");
    setDrawerOpen(false);
    void switchSession(() => hermes.resumeSession(sessionId));
  };

  const requestSwitch = (next: { type: "new-chat" } | { type: "session"; sessionId: string }) => {
    if (!hermes.connected) return;
    if (next.type === "session" && hermes.matchesActiveSession(next.sessionId)) {
      setActivePane("chat");
      setDrawerOpen(false);
      return;
    }
    // Switching chats never stops background agents — that's the multi-agent model.
    if (next.type === "session") {
      performResumeSession(next.sessionId);
      return;
    }
    // New chat also creates a separate Hermes session. The current agent keeps
    // running until the user explicitly stops it.
    performNewChat();
  };

  const startNewChat = () => {
    requestSwitch({ type: "new-chat" });
  };

  const openSession = (sessionId: string) => {
    requestSwitch({ type: "session", sessionId });
  };

  const confirmSwitch = async () => {
    const next = pendingSwitch;
    setSwitchConfirmVisible(false);
    setPendingSwitch(null);
    if (!next) return;
    if (next.type === "new-chat") {
      performNewChat();
    }
  };

  const cancelSwitch = () => {
    setSwitchConfirmVisible(false);
    setPendingSwitch(null);
  };

  const requestInterruptToggle = () => {
    if (settings.interruptOnNewChat) {
      setInterruptDisableConfirmVisible(true);
      return;
    }
    settings.setInterruptOnNewChat(true);
  };

  const confirmInterruptDisable = () => {
    setInterruptDisableConfirmVisible(false);
    settings.setInterruptOnNewChat(false);
  };

  const cancelInterruptDisable = () => {
    setInterruptDisableConfirmVisible(false);
  };

  const handleMenuNewChat = () => {
    startNewChat();
  };

  const activeSession = hermes.sessions.find(
    (session) => session.id === hermes.sessionId || session.id === hermes.activeDbSessionId,
  );
  const activeRuntime = hermes.sessionId
    ? hermes.resolveSessionRuntime(hermes.activeDbSessionId ?? hermes.sessionId)
    : undefined;
  const backgroundRunningRuntime = hermes.backgroundRunningSessionId
    ? hermes.resolveSessionRuntime(hermes.backgroundRunningSessionId)
    : undefined;
  const activeRunningSessionId = activeRuntime?.running
    ? hermes.activeDbSessionId ?? hermes.sessionId
    : null;
  const activeRunningLabel = sessionLabel(activeRunningSessionId, hermes.sessions);
  const backgroundRunningLabel = sessionLabel(
    hermes.backgroundRunningSessionId,
    hermes.sessions,
  );
  const visibleRunningSessionId = hermes.backgroundRunningSessionId ?? activeRunningSessionId;
  const visibleRunningRuntime = hermes.backgroundRunningSessionId
    ? backgroundRunningRuntime
    : activeRuntime;
  const visibleRunningLabel = hermes.backgroundRunningSessionId
    ? backgroundRunningLabel
    : activeRunningLabel;
  const visibleRunningIsActive = !hermes.backgroundRunningSessionId && Boolean(activeRunningSessionId);
  const showMissionControl =
    activePane === "chat" && hermes.delegationActive && !missionControlDismissed;

  const chatPaneTitle = showMissionControl
    ? "Mission Control"
    : activeSession?.title?.trim() || "Chat";
  const chatPaneSubtitle = showMissionControl
    ? "Tracking delegated subagents, tools, and reasoning."
    : activeRuntime?.running
      ? activeRuntime.activity || "Hermes is working in this chat."
      : activeSession?.preview?.trim()
        || (hermes.sessionId ? `${hermes.messages.length} messages in this chat` : "Open Sessions to resume a chat or start a new one.");
  const headerStatus = activeRuntime?.running
    ? `Running in this chat · ${activeRuntime.activity || "Working…"}`
    : hermes.backgroundRunningSessionId
      ? hermes.status
      : hermes.status;
  const paneTitle = activePane === "chat" ? chatPaneTitle : ({
    sessions: "Sessions",
    activity: "Activity",
    settings: "Settings",
    commands: "Commands",
    models: "Models",
    tools: "Tools",
    skills: "Skills",
    plugins: "Plugins",
    cron: "Cron",
    keys: "Keys",
    system: "System",
    logs: "Runtime",
  } as Record<Exclude<Pane, "chat">, string>)[activePane];
  const paneSubtitle = activePane === "chat" ? chatPaneSubtitle : ({
    sessions: "Pick a recent conversation to open it in chat.",
    activity: "Inspect tool calls and runtime activity.",
    settings: "Bridge connection, models, toolsets, and session behavior.",
    commands: "Slash command catalog and autocomplete reference.",
    models: "Provider and model picker backed by Hermes /model.",
    tools: "Toolset enablement backed by Hermes tool configuration.",
    skills: "Installed skills, hub browse, and enable/disable controls.",
    plugins: "Installed plugins with enable/disable, rescan, and MCP reload.",
    cron: "Scheduled Hermes jobs.",
    keys: "Credential setup status without exposing secret values.",
    system: "Profile, config, and live process status.",
    logs: "Runtime process and browser integration status.",
  } as Record<Exclude<Pane, "chat">, string>)[activePane];

  const requestDeleteSession = (sessionId: string) => {
    setPendingDeleteSessionId(sessionId);
    setDeleteConfirmVisible(true);
  };

  const confirmDeleteSession = () => {
    const target = pendingDeleteSessionId;
    setDeleteConfirmVisible(false);
    setPendingDeleteSessionId(null);
    if (!target) return;
    void runSafely(() => hermes.deleteSession(target));
  };

  const cancelDeleteSession = () => {
    setDeleteConfirmVisible(false);
    setPendingDeleteSessionId(null);
  };

  const renderChatPane = () => {
    if (showMissionControl) {
      return (
        <MissionControlView
          tree={hermes.subagentTree}
          status={hermes.status}
          busy={hermes.busy}
          liveReasoning={hermes.liveAssistantTurn?.reasoning}
          liveStreaming={hermes.liveAssistantTurn?.status === "streaming"}
          onStop={() => void runSafely(() => hermes.interruptSession())}
          onViewChat={() => setMissionControlDismissed(true)}
          composer={renderComposer()}
        />
      );
    }

    return (
    <View style={styles.chatPane}>
      <View style={styles.chatMain}>
        <ChatTranscript
          scrollRef={scrollRef}
          scrollKey={hermes.sessionId ?? hermes.activeDbSessionId}
          messages={hermes.messages}
          emptyState={<DefaultEmptyTranscript />}
        />

        {renderComposer()}
      </View>

      <View style={styles.activitySidebar}>
        {renderActivityFeed("compact")}
      </View>
    </View>
    );
  };

  const renderActivityFeed = (mode: "full" | "compact" = "full") => {
    const compact = mode === "compact";
    const body = (
      <>
        <Text selectable style={styles.sectionTitle}>Tool activity</Text>
        <Text selectable style={styles.sectionSubtitle}>{hermes.tools.length} recent tool calls</Text>
        {hermes.tools.length === 0 ? (
          <View style={compact ? styles.compactEmptyState : styles.emptyState}>
            <Text selectable style={compact ? styles.compactEmptyTitle : styles.emptyTitle}>Nothing running yet.</Text>
            <Text selectable style={compact ? styles.compactEmptyText : styles.emptyText}>Tool calls, progress, and results will appear here while Hermes works.</Text>
          </View>
        ) : (
          hermes.tools.map((tool) => <ToolActivityCard key={tool.id} tool={tool} compact={compact} />)
        )}
      </>
    );

    if (compact) {
      return (
        <ScrollView
          style={styles.activitySidebarScroll}
          contentContainerStyle={styles.activityFeedCompact}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      );
    }

    return <View style={styles.activityFeedFull}>{body}</View>;
  };

  const renderActivityPane = () => (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      {renderActivityFeed("full")}
    </ScrollView>
  );

  const renderSessionsPane = () => (
    <SessionsSection
      sessions={hermes.sessions}
      sessionRuntime={hermes.sessionRuntime}
      sessionKeyByGatewayId={hermes.sessionKeyByGatewayId}
      gatewayIdBySessionKey={hermes.gatewayIdBySessionKey}
      activeGatewaySessionId={hermes.sessionId}
      activeDbSessionId={hermes.activeDbSessionId}
      resolveSessionRuntime={hermes.resolveSessionRuntime}
      loading={sessionsLoading}
      connected={hermes.connected}
      sessionSwitchDisabled={sessionSwitchDisabled}
      canSwitchToSession={hermes.canSwitchToSession}
      viewMode={settings.sessionsViewMode}
      onViewModeChange={settings.setSessionsViewMode}
      onRefresh={() => void refreshSessionsList()}
      onSelectSession={openSession}
      onDeleteSession={requestDeleteSession}
    />
  );


  const renderActivePane = () => {
    switch (activePane) {
      case "sessions":
        return renderSessionsPane();
      case "activity":
        return renderActivityPane();
      case "settings":
        return (
          <SettingsPane
            connected={hermes.connected}
            url={hermes.url}
            status={hermes.status}
            setUrl={hermes.setUrl}
            settings={{
              interruptOnNewChat: settings.interruptOnNewChat,
              setInterruptOnNewChat: () => requestInterruptToggle(),
              autoResumeOnConnect: settings.autoResumeOnConnect,
              setAutoResumeOnConnect: settings.setAutoResumeOnConnect,
            }}
            hermesSettings={hermesSettings}
            providers={providers}
            toolsets={toolsets}
            loading={settingsLoading}
            savingKey={settingsSavingKey}
            message={settingsMessage}
            onRefresh={() => void loadHermesSettings()}
            onSaveSetting={(key, value) => void saveHermesSetting(key, value)}
            onSwitchModel={(model) => void switchModel(model)}
            onToggleToolset={(toolset) => void toggleToolset(toolset)}
            onSetVoiceMode={(mode) => void setVoiceMode(mode)}
          />
        );
      case "commands":
        return (
          <CommandsPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            commandCatalog={commandCatalog}
            onRefresh={() => void loadAuxiliaryData("commands")}
          />
        );
      case "models":
        return (
          <ModelsPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            savingKey={settingsSavingKey}
            hermesSettings={hermesSettings}
            providers={providers}
            onRefresh={() => void loadAuxiliaryData("models")}
            onSwitchModel={(model) => void switchModel(model)}
          />
        );
      case "tools":
        return (
          <ToolsPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            savingKey={settingsSavingKey}
            toolsets={toolsets}
            onRefresh={() => void loadAuxiliaryData("tools")}
            onToggleToolset={(toolset) => void toggleToolset(toolset)}
          />
        );
      case "skills":
        return (
          <SkillsPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            savingKey={skillsSavingKey}
            skills={skillsState}
            hubBrowse={skillsHubBrowse}
            hubSearchResults={skillsHubSearchResults}
            onRefresh={() => void loadAuxiliaryData("skills")}
            onReload={() => void reloadSkills()}
            onToggleSkill={(skill) => void toggleSkill(skill)}
            onSearchHub={(query) => void searchSkillsHub(query)}
            onBrowseHub={(page) => void browseSkillsHub(page)}
            onInstallSkill={(name) => void installSkill(name)}
          />
        );
      case "plugins":
        return (
          <PluginsPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            savingKey={pluginsSavingKey}
            rescanning={pluginsRescanning}
            plugins={pluginsList}
            onRefresh={() => void loadAuxiliaryData("plugins")}
            onRescan={() => void rescanPlugins()}
            onReloadMcp={() => void reloadMcp()}
            onTogglePlugin={(plugin) => void togglePlugin(plugin)}
          />
        );
      case "cron":
        return (
          <CronPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            cronState={cronState}
            onRefresh={() => void loadAuxiliaryData("cron")}
          />
        );
      case "keys":
        return (
          <KeysPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            setupStatus={setupStatus}
            onRefresh={() => void loadAuxiliaryData("keys")}
            onReloadEnv={() => void reloadEnv()}
          />
        );
      case "system":
      case "logs":
        return (
          <SystemPane
            connected={hermes.connected}
            loading={auxLoading}
            message={auxMessage}
            showRuntime={activePane === "logs"}
            agents={agentsList}
            browserState={browserState}
            profileInfo={profileInfo}
            configSections={configSections}
            onRefresh={() => void loadAuxiliaryData(activePane)}
          />
        );
      case "chat":
      default:
        return renderChatPane();
    }
  };

  const pendingSession = pendingSwitch?.type === "session"
    ? hermes.sessions.find((session) => session.id === pendingSwitch.sessionId)
    : null;
  const switchConfirmTitle = pendingSwitch?.type === "session" ? "Switch chats?" : "Stop current session?";
  const switchConfirmMessage =
    pendingSwitch?.type === "session"
      ? hermes.isBlocked
        ? `You have a pending prompt or approval. Opening "${pendingSession?.title || "this chat"}" will cancel it and load that conversation here.`
        : `Hermes is still working on a reply. Opening "${pendingSession?.title || "this chat"}" will stop the current turn and load that conversation here.`
      : hermes.isBlocked
        ? "You have a pending prompt or approval. Starting a new chat will cancel it, stop the current turn, and open a fresh session."
        : "Hermes is still working on a reply. Starting a new chat will stop the current turn and open a fresh session.";
  const switchConfirmLabel = pendingSwitch?.type === "session" ? "Open chat" : "New chat";

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <BlockingOverlays
        overlay={hermes.overlay}
        onApprovalChoice={hermes.answerApproval}
        onClarifyAnswer={hermes.answerClarify}
        onSudoSubmit={hermes.answerSudo}
        onSecretSubmit={hermes.answerSecret}
      />
      <ConfirmModal
        visible={switchConfirmVisible}
        title={switchConfirmTitle}
        message={switchConfirmMessage}
        confirmLabel={switchConfirmLabel}
        onConfirm={confirmSwitch}
        onCancel={cancelSwitch}
      />
      <ConfirmModal
        visible={interruptDisableConfirmVisible}
        title={INTERRUPT_DISABLE_CONFIRM_TITLE}
        message={INTERRUPT_DISABLE_CONFIRM_MESSAGE}
        confirmLabel="Turn off"
        cancelLabel="Keep on"
        onConfirm={confirmInterruptDisable}
        onCancel={cancelInterruptDisable}
      />
      <ConfirmModal
        visible={deleteConfirmVisible}
        title="Delete session?"
        message={`Delete "${pendingDeleteSessionId?.slice(0, 8) ?? "this session"}" permanently? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteSession}
        onCancel={cancelDeleteSession}
      />

      <Animated.View style={[styles.mainMenu, { transform: [{ translateX: drawerTranslate }] }]}>
        <MainMenu
          activePane={activePane}
          status={headerStatus}
          messageCount={hermes.messages.length}
          sessionCount={hermes.sessions.length}
          toolCount={hermes.tools.length}
          runningSessionLabel={
            hermes.backgroundRunningSessionId
              ? backgroundRunningLabel
              : activeRuntime?.running
                ? sessionLabel(hermes.sessionId, hermes.sessions)
                : null
          }
          runningSessionActivity={
            hermes.backgroundRunningSessionId
              ? backgroundRunningRuntime?.activity
              : activeRuntime?.activity
          }
          newChatDisabled={newChatDisabled}
          newChatSubtitle={newChatSubtitle}
          sessionsDisabled={sessionsMenuDisabled}
          interruptOnNewChat={settings.interruptOnNewChat}
          onSelectPane={selectPane}
          onNewChat={handleMenuNewChat}
          onToggleInterrupt={requestInterruptToggle}
          onClose={() => setDrawerOpen(false)}
        />
      </Animated.View>

      <Animated.View style={[styles.contentShell, { marginLeft: contentMarginLeft }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.menuButton}
              onPress={() => setDrawerOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Toggle main menu"
            >
              <Menu color={colors.midground} size={22} />
            </Pressable>
            <View>
              <Text selectable style={styles.title}>Hermes Native GUI</Text>
              <Text selectable style={styles.subtitle}>{headerStatus}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {(activeRuntime?.running || hermes.backgroundRunningSessionId) ? (
              <View style={styles.headerRunningPill}>
                <SessionStatusBadge
                  runtime={
                    hermes.backgroundRunningSessionId
                      ? backgroundRunningRuntime
                      : activeRuntime
                  }
                  compact
                />
                <Text selectable style={styles.headerRunningText} numberOfLines={1}>
                  {visibleRunningIsActive ? "Running here" : `Running: ${visibleRunningLabel}`}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.secondaryButton, newChatDisabled && styles.sendDisabled]}
              onPress={startNewChat}
              disabled={newChatDisabled}
            >
              <Text style={styles.secondaryText}>New chat</Text>
            </Pressable>
            <Pressable
              style={[styles.connectionButton, hermes.connected ? styles.disconnect : styles.connect]}
              onPress={hermes.connected ? hermes.disconnect : hermes.connect}
              disabled={hermes.connecting}
            >
              {hermes.connecting ? (
                <ActivityIndicator color={colors.onBackground} />
              ) : hermes.connected ? (
                <WifiOff color={colors.destructiveText} size={18} />
              ) : (
                <Wifi color={colors.onBackground} size={18} />
              )}
              <Text style={[styles.connectionText, hermes.connected && styles.disconnectText]}>
                {hermes.connected ? "Disconnect" : "Connect"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.paneChrome}>
          <View style={styles.paneChromeRow}>
            <View style={styles.paneChromeText}>
              <Text selectable style={styles.paneTitle}>{paneTitle}</Text>
              <Text selectable style={styles.paneSubtitle}>{paneSubtitle}</Text>
            </View>
            {activePane === "chat" && activeRuntime ? (
              <SessionStatusBadge runtime={activeRuntime} active={Boolean(hermes.sessionId)} />
            ) : null}
          </View>
        </View>

        {visibleRunningSessionId ? (
          <RunningSessionBanner
            sessionLabel={visibleRunningLabel}
            sessionId={visibleRunningSessionId}
            runtime={visibleRunningRuntime}
            active={visibleRunningIsActive}
            onOpen={() => {
              if (visibleRunningIsActive) {
                setActivePane("chat");
                return;
              }
              openSession(visibleRunningSessionId);
            }}
          />
        ) : null}

        {activePane === "chat" && hermes.delegationActive && missionControlDismissed ? (
          <Pressable
            style={styles.missionControlBanner}
            onPress={() => setMissionControlDismissed(false)}
          >
            <Text style={styles.missionControlBannerText}>
              Delegation in progress · Open Mission Control
            </Text>
          </Pressable>
        ) : null}

        {renderActivePane()}
      </Animated.View>
    </SafeAreaView>
  );
}

export default function AppRoot() {
  useEffect(() => {
    injectWebScrollbarStyles();
  }, []);

  return (
    <DashboardThemeProvider>
      <App />
    </DashboardThemeProvider>
  );
}
