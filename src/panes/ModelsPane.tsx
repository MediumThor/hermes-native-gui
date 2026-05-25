import { Pressable, Text, View } from "react-native";
import type { HermesSettingsState, ProviderOption } from "../hermesSettings";
import { AuxToolbar, Card, ChoiceChip, EmptyState, PaneScroll, SectionHeader } from "../components/DashboardPrimitives";
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

export function ModelsPane({ connected, loading, message, savingKey, hermesSettings, providers, onRefresh, onSwitchModel }: ModelsPaneProps) {
  const { styles } = useDashboardTheme();
  const saving = Boolean(savingKey || loading);
  const activeProvider = providers.find((provider) => provider.slug === hermesSettings.provider || provider.is_current);
  const visibleProviders = providers.filter((provider) => provider.authenticated || provider.is_current);

  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader
          title="Current model"
          subtitle={`${hermesSettings.model || "unknown"}${hermesSettings.provider ? ` · ${hermesSettings.provider}` : ""}`}
        />
        {visibleProviders.length ? (
          <View style={styles.settingsGrid}>
            {visibleProviders.map((provider) => (
              <View key={provider.slug} style={styles.providerBlock}>
                <Text selectable style={styles.settingRowTitle}>{provider.name || provider.slug}</Text>
                <Text selectable style={styles.settingHelp}>
                  {provider.authenticated ? "Authenticated" : provider.warning || "Not authenticated"}{provider.is_current ? " · current provider" : ""}
                </Text>
                {provider.models?.length ? (
                  <View style={styles.chipWrap}>
                    {provider.models.slice(0, 16).map((model) => {
                      const selected = hermesSettings.model === model;
                      return (
                        <ChoiceChip
                          key={`${provider.slug}:${model}`}
                          label={model}
                          selected={selected}
                          loading={savingKey === `model:${model}`}
                          disabled={saving || selected || !connected}
                          onPress={() => onSwitchModel(model)}
                        />
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title="No models loaded" message="Connect and refresh to show configured providers and model shortcuts." />
        )}
        {activeProvider?.models && activeProvider.models.length > 16 ? (
          <Text selectable style={styles.settingHelp}>Showing curated model shortcuts; use /model in Hermes for the full picker.</Text>
        ) : null}
      </Card>
    </PaneScroll>
  );
}
