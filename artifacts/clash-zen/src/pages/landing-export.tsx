import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  Gamepad2,
  Gift,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const steps = [
  ["01", "Select Tournament", "Browse open brackets and pick the mode that suits your playstyle.", "/modes/solo.jpg"],
  ["02", "Match Instantly", "Get paired with competitive players in seconds.", "/modes/duo.webp"],
  ["03", "Battle to Win", "Play focused, high-energy matches built for real competition.", "/banners/banner1.jpg"],
  ["04", "Verify Victory", "Submit your result and keep every win transparent.", "/banners/banner2.jpg"],
  ["05", "Claim Rewards", "Collect prizes and climb the leaderboard toward glory.", "/banners/banner3.jpg"],
];

const features = [
  { icon: Users, title: "Global Arena", text: "Connect and compete with thousands of verified players daily.", image: "/banners/banner1.jpg" },
  { icon: BarChart3, title: "Advanced Stats", text: "Track every match, streak, and step toward the top.", image: "/banners/banner2.jpg" },
  { icon: Gamepad2, title: "Multiple Modes", text: "Ranked ladders, quick matches, and featured cups.", image: "/modes/squad.jpg", wide: true },
  { icon: Gift, title: "Elite Rewards", text: "Win exclusive rewards and cash prizes in every conquest.", image: "/banners/banner3.jpg" },
  { icon: ShieldCheck, title: "Fair & Secure", text: "Verified matches, transparent scoring, and fair play.", image: "/banners/banner4.jpg" },
  { icon: Zap, title: "Instant Matchmaking", text: "Jump into a match within seconds. No waiting, just competition.", image: "/modes/solo_new_1.jpg", wide: true },
];

export default function LandingExport() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const pwa = usePwaInstall();
  const play = () => setLocation(isAuthenticated ? "/" : "/get-started");

  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-white">
      <motion.nav
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-xl md:px-12"
      >
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2">
          <img src="/icons/logo.png" alt="ClashRen" className="h-9 w-9 object-contain md:h-11 md:w-11" />
          <span className="font-heading text-lg font-black tracking-tight md:text-xl">CLASH<span className="text-red-500">REN</span></span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={play} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold transition hover:bg-white/10 md:px-5 md:text-sm">
            Sign In
          </button>
          {pwa.state !== "installed" ? (
            <button onClick={() => pwa.state === "available" ? pwa.install() : play()} className="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold shadow-[0_0_20px_rgba(255,30,39,.3)] transition hover:bg-red-600 md:px-5 md:text-sm">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          ) : null}
        </div>
      </motion.nav>

      <main>
        <section className="relative flex min-h-screen items-center overflow-hidden px-5 pb-20 pt-28 md:px-12 md:pt-32">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgba(255,30,39,.18),transparent_35%),radial-gradient(circle_at_20%_80%,rgba(255,30,39,.08),transparent_32%)]" />
          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
              <p className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[.35em] text-red-500"><Sparkles className="h-4 w-4" /> Competitive gaming, redefined</p>
              <h1 className="font-heading text-6xl font-black uppercase leading-[.85] tracking-tight md:text-8xl">
                CLASH<span className="text-red-500">REN</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg font-medium leading-relaxed text-zinc-400 md:text-xl">
                Don&apos;t wait for your moment. Create it. Challenge real players, compete in intense matches, and turn every victory into another step toward the top.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button onClick={play} className="group flex h-14 items-center justify-center gap-3 rounded-xl bg-red-500 px-8 text-sm font-black uppercase tracking-widest shadow-[0_0_30px_rgba(255,30,39,.35)] transition hover:bg-red-600 hover:shadow-[0_0_45px_rgba(255,30,39,.55)]">
                  <Rocket className="h-5 w-5 transition group-hover:-translate-y-1 group-hover:translate-x-1" /> Play Now <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#how-it-works" className="flex h-14 items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-8 text-sm font-black uppercase tracking-widest transition hover:border-red-500/50 hover:bg-white/10">
                  <Play className="h-4 w-4 text-red-500" /> Explore
                </a>
              </div>
              <div className="mt-12 flex max-w-xl items-center gap-6 border-t border-white/10 pt-7 text-zinc-500">
                {["10K+", "₹50K+", "24/7"].map((value, i) => (
                  <div key={value} className="flex items-center gap-6">
                    {i > 0 && <span className="h-8 w-px bg-white/10" />}
                    <div><strong className="block text-xl text-white">{value}</strong><span className="text-[10px] font-bold uppercase tracking-widest">{["Active Players", "Prizes Won", "Matchmaking"][i]}</span></div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .8, delay: .15 }} className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-8 rounded-full bg-red-600/20 blur-3xl" />
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl shadow-red-950/40">
                <img src="/banners/banner1.jpg" alt="ClashRen tournament arena" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                <div className="absolute bottom-6 left-6"><p className="text-xs font-black uppercase tracking-[.3em] text-red-400">Enter the arena</p><p className="mt-2 font-heading text-3xl font-black uppercase">Your next win starts here.</p></div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="how-it-works" className="relative overflow-hidden bg-black py-20">
          <div className="mb-12 px-5 text-center"><p className="text-xs font-black uppercase tracking-[.4em] text-red-500">Process</p><h2 className="mt-3 font-heading text-3xl font-black uppercase md:text-5xl">How <span className="text-red-500">ClashRen</span> works</h2><div className="mx-auto mt-5 h-1 w-16 rounded-full bg-red-500" /></div>
          <div className="flex snap-x gap-4 overflow-x-auto px-5 pb-5 [scrollbar-width:none] md:px-12">
            {steps.map(([number, title, text, image]) => (
              <motion.article whileHover={{ y: -5 }} key={number} className="w-[280px] flex-shrink-0 snap-center overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] md:w-[350px]">
                <div className="relative h-44"><img src={image} alt="" className="h-full w-full object-cover grayscale transition duration-700 hover:grayscale-0" /><span className="absolute left-4 top-4 rounded-md bg-red-500 px-3 py-1 text-[10px] font-black tracking-widest">STEP {number}</span><div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" /></div>
                <div className="p-7"><p className="text-[10px] font-bold uppercase tracking-[.3em] text-red-500">Challenge</p><h3 className="mt-3 font-heading text-xl font-black uppercase">{title}</h3><p className="mt-3 text-sm leading-relaxed text-zinc-400">{text}</p></div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="relative bg-black px-5 py-24 md:px-12">
          <div className="mx-auto max-w-7xl"><div className="mb-12 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.4em] text-red-500">Built for competitors</p><h2 className="mt-3 font-heading text-3xl font-black uppercase md:text-5xl">Why <span className="italic text-red-500">ClashRen?</span></h2><p className="mt-5 text-zinc-400 md:text-lg">Elite matchmaking, secure payments, and daily high-stakes action in one competitive arena.</p></div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text, image, wide }) => <motion.article whileHover={{ scale: 1.02 }} key={title} className={`${wide ? "lg:col-span-2" : ""} group relative min-h-72 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5`}>
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale transition duration-700 group-hover:scale-105 group-hover:opacity-55 group-hover:grayscale-0" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" /><div className="relative flex h-full flex-col justify-end p-7"><Icon className="mb-5 h-8 w-8 text-red-500" /><h3 className="font-heading text-2xl font-bold uppercase">{title}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{text}</p></div>
              </motion.article>)}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 md:px-12"><div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 px-6 py-20 text-center md:px-20"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,30,39,.2),transparent_65%)]" /><div className="relative"><div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold tracking-widest text-red-400"><Check className="h-4 w-4" /> JOIN 10,000+ COMPETITORS</div><h2 className="font-heading text-4xl font-black uppercase md:text-6xl">Ready to <span className="text-red-500">dominate?</span></h2><p className="mx-auto mt-5 max-w-2xl text-zinc-300">Your legend starts with a single match. Step into the arena and make your move.</p><button onClick={play} className="mt-9 inline-flex h-14 items-center gap-3 rounded-2xl bg-red-500 px-9 text-sm font-bold uppercase tracking-widest shadow-[0_0_25px_rgba(255,30,39,.4)] transition hover:bg-red-600"><Rocket className="h-5 w-5" /> Play Now</button></div></div></section>
      </main>

      <footer className="border-t border-white/5 bg-black px-6 py-12 md:px-12"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row"><div className="flex items-center gap-3"><img src="/icons/logo.png" alt="" className="h-9 w-9 object-contain" /><span className="font-heading text-xl font-black">CLASH<span className="text-red-500">REN</span></span></div><div className="flex gap-6 text-sm text-zinc-500"><a href="#how-it-works" className="hover:text-white">How it works</a><button onClick={play} className="hover:text-white">Play now</button></div><p className="text-xs text-zinc-600">© {new Date().getFullYear()} ClashRen. All rights reserved.</p></div></footer>
    </div>
  );
}