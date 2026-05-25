import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { createDashboardStyles, type DashboardStyles } from "./dashboardStyles";
import { BUILTIN_THEMES, BUILTIN_THEME_LIST, defaultTheme } from "./presets";
import { themeToNativeColors } from "./nativeTokens";
import type { DashboardTheme, NativeThemeColors, ThemeListEntry } from "./types";

const STORAGE_KEY = "hermes-dashboard-theme-v2";

type DashboardThemeContextValue = {
  theme: DashboardTheme;
  colors: NativeThemeColors;
  styles: DashboardStyles;
  themeName: string;
  availableThemes: ThemeListEntry[];
  setTheme: (name: string) => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

function readStoredThemeName(): string {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") {
    return defaultTheme.name;
  }
  return localStorage.getItem(STORAGE_KEY) || defaultTheme.name;
}

function writeStoredThemeName(name: string) {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, name);
}

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState(readStoredThemeName);

  const theme = BUILTIN_THEMES[themeName] ?? defaultTheme;
  const colors = useMemo(() => themeToNativeColors(theme), [theme]);
  const styles = useMemo(() => createDashboardStyles(colors), [colors]);

  useEffect(() => {
    writeStoredThemeName(theme.name);
  }, [theme.name]);

  const value = useMemo(
    () => ({
      theme,
      colors,
      styles,
      themeName: theme.name,
      availableThemes: BUILTIN_THEME_LIST,
      setTheme: (name: string) => {
        if (BUILTIN_THEMES[name]) setThemeName(name);
      },
    }),
    [colors, styles, theme],
  );

  return <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>;
}

export function useDashboardTheme() {
  const context = useContext(DashboardThemeContext);
  if (!context) {
    throw new Error("useDashboardTheme must be used within DashboardThemeProvider");
  }
  return context;
}
