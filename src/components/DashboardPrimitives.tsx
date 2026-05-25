import { RefreshCw } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { BridgeDataStatus } from "../bridgeContracts";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";
import type { NativeThemeColors } from "../themes/types";

export function PaneScroll({ children }: { children: ReactNode }) {
  const { styles } = useDashboardTheme();
  return (
    <ScrollView style={styles.fullPane} contentContainerStyle={styles.fullPaneContent}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { styles } = useDashboardTheme();
  return <View style={[styles.card, wide && styles.cardWide]}>{children}</View>;
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { styles } = useDashboardTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text selectable style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text selectable style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, message, code }: { title: string; message: string; code?: string }) {
  const { styles } = useDashboardTheme();
  return (
    <View style={styles.emptyState}>
      <Text selectable style={styles.emptyTitle}>{title}</Text>
      <Text selectable style={styles.emptyText}>{message}</Text>
      {code ? <Text selectable style={styles.emptyCode}>{code}</Text> : null}
    </View>
  );
}

export function StatusState({ status, message, onRetry, retryLabel = "Refresh" }: { status: BridgeDataStatus; message?: string; onRetry?: () => void; retryLabel?: string }) {
  const { colors, styles } = useDashboardTheme();
  if (status === "idle" || status === "ready") return null;
  return (
    <Card>
      <View style={styles.panelHeaderRow}>
        <View style={styles.settingRowText}>
          <Text selectable style={styles.sectionTitle}>{status === "loading" ? "Loading…" : "Couldn’t load this pane"}</Text>
          {message ? <Text selectable style={styles.settingHelp}>{message}</Text> : null}
        </View>
        {status === "loading" ? <ActivityIndicator color={colors.midground} /> : onRetry ? <SecondaryButton label={retryLabel} onPress={onRetry} /> : null}
      </View>
    </Card>
  );
}

export function AuxToolbar({
  connected,
  loading,
  message,
  onRefresh,
  actions,
}: {
  connected: boolean;
  loading: boolean;
  message?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
}) {
  const { colors, styles } = useDashboardTheme();
  return (
    <Card>
      <View style={styles.panelHeaderRow}>
        <View style={styles.settingRowText}>
          <Text selectable style={styles.sectionSubtitle}>
            {connected ? "Live data from the Hermes bridge." : "Connect to the bridge to load this section."}
          </Text>
        </View>
        <View style={styles.chipWrap}>
          {actions}
          {onRefresh ? (
            <SecondaryButton
              label={loading ? "Loading" : "Refresh"}
              onPress={onRefresh}
              disabled={!connected || loading}
              icon={loading ? <ActivityIndicator color={colors.midground} /> : <RefreshCw color={colors.midground} size={16} />}
            />
          ) : null}
        </View>
      </View>
      {message ? <Text selectable style={styles.settingHelp}>{message}</Text> : null}
    </Card>
  );
}

export function SecondaryButton({ label, onPress, disabled, icon }: { label: string; onPress?: () => void; disabled?: boolean; icon?: ReactNode }) {
  const { styles } = useDashboardTheme();
  return (
    <Pressable style={[styles.secondaryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.inlineIconText}>
        {icon}
        <Text style={styles.secondaryText}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  selected,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  const { colors, styles } = useDashboardTheme();
  return (
    <Pressable style={[styles.choiceChip, selected && styles.choiceChipActive, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]} numberOfLines={1}>{label}</Text>
      {loading ? <ActivityIndicator color={selected ? colors.onBackground : colors.midground} /> : null}
    </Pressable>
  );
}

export function MiniBadge({ label, active }: { label: string; active?: boolean }) {
  const { styles } = useDashboardTheme();
  return (
    <View style={[styles.miniBadge, active && styles.miniBadgeOn]}>
      <Text style={[styles.miniBadgeText, active && styles.miniBadgeTextOn]}>{label}</Text>
    </View>
  );
}

export function PortalModal({
  visible,
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const { colors } = useDashboardTheme();
  const modalStyles = useMemo(() => createModalStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.portalRoot}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close modal" />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.header}>
            <View style={modalStyles.headerText}>
              <Text selectable style={modalStyles.title}>{title}</Text>
              {subtitle ? <Text selectable style={modalStyles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={modalStyles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close modal">
              <Text style={modalStyles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView style={modalStyles.body} contentContainerStyle={modalStyles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={modalStyles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function createModalStyles(colors: NativeThemeColors) {
  return StyleSheet.create({
    portalRoot: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    sheet: {
      width: "100%",
      maxWidth: 980,
      maxHeight: "88%",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 24,
      backgroundColor: colors.surfaceElevated,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 18 },
      elevation: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      padding: 22,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerText: { flex: 1, minWidth: 0, gap: 4 },
    title: { color: colors.midground, fontSize: 22, fontWeight: "900" },
    subtitle: { color: colors.midgroundFaint, lineHeight: 20 },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
    closeText: { color: colors.midground, fontSize: 24, fontWeight: "800", lineHeight: 28 },
    body: { maxHeight: 640 },
    bodyContent: { padding: 22, gap: 16 },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
  });
}

/** @deprecated Use useDashboardTheme().styles instead */
export function useDashboardStyles() {
  return useDashboardTheme().styles;
}
