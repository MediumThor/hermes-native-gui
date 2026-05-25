import { Pressable, Text, View } from "react-native";
import type { AgentProcess, ConfigSection, CronJob, PluginSummary, SetupStatusProvider } from "../bridgeContracts";
import { asRecordArray, displayValue } from "../bridgeContracts";
import { AuxToolbar, Card, EmptyState, PaneScroll, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type ResourcePaneBaseProps = {
  connected: boolean;
  loading: boolean;
  message: string;
};

type CommandPair = [string, string];
type CommandCategory = { name?: string; pairs?: CommandPair[] };

export function CommandsPane({ connected, loading, message, commandCatalog, onRefresh }: ResourcePaneBaseProps & {
  commandCatalog: unknown;
  onRefresh: () => void;
}) {
  const { styles } = useDashboardTheme();
  const catalog = commandCatalog as any;
  const categories = Array.isArray(catalog?.categories) ? catalog.categories as CommandCategory[] : [];
  const fallbackPairs = Array.isArray(catalog?.pairs) ? catalog.pairs as CommandPair[] : [];
  const visibleCategories = categories.length ? categories : [{ name: "Commands", pairs: fallbackPairs }];
  const commandCount = visibleCategories.reduce((count, category) => count + (Array.isArray(category.pairs) ? category.pairs.length : 0), 0);

  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader
          title="Slash command reference"
          subtitle={`${commandCount} command(s) from Hermes commands.catalog. Type / in chat for autocomplete.`}
        />
        {visibleCategories.some((category) => Array.isArray(category.pairs) && category.pairs.length) ? visibleCategories.map((category, categoryIndex) => (
          <View key={String(category.name ?? categoryIndex)} style={styles.listRow}>
            <Text selectable style={styles.settingRowTitle}>{String(category.name ?? `Category ${categoryIndex + 1}`)}</Text>
            {(category.pairs ?? []).map((pair, index) => (
              <View key={`${pair[0]}-${index}`} style={styles.inlineIconText}>
                <Text selectable style={styles.toolName}>{String(pair[0])}</Text>
                <Text selectable style={styles.settingHelp}>{String(pair[1] ?? "")}</Text>
              </View>
            ))}
          </View>
        )) : <EmptyState title="No commands loaded" message="Connect and refresh to load the slash command catalog." />}
      </Card>
    </PaneScroll>
  );
}

export function PluginsPane({ connected, loading, message, plugins, onRefresh, onReloadMcp }: ResourcePaneBaseProps & {
  plugins: PluginSummary[];
  onRefresh: () => void;
  onReloadMcp: () => void;
}) {
  const { styles } = useDashboardTheme();
  return (
    <PaneScroll>
      <AuxToolbar
        connected={connected}
        loading={loading}
        message={message}
        onRefresh={onRefresh}
        actions={<SecondaryButton label="Reload MCP" onPress={onReloadMcp} disabled={!connected || loading} />}
      />
      <Card>
        <SectionHeader title="Loaded plugins" subtitle={`${plugins.length} plugin(s) reported by Hermes.`} />
        {plugins.length ? plugins.map((plugin, index) => (
          <View key={String(plugin?.name ?? plugin?.id ?? index)} style={styles.listRow}>
            <Text selectable style={styles.settingRowTitle}>{String(plugin?.name ?? plugin?.id ?? `Plugin ${index + 1}`)}</Text>
            {plugin?.version ? <Text selectable style={styles.settingHelp}>Version {String(plugin.version)}</Text> : null}
            {plugin?.description ? <Text selectable style={styles.toolPreview}>{String(plugin.description)}</Text> : null}
            {plugin?.status ? <Text selectable style={styles.toolStatus}>{String(plugin.status)}</Text> : null}
          </View>
        )) : <EmptyState title="No plugins loaded" message="Connect and refresh after configuring plugins or MCP servers." />}
      </Card>
    </PaneScroll>
  );
}

export function CronPane({ connected, loading, message, cronState, onRefresh }: ResourcePaneBaseProps & {
  cronState: unknown;
  onRefresh: () => void;
}) {
  const { styles } = useDashboardTheme();
  const jobs = asRecordArray<CronJob>((cronState as any)?.jobs ?? (cronState as any)?.crons ?? cronState);
  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      <Card>
        <SectionHeader title="Scheduled jobs" subtitle={`${jobs.length} cron job(s) reported by Hermes.`} />
        {jobs.length ? jobs.map((job, index) => (
          <View key={String(job?.id ?? job?.name ?? index)} style={styles.listRow}>
            <Text selectable style={styles.settingRowTitle}>{String(job?.name ?? job?.id ?? `Job ${index + 1}`)}</Text>
            {job?.schedule ? <Text selectable style={styles.settingHelp}>Schedule: {String(job.schedule)}</Text> : null}
            {job?.enabled != null ? <Text selectable style={styles.toolStatus}>{job.enabled ? "Enabled" : "Disabled"}</Text> : null}
            {job?.command || job?.prompt ? <Text selectable style={styles.toolPreview}>{String(job.command ?? job.prompt)}</Text> : null}
          </View>
        )) : <EmptyState title="No scheduled jobs" message="Cron jobs created in Hermes will appear here." />}
      </Card>
    </PaneScroll>
  );
}

export function KeysPane({ connected, loading, message, setupStatus, onRefresh, onReloadEnv }: ResourcePaneBaseProps & {
  setupStatus: unknown;
  onRefresh: () => void;
  onReloadEnv: () => void;
}) {
  const { styles } = useDashboardTheme();
  const providers = asRecordArray<SetupStatusProvider>((setupStatus as any)?.providers ?? (setupStatus as any)?.keys ?? setupStatus);
  return (
    <PaneScroll>
      <AuxToolbar
        connected={connected}
        loading={loading}
        message={message}
        onRefresh={onRefresh}
        actions={<SecondaryButton label="Reload .env" onPress={onReloadEnv} disabled={!connected || loading} />}
      />
      <Card>
        <SectionHeader title="Credential status" subtitle="Shows setup status only. Secret values are never displayed here." />
        {providers.length ? providers.map((provider, index) => (
          <View key={String(provider?.slug ?? provider?.name ?? index)} style={styles.listRow}>
            <Text selectable style={styles.settingRowTitle}>{String(provider?.name ?? provider?.slug ?? `Provider ${index + 1}`)}</Text>
            <Text selectable style={styles.settingHelp}>
              {provider?.configured || provider?.authenticated ? "Configured" : "Missing credentials"}
              {provider?.source ? ` · ${String(provider.source)}` : ""}
            </Text>
            {provider?.message ? <Text selectable style={styles.toolPreview}>{String(provider.message)}</Text> : null}
          </View>
        )) : <EmptyState title="No credential status loaded" message="Connect and refresh to inspect provider setup status." />}
      </Card>
    </PaneScroll>
  );
}

export function SystemPane({ connected, loading, message, showRuntime, agents, browserState, profileInfo, configSections, onRefresh }: ResourcePaneBaseProps & {
  showRuntime: boolean;
  agents: AgentProcess[];
  browserState: unknown;
  profileInfo: unknown;
  configSections: ConfigSection[];
  onRefresh: () => void;
}) {
  const { styles } = useDashboardTheme();
  return (
    <PaneScroll>
      <AuxToolbar connected={connected} loading={loading} message={message} onRefresh={onRefresh} />
      {showRuntime ? (
        <>
          <Card>
            <SectionHeader title="Agent processes" subtitle={`${agents.length} process(es) reported by Hermes.`} />
            {agents.length ? agents.map((agent, index) => (
              <View key={String(agent?.pid ?? agent?.id ?? index)} style={styles.listRow}>
                <Text selectable style={styles.settingRowTitle}>{String(agent?.name ?? agent?.label ?? `Process ${index + 1}`)}</Text>
                {agent?.pid != null ? <Text selectable style={styles.settingHelp}>PID {String(agent.pid)}</Text> : null}
                {agent?.status ? <Text selectable style={styles.toolStatus}>{String(agent.status)}</Text> : null}
              </View>
            )) : <EmptyState title="No live processes" message="No live agent processes were reported by Hermes." />}
          </Card>
          <Card>
            <SectionHeader title="Browser integration" subtitle="Status from Hermes browser.manage." />
            <Text selectable style={styles.toolPreview}>{displayValue(browserState)}</Text>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <SectionHeader title="Profile" />
            <Text selectable style={styles.toolPreview}>{displayValue(profileInfo)}</Text>
          </Card>
          <Card>
            <SectionHeader title="Configuration" subtitle={`${configSections.length} config section(s).`} />
            {configSections.length ? configSections.map((section, index) => (
              <View key={String(section?.title ?? section?.name ?? index)} style={styles.listRow}>
                <Text selectable style={styles.settingRowTitle}>{String(section?.title ?? section?.name ?? `Section ${index + 1}`)}</Text>
                <Text selectable style={styles.toolPreview}>{displayValue(section?.values ?? section?.entries ?? section)}</Text>
              </View>
            )) : <EmptyState title="No configuration loaded" message="Connect and refresh to read Hermes config sections." />}
          </Card>
        </>
      )}
    </PaneScroll>
  );
}
