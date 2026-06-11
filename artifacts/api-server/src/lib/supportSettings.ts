import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./dataDir.js";

const SETTINGS_FILE = join(DATA_DIR, "support-settings.json");

export interface SupportSettings {
  whatsappNumber: string;
  email: string;
  availableHours: string;
}

const DEFAULTS: SupportSettings = {
  whatsappNumber: "919999999999",
  email: "support@clashzen.in",
  availableHours: "9 AM – 11 PM IST",
};

export function getSupportSettings(): SupportSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSupportSettings(patch: Partial<SupportSettings>): SupportSettings {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const current = getSupportSettings();
    const updated: SupportSettings = { ...current, ...patch };
    writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  } catch {
    return getSupportSettings();
  }
}
