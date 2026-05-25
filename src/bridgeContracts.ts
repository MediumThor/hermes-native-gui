import type { ProviderOption, ToolsetSetting } from "./hermesSettings";

export type ModelOptionsResponse = {
  provider: string;
  model: string;
  providers: ProviderOption[];
};

export type SetupStatusProvider = {
  slug?: string;
  name?: string;
  configured?: boolean;
  authenticated?: boolean;
  source?: string;
  message?: string;
};

export type SetupStatusResponse = {
  providers: SetupStatusProvider[];
  keys?: SetupStatusProvider[];
};

export type ConfigSection = {
  title?: string;
  name?: string;
  values?: unknown;
  entries?: unknown;
};

export type AgentProcess = {
  pid?: number | string;
  id?: string;
  name?: string;
  label?: string;
  status?: string;
};

export type CronJob = {
  id?: string;
  name?: string;
  schedule?: string;
  enabled?: boolean;
  command?: string;
  prompt?: string;
};

export type SkillSummary = {
  id?: string;
  name?: string;
  description?: string;
  path?: string;
  category?: string | null;
  enabled?: boolean;
  source?: string;
  trust?: string;
  version?: string;
};

export type SkillHubItem = {
  name?: string;
  description?: string;
  source?: string;
  trust?: string;
  version?: string;
};

export type DoctorCheckStatus = "ok" | "warning" | "error";

export type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  detail: string;
  command?: string;
};

export type DoctorStatusResponse = {
  checks: DoctorCheck[];
  generated_at?: number;
};

export type SkillHubBrowse = {
  items: SkillHubItem[];
  page: number;
  total_pages: number;
  total: number;
};

export function normalizeSkillsList(value: unknown): SkillSummary[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawSkills = record.skills;
  const skills = Array.isArray(rawSkills)
    ? rawSkills
    : rawSkills && typeof rawSkills === "object"
      ? Object.entries(rawSkills as Record<string, unknown>).flatMap(([category, entries]) => (
        Array.isArray(entries)
          ? entries.map((entry) => (typeof entry === "string" ? { name: entry, category } : { ...(entry as SkillSummary), category: (entry as SkillSummary).category ?? category }))
          : []
      ))
      : asRecordArray<SkillSummary>(value);
  return skills
    .map((skill) => ({
      ...skill,
      name: String(skill.name ?? skill.id ?? ""),
      enabled: skill.enabled !== false,
    }))
    .filter((skill) => skill.name)
    .sort((a, b) => {
      const category = String(a.category ?? "").localeCompare(String(b.category ?? ""));
      if (category !== 0) return category;
      return String(a.name).localeCompare(String(b.name));
    });
}

export function normalizeSkillHubBrowse(value: unknown): SkillHubBrowse {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    items: Array.isArray(record.items) ? record.items as SkillHubItem[] : [],
    page: Number(record.page ?? 1) || 1,
    total_pages: Number(record.total_pages ?? 1) || 1,
    total: Number(record.total ?? 0) || 0,
  };
}

export type PluginSummary = {
  id?: string;
  name?: string;
  key?: string;
  kind?: string;
  version?: string;
  description?: string;
  source?: string;
  status?: string;
  enabled?: boolean;
  tools?: number;
  hooks?: number;
  commands?: number;
  error?: string | null;
};

export function pluginRegistryName(plugin: PluginSummary): string {
  return String(plugin.key ?? plugin.name ?? plugin.id ?? "");
}

export function normalizePluginsList(value: unknown): PluginSummary[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const plugins = Array.isArray(record.plugins) ? record.plugins : asRecordArray<PluginSummary>(value);
  return plugins
    .map((plugin) => ({
      ...plugin,
      key: String(plugin.key ?? plugin.name ?? plugin.id ?? ""),
      name: String(plugin.name ?? plugin.key ?? plugin.id ?? ""),
      enabled: plugin.enabled !== false,
      tools: Number(plugin.tools ?? 0) || 0,
      hooks: Number(plugin.hooks ?? 0) || 0,
      commands: Number(plugin.commands ?? 0) || 0,
    }))
    .filter((plugin) => pluginRegistryName(plugin))
    .sort((a, b) => pluginRegistryName(a).localeCompare(pluginRegistryName(b)));
}

export type BridgeDataStatus = "idle" | "loading" | "ready" | "error";

export function asRecordArray<T = Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["skills", "jobs", "crons", "items", "entries", "providers", "keys", "plugins", "processes"]) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

export function normalizeModelOptions(value: unknown): ModelOptionsResponse {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    provider: String(record.provider ?? ""),
    model: String(record.model ?? ""),
    providers: Array.isArray(record.providers) ? record.providers as ProviderOption[] : [],
  };
}

export function normalizeToolsets(value: unknown): ToolsetSetting[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Array.isArray(record.toolsets) ? record.toolsets as ToolsetSetting[] : [];
}

export function displayValue(value: unknown, maxLength = 800): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  } catch {
    return String(value);
  }
}
