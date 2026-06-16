import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./dataDir.js";

const SETTINGS_FILE = join(DATA_DIR, "payment-settings.json");

export interface GatewayAlert {
  message: string;
  at: string;
}

export interface PaymentSettings {
  upiId: string;
  upiName: string;
  ratePerDiamond: number;
  minTopup: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  isEnabled: boolean;
  withdrawalEnabled: boolean;
  withdrawalPaused: boolean;
  withdrawalPauseMessage: string;
  withdrawalWindowEnabled: boolean;
  withdrawalWindowStart: string;
  withdrawalWindowEnd: string;
  withdrawalProcessingNote: string;
  xsrfToken: string;
  bharatpeSession: string;
  gatewayAlert: GatewayAlert | null;
  webhookUrl: string;
  webhookSecret: string;
}

const DEFAULTS: PaymentSettings = {
  upiId: "BHARATPE2V0D0M2C0A10930@unitype",
  upiName: "BharatPe Merchant",
  ratePerDiamond: 0.5,
  minTopup: 10,
  minWithdrawal: 50,
  maxWithdrawal: 0,
  isEnabled: true,
  withdrawalEnabled: false,
  withdrawalPaused: false,
  withdrawalPauseMessage: "Withdrawals are temporarily paused for maintenance. Please try again later.",
  withdrawalWindowEnabled: false,
  withdrawalWindowStart: "10:00",
  withdrawalWindowEnd: "22:00",
  withdrawalProcessingNote: "Most withdrawals are processed within 30 minutes · max 12 hours.",
  xsrfToken: "",
  bharatpeSession: "",
  gatewayAlert: null,
  webhookUrl: "https://trigger.macrodroid.com/9fa326ec-2426-42fa-9ad1-5aeaa12c27cd",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
};

export function getPaymentSettings(): PaymentSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getPublicPaymentSettings(): Omit<PaymentSettings, "xsrfToken" | "bharatpeSession"> {
  const s = getPaymentSettings();
  const { xsrfToken: _x, bharatpeSession: _b, ...pub } = s;
  return pub;
}

export function savePaymentSettings(patch: Partial<PaymentSettings>): PaymentSettings {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const current = getPaymentSettings();
    const updated: PaymentSettings = { ...current, ...patch };
    writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  } catch {
    return getPaymentSettings();
  }
}
