import { motion } from "framer-motion";
import {
  ArrowRight, BarChart3, Check, Download, Eye, Gamepad2, Gift,
  Play, Rocket, ShieldCheck, Sparkles, Trophy, Users, Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const art = {
  hero: "https://github.com/lunexooryzeno/ClashRen2/blob/main/attached_assets/logo/1d88ab71-ecd0-4731-860b-c6cae072eed4.png?raw=true",
  logo: "/icons/logo.png",
};

const steps = [
  ["01.", "Select Tournament", "Browse open brackets and pick the mode that suits your playstyle.", "CHOOSE", "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_8e9977f9b8_9e7561f246335339.png"],
  ["02.", "Match Instantly", "Our system pairs you with opponents of similar skill in seconds.", "GET MATCHED", "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_d70e499ba5_5ef1704ac7477c6c.png"],
  ["03.", "Battle to Win", "Two competitive gamers focused on screens with colorful LED lighting in a professional arena setup", "PLAY", "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_7c7edd120b_b5305f68ebadf645.png"],
  ["04.", "Verify Victory", "Log the outcome and upload proof to verify your win.", "SUBMIT", "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_3538d3fa49_aea9340b26e2c89e.png"],
  ["05.", "Claim Rewards", "Collect your prize and climb the leaderboard toward glory.", "WIN", "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_4ae500a6fd_a3e6cf4105b64fc7.png"],
];

const features = [
  ["Global Arena", "Connect and compete with thousands of verified players daily.", Users, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_8f8529fdfb_baf232bbd8cedd63.png"],
  ["Advanced Stats", "Detailed analytics for every game and win streak tracking.", BarChart3, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_1abfbd058b_76eeebd0a08ea1b0.png"],
  ["Multiple Modes", "Ranked ladders, casual skirmishes, and weekly featured cups.", Gamepad2, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_63727a524d_5bc0bfca8172be82.png"],
  ["Elite Rewards", "Win exclusive rewards, physical gear, and cash prizes in every conquest.", Trophy, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_e57b34f37e_272506039668f3fd.png"],
  ["Fair & Secure", "Verified matches with military-grade anti-cheat and transparent scoring.", ShieldCheck, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_bedb32d1a9_46dd57c963dfb6be.png"],
  ["Instant Matchmaking", "Jump into a match within seconds. No waiting, no queues — just pure competition with players at your level.", Zap, "https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_46b7fa72e9_4b50c5631846b0c6.png"],
];

export default function LandingExport() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const pwa = usePwaInstall();
  const play = () => setLocation(isAuthenticated ? "/" : "/get-started");
  const download = () => pwa.state === "available" ? pwa.install() : play();

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-black text-white">
      <style>{`
        .landing-page { font-family: Inter, sans-serif; }
        .landing-page .display { font-family: Orbitron, Rajdhani, sans-serif; }
        .landing-page .brand-red { color: #ff1e27; }
        .landing-page .scroll-hide::-webkit-scrollbar { display:none; }
        .landing-page .scroll-hide { scrollbar-width:none; }
        @keyframes landing-beam { from { transform:translateY(-20%); } to { transform:translateY(20%); } }
        .landing-page .beam { animation: landing-beam 7s ease-in-out infinite alternate; }
      `}</style>

      <motion.nav initial={{ y: -80 }} animate={{ y: 0 }} className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-xl md:px-12">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2">
          <img src={art.logo} alt="ClashRen" className="h-9 w-9 object-contain md:h-11 md:w-11" />
          <span className="display text-lg font-black tracking-tight md:text-xl">CLASH<span className="brand-red">REN</span></span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={play} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold transition hover:bg-white/10 md:px-5 md:text-sm">Sign In</button>
          {pwa.state !== "installed" && <button onClick={download} className="flex items-center gap-2 rounded-lg bg-[#ff1e27] px-3 py-2 text-xs font-bold shadow-[0_0_20px_rgba(255,30,39,.3)] transition hover:bg-red-600 md:px-5 md:text-sm"><Download className="h-3.5 w-3.5" /> Download</button>}
        </div>
      </motion.nav>

      <main>
        <section className="relative flex min-h-screen items-center overflow-hidden px-5 pb-20 pt-28 md:px-12 md:pt-32">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgba(255,30,39,.18),transparent_35%),radial-gradient(circle_at_20%_80%,rgba(255,30,39,.08),transparent_32%)]" />
          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }} className="order-2 flex w-full min-w-0 flex-col items-center text-center lg:order-1">
              <p className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-[.35em] text-[#ff1e27]"><Sparkles className="h-4 w-4" /> Competitive gaming, redefined</p>
              <h1 className="display whitespace-nowrap text-5xl font-black uppercase leading-[.85] tracking-tight sm:text-6xl md:text-8xl">CLASH<span className="brand-red">REN</span></h1>
              <p className="mt-7 max-w-xl px-2 text-lg font-medium leading-relaxed text-zinc-400 md:text-xl">Don&apos;t wait for your moment. Create it. Challenge real players, compete in intense matches, and turn every victory into another step toward the top.</p>
              <div className="mt-9 flex w-full max-w-[350px] flex-row gap-2">
                <button onClick={play} className="group flex h-14 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#ff1e27] px-3 text-xs font-black uppercase tracking-widest shadow-[0_0_30px_rgba(255,30,39,.35)] transition hover:bg-red-600 hover:shadow-[0_0_45px_rgba(255,30,39,.55)] sm:gap-3 sm:px-5 sm:text-sm"><Rocket className="h-4 w-4 shrink-0 sm:h-5 sm:w-5 transition group-hover:-translate-y-1 group-hover:translate-x-1" /> Play Now <ArrowRight className="h-4 w-4 shrink-0" /></button>
                <a href="#how-it-works" className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black uppercase tracking-widest transition hover:border-[#ff1e27]/50 hover:bg-white/10 sm:gap-3 sm:px-5 sm:text-sm"><Eye className="h-4 w-4 shrink-0 text-[#ff1e27]" /> Explore</a>
              </div>
              <div className="mt-12 flex max-w-xl items-center justify-center gap-6 border-t border-white/10 pt-7 text-zinc-500">
                {[["10K+", "Active Players"], ["₹50K+", "Prizes Won"], ["24/7", "Matchmaking"]].map(([value, label], i) => <div key={value} className="flex items-center gap-6">{i > 0 && <span className="h-8 w-px bg-white/10" />}<div><strong className="display block text-xl text-white">{value}</strong><span className="text-[10px] font-bold uppercase tracking-widest">{label}</span></div></div>)}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .8 }} className="relative order-1 flex items-center justify-center lg:order-2">
              <div className="relative aspect-[4/3] w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl shadow-red-950/40 md:aspect-square">
                <div className="absolute -inset-8 -z-10 rounded-full bg-red-600/20 blur-3xl" />
                <img src={art.hero} alt="ClashRen tournament arena" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                <div className="absolute bottom-6 left-6"><p className="display mt-2 text-3xl font-black uppercase">Your next win starts here.</p></div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="how-it-works" className="relative overflow-hidden bg-black py-20">
          <div className="mb-12 px-5 text-center"><p className="text-xs font-black uppercase tracking-[.4em] text-[#ff1e27]">Process</p><h2 className="display mt-3 text-3xl font-black uppercase md:text-5xl">How <span className="brand-red">ClashRen</span> works</h2><div className="mx-auto mt-5 h-1 w-16 rounded-full bg-[#ff1e27]" /></div>
          <div className="scroll-hide flex snap-x gap-4 overflow-x-auto px-5 pb-5 md:px-12">{steps.map(([number, title, text, label, image]) => <motion.article whileHover={{ y: -5 }} key={number} className="w-[280px] flex-shrink-0 snap-center overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] md:w-[350px]"><div className="relative h-48"><img src={image} alt={title} className="h-full w-full object-cover transition duration-700" /><span className="absolute left-4 top-4 rounded-md bg-[#ff1e27] px-3 py-1 text-[10px] font-black tracking-widest">STEP {number.replace(".", "")}</span><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /></div><div className="p-8 pt-6"><p className="text-[10px] font-bold uppercase tracking-[.3em] text-[#ff1e27]">{label}</p><h3 className="display mt-3 text-xl font-black uppercase">{title}</h3><p className="mt-3 text-sm leading-relaxed text-zinc-400">{text}</p></div></motion.article>)}</div>
        </section>

        <section className="relative bg-black px-5 py-24 md:px-12"><div className="mx-auto max-w-7xl"><div className="mb-12 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.4em] text-[#ff1e27]">Built for competitors</p><h2 className="display mt-3 text-3xl font-black uppercase md:text-5xl">Why <span className="brand-red italic">ClashRen?</span></h2><p className="mt-5 text-zinc-400 md:text-lg">The premier destination for competitive mobile gaming. Experience elite matchmaking, secure payments, and daily high-stakes action.</p></div><div className="scroll-hide grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {features.map(([title, text, Icon, image], i) => <motion.article whileHover={{ scale: 1.02 }} key={title} className={`${i === 2 || i === 5 ? "lg:col-span-2" : ""} group relative min-h-72 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5`}><img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-105 group-hover:opacity-80" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" /><div className="relative flex h-full flex-col justify-end p-7"><Icon className="mb-5 h-8 w-8 text-[#ff1e27]" /><h3 className="display text-2xl font-bold uppercase">{title}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{text}</p>{title === "Multiple Modes" && <span className="absolute right-7 top-7 rounded-full bg-[#ff1e27] px-4 py-2 text-[10px] font-black tracking-widest shadow-[0_0_20px_rgba(255,30,39,.4)]">LIVE NOW</span>}</div></motion.article>)}
        </div></div></section>

        <section className="px-5 py-20 md:px-12"><div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 px-6 py-20 text-center md:px-20"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,30,39,.2),transparent_65%)]" /><div className="relative"><div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold tracking-widest text-red-400"><Check className="h-4 w-4" /> JOIN 10,000+ COMPETITORS</div><h2 className="display text-4xl font-black uppercase md:text-6xl">Ready to <span className="brand-red">dominate?</span></h2><p className="mx-auto mt-5 max-w-2xl text-zinc-300">Join thousands of players already competing for glory and massive prize pools. Your legend starts with a single match.</p><button onClick={play} className="mt-9 inline-flex h-14 items-center gap-3 rounded-2xl bg-[#ff1e27] px-9 text-sm font-bold uppercase tracking-widest shadow-[0_0_25px_rgba(255,30,39,.4)] transition hover:bg-red-600"><Rocket className="h-5 w-5" /> Play Now</button></div></div></section>
      </main>

      <footer className="border-t border-white/5 bg-black px-6 py-16 md:px-12"><div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4"><div><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-3"><img src={art.logo} alt="ClashRen Logo" className="h-9 w-9 object-contain" /><span className="display text-xl font-black">CLASH<span className="brand-red">REN</span></span></button><p className="mt-4 text-sm text-gray-500">The ultimate destination for competitive gaming tournaments.</p></div>{[["Platform", "Tournaments", "Leaderboard", "Rewards"], ["Company", "About Us", "Careers", "Contact"], ["Legal", "Terms of Service", "Privacy Policy"]].map(([heading, ...links]) => <div key={heading}><h4 className="mb-4 text-xs font-bold uppercase tracking-widest">{heading}</h4><ul className="space-y-2 text-sm text-gray-400">{links.map(link => <li key={link}><button onClick={play} className="transition hover:text-white">{link}</button></li>)}</ul></div>)}</div><div className="mx-auto mt-12 flex max-w-7xl flex-col justify-between gap-4 border-t border-white/10 pt-8 text-xs text-gray-600 md:flex-row"><span>© {new Date().getFullYear()} ClashRen. All rights reserved.</span><span>Compete. Win. Ascend.</span></div></footer>
    </div>
  );
}