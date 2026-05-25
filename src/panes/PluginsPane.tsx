import { RefreshCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PluginSummary } from "../bridgeContracts";
import { pluginRegistryName } from "../bridgeContracts";
import { AuxToolbar, Card, ChoiceChip, EmptyState, MiniBadge, PaneScroll, PortalModal, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type PluginsPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  savingKey: string | null;
  rescanning: boolean;
  plugins: PluginSummary[];
  onRefresh: () => void;
  onRescan: () => void;
  onReloadMcp: () => void;
  onTogglePlugin: (plugin: PluginSummary) => void;
};

const RECOMMENDED_PLUGIN_BUNDLES = [
  { label: "Model providers", match: ["model", "provider", "openrouter", "anthropic", "gmi"], description: "Extra provider/auth backends for model routing." },
  { label: "Context & memory", match: ["memory", "context", "honcho", "mem0"], description: "Long-term memory and context-engine extensions." },
  { label: "Platforms", match: ["platform", "telegram", "discord", "slack", "email"], description: "Messaging gateways and external platform integrations." },
  { label: "Observability", match: ["observability", "metrics", "trace", "log"], description: "Monitoring, traces, logs, and runtime visibility." },
];

function pluginGroupKey(plugin: PluginSummary) {
  const registry = pluginRegistryName(plugin);
  const slash = registry.indexOf("/");
  if (slash > 0) return registry.slice(0, slash);
  return plugin.kind || "standalone";
}

function prettyLabel(raw: string) {
  return raw
    .split(/[-_/]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatVersion(version?: string) {
  const value = String(version ?? "").trim();
  if (!value || value === "?") return null;
  return value.startsWith("v") ? value : `v${value}`;
}

function pluginStats(plugin: PluginSummary) {
  const parts = [
    plugin.tools ? `${plugin.tools} tool${plugin.tools === 1 ? "" : "s"}` : null,
    plugin.hooks ? `${plugin.hooks} hook${plugin.hooks === 1 ? "" : "s"}` : null,
    plugin.commands ? `${plugin.commands} cmd${plugin.commands === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No registered surface";
}

function pluginExplanation(plugin: PluginSummary) {
  const text = `${pluginRegistryName(plugin)} ${plugin.name ?? ""} ${plugin.description ?? ""} ${plugin.kind ?? ""}`.toLowerCase();
  if (text.includes("model") || text.includes("provider")) return "Adds provider/auth/model routing capabilities that Hermes can use when choosing an LLM backend.";
  if (text.includes("memory") || text.includes("context")) return "Extends what Hermes can remember or retrieve as background context for future turns.";
  if (text.includes("platform") || text.includes("telegram") || text.includes("discord") || text.includes("email")) return "Connects Hermes to an external communication platform or event source.";
  if (text.includes("tool") || plugin.tools) return "Registers additional tools Hermes can call during agent runs.";
  if (text.includes("hook") || plugin.hooks) return "Adds lifecycle hooks that can react to Hermes runtime events.";
  if (text.includes("command") || plugin.commands) return "Adds slash commands or command handlers to Hermes sessions.";
  return "Extends Hermes at runtime. Review source and status before enabling in new sessions.";
}

export function PluginsPane({
  connected,
  loading,
  message,
  savingKey,
  rescanning,
  plugins,
  onRefresh,
  onRescan,
  onReloadMcp,
  onTogglePlugin,
}: PluginsPaneProps) {
  const { colors, styles } = useDashboardTheme();
  const [filter, setFilter] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const saving = Boolean(savingKey || loading || rescanning);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plugin of plugins) {
      const key = pluginGroupKey(plugin);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, label: prettyLabel(key), count }));
  }, [plugins]);

  const filteredPlugins = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (activeGroup && pluginGroupKey(plugin) !== activeGroup) return false;
      if (!needle) return true;
      const haystack = [pluginRegistryName(plugin), plugin.name, plugin.description, plugin.kind, plugin.source]
        .map((part) => String(part ?? "").toLowerCase()).join(" ");
      return haystack.includes(needle);
    });
  }, [activeGroup, filter, plugins]);

  const selectedPlugin = plugins.find((plugin) => pluginRegistryName(plugin) === selectedKey) ?? null;
  const enabledCount = plugins.filter((plugin) => plugin.enabled !== false).length;
  const erroredCount = plugins.filter((plugin) => plugin.error).length;

  const bundleCounts = RECOMMENDED_PLUGIN_BUNDLES.map((bundle) => ({
    ...bundle,
    plugins: plugins.filter((plugin) => {
      const text = `${pluginRegistryName(plugin)} ${plugin.description ?? ""} ${plugin.kind ?? ""}`.toLowerCase();
      return bundle.match.some((term) => text.includes(term));
    }),
  }));

  const renderDetails = () => {
    if (!selectedPlugin) return null;
    const registry = pluginRegistryName(selectedPlugin);
    const enabled = selectedPlugin.enabled !== false;
    const version = formatVersion(selectedPlugin.version);
    const toggleKey = `plugin:${registry}`;
    return (
      <>
        <View style={styles.panelHeaderRow}>
          <View style={styles.settingRowText}>
            <Text selectable style={styles.settingRowTitle}>{selectedPlugin.name || registry}</Text>
            <Text selectable style={styles.settingHelp}>{registry}</Text>
          </View>
          <MiniBadge label={selectedPlugin.error ? "Error" : enabled ? "Enabled" : "Disabled"} active={enabled && !selectedPlugin.error} />
        </View>
        <Text selectable style={styles.toolPreview}>{pluginExplanation(selectedPlugin)}</Text>
        <View style={styles.settingsGrid}>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Source / trust</Text>
            <Text selectable style={styles.infoValue}>{selectedPlugin.source || "Local plugin registry"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Version</Text>
            <Text selectable style={styles.infoValue}>{version || "Not reported"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Runtime surface</Text>
            <Text selectable style={styles.infoValue}>{pluginStats(selectedPlugin)}</Text>
          </View>
        </View>
        {selectedPlugin.description ? <Text selectable style={styles.toolPreview}>{selectedPlugin.description}</Text> : null}
        {selectedPlugin.error ? <Text selectable style={[styles.emptyCode, { color: colors.destructiveText }]}>{selectedPlugin.error}</Text> : null}
        <View style={styles.chipWrap}>
          <SecondaryButton
            label={savingKey === toggleKey ? "Saving…" : enabled ? "Disable plugin" : "Enable plugin"}
            onPress={() => onTogglePlugin(selectedPlugin)}
            disabled={!connected || saving || Boolean(selectedPlugin.error)}
          />
          <SecondaryButton label="Rescan" onPress={onRescan} disabled={!connected || saving} />
          <SecondaryButton label="Reload MCP" onPress={onReloadMcp} disabled={!connected || saving} />
        </View>
      </>
    );
  };

  return (
    <PaneScroll>
      <AuxToolbar
        connected={connected}
        loading={loading}
        message={message}
        onRefresh={onRefresh}
        actions={(
          <>
            <SecondaryButton
              label={rescanning ? "Rescanning…" : "Rescan plugins"}
              onPress={onRescan}
              disabled={!connected || saving}
              icon={rescanning ? <ActivityIndicator color={colors.midground} /> : <RefreshCw color={colors.midground} size={16} />}
            />
            <SecondaryButton label="Reload MCP" onPress={onReloadMcp} disabled={!connected || saving} />
          </>
        )}
      />

      <Card>
        <SectionHeader title="Recommended bundles" subtitle="Common plugin families to check when expanding Hermes capabilities." />
        <View style={styles.toolsetGrid}>
          {bundleCounts.map((bundle) => (
            <View key={bundle.label} style={styles.toolsetCard}>
              <View style={styles.panelHeaderRow}>
                <Text selectable style={styles.settingRowTitle}>{bundle.label}</Text>
                <MiniBadge label={`${bundle.plugins.length} found`} active={bundle.plugins.length > 0} />
              </View>
              <Text selectable style={styles.toolPreview}>{bundle.description}</Text>
              <Text selectable style={styles.toolStatus} numberOfLines={2}>{bundle.plugins.slice(0, 4).map(pluginRegistryName).join(", ") || "No matching plugins loaded."}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Loaded plugins"
          subtitle={`${enabledCount} of ${plugins.length} enabled${erroredCount ? ` · ${erroredCount} with load errors` : ""}. Open a card to inspect and manage it in a portaled modal.`}
        />
        <TextInput
          style={styles.input}
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter plugins by name, kind, or description"
          placeholderTextColor={colors.midgroundMuted}
          editable={connected && !saving}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {groups.length > 1 ? (
          <View style={[styles.chipWrap, { marginTop: 12 }]}>
            <ChoiceChip label="All" selected={!activeGroup} disabled={saving || !connected} onPress={() => setActiveGroup(null)} />
            {groups.map((group) => (
              <ChoiceChip key={group.key} label={`${group.label} (${group.count})`} selected={activeGroup === group.key} disabled={saving || !connected} onPress={() => setActiveGroup(group.key)} />
            ))}
          </View>
        ) : null}
        <View style={[styles.toolsetGrid, { marginTop: 12 }]}>
          {filteredPlugins.length ? filteredPlugins.map((plugin) => {
            const registry = pluginRegistryName(plugin);
            const enabled = plugin.enabled !== false;
            const selected = selectedKey === registry;
            const version = formatVersion(plugin.version);
            const title = registry !== plugin.name && plugin.name ? plugin.name : registry;
            const subtitle = registry !== plugin.name && plugin.name ? registry : null;
            return (
              <Pressable
                key={registry}
                style={[styles.toolsetCard, (enabled || selected) && styles.toolsetCardOn, saving && styles.disabled]}
                onPress={() => setSelectedKey(registry)}
                disabled={saving || !connected}
              >
                <View style={styles.panelHeaderRow}>
                  <Text selectable style={styles.toolName}>{title}</Text>
                  <MiniBadge label={plugin.error ? "Error" : enabled ? "On" : "Off"} active={enabled && !plugin.error} />
                </View>
                {subtitle ? <Text selectable style={styles.toolStatus}>{subtitle}</Text> : null}
                <View style={styles.chipWrap}>
                  {plugin.kind ? <MiniBadge label={prettyLabel(String(plugin.kind))} active={enabled} /> : null}
                  {plugin.source ? <MiniBadge label={String(plugin.source)} active={false} /> : null}
                  {version ? <MiniBadge label={version} active={false} /> : null}
                </View>
                <Text selectable style={styles.toolPreview} numberOfLines={4}>{plugin.description || pluginExplanation(plugin)}</Text>
                <Text selectable style={styles.toolStatus}>{pluginStats(plugin)}</Text>
              </Pressable>
            );
          }) : (
            <EmptyState
              title={plugins.length ? "No matching plugins" : "No plugins loaded"}
              message={plugins.length ? "Try clearing the filter or choosing another group." : "Connect, rescan, or refresh after installing Hermes plugins."}
            />
          )}
        </View>
      </Card>
      <PortalModal
        visible={Boolean(selectedPlugin)}
        title={selectedPlugin?.name || selectedKey || "Plugin details"}
        subtitle="Source, version, runtime surface, reload status, and what this extension lets Hermes do."
        onClose={() => setSelectedKey(null)}
      >
        {renderDetails()}
      </PortalModal>
    </PaneScroll>
  );
}
