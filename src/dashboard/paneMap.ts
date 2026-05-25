import type { DashboardPane } from "./nav";
import type { MainMenuPane } from "../components/MainMenu";

const MAIN_TO_DASHBOARD: Record<MainMenuPane, DashboardPane> = {
  chat: "chat",
  sessions: "sessions",
  activity: "analytics",
  settings: "config",
  commands: "docs",
  models: "models",
  tools: "config",
  skills: "skills",
  plugins: "plugins",
  cron: "cron",
  keys: "keys",
  system: "profiles",
  logs: "logs",
};

const DASHBOARD_TO_MAIN: Partial<Record<DashboardPane, MainMenuPane>> = {
  chat: "chat",
  sessions: "sessions",
  analytics: "activity",
  config: "settings",
  models: "models",
  logs: "logs",
  cron: "cron",
  skills: "skills",
  plugins: "plugins",
  profiles: "system",
  keys: "keys",
};

export function mainMenuPaneToDashboard(pane: MainMenuPane): DashboardPane {
  return MAIN_TO_DASHBOARD[pane];
}

export function dashboardPaneToMainMenu(pane: DashboardPane): MainMenuPane | null {
  return DASHBOARD_TO_MAIN[pane] ?? null;
}

export const DESKTOP_SIDEBAR_BREAKPOINT = 960;
