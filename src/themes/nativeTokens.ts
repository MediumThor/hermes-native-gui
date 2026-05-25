import type { DashboardTheme, NativeThemeColors } from "./types";
import { hermesCanonicalColors } from "./canonicalTokens";

function parseRadius(radius: string): number {
  if (radius.endsWith("rem")) {
    return Number.parseFloat(radius) * 16;
  }
  if (radius.endsWith("px")) {
    return Number.parseFloat(radius);
  }
  return Number.parseFloat(radius) || 8;
}

function parseHex(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function blendHex(base: string, overlay: string, amount: number): string {
  const a = parseHex(base);
  const b = parseHex(overlay);
  const mix = (channel: "r" | "g" | "b") =>
    Math.round(a[channel] + (b[channel] - a[channel]) * amount);
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix("r"))}${toHex(mix("g"))}${toHex(mix("b"))}`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function isDarkBackground(hex: string): boolean {
  return relativeLuminance(hex) < 0.4;
}

function textOn(accentHex: string, darkBackground: boolean): string {
  return relativeLuminance(accentHex) > 0.62 ? "#000000" : "#ffffff";
}

export function themeToNativeColors(theme: DashboardTheme): NativeThemeColors {
  if (theme.canonical) {
    return hermesCanonicalColors(parseRadius(theme.layout.radius || "0.5rem"));
  }

  const background = theme.palette.background.hex;
  const accent = theme.colorOverrides?.success ?? theme.palette.midground.hex;
  const destructive = theme.colorOverrides?.destructive ?? "#ff5f5f";
  const warning = theme.colorOverrides?.warning ?? "#ffd166";
  const dark = isDarkBackground(background);
  const text = dark ? "#ffffff" : "#000000";
  const textMuted = dark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.74)";
  const textFaint = dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.54)";
  const onAccent = textOn(accent, dark);
  const punch = theme.contrast === "high";

  const surfaceMix = punch ? 0.14 : 0.1;
  const surfaceElevatedMix = punch ? 0.22 : 0.16;
  const borderMix = punch ? 0.34 : 0.28;
  const borderStrongMix = punch ? 0.48 : 0.4;
  const accentSurfaceMix = punch ? 0.3 : 0.24;
  const accentStrongMix = punch ? 0.4 : 0.32;

  return {
    background,
    surface: blendHex(background, text, surfaceMix),
    surfaceElevated: blendHex(background, text, surfaceElevatedMix),
    midground: text,
    midgroundMuted: textMuted,
    midgroundFaint: textFaint,
    highlight: accent,
    border: blendHex(background, text, borderMix),
    borderStrong: blendHex(background, text, borderStrongMix),
    accent: blendHex(background, accent, accentSurfaceMix),
    accentStrong: blendHex(background, accent, accentStrongMix),
    warmGlow: theme.palette.warmGlow,
    destructive,
    success: accent,
    warning,
    radius: parseRadius(theme.layout.radius || "0.5rem"),
    onBackground: onAccent,
    destructiveSurface: blendHex(background, destructive, punch ? 0.28 : 0.22),
    destructiveBorder: blendHex(background, destructive, punch ? 0.55 : 0.48),
    destructiveText: destructive,
    systemSurface: blendHex(background, warning, punch ? 0.22 : 0.16),
    systemBorder: blendHex(background, warning, punch ? 0.5 : 0.42),
    systemText: warning,
    userBubble: blendHex(background, accent, punch ? 0.36 : 0.3),
    userBubbleBorder: blendHex(background, accent, punch ? 0.52 : 0.46),
    overlay: dark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.45)",
  };
}
