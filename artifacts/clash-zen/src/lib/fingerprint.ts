const DEVICE_ID_KEY = "czs:device_id";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function sha256Short(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
}

function detectEmulatorSignals(): string[] {
  const signals: string[] = [];
  const nav = navigator as Navigator & { webdriver?: boolean; deviceMemory?: number };
  if (nav.webdriver === true) signals.push("webdriver");
  if (/HeadlessChrome|PhantomJS|Selenium|slimerjs/i.test(navigator.userAgent)) signals.push("headless_ua");
  if (screen.width === 0 || screen.height === 0) signals.push("zero_screen");
  if (screen.width === screen.height) signals.push("square_screen");
  if (typeof (window as unknown as Record<string, unknown>).callPhantom !== "undefined") signals.push("phantom");
  if (navigator.languages === undefined || navigator.languages.length === 0) signals.push("no_languages");
  return signals;
}

function parseAndroidVersion(ua: string): string | null {
  const m = ua.match(/Android\s+([\d.]+)/i);
  return m ? m[1] : null;
}

function parseDeviceType(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad/i.test(ua)) return "tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (/Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|webOS/i.test(ua)) return "mobile";
  return "desktop";
}

function parseAppVersion(ua: string): string | null {
  const patterns: [RegExp, string][] = [
    [/CriOS\/([\d.]+)/i, "Chrome iOS"],
    [/FxiOS\/([\d.]+)/i, "Firefox iOS"],
    [/EdgA?\/([\d.]+)/i, "Edge"],
    [/OPR\/([\d.]+)/i, "Opera"],
    [/Chrome\/([\d.]+)/i, "Chrome"],
    [/Firefox\/([\d.]+)/i, "Firefox"],
    [/Version\/([\d.]+).*Safari/i, "Safari"],
    [/MSIE ([\d.]+)/i, "IE"],
    [/Trident\/.*rv:([\d.]+)/i, "IE"],
  ];
  for (const [re, name] of patterns) {
    const m = ua.match(re);
    if (m) {
      const parts = m[1].split(".");
      const ver = parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
      return `${name} ${ver}`;
    }
  }
  return null;
}

function getNetworkType(): string | null {
  type NavConn = { effectiveType?: string; type?: string };
  const conn = (navigator as Navigator & { connection?: NavConn; mozConnection?: NavConn; webkitConnection?: NavConn })
    .connection ?? (navigator as Navigator & { mozConnection?: NavConn }).mozConnection ?? (navigator as Navigator & { webkitConnection?: NavConn }).webkitConnection;
  if (!conn) return null;
  if (conn.type && conn.type !== "other" && conn.type !== "none" && conn.type !== "unknown") return conn.type;
  if (conn.effectiveType) return conn.effectiveType;
  return null;
}

export interface FingerprintData {
  deviceId: string;
  fingerprint: string;
  isEmulator: boolean;
  emulatorSignals: string;
  userAgent: string;
  androidVersion: string | null;
  deviceType: "mobile" | "tablet" | "desktop";
  appVersion: string | null;
  networkType: string | null;
  language: string;
}

export async function collectFingerprint(): Promise<FingerprintData> {
  const deviceId = getOrCreateDeviceId();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ua = navigator.userAgent;

  const components = [
    ua,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    navigator.language,
    (navigator.languages ?? []).join(","),
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? ""),
    String(nav.deviceMemory ?? ""),
  ].join("|");

  const fingerprint = await sha256Short(components);
  const emulatorSignalsList = detectEmulatorSignals();

  return {
    deviceId,
    fingerprint,
    isEmulator: emulatorSignalsList.length > 0,
    emulatorSignals: emulatorSignalsList.join(","),
    userAgent: ua,
    androidVersion: parseAndroidVersion(ua),
    deviceType: parseDeviceType(ua),
    appVersion: parseAppVersion(ua),
    networkType: getNetworkType(),
    language: navigator.language,
  };
}
