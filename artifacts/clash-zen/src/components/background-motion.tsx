import { memo } from "react";

const ORBS = [
  {
    style: {
      top: "8%", left: "15%",
      width: 320, height: 320,
      background: "radial-gradient(circle, hsl(var(--primary)/0.18) 0%, transparent 70%)",
      animation: "orb-drift-1 28s ease-in-out infinite",
      animationDelay: "0s",
    },
  },
  {
    style: {
      top: "45%", right: "10%",
      width: 260, height: 260,
      background: "radial-gradient(circle, rgba(96,165,250,0.13) 0%, transparent 70%)",
      animation: "orb-drift-2 36s ease-in-out infinite",
      animationDelay: "-11s",
    },
  },
  {
    style: {
      bottom: "18%", left: "30%",
      width: 200, height: 200,
      background: "radial-gradient(circle, rgba(52,211,153,0.10) 0%, transparent 70%)",
      animation: "orb-drift-3 22s ease-in-out infinite",
      animationDelay: "-7s",
    },
  },
];

const PARTICLES = [
  { left: "18%", bottom: "12%", delay: "0s",   dur: "9s",  drift: "12px"  },
  { left: "42%", bottom: "6%",  delay: "-3s",  dur: "12s", drift: "-18px" },
  { left: "67%", bottom: "20%", delay: "-5s",  dur: "8s",  drift: "20px"  },
  { left: "80%", bottom: "8%",  delay: "-1.5s",dur: "11s", drift: "-10px" },
  { left: "55%", bottom: "15%", delay: "-7s",  dur: "10s", drift: "14px"  },
  { left: "30%", bottom: "28%", delay: "-9s",  dur: "13s", drift: "-22px" },
];

export const BackgroundMotion = memo(function BackgroundMotion() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {ORBS.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            ...orb.style,
            willChange: "transform",
            filter: "blur(48px)",
          }}
        />
      ))}

      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: 3,
            height: 3,
            background: "hsl(var(--primary)/0.35)",
            willChange: "transform, opacity",
            animation: `particle-rise ${p.dur} ease-in-out infinite`,
            animationDelay: p.delay,
            ["--pdrift" as string]: p.drift,
          }}
        />
      ))}
    </div>
  );
});
