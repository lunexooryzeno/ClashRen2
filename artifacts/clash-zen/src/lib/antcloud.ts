const ANTCLOUD_BASE = "https://api.antcloud.co/api/phone";

export interface AntcloudResult {
  success: boolean;
  message?: string;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function sendOtpViaBrowser(phone: string): Promise<AntcloudResult> {
  try {
    const fullPhone = `+91${phone}`;
    const first = await postJson(`${ANTCLOUD_BASE}/otp`, { phone: fullPhone, signup: true });
    if (first.ok) return { success: true };

    const msg = (first.data?.message || first.data?.error || "") as string;
    if (msg.toLowerCase().includes("already exists")) {
      const second = await postJson(`${ANTCLOUD_BASE}/otp`, { phone: fullPhone, signup: false });
      if (second.ok) return { success: true };
      return { success: false, message: (second.data?.message || second.data?.error || "Failed to send OTP") as string };
    }

    return { success: false, message: msg || "Failed to send OTP" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Network error" };
  }
}

export async function verifyOtpViaBrowser(phone: string, otp: string): Promise<AntcloudResult> {
  try {
    const fullPhone = `+91${phone}`;
    const { ok, data } = await postJson(`${ANTCLOUD_BASE}/verify`, {
      phone: fullPhone,
      _verificationToken: otp,
    });
    if (!ok) {
      return { success: false, message: (data?.message || data?.error || "Invalid OTP") as string };
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Network error" };
  }
}
