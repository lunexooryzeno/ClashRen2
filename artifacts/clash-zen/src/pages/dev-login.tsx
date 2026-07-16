import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Terminal, User, ShieldCheck, Loader2, LogIn } from "lucide-react";

const PRESETS = [
  { label: "Regular Player", phone: "9000000001", isAdmin: false, desc: "500 🪙 · No admin rights" },
  { label: "Player 2", phone: "9000000002", isAdmin: false, desc: "Fresh test account" },
  { label: "Admin User", phone: "9000000099", isAdmin: true, desc: "Full admin access" },
];

export default function DevLoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [customPhone, setCustomPhone] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function loginAs(phone: string, isAdmin: boolean, label: string) {
    setLoading(label);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, isAdmin }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok || data.error) {
        toast({ title: "Login failed", description: data.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      if (data.token) {
        try { localStorage.setItem("clash_ren_token", data.token); } catch { /* ignore */ }
      }
      try { localStorage.removeItem("cz:qcache"); } catch { /* ignore */ }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: `Logged in as ${label}` });
      setLocation("/");
    } catch (e) {
      toast({ title: "Network error", description: String(e), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  const handleCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = customPhone.replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      toast({ title: "Invalid number", description: "Enter a 10-digit Indian mobile number (6-9XXXXXXXX)", variant: "destructive" });
      return;
    }
    loginAs(digits, false, `+91${digits}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Dev Login</h1>
            <p className="text-xs text-yellow-400/80">Development only · Not available in production</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1">Quick Accounts</p>
          {PRESETS.map((p) => (
            <button
              key={p.phone}
              onClick={() => loginAs(p.phone, p.isAdmin, p.label)}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${p.isAdmin ? "bg-purple-500/15 border border-purple-500/30" : "bg-blue-500/15 border border-blue-500/30"}`}>
                {p.isAdmin
                  ? <ShieldCheck className="w-4 h-4 text-purple-400" />
                  : <User className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">{p.label}</div>
                <div className="text-zinc-500 text-xs">{p.desc} · +91{p.phone}</div>
              </div>
              {loading === p.label
                ? <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                : <LogIn className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-3">Custom Phone</p>
          <form onSubmit={handleCustom} className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">+91</span>
              <Input
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="9XXXXXXXXX"
                maxLength={10}
                className="pl-10 bg-white/[0.05] border-white/10 text-white placeholder:text-zinc-600 focus:border-white/25"
              />
            </div>
            <Button
              type="submit"
              disabled={loading !== null}
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
            >
              {loading && !PRESETS.find(p => p.label === loading)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : "Login"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-700">
          This page is only visible when <code className="text-zinc-600">NODE_ENV=development</code>
        </p>
      </div>
    </div>
  );
}
