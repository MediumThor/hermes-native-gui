import { Check, Moon, Palette, Sun } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BUILTIN_THEMES } from "../themes/presets";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

const MENU_MAX_HEIGHT = 280;

function ThemeSwatch({
  theme,
  borderColor,
}: {
  theme: { background: { hex: string }; midground: { hex: string }; warmGlow: string };
  borderColor: string;
}) {
  return (
    <View style={[styles.swatchRow, { borderColor }]}>
      <View style={[styles.swatchCell, { backgroundColor: theme.background.hex }]} />
      <View style={[styles.swatchCell, { backgroundColor: theme.midground.hex }]} />
      <View style={[styles.swatchCell, { backgroundColor: theme.warmGlow }]} />
    </View>
  );
}

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    wrap: { position: "relative" },
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    buttonText: {
      flex: 1,
      color: colors.midground,
      fontSize: 13,
      fontWeight: "800",
    },
    menu: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "100%",
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      overflow: "hidden",
      maxHeight: MENU_MAX_HEIGHT,
    },
    menuTitle: {
      color: colors.midgroundMuted,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontWeight: "900",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuScroll: {
      maxHeight: MENU_MAX_HEIGHT - 36,
    },
    menuScrollContent: {
      paddingBottom: 4,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    optionActive: {
      backgroundColor: colors.accent,
    },
    optionText: { flex: 1, minWidth: 0, gap: 2 },
    optionLabel: {
      color: colors.midground,
      fontSize: 12,
      fontWeight: "800",
    },
    optionDescription: {
      color: colors.midgroundFaint,
      fontSize: 11,
      lineHeight: 15,
    },
    swatchPlaceholder: {
      width: 36,
      height: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
  });
}


type SailDashMode = "light" | "dark";

const SAILDASH_THEME_BY_MODE: Record<SailDashMode, string> = {
  light: "saildash-light",
  dark: "saildash-dark",
};

function activeSailDashMode(themeName: string): SailDashMode | null {
  if (themeName === SAILDASH_THEME_BY_MODE.light) return "light";
  if (themeName === SAILDASH_THEME_BY_MODE.dark) return "dark";
  return null;
}

function createSailDashModeStyles(colors: NativeThemeColors, compact: boolean) {
  return StyleSheet.create({
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 999,
      padding: 3,
      shadowColor: "#000",
      shadowOpacity: 0.20,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: 999,
      paddingHorizontal: compact ? 10 : 12,
      paddingVertical: compact ? 7 : 9,
    },
    optionActive: {
      backgroundColor: colors.success,
      borderColor: colors.borderStrong,
      shadowColor: colors.success,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    optionText: {
      color: colors.midgroundMuted,
      fontSize: compact ? 12 : 13,
      fontWeight: "900",
    },
    optionTextActive: {
      color: colors.onBackground,
    },
  });
}

export function SailDashModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { colors, themeName, setTheme } = useDashboardTheme();
  const styles = useMemo(() => createSailDashModeStyles(colors, compact), [colors, compact]);
  const activeMode = activeSailDashMode(themeName);

  const renderOption = (mode: SailDashMode) => {
    const active = activeMode === mode;
    const Icon = mode === "light" ? Sun : Moon;
    const label = mode === "light" ? "Light" : "Dark";
    return (
      <Pressable
        key={mode}
        style={[styles.option, active && styles.optionActive]}
        onPress={() => setTheme(SAILDASH_THEME_BY_MODE[mode])}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={"Switch to SailDash " + label}
      >
        <Icon color={active ? colors.onBackground : colors.midgroundMuted} size={compact ? 14 : 15} />
        <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.toggle} accessibilityRole="tablist" accessibilityLabel="SailDash color mode">
      {renderOption("light")}
      {renderOption("dark")}
    </View>
  );
}

export function ThemeSwitcher() {
  const { colors, themeName, availableThemes, setTheme } = useDashboardTheme();
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeLabel = BUILTIN_THEMES[themeName]?.label ?? themeName;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.button}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Theme: ${activeLabel}`}
      >
        <Palette color={colors.midgroundMuted} size={16} />
        <Text style={styles.buttonText}>{activeLabel}</Text>
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          <Text style={styles.menuTitle}>Theme</Text>
          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={styles.menuScrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {availableThemes.map((entry) => {
              const paletteTheme = BUILTIN_THEMES[entry.name];
              const active = entry.name === themeName;
              return (
                <Pressable
                  key={entry.name}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    setTheme(entry.name);
                    setOpen(false);
                  }}
                >
                  {paletteTheme ? (
                    <ThemeSwatch theme={paletteTheme.palette} borderColor={colors.border} />
                  ) : (
                    <View style={styles.swatchPlaceholder} />
                  )}
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{entry.label}</Text>
                    <Text style={styles.optionDescription}>{entry.description}</Text>
                  </View>
                  {active ? <Check color={colors.midground} size={14} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  swatchRow: {
    flexDirection: "row",
    width: 36,
    height: 16,
    borderWidth: 1,
    overflow: "hidden",
    borderRadius: 3,
  },
  swatchCell: { flex: 1 },
});
