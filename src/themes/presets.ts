import type { DashboardTheme, NativeThemeColors, ThemeLayout, ThemeTypography } from "./types";

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

const SAILDASH_TYPOGRAPHY: ThemeTypography = {
  fontSans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
  fontMono: SYSTEM_MONO,
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "-0.01em",
};

const saildashLightNativeColors: NativeThemeColors = {
  background: "#ece9df",
  surface: "#f5f3ed",
  surfaceElevated: "#ffffff",
  midground: "#01161e",
  midgroundMuted: "rgba(1,22,30,0.76)",
  midgroundFaint: "rgba(1,22,30,0.56)",
  highlight: "#124559",
  border: "#aec3b0",
  borderStrong: "#598392",
  accent: "#e2d7a3",
  accentStrong: "#cbd8c8",
  warmGlow: "rgba(203, 190, 122, 0.34)",
  destructive: "#ff3b30",
  success: "#124559",
  warning: "#ff9500",
  radius: 14,
  onBackground: "#ffffff",
  destructiveSurface: "#ffe6e3",
  destructiveBorder: "rgba(255,59,48,0.42)",
  destructiveText: "#c21f17",
  systemSurface: "#fff3d6",
  systemBorder: "rgba(255,149,0,0.36)",
  systemText: "#8a4b00",
  userBubble: "#dceaf0",
  userBubbleBorder: "#9bc4dd",
  overlay: "rgba(1,22,30,0.38)",
};

const saildashDarkNativeColors: NativeThemeColors = {
  background: "#18181b",
  surface: "rgba(31, 31, 35, 0.94)",
  surfaceElevated: "rgba(39, 39, 42, 0.90)",
  midground: "#ffffff",
  midgroundMuted: "rgba(255,255,255,0.86)",
  midgroundFaint: "rgba(212,212,216,0.68)",
  highlight: "#60a5fa",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(96,165,250,0.52)",
  accent: "rgba(96,165,250,0.18)",
  accentStrong: "rgba(96,165,250,0.34)",
  warmGlow: "rgba(245, 158, 11, 0.38)",
  destructive: "#ff3b30",
  success: "#60a5fa",
  warning: "#f59e0b",
  radius: 14,
  onBackground: "#18181b",
  destructiveSurface: "rgba(255,59,48,0.18)",
  destructiveBorder: "rgba(255,59,48,0.44)",
  destructiveText: "#ff6961",
  systemSurface: "rgba(245,158,11,0.18)",
  systemBorder: "rgba(245,158,11,0.46)",
  systemText: "#fbbf24",
  userBubble: "rgba(96,165,250,0.24)",
  userBubbleBorder: "rgba(96,165,250,0.56)",
  overlay: "rgba(0,0,0,0.72)",
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

export const saildashLightTheme: DashboardTheme = {
  name: "saildash-light",
  label: "SailDash Light",
  description: "SailPulse/SailDash iOS light — warm deck, glass cards, nautical teal accents",
  palette: {
    background: { hex: "#ece9df", alpha: 1 },
    midground: { hex: "#124559", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(203, 190, 122, 0.34)",
    noiseOpacity: 0.2,
  },
  typography: SAILDASH_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "14px" },
  nativeColors: saildashLightNativeColors,
};

export const saildashDarkTheme: DashboardTheme = {
  name: "saildash-dark",
  label: "SailDash Dark",
  description: "SailPulse/SailDash iOS dark — zinc cockpit surfaces, sky-blue active states, amber signal glow",
  palette: {
    background: { hex: "#18181b", alpha: 1 },
    midground: { hex: "#60a5fa", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(245, 158, 11, 0.36)",
    noiseOpacity: 0.7,
  },
  typography: SAILDASH_TYPOGRAPHY,
  layout: { ...DEFAULT_LAYOUT, radius: "14px" },
  nativeColors: saildashDarkNativeColors,
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
  "saildash-light": saildashLightTheme,
  "saildash-dark": saildashDarkTheme,
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
