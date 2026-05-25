import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { HermesSettingsState, ProviderOption, SettingDefinition, ToolsetSetting } from "../hermesSettings";
import { HERMES_SETTING_GROUPS, HERMES_SETTING_SAVE_BEHAVIOR } from "../hermesSettings";
import { Card, ChoiceChip, EmptyState, PaneScroll, SectionHeader, SecondaryButton, MiniBadge } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type LocalAppSettings = {
  interruptOnNewChat: boolean;
  setInterruptOnNewChat: (value: boolean) => void;
  autoResumeOnConnect: boolean;
  setAutoResumeOnConnect: (value: boolean) => void;
};

export type SettingsPaneProps = {
  connected: boolean;
  url: string;
  status: string;
  setUrl: (url: string) => void;
  settings: LocalAppSettings;
  hermesSettings: HermesSettingsState;
  providers: ProviderOption[];
  toolsets: ToolsetSetting[];
  loading: boolean;
  savingKey: string | null;
  message: string;
  onRefresh: () => void;
  onSaveSetting: (key: string, value: string) => void;
  onSwitchModel: (model: string) => void;
  onToggleToolset: (toolset: ToolsetSetting) => void;
  onSetVoiceMode: (mode: "on" | "off" | "tts") => void;
};

function SettingControl({
  definition,
  value,
  saving,
  savingKey,
  connected,
  onSave,
}: {
  definition: SettingDefinition;
  value: string;
  saving: boolean;
  savingKey: string | null;
  connected: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const { styles } = useDashboardTheme();
  const behavior = HERMES_SETTING_SAVE_BEHAVIOR[definition.key] ?? "saved";
  return (
    <View style={styles.settingBlock}>
      <Text selectable style={styles.settingRowTitle}>{definition.title}</Text>
      <Text selectable style={styles.settingHelp}>{definition.description}</Text>
      <View style={styles.chipWrap}>
        {definition.options.map((option) => {
          const selected = value === option.value;
          const key = `${definition.key}:${option.value}`;
          return (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={selected}
              loading={savingKey === key}
              disabled={saving || selected || !connected}
              onPress={() => onSave(definition.key, option.value)}
            />
          );
        })}
      </View>
      <Text selectable style={styles.settingHelp}>{behavior}</Text>
    </View>
  );
}

export function SettingsPane({
  connected,
  url,
  status,
  setUrl,
  settings,
  hermesSettings,
  providers,
  toolsets,
  loading,
  savingKey,
  message,
  onRefresh,
  onSaveSetting,
  onSwitchModel,
  onToggleToolset,
  onSetVoiceMode,
}: SettingsPaneProps) {
  const { styles, colors } = useDashboardTheme();
  const saving = Boolean(savingKey || loading);
  const activeProvider = providers.find((p) => p.slug === hermesSettings.provider || p.is_current);
  const activeProviderModels = activeProvider?.models ?? [];
  const visibleProviders = providers.filter((p) => p.authenticated || p.is_current).slice(0, 8);

  return (
    <PaneScroll>
      <Card>
        <View style={styles.panelHeaderRow}>
          <View style={styles.settingRowText}>
            <SectionHeader
              title="Hermes TUI settings"
              subtitle="Schema-rendered controls backed by the same JSON-RPC/config handlers as /model, /reasoning, /verbose, /busy, /voice, /tools, and display toggles."
            />
          </View>
          <SecondaryButton
            label={loading ? "Loading" : "Refresh"}
            onPress={onRefresh}
            disabled={!connected || loading}
            icon={loading ? <ActivityIndicator color={colors.midground} /> : undefined}
          />
        </View>
        <Text selectable style={styles.settingHelp}>{message}</Text>
      </Card>

      <Card>
        <SectionHeader title="Session behavior" subtitle="Native GUI behavior stored locally in this app." />
        <Pressable
          style={styles.settingRow}
          onPress={() => settings.setInterruptOnNewChat(!settings.interruptOnNewChat)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.interruptOnNewChat }}
        >
          <View style={styles.settingRowText}>
            <Text style={styles.settingRowTitle}>Interrupt before switching</Text>
            <Text selectable style={styles.settingHelp}>
              Stop the running reply before starting a new chat or resuming another session. When off, wait for the turn to finish or press Stop.
            </Text>
          </View>
          <View style={[styles.toggle, settings.interruptOnNewChat && styles.toggleOn]}>
            <View style={[styles.toggleKnob, settings.interruptOnNewChat && styles.toggleKnobOn]} />
          </View>
        </Pressable>
        <Pressable
          style={styles.settingRow}
          onPress={() => settings.setAutoResumeOnConnect(!settings.autoResumeOnConnect)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.autoResumeOnConnect }}
        >
          <View style={styles.settingRowText}>
            <Text style={styles.settingRowTitle}>Auto-resume on connect</Text>
            <Text selectable style={styles.settingHelp}>
              After connecting to the bridge, open your most recent Hermes session instead of creating a new chat.
            </Text>
          </View>
          <View style={[styles.toggle, settings.autoResumeOnConnect && styles.toggleOn]}>
            <View style={[styles.toggleKnob, settings.autoResumeOnConnect && styles.toggleKnobOn]} />
          </View>
        </Pressable>
      </Card>

      <Card>
        <SectionHeader
          title="Model"
          subtitle={`Current: ${hermesSettings.model || "unknown"}${hermesSettings.provider ? ` · ${hermesSettings.provider}` : ""}`}
        />
        {visibleProviders.length ? (
          visibleProviders.map((provider) => (
            <View key={provider.slug} style={styles.providerBlock}>
              <View style={styles.panelHeaderRow}>
                <View style={styles.settingRowText}>
                  <Text selectable style={styles.settingRowTitle}>{provider.name || provider.slug}</Text>
                  <Text selectable style={styles.settingHelp}>
                    {provider.is_current ? "Current provider" : provider.authenticated ? "Authenticated" : provider.warning || "Not configured"}
                  </Text>
                </View>
              </View>
              {provider.models?.length ? (
                <View style={styles.chipWrap}>
                  {provider.models.slice(0, provider.is_current ? 12 : 6).map((model) => {
                    const selected = model === hermesSettings.model;
                    return (
                      <ChoiceChip
                        key={model}
                        label={model}
                        selected={selected}
                        loading={savingKey === `model:${model}`}
                        disabled={saving || selected || !connected}
                        onPress={() => onSwitchModel(model)}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <EmptyState
            title="No configured providers yet"
            message="Connect and refresh to show configured providers. Use Hermes model setup for OAuth providers or first-time API-key setup."
          />
        )}
        {activeProviderModels.length > 12 ? <Text selectable style={styles.settingHelp}>Showing curated model shortcuts; use /model for the full picker.</Text> : null}
      </Card>

      {HERMES_SETTING_GROUPS.map((group) => (
        <Card key={group.title}>
          <SectionHeader title={group.title} subtitle={group.description} />
          {group.settings.map((definition) => (
            <SettingControl
              key={definition.key}
              definition={definition}
              value={String((hermesSettings as any)[definition.key] ?? "")}
              saving={saving}
              savingKey={savingKey}
              connected={connected}
              onSave={onSaveSetting}
            />
          ))}
        </Card>
      ))}

      <Card>
        <SectionHeader title="Voice" subtitle="Runtime voice mode mirrors /voice. TTS can only be enabled after voice mode is on." />
        <View style={styles.chipWrap}>
          <ChoiceChip
            label={hermesSettings.voiceEnabled ? "Voice on" : "Voice off"}
            selected={hermesSettings.voiceEnabled}
            disabled={saving || !connected}
            onPress={() => onSetVoiceMode(hermesSettings.voiceEnabled ? "off" : "on")}
          />
          <ChoiceChip
            label="Reply TTS"
            selected={hermesSettings.voiceTts}
            disabled={saving || !connected || !hermesSettings.voiceEnabled}
            onPress={() => onSetVoiceMode("tts")}
          />
        </View>
        <Text selectable style={styles.settingHelp}>
          {hermesSettings.voiceAvailable === false ? "Voice dependencies missing. " : ""}{hermesSettings.voiceDetails || "Use the configured voice record key in TUI for recording."}
        </Text>
      </Card>

      <Card>
        <SectionHeader title="Toolsets" subtitle="Enable or disable CLI/TUI toolsets. Hermes may reset the active session so prompt cache stays valid." />
        <View style={styles.toolsetGrid}>
          {toolsets.length ? toolsets.map((toolset) => (
            <Pressable
              key={toolset.name}
              style={[styles.toolsetCard, toolset.enabled && styles.toolsetCardOn, saving && styles.disabled]}
              onPress={() => onToggleToolset(toolset)}
              disabled={saving || !connected}
            >
              <View style={styles.panelHeaderRow}>
                <Text selectable style={styles.toolName}>{toolset.name}</Text>
                <MiniBadge label={toolset.enabled ? "On" : "Off"} active={toolset.enabled} />
              </View>
              <Text selectable style={styles.toolStatus}>{toolset.tool_count} tools</Text>
              <Text selectable style={styles.toolPreview} numberOfLines={3}>{toolset.description}</Text>
            </Pressable>
          )) : (
            <EmptyState title="No toolsets loaded" message="Connect and refresh to inspect available Hermes toolsets." />
          )}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Bridge WebSocket" subtitle="Local bridge endpoint used by the native GUI." />
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          editable={!connected}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text selectable style={styles.settingHelp}>
          Localhost only (`ws://127.0.0.1` or `ws://localhost`). Disconnect before editing. Current status: {status}
        </Text>
      </Card>
    </PaneScroll>
  );
}
