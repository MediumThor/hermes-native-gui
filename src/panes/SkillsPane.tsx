import { Download, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { SkillHubBrowse, SkillHubItem, SkillSummary } from "../bridgeContracts";
import { AuxToolbar, Card, ChoiceChip, EmptyState, MiniBadge, PaneScroll, PortalModal, SectionHeader, SecondaryButton } from "../components/DashboardPrimitives";
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

const RECOMMENDED_BUNDLES = [
  { label: "Coding", match: ["github", "test", "debug", "plan", "react", "python", "code"], description: "Implementation planning, debugging, review, and repo workflows." },
  { label: "Research", match: ["arxiv", "research", "youtube", "blog", "wiki", "maps"], description: "Paper discovery, web/source monitoring, summarization, and knowledge gathering." },
  { label: "Productivity", match: ["google", "notion", "linear", "airtable", "pdf", "powerpoint", "obsidian"], description: "Docs, calendars, databases, notes, PDFs, and work management." },
  { label: "Creative", match: ["design", "diagram", "comic", "infographic", "ascii", "pixel", "song", "video"], description: "Visual artifacts, diagrams, media, and creative generation workflows." },
];

function prettyCategory(raw: string | null | undefined) {
  if (!raw) return "General";
  return raw
    .split(/[-_/]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function whatSkillDoes(skill: SkillSummary | SkillHubItem) {
  const text = `${String(skill.name ?? "")} ${String(skill.description ?? "")}`.toLowerCase();
  if (text.includes("github") || text.includes("pr") || text.includes("issue")) return "Lets Hermes manage repository workflows such as issues, pull requests, review, and CI checks.";
  if (text.includes("debug") || text.includes("test")) return "Gives Hermes a proven technical workflow for diagnosing bugs and validating fixes.";
  if (text.includes("plan")) return "Helps Hermes turn a broad request into a sequenced implementation plan with acceptance criteria.";
  if (text.includes("arxiv") || text.includes("research") || text.includes("paper")) return "Lets Hermes search, triage, and summarize domain sources with the right retrieval flow.";
  if (text.includes("google") || text.includes("notion") || text.includes("linear") || text.includes("airtable")) return "Gives Hermes app-specific commands and safety rules for structured productivity tools.";
  if (text.includes("design") || text.includes("diagram") || text.includes("infographic")) return "Guides Hermes through visual artifact creation with layout, style, and verification checks.";
  return "Adds a reusable workflow Hermes can load when a matching task appears, reducing guesswork and setup friction.";
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
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
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

  const selectedSkill = skills.find((skill) => skill.name === selectedSkillName) ?? null;
  const enabledCount = skills.filter((skill) => skill.enabled !== false).length;
  const hubItems = hubSearchResults.length ? hubSearchResults : hubBrowse.items;

  const bundleCounts = RECOMMENDED_BUNDLES.map((bundle) => ({
    ...bundle,
    skills: skills.filter((skill) => {
      const text = `${skill.name ?? ""} ${skill.description ?? ""} ${skill.category ?? ""}`.toLowerCase();
      return bundle.match.some((term) => text.includes(term));
    }),
  }));

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

  const renderSkillDetails = () => {
    if (!selectedSkill) return null;
    const enabled = selectedSkill.enabled !== false;
    const toggleKey = `skill:${selectedSkill.name}`;
    return (
      <>
        <View style={styles.panelHeaderRow}>
          <View style={styles.settingRowText}>
            <Text selectable style={styles.settingRowTitle}>{selectedSkill.name}</Text>
            <Text selectable style={styles.settingHelp}>{whatSkillDoes(selectedSkill)}</Text>
          </View>
          <MiniBadge label={enabled ? "Enabled" : "Disabled"} active={enabled} />
        </View>
        <View style={styles.settingsGrid}>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Category</Text>
            <Text selectable style={styles.infoValue}>{prettyCategory(selectedSkill.category)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Source / trust</Text>
            <Text selectable style={styles.infoValue}>{selectedSkill.source || selectedSkill.trust || (selectedSkill.path ? "Local installed skill" : "Bundled or local skill")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text selectable style={styles.infoLabel}>Version</Text>
            <Text selectable style={styles.infoValue}>{selectedSkill.version || "Not reported"}</Text>
          </View>
        </View>
        {selectedSkill.description ? <Text selectable style={styles.toolPreview}>{selectedSkill.description}</Text> : null}
        {selectedSkill.path ? <Text selectable style={styles.emptyCode}>{selectedSkill.path}</Text> : null}
        <SecondaryButton
          label={savingKey === toggleKey ? "Saving…" : enabled ? "Disable skill" : "Enable skill"}
          onPress={() => onToggleSkill(selectedSkill)}
          disabled={!connected || saving}
        />
      </>
    );
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
          title="Recommended bundles"
          subtitle="Fast paths for discovering groups of skills that make Hermes feel purpose-built for a task."
        />
        <View style={styles.toolsetGrid}>
          {bundleCounts.map((bundle) => (
            <View key={bundle.label} style={styles.toolsetCard}>
              <View style={styles.panelHeaderRow}>
                <Text selectable style={styles.settingRowTitle}>{bundle.label}</Text>
                <MiniBadge label={`${bundle.skills.length} installed`} active={bundle.skills.length > 0} />
              </View>
              <Text selectable style={styles.toolPreview}>{bundle.description}</Text>
              <Text selectable style={styles.toolStatus} numberOfLines={2}>{bundle.skills.slice(0, 5).map((skill) => skill.name).join(", ") || "Search the hub to add matching skills."}</Text>
            </View>
          ))}
        </View>
      </Card>

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
        <>
          <Card>
            <SectionHeader title="Installed skills" subtitle="Open a card to inspect details in a portaled modal." />
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
                <ChoiceChip label="All" selected={!activeCategory} disabled={saving || !connected} onPress={() => setActiveCategory(null)} />
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
                const selected = selectedSkillName === skill.name;
                return (
                  <Pressable
                    key={skill.name}
                    style={[styles.toolsetCard, (enabled || selected) && styles.toolsetCardOn, saving && styles.disabled]}
                    onPress={() => setSelectedSkillName(String(skill.name))}
                    disabled={saving || !connected}
                  >
                    <View style={styles.panelHeaderRow}>
                      <Text selectable style={styles.toolName}>{skill.name}</Text>
                      <MiniBadge label={enabled ? "On" : "Off"} active={enabled} />
                    </View>
                    <Text selectable style={styles.toolStatus}>{prettyCategory(skill.category)}</Text>
                    <Text selectable style={styles.toolPreview} numberOfLines={4}>{skill.description || whatSkillDoes(skill)}</Text>
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
        </>
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
                    <Text selectable style={styles.settingHelp}>{whatSkillDoes(item)}</Text>
                    {item.description ? <Text selectable style={styles.toolPreview}>{String(item.description)}</Text> : null}
                    {item.source || item.trust || item.version ? (
                      <Text selectable style={styles.toolPreview}>
                        {[item.source, item.trust, item.version].filter(Boolean).join(" · ")}
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
              <SecondaryButton label="Previous" onPress={() => onBrowseHub(Math.max(1, hubBrowse.page - 1))} disabled={!connected || saving || hubBrowse.page <= 1} />
              <SecondaryButton label="Next" onPress={() => onBrowseHub(Math.min(hubBrowse.total_pages, hubBrowse.page + 1))} disabled={!connected || saving || hubBrowse.page >= hubBrowse.total_pages} />
            </View>
          ) : null}
        </Card>
      )}
      <PortalModal
        visible={Boolean(selectedSkill)}
        title={selectedSkill?.name || "Skill details"}
        subtitle="What this skill lets Hermes do, where it came from, and whether it loads in new sessions."
        onClose={() => setSelectedSkillName(null)}
      >
        {renderSkillDetails()}
      </PortalModal>
    </PaneScroll>
  );
}
