import { RefreshCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PluginSummary } from "../bridgeContracts";
import { pluginRegistryName } from "../bridgeContracts";
import { AuxToolbar, Card, ChoiceChip, EmptyState, MiniBadge, PaneScroll, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
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
      const haystack = [
        pluginRegistryName(plugin),
        plugin.name,
        plugin.description,
        plugin.kind,
        plugin.source,
      ].map((part) => String(part ?? "").toLowerCase()).join(" ");
      return haystack.includes(needle);
    });
  }, [activeGroup, filter, plugins]);

  const enabledCount = plugins.filter((plugin) => plugin.enabled !== false).length;
  const erroredCount = plugins.filter((plugin) => plugin.error).length;

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
        <SectionHeader
          title="Loaded plugins"
          subtitle={`${enabledCount} of ${plugins.length} enabled${erroredCount ? ` · ${erroredCount} with load errors` : ""}. Tap a card to enable or disable runtime loading.`}
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
            <ChoiceChip
              label="All"
              selected={!activeGroup}
              disabled={saving || !connected}
              onPress={() => setActiveGroup(null)}
            />
            {groups.map((group) => (
              <ChoiceChip
                key={group.key}
                label={`${group.label} (${group.count})`}
                selected={activeGroup === group.key}
                disabled={saving || !connected}
                onPress={() => setActiveGroup(group.key)}
              />
            ))}
          </View>
        ) : null}
        <View style={[styles.toolsetGrid, { marginTop: 12 }]}>
          {filteredPlugins.length ? filteredPlugins.map((plugin) => {
            const registry = pluginRegistryName(plugin);
            const enabled = plugin.enabled !== false;
            const toggleKey = `plugin:${registry}`;
            const isSaving = savingKey === toggleKey;
            const version = formatVersion(plugin.version);
            const title = registry !== plugin.name && plugin.name ? plugin.name : registry;
            const subtitle = registry !== plugin.name && plugin.name ? registry : null;
            return (
              <Pressable
                key={registry}
                style={[styles.toolsetCard, enabled && styles.toolsetCardOn, (saving || isSaving) && styles.disabled]}
                onPress={() => onTogglePlugin(plugin)}
                disabled={saving || !connected || Boolean(plugin.error)}
              >
                <View style={styles.panelHeaderRow}>
                  <Text selectable style={styles.toolName}>{title}</Text>
                  <MiniBadge label={isSaving ? "…" : enabled ? "On" : "Off"} active={enabled} />
                </View>
                {subtitle ? <Text selectable style={styles.toolStatus}>{subtitle}</Text> : null}
                <View style={styles.chipWrap}>
                  {plugin.kind ? <MiniBadge label={prettyLabel(String(plugin.kind))} active={enabled} /> : null}
                  {plugin.source ? <MiniBadge label={String(plugin.source)} active={false} /> : null}
                  {version ? <MiniBadge label={version} active={false} /> : null}
                </View>
                {plugin.description ? (
                  <Text selectable style={styles.toolPreview} numberOfLines={4}>{plugin.description}</Text>
                ) : null}
                <Text selectable style={styles.toolStatus}>{pluginStats(plugin)}</Text>
                {plugin.error ? (
                  <Text selectable style={[styles.toolPreview, { color: colors.destructiveText }]} numberOfLines={3}>
                    {plugin.error}
                  </Text>
                ) : null}
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
    </PaneScroll>
  );
}
