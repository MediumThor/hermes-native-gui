import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const STORAGE_KEY = "hermes-native-gui-settings";

export type AppSettings = {
  /** Stop the in-flight turn before starting a new chat or resuming another session. */
  interruptOnNewChat: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  interruptOnNewChat: true,
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

  return useMemo(
    () => ({
      interruptOnNewChat: settings.interruptOnNewChat,
      setInterruptOnNewChat,
    }),
    [settings.interruptOnNewChat, setInterruptOnNewChat],
  );
}
