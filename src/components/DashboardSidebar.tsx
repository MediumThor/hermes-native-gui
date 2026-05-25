import { useState } from "react";
import { Check, Download, Palette, RotateCw, X } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  DASHBOARD_NAV_ITEMS,
  IMPLEMENTED_PANES,
  type DashboardNavItem,
  type DashboardPane,
} from "../dashboard/nav";
import { BUILTIN_THEMES } from "../themes/presets";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

const SIDEBAR_WIDTH = 256;

type Props = {
  activePane: DashboardPane;
  statusLine1: string;
  statusLine2: string;
  onSelectPane: (pane: DashboardPane) => void;
  onClose: () => void;
};

export function DashboardSidebar({
  activePane,
  statusLine1,
  statusLine2,
  onSelectPane,
  onClose,
}: Props) {
  const { colors, themeName, availableThemes, setTheme } = useDashboardTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const styles = createStyles(colors);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Text style={styles.brandLine}>Hermes</Text>
          <Text style={styles.brandLine}>Agent</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close navigation">
          <X color={colors.midgroundMuted} size={18} />
        </Pressable>
      </View>

      <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent}>
        {DASHBOARD_NAV_ITEMS.map((item) => (
          <SidebarNavLink
            key={item.id}
            item={item}
            active={activePane === item.id}
            implemented={IMPLEMENTED_PANES.has(item.id)}
            colors={colors}
            onPress={() => onSelectPane(item.id)}
          />
        ))}

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>System</Text>
          <View style={styles.statusStrip}>
            <Text style={styles.statusLine}>Gateway Status: {statusLine1}</Text>
            <Text style={styles.statusLine}>Bridge: {statusLine2}</Text>
          </View>
          <SystemActionRow icon={RotateCw} label="Restart Gateway" colors={colors} disabled />
          <SystemActionRow icon={Download} label="Update Hermes" colors={colors} disabled />
        </View>
      </ScrollView>

      <View style={styles.switcherRow}>
        <View style={styles.themeSwitcherWrap}>
          <Pressable style={styles.themeButton} onPress={() => setThemeOpen((open) => !open)}>
            <Palette color={colors.midgroundMuted} size={14} />
            <Text style={styles.themeButtonText}>{BUILTIN_THEMES[themeName]?.label ?? themeName}</Text>
          </Pressable>
          {themeOpen ? (
            <View style={styles.themeMenu}>
              <Text style={styles.themeMenuTitle}>Theme</Text>
              {availableThemes.map((entry) => {
                const paletteTheme = BUILTIN_THEMES[entry.name];
                const active = entry.name === themeName;
                return (
                  <Pressable
                    key={entry.name}
                    style={[styles.themeOption, active && styles.themeOptionActive]}
                    onPress={() => {
                      setTheme(entry.name);
                      setThemeOpen(false);
                    }}
                  >
                    {paletteTheme ? <ThemeSwatch theme={paletteTheme.palette} /> : <View style={styles.themeSwatchPlaceholder} />}
                    <View style={styles.themeOptionText}>
                      <Text style={styles.themeOptionLabel}>{entry.label}</Text>
                      <Text style={styles.themeOptionDescription}>{entry.description}</Text>
                    </View>
                    {active ? <Check color={colors.midground} size={12} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerVersion}>v0.1.0</Text>
        <Text style={styles.footerOrg}>Nous Research</Text>
      </View>
    </View>
  );
}

function SidebarNavLink({
  item,
  active,
  implemented,
  colors,
  onPress,
}: {
  item: DashboardNavItem;
  active: boolean;
  implemented: boolean;
  colors: NativeThemeColors;
  onPress: () => void;
}) {
  const Icon = item.icon;
  const styles = createStyles(colors);
  return (
    <Pressable
      style={[styles.navItem, active && styles.navItemActive, !implemented && styles.navItemSoon]}
      onPress={onPress}
    >
      {active ? <View style={styles.navActiveBar} /> : null}
      <Icon color={active ? colors.midground : colors.midgroundMuted} size={14} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label.toUpperCase()}</Text>
    </Pressable>
  );
}

function SystemActionRow({
  icon: Icon,
  label,
  colors,
  disabled,
}: {
  icon: typeof RotateCw;
  label: string;
  colors: NativeThemeColors;
  disabled?: boolean;
}) {
  const styles = createStyles(colors);
  return (
    <Pressable style={[styles.systemAction, disabled && styles.systemActionDisabled]} disabled={disabled}>
      <Icon color={colors.midgroundMuted} size={14} />
      <Text style={styles.systemActionLabel}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function ThemeSwatch({ theme }: { theme: { background: { hex: string }; midground: { hex: string }; warmGlow: string } }) {
  return (
    <View style={stylesStatic.swatchRow}>
      <View style={[stylesStatic.swatchCell, { backgroundColor: theme.background.hex }]} />
      <View style={[stylesStatic.swatchCell, { backgroundColor: theme.midground.hex }]} />
      <View style={[stylesStatic.swatchCell, { backgroundColor: theme.warmGlow }]} />
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  swatchRow: { flexDirection: "row", width: 36, height: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  swatchCell: { flex: 1 },
});

function createStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      width: SIDEBAR_WIDTH,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    header: {
      height: 56,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandBlock: { gap: 0 },
    brandLine: {
      color: colors.midground,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0.8,
      lineHeight: 20,
    },
    closeButton: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    navScroll: { flex: 1 },
    navContent: { paddingVertical: 8 },
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      opacity: 0.6,
    },
    navItemActive: { opacity: 1, backgroundColor: colors.accent },
    navItemSoon: { opacity: 0.45 },
    navActiveBar: {
      position: "absolute",
      left: 0,
      top: 4,
      bottom: 4,
      width: 1,
      backgroundColor: colors.midground,
    },
    navLabel: {
      color: colors.midgroundMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.4,
    },
    navLabelActive: { color: colors.midground },
    sectionBlock: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      marginTop: 8,
    },
    sectionLabel: {
      color: colors.midgroundFaint,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      paddingHorizontal: 20,
      paddingBottom: 6,
      opacity: 0.3,
    },
    statusStrip: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      gap: 4,
    },
    statusLine: {
      color: colors.midgroundMuted,
      fontSize: 10,
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    systemAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      opacity: 0.6,
    },
    systemActionDisabled: { opacity: 0.35 },
    systemActionLabel: {
      color: colors.midgroundMuted,
      fontSize: 12,
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    switcherRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    themeSwitcherWrap: { position: "relative" },
    themeButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    themeButtonText: {
      color: colors.midgroundMuted,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    themeMenu: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "100%",
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      paddingBottom: 4,
    },
    themeMenuTitle: {
      color: colors.midgroundMuted,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    themeOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    themeOptionActive: { backgroundColor: colors.accent },
    themeOptionText: { flex: 1, minWidth: 0, gap: 2 },
    themeOptionLabel: {
      color: colors.midground,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    themeOptionDescription: {
      color: colors.midgroundFaint,
      fontSize: 10,
      lineHeight: 14,
    },
    themeSwatchPlaceholder: {
      width: 36,
      height: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    footerVersion: {
      color: colors.midgroundFaint,
      fontSize: 11,
      letterSpacing: 1,
    },
    footerOrg: {
      color: colors.midground,
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: "700",
    },
  });
}

export { SIDEBAR_WIDTH };
