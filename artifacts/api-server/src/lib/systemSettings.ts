import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./dataDir.js";

const SETTINGS_FILE = join(DATA_DIR, "system-settings.json");

export interface SystemSettings {
  freefireApiKey: string;
  hlGamingUseruid: string;
  hlGamingApiKey: string;
  gameskinboApiKey: string;
}

const DEFAULTS: SystemSettings = {
  freefireApiKey: "",
  hlGamingUseruid: "",
  hlGamingApiKey: "",
  gameskinboApiKey: "",
};

export function getSystemSettings(): SystemSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSystemSettings(patch: Partial<SystemSettings>): SystemSettings {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const current = getSystemSettings();
    const updated: SystemSettings = { ...current, ...patch };
    writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  } catch {
    return getSystemSettings();
  }
}
