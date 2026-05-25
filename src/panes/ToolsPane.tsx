import { Pressable, Text, View } from "react-native";
import type { ToolsetSetting } from "../hermesSettings";
import { AuxToolbar, Card, EmptyState, MiniBadge, PaneScroll, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type ToolsPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  savingKey: string | null;
  toolsets: ToolsetSetting[];
  onRefresh: () => void;
  onToggleToolset: (toolset: ToolsetSetting) => void;
  onApplyToolPreset: (label: string, names: string[]) => void;
};

type ToolPreset = {
  label: string;
  description: string;
  names: string[];
  risk: "low" | "medium" | "high";
};

const TOOL_PRESETS: ToolPreset[] = [
  {
    label: "Coding",
    description: "Files, terminal, GitHub, browser, delegation, and web lookup for software work.",
    names: ["file", "terminal", "github", "browser", "web", "search", "delegation"],
    risk: "high",
  },
  {
    label: "Research",
    description: "Search, web extraction, academic/research sources, notes, and documents.",
    names: ["web", "search", "research", "note-taking", "file", "productivity"],
    risk: "medium",
  },
  {
    label: "Browser automation",
    description: "Browser and macOS control for interactive websites, visual checks, and account flows.",
    names: ["browser", "computer_use", "vision", "web"],
    risk: "high",
  },
  {
    label: "Safe mode",
    description: "Read-first tools for low-risk lookup and recall without shell or desktop automation.",
    names: ["web", "search", "session_search", "skills"],
    risk: "low",
  },
];

function toolsetRisk(toolset: ToolsetSetting): "low" | "medium" | "high" {
  const name = toolset.name.toLowerCase();
  const description = toolset.description.toLowerCase();
  if (["terminal", "computer_use", "browser", "github", "discord_admin", "homeassistant"].some((part) => name.includes(part))) return "high";
  if (description.includes("write") || description.includes("manage") || description.includes("send") || description.includes("control")) return "medium";
  return "low";
}

function riskCopy(risk: "low" | "medium" | "high") {
  if (risk === "high") return "High risk: can affect files, browser state, external services, or local processes.";
  if (risk === "medium") return "Medium risk: may write to apps/services or change Hermes runtime behavior.";
  return "Low risk: primarily read/search/summarize capabilities.";
}

function toolsetExplanation(toolset: ToolsetSetting) {
  const name = toolset.name.toLowerCase();
  const fallback = toolset.description || "Makes this group of Hermes tools available to the active session.";
  if (name.includes("terminal")) return "Run shell commands, builds, tests, package managers, and process checks.";
  if (name.includes("file")) return "Read, search, write, and patch local project files safely through structured tools.";
  if (name.includes("browser")) return "Open and interact with web pages through the browser automation stack.";
  if (name.includes("computer")) return "Drive the macOS desktop in the background for visual UI workflows.";
  if (name.includes("web") || name.includes("search")) return "Look up current information, fetch pages, and ground answers in online sources.";
  if (name.includes("delegation")) return "Spawn isolated subagents for parallel investigation or implementation work.";
  if (name.includes("github")) return "Inspect repositories, issues, pull requests, CI, and release metadata.";
  if (name.includes("vision")) return "Analyze images and screenshots as part of the conversation.";
  return fallback;
}

export function ToolsPane({ connected, loading, message, savingKey, toolsets, onRefresh, onToggleToolset, onApplyToolPreset }: ToolsPaneProps) {
  const { styles } = useDashboardTheme();
  const saving = Boolean(savingKey || loading);
  const enabledNames = new Set(toolsets.filter((toolset) => toolset.enabled).map((toolset) => toolset.name));
  const knownNames = new Set(toolsets.map((toolset) => toolset.name));
  const enabledCount = enabledNames.size;

  const presetMatches = (preset: ToolPreset) => preset.names.every((name) => enabledNames.has(name) || !knownNames.has(name));

  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader
          title="Recommended tool presets"
          subtitle="Apply a curated per-session toolset selection instead of toggling raw backend surfaces one by one. Unknown toolsets are ignored."
        />
        <View style={styles.toolsetGrid}>
          {TOOL_PRESETS.map((preset) => {
            const active = presetMatches(preset);
            const availableNames = preset.names.filter((name) => knownNames.has(name));
            return (
              <View key={preset.label} style={[styles.toolsetCard, active && styles.toolsetCardOn]}>
                <View style={styles.panelHeaderRow}>
                  <Text selectable style={styles.settingRowTitle}>{preset.label}</Text>
                  <MiniBadge label={preset.risk} active={active} />
                </View>
                <Text selectable style={styles.toolPreview}>{preset.description}</Text>
                <Text selectable style={styles.toolStatus}>{availableNames.length ? availableNames.join(", ") : "No matching installed toolsets yet"}</Text>
                <SecondaryButton
                  label={savingKey === `preset:${preset.label}` ? "Applying…" : active ? "Applied" : "Apply preset"}
                  onPress={() => onApplyToolPreset(preset.label, preset.names)}
                  disabled={!connected || saving || active || availableNames.length === 0}
                />
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Toolsets"
          subtitle={`${enabledCount} of ${toolsets.length} enabled. Changes go through Hermes tools.configure so active-session reset behavior stays safe.`}
        />
        <View style={styles.toolsetGrid}>
          {toolsets.length ? toolsets.map((toolset) => {
            const risk = toolsetRisk(toolset);
            return (
              <Pressable
                key={toolset.name}
                style={[styles.toolsetCard, toolset.enabled && styles.toolsetCardOn, saving && styles.disabled]}
                onPress={() => onToggleToolset(toolset)}
                disabled={saving || !connected}
                accessibilityRole="switch"
                accessibilityState={{ checked: toolset.enabled }}
              >
                <View style={styles.panelHeaderRow}>
                  <Text selectable style={styles.toolName}>{toolset.name}</Text>
                  <MiniBadge label={toolset.enabled ? "On" : "Off"} active={toolset.enabled} />
                </View>
                <View style={styles.chipWrap}>
                  <MiniBadge label={`${toolset.tool_count} tools`} active={toolset.enabled} />
                  <MiniBadge label={`${risk} risk`} active={risk === "low" ? false : toolset.enabled} />
                </View>
                <Text selectable style={styles.toolPreview}>{toolsetExplanation(toolset)}</Text>
                <Text selectable style={styles.toolStatus}>{riskCopy(risk)}</Text>
                {toolset.description && toolset.description !== toolsetExplanation(toolset) ? (
                  <Text selectable style={styles.toolPreview} numberOfLines={3}>{toolset.description}</Text>
                ) : null}
              </Pressable>
            );
          }) : (
            <EmptyState title="No toolsets loaded" message="Connect and refresh to show available Hermes toolsets." />
          )}
        </View>
      </Card>
    </PaneScroll>
  );
}
