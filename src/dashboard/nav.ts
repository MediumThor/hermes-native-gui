import type { LucideIcon } from "lucide-react-native";
import {
  BarChart3,
  BookOpen,
  Clock,
  Cpu,
  FileText,
  KeyRound,
  MessageSquare,
  Package,
  Puzzle,
  Settings,
  Terminal,
  Users,
} from "lucide-react-native";

export type DashboardPane =
  | "chat"
  | "sessions"
  | "analytics"
  | "models"
  | "logs"
  | "cron"
  | "skills"
  | "plugins"
  | "profiles"
  | "config"
  | "keys"
  | "docs";

export type DashboardNavItem = {
  id: DashboardPane;
  label: string;
  icon: LucideIcon;
};

/** Mirrors `web/src/App.tsx` built-in sidebar order (with Chat first). */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { id: "chat", label: "Chat", icon: Terminal },
  { id: "sessions", label: "Sessions", icon: MessageSquare },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "models", label: "Models", icon: Cpu },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "cron", label: "Cron", icon: Clock },
  { id: "skills", label: "Skills", icon: Package },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "config", label: "Config", icon: Settings },
  { id: "keys", label: "Keys", icon: KeyRound },
  { id: "docs", label: "Documentation", icon: BookOpen },
];

export const IMPLEMENTED_PANES = new Set<DashboardPane>([
  "chat",
  "sessions",
  "analytics",
  "models",
  "logs",
  "cron",
  "skills",
  "plugins",
  "profiles",
  "config",
  "keys",
]);

export function paneTitle(pane: DashboardPane): string {
  return DASHBOARD_NAV_ITEMS.find((item) => item.id === pane)?.label ?? "Hermes";
}

export function paneSubtitle(pane: DashboardPane): string {
  switch (pane) {
    case "chat":
      return "Embedded Hermes chat surface.";
    case "sessions":
      return "Browse and resume recent Hermes sessions.";
    case "config":
      return "Bridge connection, models, toolsets, and display settings.";
    case "docs":
      return "Command reference and Hermes documentation.";
    default:
      return "This dashboard section is not wired in the Native GUI yet.";
  }
}
