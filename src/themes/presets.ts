import type { DashboardTheme, ThemeLayout, ThemeTypography } from "./types";

const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontSans: SYSTEM_SANS,
  fontMono: SYSTEM_MONO,
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "0",
};

const DEFAULT_LAYOUT: ThemeLayout = {
  radius: "0.5rem",
  density: "comfortable",
};

export const defaultTheme: DashboardTheme = {
  name: "default",
  label: "Hermes Teal",
  description: "Original Hermes React GUI — dark teal with crisp accents",
  canonical: true,
  palette: {
    background: { hex: "#071111", alpha: 1 },
    midground: { hex: "#9ee7d7", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(255, 189, 56, 0.35)",
    noiseOpacity: 1,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: DEFAULT_LAYOUT,
};

export const defaultLargeTheme: DashboardTheme = {
  name: "default-large",
  label: "Hermes Teal (Large)",
  description: "Original Hermes look with bigger fonts and roomier spacing",
  canonical: true,
  palette: defaultTheme.palette,
  typography: { ...DEFAULT_TYPOGRAPHY, baseSize: "18px", lineHeight: "1.65" },
  layout: { ...DEFAULT_LAYOUT, density: "spacious" },
};

export const midnightTheme: DashboardTheme = {
  name: "midnight",
  label: "Midnight",
  description: "Deep blue-violet — white text, violet accents",
  palette: {
    background: { hex: "#0a0a1f", alpha: 1 },
    midground: { hex: "#d4c8ff", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(167, 139, 250, 0.32)",
    noiseOpacity: 0.8,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "0.75rem" },
};

export const emberTheme: DashboardTheme = {
  name: "ember",
  label: "Ember",
  description: "Warm forge tones — white text, amber accents",
  palette: {
    background: { hex: "#1a0a06", alpha: 1 },
    midground: { hex: "#ffd8b0", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 115, 22, 0.38)",
    noiseOpacity: 1,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "0.25rem" },
  colorOverrides: { destructive: "#c92d0f", warning: "#f97316" },
};

export const monoTheme: DashboardTheme = {
  name: "mono",
  label: "Mono",
  description: "Grayscale — white text on charcoal",
  palette: {
    background: { hex: "#0e0e0e", alpha: 1 },
    midground: { hex: "#eaeaea", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(255, 255, 255, 0.1)",
    noiseOpacity: 0.6,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "0" },
};

export const cyberpunkTheme: DashboardTheme = {
  name: "cyberpunk",
  label: "Cyberpunk",
  description: "Neon green on black — white text, matrix accents",
  palette: {
    background: { hex: "#040608", alpha: 1 },
    midground: { hex: "#9bffcf", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(0, 255, 136, 0.22)",
    noiseOpacity: 1.2,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "0" },
  colorOverrides: { success: "#00ff88", warning: "#ffd700", destructive: "#ff0055" },
};

export const roseTheme: DashboardTheme = {
  name: "rose",
  label: "Rosé",
  description: "Dark rose — white text, pink accents",
  palette: {
    background: { hex: "#1a0f15", alpha: 1 },
    midground: { hex: "#ffd4e1", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 168, 212, 0.3)",
    noiseOpacity: 0.9,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "1rem" },
};

export const highContrastTheme: DashboardTheme = {
  name: "high-contrast",
  label: "High Contrast",
  description: "Crisp black and white — sharp borders, no muddy grays",
  contrast: "high",
  palette: {
    background: { hex: "#000000", alpha: 1 },
    midground: { hex: "#f5f5f5", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(255, 255, 255, 0.14)",
    noiseOpacity: 0,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "0.25rem" },
  colorOverrides: {
    success: "#ffffff",
    warning: "#ffcc00",
    destructive: "#ff5252",
  },
};

export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  default: defaultTheme,
  "high-contrast": highContrastTheme,
  "default-large": defaultLargeTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  rose: roseTheme,
};

export const BUILTIN_THEME_LIST = Object.values(BUILTIN_THEMES).map((theme) => ({
  name: theme.name,
  label: theme.label,
  description: theme.description,
}));
