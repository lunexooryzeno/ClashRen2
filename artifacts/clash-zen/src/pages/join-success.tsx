import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Trophy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const REDIRECT_SECONDS = 3;
const SESSION_KEY = "cz_join_success";

const PALETTE = [
  "#a78bfa", // violet-400
  "#7c3aed", // violet-600
  "#c4b5fd", // violet-300
  "#8b5cf6", // violet-500
  "#ddd6fe", // violet-200
  "#6d28d9", // violet-700
  "#e879f9", // fuchsia-400
  "#d946ef", // fuchsia-500
];

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  speed: number;
  size: number;
  rotate: number;
  shape: "rect" | "circle";
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: randomBetween(20, 80),
    y: randomBetween(10, 50),
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    angle: randomBetween(0, 360),
    speed: randomBetween(60, 160),
    size: randomBetween(5, 11),
    rotate: randomBetween(-180, 180),
    shape: Math.random() > 0.4 ? "rect" : "circle",
  }));
}

function ConfettiBurst({ active }: { active: boolean }) {
  const particles = useRef<Particle[]>(buildParticles(60));

  return (
    <AnimatePresence>
      {active && (
        <div
          className="pointer-events-none fixed inset-0 overflow-hidden z-50"
          aria-hidden="true"
        >
          {particles.current.map((p) => {
            const rad = (p.angle * Math.PI) / 180;
            const dx = Math.cos(rad) * p.speed;
            const dy = Math.sin(rad) * p.speed;
            return (
              <motion.div
                key={p.id}
                initial={{
                  opacity: 1,
                  x: 0,
                  y: 0,
                  rotate: 0,
                  scale: 1,
                }}
                animate={{
                  opacity: 0,
                  x: dx,
                  y: dy + randomBetween(30, 80),
                  rotate: p.rotate,
                  scale: randomBetween(0.3, 0.8),
                }}
                transition={{
                  duration: randomBetween(1.0, 1.8),
                  ease: [0.2, 0.8, 0.4, 1],
                  delay: randomBetween(0, 0.25),
                }}
                style={{
                  position: "absolute",
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.shape === "rect" ? p.size * randomBetween(1.5, 2.5) : p.size,
                  borderRadius: p.shape === "circle" ? "50%" : 2,
                  background: p.color,
                  boxShadow: `0 0 6px ${p.color}80`,
                }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}

export default function JoinSuccessPage() {
  const [, navigate] = useLocation();
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const [valid, setValid] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      navigate("/matches/my_matches");
      return;
    }
    try {
      const data = JSON.parse(raw);
      const age = Date.now() - (data.ts ?? 0);
      if (age > 30000) {
        sessionStorage.removeItem(SESSION_KEY);
        navigate("/matches/my_matches");
        return;
      }
      sessionStorage.removeItem(SESSION_KEY);
      setTournamentName(data.name ?? null);
      setMatchId(data.matchId ?? null);
      setValid(true);
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 2000);
    } catch {
      navigate("/matches/my_matches");
    }
  }, []);

  useEffect(() => {
    if (!valid) return;
    if (countdown <= 0) {
      sessionStorage.setItem("cz_history_needs_refresh", "1");
      navigate("/matches/my_matches");
      return;
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [valid, countdown]);

  if (!valid) return null;

  return (
    <>
      <ConfettiBurst active={confettiActive} />

      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "linear-gradient(160deg, #0a0a0b 0%, #0f0a1a 60%, #0a0a0b 100%)" }}
      >
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(139,92,246,0.05) 70%)",
            border: "1.5px solid rgba(139,92,246,0.45)",
            boxShadow: "0 0 40px rgba(139,92,246,0.35)",
          }}
        >
          <CheckCircle className="w-12 h-12 text-violet-400" strokeWidth={1.5} />
        </div>

        <h1
          className="font-heading text-4xl font-black text-white mb-3 tracking-tight"
          style={{ textShadow: "0 0 30px rgba(139,92,246,0.5)" }}
        >
          You're in!
        </h1>

        {tournamentName && (
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-[15px] font-semibold text-amber-300 line-clamp-2">{tournamentName}</p>
          </div>
        )}

        <p className="text-[13px] text-zinc-400 mb-10 max-w-xs leading-relaxed">
          You've successfully registered. Get ready to compete and show your skills!
        </p>

        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1.5px solid rgba(255,255,255,0.1)",
          }}
        >
          <span className="text-2xl font-black text-white tabular-nums">{countdown}</span>
        </div>

        <p className="text-[12px] text-zinc-500 mb-6">
          Redirecting to My Matches in {countdown}…
        </p>

        <Button
          onClick={() => { sessionStorage.setItem("cz_history_needs_refresh", "1"); navigate("/matches/my_matches"); }}
          className="w-full max-w-xs h-12 rounded-2xl font-bold text-[14px] text-white"
          style={{
            background: "hsl(var(--primary))",
            boxShadow: "0 0 24px hsl(var(--primary)/0.4)",
            border: "1px solid hsl(var(--primary)/0.5)",
          }}
        >
          Go to My Matches
        </Button>

        {matchId && (
          <Button
            variant="ghost"
            onClick={() => navigate(`/matches/${matchId}`)}
            className="w-full max-w-xs h-11 rounded-2xl font-semibold text-[13px] text-zinc-300 mt-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2 opacity-70" />
            View Match
          </Button>
        )}
      </div>
    </>
  );
}
