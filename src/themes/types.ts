export interface ThemeLayer {
  alpha: number;
  hex: string;
}

export interface ThemePalette {
  background: ThemeLayer;
  midground: ThemeLayer;
  foreground: ThemeLayer;
  warmGlow: string;
  noiseOpacity: number;
}

export interface ThemeTypography {
  fontSans: string;
  fontMono: string;
  fontDisplay?: string;
  baseSize: string;
  lineHeight: string;
  letterSpacing: string;
}

export type ThemeDensity = "compact" | "comfortable" | "spacious";

export interface ThemeLayout {
  radius: string;
  density: ThemeDensity;
}

export interface ThemeColorOverrides {
  destructive?: string;
  success?: string;
  warning?: string;
}

export interface DashboardTheme {
  name: string;
  label: string;
  description: string;
  palette: ThemePalette;
  typography: ThemeTypography;
  layout: ThemeLayout;
  colorOverrides?: ThemeColorOverrides;
  /** Fully specified native tokens for themes that need platform-precise surfaces */
  nativeColors?: NativeThemeColors;
  /** Use the original Hermes React GUI palette instead of derived blends */
  canonical?: boolean;
  /** Sharper borders and text steps — less washed-out blending */
  contrast?: "normal" | "high";
}

export interface ThemeListEntry {
  name: string;
  label: string;
  description: string;
}

export interface NativeThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  midground: string;
  midgroundMuted: string;
  midgroundFaint: string;
  /** Brighter accent text — links, secondary buttons, active labels */
  highlight: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentStrong: string;
  warmGlow: string;
  destructive: string;
  success: string;
  warning: string;
  radius: number;
  onBackground: string;
  destructiveSurface: string;
  destructiveBorder: string;
  destructiveText: string;
  systemSurface: string;
  systemBorder: string;
  systemText: string;
  userBubble: string;
  userBubbleBorder: string;
  overlay: string;
}
