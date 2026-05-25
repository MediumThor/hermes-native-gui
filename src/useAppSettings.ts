import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { isChatMode, type ChatMode } from "./chatModes";

const STORAGE_KEY = "hermes-native-gui-settings";

export type SessionsViewMode = "list" | "grid";

export type AppSettings = {
  /** Stop the in-flight turn before starting a new chat or resuming another session. */
  interruptOnNewChat: boolean;
  /** Reattach the last live gateway session after connecting (never creates a new one). */
  autoResumeOnConnect: boolean;
  /** Layout for the sessions pane. */
  sessionsViewMode: SessionsViewMode;
  /** Composer mode: agent (full tools), plan (/plan), or ask (read-only). */
  chatMode: import("./chatModes").ChatMode;
};

const DEFAULT_SETTINGS: AppSettings = {
  interruptOnNewChat: true,
  autoResumeOnConnect: true,
  sessionsViewMode: "list",
  chatMode: "agent",
};

function readStoredSettings(): AppSettings {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      interruptOnNewChat:
        typeof parsed.interruptOnNewChat === "boolean"
          ? parsed.interruptOnNewChat
          : DEFAULT_SETTINGS.interruptOnNewChat,
      autoResumeOnConnect:
        typeof parsed.autoResumeOnConnect === "boolean"
          ? parsed.autoResumeOnConnect
          : DEFAULT_SETTINGS.autoResumeOnConnect,
      sessionsViewMode:
        parsed.sessionsViewMode === "grid" || parsed.sessionsViewMode === "list"
          ? parsed.sessionsViewMode
          : DEFAULT_SETTINGS.sessionsViewMode,
      chatMode: isChatMode(parsed.chatMode) ? parsed.chatMode : DEFAULT_SETTINGS.chatMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStoredSettings(settings: AppSettings) {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(readStoredSettings());
  }, []);

  const setInterruptOnNewChat = useCallback((interruptOnNewChat: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, interruptOnNewChat };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const setAutoResumeOnConnect = useCallback((autoResumeOnConnect: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, autoResumeOnConnect };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const setSessionsViewMode = useCallback((sessionsViewMode: SessionsViewMode) => {
    setSettings((prev) => {
      const next = { ...prev, sessionsViewMode };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const setChatMode = useCallback((chatMode: ChatMode) => {
    setSettings((prev) => {
      const next = { ...prev, chatMode };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      interruptOnNewChat: settings.interruptOnNewChat,
      setInterruptOnNewChat,
      autoResumeOnConnect: settings.autoResumeOnConnect,
      setAutoResumeOnConnect,
      sessionsViewMode: settings.sessionsViewMode,
      setSessionsViewMode,
      chatMode: settings.chatMode,
      setChatMode,
    }),
    [
      settings.autoResumeOnConnect,
      settings.chatMode,
      settings.interruptOnNewChat,
      settings.sessionsViewMode,
      setAutoResumeOnConnect,
      setChatMode,
      setInterruptOnNewChat,
      setSessionsViewMode,
    ],
  );
}
