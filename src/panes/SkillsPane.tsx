import { Download, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { SkillHubBrowse, SkillHubItem, SkillSummary } from "../bridgeContracts";
import { AuxToolbar, Card, ChoiceChip, EmptyState, MiniBadge, PaneScroll, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
import { useDashboardTheme } from "../themes/DashboardThemeProvider";

type SkillsPaneProps = {
  connected: boolean;
  loading: boolean;
  message: string;
  savingKey: string | null;
  skills: SkillSummary[];
  hubBrowse: SkillHubBrowse;
  hubSearchResults: SkillHubItem[];
  onRefresh: () => void;
  onReload: () => void;
  onToggleSkill: (skill: SkillSummary) => void;
  onSearchHub: (query: string) => void;
  onBrowseHub: (page: number) => void;
  onInstallSkill: (name: string) => void;
};

function prettyCategory(raw: string | null | undefined) {
  if (!raw) return "General";
  return raw
    .split(/[-_/]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SkillsPane({
  connected,
  loading,
  message,
  savingKey,
  skills,
  hubBrowse,
  hubSearchResults,
  onRefresh,
  onReload,
  onToggleSkill,
  onSearchHub,
  onBrowseHub,
  onInstallSkill,
}: SkillsPaneProps) {
  const { colors, styles } = useDashboardTheme();
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [view, setView] = useState<"installed" | "browse">("installed");
  const saving = Boolean(savingKey || loading);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      const key = skill.category || "__general__";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => {
        if (a === "__general__") return -1;
        if (b === "__general__") return 1;
        return a.localeCompare(b);
      })
      .map(([key, count]) => ({
        key,
        label: key === "__general__" ? "General" : prettyCategory(key),
        count,
      }));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return skills.filter((skill) => {
      if (activeCategory && (skill.category || "__general__") !== activeCategory) return false;
      if (!needle) return true;
      return (
        String(skill.name).toLowerCase().includes(needle)
        || String(skill.description ?? "").toLowerCase().includes(needle)
        || String(skill.category ?? "").toLowerCase().includes(needle)
      );
    });
  }, [activeCategory, filter, skills]);

  const enabledCount = skills.filter((skill) => skill.enabled !== false).length;
  const hubItems = hubSearchResults.length ? hubSearchResults : hubBrowse.items;

  const runSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearchHub(trimmed);
    setView("browse");
  };

  const installFromQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onInstallSkill(trimmed);
  };

  return (
    <PaneScroll>
      <AuxToolbar
        connected={connected}
        loading={loading}
        message={message}
        onRefresh={onRefresh}
        actions={<SecondaryButton label="Reload skills" onPress={onReload} disabled={!connected || saving} />}
      />

      <Card>
        <SectionHeader
          title="Add a skill"
          subtitle="Search the skills hub or install by name. Disabled skills stay installed but won't load in new sessions."
        />
        <View style={styles.panelHeaderRow}>
          <TextInput
            style={[styles.input, styles.settingRowText]}
            value={query}
            onChangeText={setQuery}
            placeholder="Skill name or search query"
            placeholderTextColor={colors.midgroundMuted}
            editable={connected && !saving}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={runSearch}
          />
          <View style={styles.chipWrap}>
            <SecondaryButton
              label="Search"
              onPress={runSearch}
              disabled={!connected || saving || !query.trim()}
              icon={<Search color={colors.midground} size={16} />}
            />
            <SecondaryButton
              label={savingKey?.startsWith("install:") ? "Installing…" : "Install"}
              onPress={installFromQuery}
              disabled={!connected || saving || !query.trim()}
              icon={savingKey?.startsWith("install:") ? <ActivityIndicator color={colors.midground} /> : <Download color={colors.midground} size={16} />}
            />
          </View>
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Skills library"
          subtitle={`${enabledCount} of ${skills.length} installed skill(s) enabled.`}
        />
        <View style={styles.chipWrap}>
          <ChoiceChip label="Installed" selected={view === "installed"} disabled={saving || !connected} onPress={() => setView("installed")} />
          <ChoiceChip label="Browse hub" selected={view === "browse"} disabled={saving || !connected} onPress={() => setView("browse")} />
        </View>
      </Card>

      {view === "installed" ? (
        <Card>
          <SectionHeader title="Installed skills" subtitle="Tap a card to enable or disable a skill for CLI sessions." />
          <TextInput
            style={styles.input}
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter installed skills"
            placeholderTextColor={colors.midgroundMuted}
            editable={connected && !saving}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {categories.length > 1 ? (
            <View style={[styles.chipWrap, { marginTop: 12 }]}>
              <ChoiceChip
                label="All"
                selected={!activeCategory}
                disabled={saving || !connected}
                onPress={() => setActiveCategory(null)}
              />
              {categories.map((category) => (
                <ChoiceChip
                  key={category.key}
                  label={`${category.label} (${category.count})`}
                  selected={activeCategory === category.key}
                  disabled={saving || !connected}
                  onPress={() => setActiveCategory(category.key)}
                />
              ))}
            </View>
          ) : null}
          <View style={[styles.toolsetGrid, { marginTop: 12 }]}>
            {filteredSkills.length ? filteredSkills.map((skill) => {
              const enabled = skill.enabled !== false;
              const toggleKey = `skill:${skill.name}`;
              const isSaving = savingKey === toggleKey;
              return (
                <Pressable
                  key={skill.name}
                  style={[styles.toolsetCard, enabled && styles.toolsetCardOn, (saving || isSaving) && styles.disabled]}
                  onPress={() => onToggleSkill(skill)}
                  disabled={saving || !connected}
                >
                  <View style={styles.panelHeaderRow}>
                    <Text selectable style={styles.toolName}>{skill.name}</Text>
                    <MiniBadge label={isSaving ? "…" : enabled ? "On" : "Off"} active={enabled} />
                  </View>
                  <Text selectable style={styles.toolStatus}>{prettyCategory(skill.category)}</Text>
                  {skill.description ? (
                    <Text selectable style={styles.toolPreview} numberOfLines={4}>{skill.description}</Text>
                  ) : null}
                </Pressable>
              );
            }) : (
              <EmptyState
                title={skills.length ? "No matching skills" : "No skills found"}
                message={skills.length ? "Try clearing the filter or choosing another category." : "Install skills from the hub, then reload to refresh slash commands."}
              />
            )}
          </View>
        </Card>
      ) : (
        <Card>
          <SectionHeader
            title={hubSearchResults.length ? "Search results" : "Browse skills hub"}
            subtitle={hubSearchResults.length
              ? `${hubSearchResults.length} result(s) for your query.`
              : `${hubBrowse.total} skill(s) available · page ${hubBrowse.page} of ${hubBrowse.total_pages}`}
          />
          {hubItems.length ? hubItems.map((item, index) => {
            const name = String(item.name ?? "");
            const installKey = `install:${name}`;
            const isInstalling = savingKey === installKey;
            const alreadyInstalled = skills.some((skill) => skill.name === name);
            return (
              <View key={`${name}-${index}`} style={styles.listRow}>
                <View style={styles.panelHeaderRow}>
                  <View style={styles.settingRowText}>
                    <Text selectable style={styles.settingRowTitle}>{name || `Skill ${index + 1}`}</Text>
                    {item.description ? <Text selectable style={styles.settingHelp}>{String(item.description)}</Text> : null}
                    {item.source || item.trust ? (
                      <Text selectable style={styles.toolPreview}>
                        {[item.source, item.trust].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                  <SecondaryButton
                    label={alreadyInstalled ? "Installed" : isInstalling ? "Installing…" : "Install"}
                    onPress={() => onInstallSkill(name)}
                    disabled={!connected || saving || !name || alreadyInstalled || isInstalling}
                    icon={isInstalling ? <ActivityIndicator color={colors.midground} /> : <Download color={colors.midground} size={16} />}
                  />
                </View>
              </View>
            );
          }) : (
            <EmptyState title="No hub skills loaded" message="Search for a skill or refresh to browse the hub catalog." />
          )}
          {!hubSearchResults.length && hubBrowse.total_pages > 1 ? (
            <View style={[styles.chipWrap, { marginTop: 12 }]}>
              <SecondaryButton
                label="Previous"
                onPress={() => onBrowseHub(Math.max(1, hubBrowse.page - 1))}
                disabled={!connected || saving || hubBrowse.page <= 1}
              />
              <SecondaryButton
                label="Next"
                onPress={() => onBrowseHub(Math.min(hubBrowse.total_pages, hubBrowse.page + 1))}
                disabled={!connected || saving || hubBrowse.page >= hubBrowse.total_pages}
              />
            </View>
          ) : null}
        </Card>
      )}
    </PaneScroll>
  );
}
