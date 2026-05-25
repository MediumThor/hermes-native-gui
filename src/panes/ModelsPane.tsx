import { Star } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { HermesSettingsState, ProviderOption } from "../hermesSettings";
import { AuxToolbar, Card, EmptyState, MiniBadge, PaneScroll, PortalModal, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type ModelsPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  savingKey: string | null;
  hermesSettings: HermesSettingsState;
  providers: ProviderOption[];
  onRefresh: () => void;
  onSwitchModel: (model: string) => void;
};

type ModelRow = {
  id: string;
  model: string;
  providerSlug: string;
  providerName: string;
  authenticated: boolean;
  current: boolean;
};

const FAVORITES_KEY = "hermes-native-gui.favorite-models.v1";
const RECENTS_KEY = "hermes-native-gui.recent-models.v1";

function readStoredList(key: string): string[] {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 24) : [];
  } catch {
    return [];
  }
}

function writeStoredList(key: string, value: string[]) {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value.slice(0, 24)));
}

function inferCapabilities(model: string) {
  const lower = model.toLowerCase();
  const capabilities = [
    lower.includes("vision") || lower.includes("gpt-4o") || lower.includes("gemini") || lower.includes("claude") ? "vision likely" : null,
    lower.includes("reason") || lower.includes("thinking") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4") || lower.includes("sonnet") || lower.includes("opus") ? "reasoning" : null,
    lower.includes("mini") || lower.includes("haiku") || lower.includes("flash") || lower.includes("lite") ? "low latency" : null,
    lower.includes("code") || lower.includes("coder") || lower.includes("sonnet") ? "coding" : null,
  ].filter(Boolean) as string[];
  return capabilities.length ? capabilities : ["chat"];
}

function inferContext(model: string) {
  const lower = model.toLowerCase();
  if (lower.includes("1m") || lower.includes("1000000")) return "~1M tokens";
  if (lower.includes("gemini")) return "large context (provider metadata unavailable)";
  if (lower.includes("claude")) return "large context (provider metadata unavailable)";
  if (lower.includes("gpt-4.1") || lower.includes("gpt-4o")) return "large context (provider metadata unavailable)";
  return "context metadata unavailable";
}

function providerStatus(provider: ProviderOption) {
  if (provider.authenticated) return "Authenticated";
  if (provider.is_current) return "Current provider";
  return provider.warning || "Not configured";
}

export function ModelsPane({ connected, loading, message, savingKey, hermesSettings, providers, onRefresh, onSwitchModel }: ModelsPaneProps) {
  const { colors, styles } = useDashboardTheme();
  const [modalQuery, setModalQuery] = useState("");
  const [selectedProviderSlug, setSelectedProviderSlug] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredList(FAVORITES_KEY));
  const [recent, setRecent] = useState<string[]>(() => readStoredList(RECENTS_KEY));
  const saving = Boolean(savingKey || loading);

  const rows = useMemo<ModelRow[]>(() => providers.flatMap((provider) => (
    (provider.models ?? []).map((model) => ({
      id: `${provider.slug}:${model}`,
      model,
      providerSlug: provider.slug,
      providerName: provider.name || provider.slug,
      authenticated: provider.authenticated || Boolean(provider.is_current),
      current: hermesSettings.model === model,
    }))
  )), [hermesSettings.model, providers]);

  const rowByModel = useMemo(() => {
    const map = new Map<string, ModelRow>();
    for (const row of rows) if (!map.has(row.model)) map.set(row.model, row);
    return map;
  }, [rows]);

  const favoriteRows = favorites.map((model) => rowByModel.get(model)).filter(Boolean) as ModelRow[];
  const recentRows = recent.map((model) => rowByModel.get(model)).filter(Boolean) as ModelRow[];
  const selectedProvider = providers.find((provider) => provider.slug === selectedProviderSlug) ?? null;

  const selectedProviderRows = useMemo(() => {
    if (!selectedProvider) return [];
    const needle = modalQuery.trim().toLowerCase();
    const providerRows = rows.filter((row) => row.providerSlug === selectedProvider.slug);
    if (!needle) return providerRows;
    return providerRows.filter((row) => `${row.model} ${row.providerName}`.toLowerCase().includes(needle));
  }, [modalQuery, rows, selectedProvider]);

  const toggleFavorite = (model: string) => {
    const next = favorites.includes(model)
      ? favorites.filter((entry) => entry !== model)
      : [model, ...favorites.filter((entry) => entry !== model)];
    setFavorites(next);
    writeStoredList(FAVORITES_KEY, next);
  };

  const switchAndRemember = (model: string) => {
    const next = [model, ...recent.filter((entry) => entry !== model)].slice(0, 12);
    setRecent(next);
    writeStoredList(RECENTS_KEY, next);
    onSwitchModel(model);
    setSelectedProviderSlug(null);
  };

  const openProvider = (provider: ProviderOption) => {
    if (!(provider.models?.length)) return;
    setModalQuery("");
    setSelectedProviderSlug(provider.slug);
  };

  const renderCompactPick = (row: ModelRow) => (
    <SecondaryButton
      key={`${row.providerSlug}:${row.model}`}
      label={row.model}
      onPress={() => switchAndRemember(row.model)}
      disabled={saving || !connected || !row.authenticated || row.current}
    />
  );

  const renderModelRow = (row: ModelRow) => {
    const selected = hermesSettings.model === row.model;
    const isFavorite = favorites.includes(row.model);
    const capabilities = inferCapabilities(row.model);
    return (
      <View key={row.id} style={[styles.listRow, selected && styles.toolsetCardOn]}>
        <View style={styles.panelHeaderRow}>
          <View style={styles.settingRowText}>
            <Text selectable style={styles.settingRowTitle}>{row.model}</Text>
            <Text selectable style={styles.settingHelp}>{inferContext(row.model)} · pricing unavailable from bridge metadata</Text>
          </View>
          <View style={styles.chipWrap}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => toggleFavorite(row.model)}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? `Remove ${row.model} from favorites` : `Favorite ${row.model}`}
            >
              <Star color={isFavorite ? colors.highlight : colors.midgroundMuted} fill={isFavorite ? colors.highlight : "transparent"} size={16} />
            </Pressable>
            <SecondaryButton
              label={selected ? "Selected" : savingKey === `model:${row.model}` ? "Switching…" : "Use model"}
              onPress={() => switchAndRemember(row.model)}
              disabled={saving || selected || !connected || !row.authenticated}
            />
          </View>
        </View>
        <View style={styles.chipWrap}>
          {selected ? <MiniBadge label="Current" active /> : null}
          {capabilities.map((capability) => <MiniBadge key={capability} label={capability} active={selected} />)}
        </View>
      </View>
    );
  };

  const modalFavoriteRows = selectedProvider ? favoriteRows.filter((row) => row.providerSlug === selectedProvider.slug) : [];
  const modalRecentRows = selectedProvider ? recentRows.filter((row) => row.providerSlug === selectedProvider.slug) : [];

  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader
          title="Model picker"
          subtitle={`${rows.length} model(s) across ${providers.length} provider(s). Providers stay compact; open one to pick from a portaled modal.`}
        />
        <View style={styles.chipWrap}>
          <MiniBadge label={`Current: ${hermesSettings.model || "unknown"}`} active />
          {hermesSettings.provider ? <MiniBadge label={hermesSettings.provider} active /> : null}
          {favoriteRows.length ? <MiniBadge label={`${favoriteRows.length} favorite(s)`} /> : null}
          {recentRows.length ? <MiniBadge label={`${recentRows.length} recent`} /> : null}
        </View>
      </Card>

      {favoriteRows.length || recentRows.length ? (
        <Card>
          <SectionHeader title="Quick picks" subtitle="Favorite and recently used models stay compact here; provider modals remain the full picker." />
          {favoriteRows.length ? (
            <View style={styles.settingBlock}>
              <Text selectable style={styles.settingRowTitle}>Favorites</Text>
              <View style={styles.chipWrap}>{favoriteRows.slice(0, 8).map(renderCompactPick)}</View>
            </View>
          ) : null}
          {recentRows.length ? (
            <View style={styles.settingBlock}>
              <Text selectable style={styles.settingRowTitle}>Recently used</Text>
              <View style={styles.chipWrap}>{recentRows.slice(0, 8).map(renderCompactPick)}</View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Providers" subtitle="Click a provider to open its model picker modal. Providers without advertised models stay collapsed." />
        {providers.length ? (
          <View style={styles.settingsGrid}>
            {providers.map((provider) => {
              const count = provider.models?.length ?? 0;
              const currentModel = provider.models?.includes(hermesSettings.model) ? hermesSettings.model : "";
              const available = count > 0;
              return (
                <Pressable
                  key={provider.slug}
                  style={[styles.providerBlock, provider.is_current && styles.toolsetCardOn, (!available || saving) && styles.disabled]}
                  onPress={() => openProvider(provider)}
                  disabled={!available || saving || !connected}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${provider.name || provider.slug} model picker`}
                >
                  <View style={styles.panelHeaderRow}>
                    <View style={styles.settingRowText}>
                      <Text selectable style={styles.settingRowTitle}>{provider.name || provider.slug}</Text>
                      <Text selectable style={styles.settingHelp}>{providerStatus(provider)}{provider.is_current ? " · current" : ""}</Text>
                    </View>
                    <MiniBadge label={`${count} models`} active={provider.authenticated || provider.is_current} />
                  </View>
                  {currentModel ? <Text selectable style={styles.toolPreview}>Current model: {currentModel}</Text> : null}
                  <SecondaryButton
                    label={available ? "Open picker" : "No models"}
                    onPress={() => openProvider(provider)}
                    disabled={!available || saving || !connected}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No models loaded" message="Connect and refresh to show configured providers and models." />
        )}
      </Card>

      <PortalModal
        visible={Boolean(selectedProvider)}
        title={`${selectedProvider?.name || selectedProvider?.slug || "Provider"} models`}
        subtitle="Search within this provider, favorite models, and switch directly from the modal."
        onClose={() => setSelectedProviderSlug(null)}
      >
        <TextInput
          style={styles.input}
          value={modalQuery}
          onChangeText={setModalQuery}
          placeholder="Search this provider's models"
          placeholderTextColor={colors.midgroundMuted}
          editable={connected && !saving}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {modalFavoriteRows.length ? (
          <View style={styles.settingBlock}>
            <Text selectable style={styles.settingRowTitle}>Favorites in this provider</Text>
            <View style={styles.chipWrap}>{modalFavoriteRows.slice(0, 8).map(renderCompactPick)}</View>
          </View>
        ) : null}
        {modalRecentRows.length ? (
          <View style={styles.settingBlock}>
            <Text selectable style={styles.settingRowTitle}>Recent in this provider</Text>
            <View style={styles.chipWrap}>{modalRecentRows.slice(0, 8).map(renderCompactPick)}</View>
          </View>
        ) : null}
        {selectedProviderRows.length ? (
          <View style={styles.settingBlock}>{selectedProviderRows.map(renderModelRow)}</View>
        ) : (
          <EmptyState
            title={modalQuery.trim() ? "No matching models" : "No models advertised"}
            message={modalQuery.trim() ? "Try a different search term or clear the search field." : "Hermes did not return model shortcuts for this provider."}
          />
        )}
      </PortalModal>
    </PaneScroll>
  );
}
