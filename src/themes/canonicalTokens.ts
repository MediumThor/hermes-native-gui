import type { NativeThemeColors } from "./types";

/** Hermes Teal — original layout colors with crisp white/black text. */
export function hermesCanonicalColors(radius = 8): NativeThemeColors {
  return {
    background: "#071111",
    surface: "#081515",
    surfaceElevated: "#0d1d1d",
    midground: "#ffffff",
    midgroundMuted: "rgba(255,255,255,0.80)",
    midgroundFaint: "rgba(255,255,255,0.62)",
    highlight: "#c7fff3",
    border: "#284848",
    borderStrong: "#3f867a",
    accent: "#12302d",
    accentStrong: "#173c38",
    warmGlow: "rgba(255, 189, 56, 0.35)",
    destructive: "#ff5f5f",
    success: "#9ee7d7",
    warning: "#ffd166",
    radius,
    onBackground: "#081111",
    destructiveSurface: "#4b2020",
    destructiveBorder: "#865050",
    destructiveText: "#ffb4b4",
    systemSurface: "#221a10",
    systemBorder: "#6e5127",
    systemText: "#ffd99e",
    userBubble: "#173c38",
    userBubbleBorder: "#3f867a",
    overlay: "rgba(0,0,0,0.55)",
  };
}
