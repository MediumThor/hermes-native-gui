export type SettingKind = "select" | "toggle";

export type SettingOption = {
  label: string;
  value: string;
  help?: string;
};

export type SettingDefinition = {
  key: string;
  title: string;
  description: string;
  kind: SettingKind;
  options: SettingOption[];
  applies?: "immediate" | "new-session" | "restart";
};

export type HermesSettingsState = {
  model: string;
  provider: string;
  reasoning: string;
  reasoningDisplay: "show" | "hide";
  fast: "fast" | "normal";
  busy: "queue" | "steer" | "interrupt";
  verbose: "off" | "new" | "all" | "verbose";
  detailsMode: "hidden" | "collapsed" | "expanded";
  thinkingMode: "collapsed" | "truncated" | "full";
  compact: "on" | "off";
  statusbar: "off" | "top" | "bottom";
  mouse: "on" | "off";
  indicator: "ascii" | "emoji" | "kaomoji" | "unicode";
  voiceEnabled: boolean;
  voiceTts: boolean;
  voiceAvailable?: boolean;
  voiceDetails?: string;
};

export type ToolsetSetting = {
  name: string;
  description: string;
  tool_count: number;
  enabled: boolean;
};

export type ProviderOption = {
  slug: string;
  name: string;
  authenticated: boolean;
  is_current?: boolean;
  warning?: string;
  models?: string[];
};

export const DEFAULT_HERMES_SETTINGS: HermesSettingsState = {
  model: "",
  provider: "",
  reasoning: "medium",
  reasoningDisplay: "hide",
  fast: "normal",
  busy: "interrupt",
  verbose: "all",
  detailsMode: "collapsed",
  thinkingMode: "collapsed",
  compact: "off",
  statusbar: "top",
  mouse: "on",
  indicator: "kaomoji",
  voiceEnabled: false,
  voiceTts: false,
};

export const HERMES_SETTING_GROUPS: Array<{ title: string; description: string; settings: SettingDefinition[] }> = [
  {
    title: "Runtime",
    description: "Matches TUI slash settings that affect the active agent session.",
    settings: [
      {
        key: "fast",
        title: "Fast mode",
        description: "Request provider priority/fast service tier when the selected model supports it.",
        kind: "select",
        options: [
          { label: "Normal", value: "normal" },
          { label: "Fast", value: "fast" },
        ],
      },
      {
        key: "reasoning",
        title: "Reasoning effort",
        description: "Sets /reasoning effort for models that expose reasoning controls.",
        kind: "select",
        options: ["none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({ label: value, value })),
      },
      {
        key: "reasoningDisplay",
        title: "Show reasoning",
        description: "Controls whether reasoning/thinking sections are shown in compatible Hermes views.",
        kind: "select",
        options: [
          { label: "Hide", value: "hide" },
          { label: "Show", value: "show" },
        ],
      },
      {
        key: "busy",
        title: "Busy Enter behavior",
        description: "TUI parity for /busy: queue, steer, or interrupt while Hermes is working.",
        kind: "select",
        options: [
          { label: "Interrupt", value: "interrupt" },
          { label: "Queue", value: "queue" },
          { label: "Steer", value: "steer" },
        ],
      },
      {
        key: "verbose",
        title: "Tool progress",
        description: "TUI /verbose mode: hide, show new calls, show all, or verbose logging.",
        kind: "select",
        options: [
          { label: "Off", value: "off" },
          { label: "New", value: "new" },
          { label: "All", value: "all" },
          { label: "Verbose", value: "verbose" },
        ],
      },
    ],
  },
  {
    title: "Display",
    description: "Terminal UI display preferences persisted to Hermes config.yaml.",
    settings: [
      {
        key: "detailsMode",
        title: "Details mode",
        description: "Default visibility for tool/reasoning detail sections.",
        kind: "select",
        options: [
          { label: "Hidden", value: "hidden" },
          { label: "Collapsed", value: "collapsed" },
          { label: "Expanded", value: "expanded" },
        ],
      },
      {
        key: "thinkingMode",
        title: "Thinking preview",
        description: "Controls how much reasoning text is rendered in thinking sections.",
        kind: "select",
        options: [
          { label: "Collapsed", value: "collapsed" },
          { label: "Truncated", value: "truncated" },
          { label: "Full", value: "full" },
        ],
      },
      {
        key: "compact",
        title: "Compact TUI",
        description: "Reduce spacing in the terminal UI.",
        kind: "select",
        options: [
          { label: "Off", value: "off" },
          { label: "On", value: "on" },
        ],
      },
      {
        key: "statusbar",
        title: "Status bar",
        description: "Show the model/context status bar at top, bottom, or hide it.",
        kind: "select",
        options: [
          { label: "Top", value: "top" },
          { label: "Bottom", value: "bottom" },
          { label: "Off", value: "off" },
        ],
      },
      {
        key: "mouse",
        title: "Mouse tracking",
        description: "Enable mouse/wheel tracking in the terminal UI.",
        kind: "select",
        options: [
          { label: "On", value: "on" },
          { label: "Off", value: "off" },
        ],
      },
      {
        key: "indicator",
        title: "Busy indicator",
        description: "Pick the TUI busy indicator style.",
        kind: "select",
        options: [
          { label: "Kaomoji", value: "kaomoji" },
          { label: "Emoji", value: "emoji" },
          { label: "Unicode", value: "unicode" },
          { label: "ASCII", value: "ascii" },
        ],
      },
    ],
  },
];

export const HERMES_SETTING_SAVE_BEHAVIOR: Record<string, string> = {
  fast: "Takes effect on the next provider request when supported.",
  reasoning: "Saved to config and used by new turns/sessions.",
  reasoningDisplay: "Updates reasoning visibility preference in Hermes config.",
  busy: "Applied to future busy-input behavior.",
  verbose: "Saved to display.tool_progress for future tool progress rendering.",
  detailsMode: "Saved to TUI display defaults.",
  thinkingMode: "Saved to TUI thinking preview defaults.",
  compact: "Saved to TUI layout defaults; existing terminal sessions may need restart.",
  statusbar: "Saved to TUI layout defaults; existing terminal sessions may need restart.",
  mouse: "Saved to TUI input defaults; existing terminal sessions may need restart.",
  indicator: "Saved to TUI indicator defaults.",
};

export function normalizeSettingsPayload(payload: Partial<HermesSettingsState>): HermesSettingsState {
  return { ...DEFAULT_HERMES_SETTINGS, ...payload };
}
