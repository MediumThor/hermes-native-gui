import { Pressable, Text, View } from "react-native";
import type { ToolsetSetting } from "../hermesSettings";
import { AuxToolbar, Card, EmptyState, MiniBadge, PaneScroll, SectionHeader } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type ToolsPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  savingKey: string | null;
  toolsets: ToolsetSetting[];
  onRefresh: () => void;
  onToggleToolset: (toolset: ToolsetSetting) => void;
};

export function ToolsPane({ connected, loading, message, savingKey, toolsets, onRefresh, onToggleToolset }: ToolsPaneProps) {
  const { styles } = useDashboardTheme();
  const saving = Boolean(savingKey || loading);
  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader title="Toolsets" subtitle="Enable or disable Hermes toolsets. Active sessions may reset after changes." />
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
              <Text selectable style={styles.toolPreview} numberOfLines={4}>{toolset.description}</Text>
            </Pressable>
          )) : (
            <EmptyState title="No toolsets loaded" message="Connect and refresh to show available Hermes toolsets." />
          )}
        </View>
      </Card>
    </PaneScroll>
  );
}
