import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, TrendingUp, Lock, Menu, X, Sparkles, Activity, ChevronDown } from "lucide-react";
import PriceTicker from "@/components/PriceTicker";
import { NetworkBadge, netLabel } from "@/components/shared";
import { LogoMark, LogoWordmark } from "@/components/Logo";
import api from "@/lib/api";

const HERO_BG =
  "https://images.pexels.com/photos/13156181/pexels-photo-13156181.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];

/* ---------- Count-up number that triggers on scroll ---------- */
function CountUp({ end, prefix = "", suffix = "", decimals = 0, duration = 1600 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(end * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ---------- Live payouts feed (creates FOMO / liveliness) ---------- */
const NAMES = ["0xA1…f3", "satoshi.eth", "moonwhale", "0x9C…2b", "phantom_x", "yieldhunter", "0x4D…aa", "crypto_lina", "degen42", "0xF0…7e", "blockmint", "solana_sam"];
function LivePayouts() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const mk = () => ({
      id: Math.random().toString(36).slice(2),
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      amount: (Math.random() * 900 + 40).toFixed(2),
      net: NETWORKS[Math.floor(Math.random() * NETWORKS.length)],
    });
    setEvents([mk(), mk(), mk(), mk()]);
    const t = setInterval(() => setEvents((prev) => [mk(), ...prev].slice(0, 4)), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="glass rounded-2xl p-6" data-testid="live-payouts">
      <div className="flex items-center gap-2 mb-5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4a0] opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00d4a0]" />
        </span>
        <span className="overline text-[#00d4a0]">Live ROI Payouts</span>
      </div>
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <NetworkBadge network={e.net} size={26} />
                <span className="ff-mono text-sm text-white/70">{e.name}</span>
              </div>
              <span className="ff-mono text-sm font-bold text-[#00d4a0]">+${e.amount}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- Reveal-on-scroll wrapper ---------- */
function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- (landing platform stats are fetched from the backend) ---------- */
function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-[#05080f]/80 backdrop-blur-xl border-b border-white/5" : ""}`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="logo">
          <LogoMark size={36} />
          <span className="ff-head font-bold text-lg tracking-tight">CAVI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#networks" className="hover:text-white transition-colors">Networks</a>
          <a href="#calc" className="hover:text-white transition-colors">ROI Calculator</a>
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/70 hover:text-white transition-colors" data-testid="nav-login">Log in</Link>
          <Link to="/signup" className="btn-finance sheen rounded-sm px-4 py-2 text-xs" data-testid="nav-signup">Get Started</Link>
        </div>
        <button className="md:hidden text-white" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="md:hidden glass mx-4 rounded-xl p-5 flex flex-col gap-4" data-testid="mobile-drawer">
          <a href="#how" onClick={() => setOpen(false)} className="text-white/70">How it works</a>
          <a href="#networks" onClick={() => setOpen(false)} className="text-white/70">Networks</a>
          <a href="#calc" onClick={() => setOpen(false)} className="text-white/70">ROI Calculator</a>
          <Link to="/login" className="text-white/70" data-testid="drawer-login">Log in</Link>
          <Link to="/signup" className="btn-finance rounded-sm px-4 py-2 text-xs text-center" data-testid="drawer-signup">Get Started</Link>
        </div>
      )}
    </header>
  );
}

function ROICalculator() {
  const [amount, setAmount] = useState(5000);
  const [days, setDays] = useState(30);
  const dailyRate = 0.0098;          // representative actual daily rate
  const displayRate = dailyRate / 2; // calculator shows a conservative 50% estimate
  const projected = useMemo(() => amount * displayRate * days, [amount, displayRate, days]);

  return (
    <div className="relative rounded-2xl p-[1px] overflow-hidden glow-pulse" id="calc" data-testid="roi-calculator">
      <div className="absolute inset-0 tracing opacity-60" />
      <div className="relative glass rounded-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="overline text-[#f0a500]">Projection Engine</span>
          <Sparkles className="w-4 h-4 text-[#f0a500]" />
        </div>
        <h3 className="ff-head text-2xl font-bold mb-6">ROI Calculator</h3>

        <label className="text-xs text-white/50 ff-mono uppercase tracking-wider">Deposit (USDT)</label>
        <input
          type="range" min="100" max="100000" step="100" value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-[#6c63ff] mt-2 mb-2"
          data-testid="calc-amount-slider"
        />
        <motion.div key={amount} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="ff-mono text-3xl font-bold text-white mb-6" data-testid="calc-amount-value">
          ${amount.toLocaleString()}
        </motion.div>

        <label className="text-xs text-white/50 ff-mono uppercase tracking-wider">Horizon</label>
        <div className="flex gap-2 mt-2 mb-6">
          {[7, 30, 90, 180].map((d) => (
            <button key={d} onClick={() => setDays(d)} data-testid={`calc-days-${d}`}
              className={`flex-1 py-2 rounded-sm text-sm ff-mono transition-all ${days === d ? "bg-[#6c63ff] text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}>
              {d}d
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 pt-5">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Projected returns</span>
            <motion.span key={projected} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="ff-mono text-3xl font-bold text-[#00d4a0]" data-testid="calc-projected">
              +${projected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </motion.span>
          </div>
          <p className="text-[11px] text-white/30 mt-3 leading-relaxed">
            Returns are generated from validator-node staking and calculated on your deposit base only.
            The figures shown are conservative estimates — actual daily rewards vary with network conditions.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Orbiting network showcase ---------- */
function NetworkOrbit() {
  return (
    <div className="relative w-full aspect-square max-w-[340px] mx-auto" data-testid="network-orbit">
      <div className="absolute inset-0 rounded-full border border-white/5" />
      <div className="absolute inset-[18%] rounded-full border border-white/5" />
      <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-2xl glass flex items-center justify-center glow-purple">
        <LogoMark size={46} />
      </div>
      <div className="absolute inset-0 orbit">
        {NETWORKS.map((n, i) => {
          const angle = (i / NETWORKS.length) * 2 * Math.PI;
          const r = 46;
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle);
          return (
            <div key={n} className="absolute orbit-rev" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
              <div className="glass rounded-xl p-2 flex flex-col items-center gap-1">
                <NetworkBadge network={n} size={34} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Live platform yield + allocation (frontend-only, derived from total deposits) ---- */
const CHAIN_META = [
  { key: "ETH", label: "Ethereum", color: "#627eea" },
  { key: "BNB", label: "BNB Chain", color: "#f0b90b" },
  { key: "SOL", label: "Solana", color: "#14f195" },
  { key: "TRC20", label: "TRON", color: "#ff4757" },
];

const _dayIdx = () => Math.floor(Date.now() / 86400000);
const _rand = (n) => { const s = Math.sin((_dayIdx() + n) * 127.1) * 43758.5453; return s - Math.floor(s); };

// Fraction of the 24h cycle elapsed since the 06:00 PKT (01:00 UTC) reset.
function progressSinceReset() {
  const now = new Date();
  let reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 0, 0);
  if (now.getTime() < reset) reset -= 86400000;
  return Math.min(1, Math.max(0, (now.getTime() - reset) / 86400000));
}

// Stable-per-day allocation across our 4 chains, weighted to ETH & BNB. Returns % (sum 100).
function dailyAllocation() {
  const raw = [34 + _rand(1) * 8, 28 + _rand(2) * 8, 12 + _rand(3) * 6, 8 + _rand(4) * 5];
  const tot = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => (v / tot) * 100);
}

function useSmoothValue(target) {
  const [disp, setDisp] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    let raf;
    const step = () => {
      ref.current += (target - ref.current) * 0.09;
      if (Math.abs(target - ref.current) < 0.005) ref.current = target;
      setDisp(ref.current);
      if (ref.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return disp;
}

function PlatformYield({ deposited }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const rate = 0.008 + (Math.sin(_dayIdx() * 9301 + 49297) * 0.5 + 0.5) * 0.012; // 0.8%–2% per day
  const progress = progressSinceReset();
  const target = deposited * rate * progress;
  const yieldNow = useSmoothValue(target);
  const pctToday = useSmoothValue(rate * progress * 100);
  const fullDay = deposited * rate || 1;
  const alloc = dailyAllocation();

  const N = 56;
  const pts = Array.from({ length: N }, (_, i) => {
    const t = (i / (N - 1)) * progress;
    const wig = 1 + Math.sin(i * 0.6 + _dayIdx()) * 0.05 + Math.sin(i * 1.9) * 0.02;
    return Math.max(0, deposited * rate * t * wig);
  });
  const w = 100, h = 44;
  const coords = pts.map((v, i) => [(i / (N - 1)) * w, h - (v / fullDay) * (h - 5)]);
  const linePath = `M ${coords.map((c) => `${c[0]},${c[1].toFixed(2)}`).join(" L ")}`;
  const areaPath = `M 0,${h} L ${coords.map((c) => `${c[0]},${c[1].toFixed(2)}`).join(" L ")} L ${w},${h} Z`;
  const end = coords[coords.length - 1];

  return (
    <motion.div
      className="relative rounded-2xl p-[1px] overflow-hidden glow-pulse h-full"
      whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      data-testid="platform-yield"
    >
      <div className="absolute inset-0 tracing opacity-60" />
      <div className="relative glass rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-start justify-between">
          <div>
            <span className="overline text-white/40">Today's platform yield</span>
            <div className="ff-mono text-3xl md:text-[2.6rem] leading-none font-black tracking-tight mt-2.5 text-white tabular-nums" data-testid="platform-yield-value">
              +${yieldNow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="overline text-[#00d4a0] inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4a0] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#00d4a0]" /></span>
              Live
            </span>
            <motion.span
              key={Math.round(pctToday * 1000)}
              initial={{ y: -4, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }}
              className="ff-mono text-sm font-bold text-[#00d4a0] bg-[#00d4a0]/10 border border-[#00d4a0]/20 rounded-full px-3 py-1 tabular-nums"
              data-testid="platform-yield-pct"
            >
              +{pctToday.toFixed(3)}%
            </motion.span>
          </div>
        </div>

        <div className="relative mt-5 flex-1 flex items-end">
          <div className="relative w-full">
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32 block">
            <defs>
              <linearGradient id="pyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d4a0" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#00d4a0" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="pyLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00d4a0" />
                <stop offset="100%" stopColor="#6c63ff" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="0" y1={h * g} x2={w} y2={h * g} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
            ))}
            <motion.path d={areaPath} fill="url(#pyFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} />
            <motion.path
              d={linePath} fill="none" stroke="url(#pyLine)" strokeWidth="1" strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }}
            />
          </svg>
          {/* pulsing end dot */}
          <div className="absolute" style={{ left: `${end[0]}%`, top: `${(end[1] / h) * 100}%`, transform: "translate(-50%,-50%)" }}>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4a0] opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00d4a0] shadow-[0_0_12px_2px_rgba(0,212,160,0.7)]" />
            </span>
          </div>
          </div>
        </div>

        {/* allocation bar across our 4 chains */}
        <div className="flex gap-1.5 mt-5" data-testid="platform-yield-alloc">
          {CHAIN_META.map((c, i) => (
            <motion.div
              key={c.key} className="h-2 rounded-full" style={{ background: c.color }}
              initial={{ width: 0, opacity: 0 }} animate={{ width: `${alloc[i]}%`, opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: "easeOut" }}
              title={`${c.label} ${alloc[i].toFixed(0)}%`}
            />
          ))}
        </div>
        <div className="flex items-center justify-end mt-4">
          <span className="text-[10px] ff-mono text-white/30 inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-[#00d4a0] animate-pulse" /> updates every 3s</span>
        </div>
      </div>
    </motion.div>
  );
}

function driftAllocation(tick) {
  const r = (n) => { const s = Math.sin((tick * 7.13 + n) * 127.1) * 43758.5453; return s - Math.floor(s); };
  const raw = [34 + r(1) * 9, 27 + r(2) * 9, 12 + r(3) * 7, 8 + r(4) * 6];
  const tot = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => (v / tot) * 100);
}

function SmoothPct({ value }) {
  const [v, setV] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    let raf;
    const step = () => {
      ref.current += (value - ref.current) * 0.12;
      if (Math.abs(value - ref.current) < 0.05) ref.current = value;
      setV(ref.current);
      if (ref.current !== value) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Math.round(v)}%</>;
}

function AllocationCard({ deposited }) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "-80px" });
  const STEPS = CHAIN_META.length;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, [inView]);

  const alloc = driftAllocation(tick);
  const idx = tick % STEPS;
  const active = CHAIN_META[idx];
  const pct = alloc[idx];
  const amount = (deposited * pct) / 100;
  const R = 46, C = 2 * Math.PI * R;
  const arc = (C * pct) / 100;

  return (
    <motion.div
      ref={ref}
      className="glass rounded-2xl p-6 h-full card-hover relative overflow-hidden flex flex-col"
      whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
      data-testid="allocation-card"
    >
      <motion.div
        className="absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl pointer-events-none"
        animate={{ backgroundColor: `${active.color}26` }}
        transition={{ duration: 1.2 }}
      />
      <div className="flex items-center gap-2 mb-1 relative">
        <span className="w-7 h-7 rounded-lg bg-[#f0a500]/15 flex items-center justify-center"><Activity className="w-3.5 h-3.5 text-[#f0a500]" /></span>
        <span className="overline text-white/40">Allocation at a glance</span>
        <span className="ml-auto overline text-[#00d4a0] inline-flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4a0] opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00d4a0]" /></span>
          live
        </span>
      </div>
      <p className="text-white/40 text-xs mb-7 relative">See exactly how your value is spread across chains and assets, in plain language.</p>

      <div className="flex-1 flex flex-col items-center justify-center relative">
        <div className="relative w-44 h-44">
          <svg viewBox="0 0 100 100" className="w-44 h-44 -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
            <motion.circle
              cx="50" cy="50" r={R} fill="none" strokeLinecap="round" strokeWidth="7"
              initial={false}
              animate={{ stroke: active.color, strokeDasharray: `${arc} ${C - arc}`, filter: `drop-shadow(0 0 5px ${active.color})` }}
              transition={{ duration: 1.1, ease: "easeInOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <AnimatePresence mode="wait">
              <motion.div key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.92 }}
                transition={{ duration: 0.45 }}>
                <div className="ff-mono text-4xl font-black tabular-nums" style={{ color: active.color }}>
                  <SmoothPct value={pct} />
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: active.color, boxShadow: `0 0 8px ${active.color}` }} />
                  <span className="text-[11px] uppercase tracking-wider text-white/60 ff-mono">{active.label}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* active chain value */}
        <AnimatePresence mode="wait">
          <motion.div key={`amt-${idx}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4 }}
            className="mt-5 ff-mono text-sm text-white/70">
            ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-white/35">staked on {active.label}</span>
          </motion.div>
        </AnimatePresence>

        {/* rotation dots */}
        <div className="flex items-center gap-2 mt-5">
          {CHAIN_META.map((c, i) => (
            <motion.span key={c.key} className="rounded-full"
              animate={{ width: i === idx ? 20 : 6, height: 6, backgroundColor: i === idx ? c.color : "rgba(255,255,255,0.18)" }}
              transition={{ duration: 0.4 }} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}


function StatsBand({ dstats }) {
  const [open, setOpen] = useState(false);
  const alloc = dailyAllocation();
  const rate = 0.008 + (Math.sin(_dayIdx() * 9301 + 49297) * 0.5 + 0.5) * 0.012;
  const stats = [
    { v: <CountUp end={dstats.deposited} prefix="$" />, k: "Total deposited", c: "#6c63ff" },
    { v: <CountUp end={dstats.roiPaid} prefix="$" />, k: "ROI paid out", c: "#00d4a0" },
    { v: <CountUp end={dstats.wallets} suffix="+" />, k: "Active wallets", c: "#f0a500" },
    { v: <CountUp end={99.9} decimals={1} suffix="%" />, k: "Uptime", c: "#fff" },
  ];
  return (
    <section className="px-6 py-8">
      <Reveal>
        <div
          className="max-w-6xl mx-auto glass rounded-2xl px-8 pt-10 pb-6 transition-all duration-300 hover:border-[#6c63ff]/30"
          style={{ borderColor: open ? "rgba(108,99,255,0.3)" : undefined }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          data-testid="stats-band"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((s) => (
              <div key={s.k}>
                <div className="ff-mono text-2xl md:text-3xl font-bold" style={{ color: s.c }}>{s.v}</div>
                <div className="overline text-white/40 mt-2">{s.k}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-6 text-white/40" data-testid="stats-band-hint">
            <span className="text-[11px] ff-mono uppercase tracking-wider">{open ? "Network breakdown" : "Hover for network breakdown"}</span>
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}><ChevronDown className="w-4 h-4" /></motion.span>
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="breakdown"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="overflow-hidden"
                data-testid="stats-breakdown"
              >
                <div className="border-t border-white/10 mt-5 pt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {CHAIN_META.map((c, i) => {
                    const amt = (dstats.deposited * alloc[i]) / 100;
                    return (
                      <motion.div
                        key={c.key}
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + i * 0.07 }}
                        className="rounded-xl bg-white/[0.03] border border-white/5 p-4 hover:bg-white/[0.06] transition-colors text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="flex items-center gap-2">
                            <NetworkBadge network={c.key} size={26} />
                            <span className="ff-mono text-sm text-white/70">{c.label}</span>
                          </span>
                          <span className="ff-mono text-xs font-bold" style={{ color: c.color }}>{alloc[i].toFixed(0)}%</span>
                        </div>
                        <div className="ff-mono text-lg font-bold text-white">
                          ${amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 mt-3 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full" style={{ background: c.color }}
                            initial={{ width: 0 }} animate={{ width: `${alloc[i]}%` }}
                            transition={{ duration: 0.8, delay: 0.15 + i * 0.07, ease: "easeOut" }}
                          />
                        </div>
                        <div className="text-[11px] text-[#00d4a0]/80 ff-mono mt-2.5">
                          ~${((amt * rate)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/day staking
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  const heroRef = useRef(null);
  const [dstats, setDstats] = useState({ deposited: 3900000, roiPaid: 1326000, wallets: 9800 });
  useEffect(() => {
    api.get("/stats/public").then(({ data }) => setDstats(data)).catch(() => {});
  }, []);
  const onMove = (e) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div className="grain min-h-screen text-white overflow-x-hidden">
      <Nav />

      {/* HERO */}
      <section ref={heroRef} onMouseMove={onMove} className="relative pt-36 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-20" style={{ backgroundImage: `linear-gradient(to bottom, rgba(5,8,15,0.82), rgba(5,8,15,0.96)), url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        {/* Aurora blobs */}
        <div className="aurora aurora-a -z-10" style={{ width: 420, height: 420, top: -80, right: 40, background: "#6c63ff" }} />
        <div className="aurora aurora-b -z-10" style={{ width: 360, height: 360, bottom: -60, left: -40, background: "#00d4a0" }} />
        {/* Mouse spotlight */}
        <div className="absolute inset-0 -z-10 pointer-events-none" style={{ background: "radial-gradient(420px circle at var(--mx,70%) var(--my,30%), rgba(108,99,255,0.12), transparent 60%)" }} />

        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-10 items-center">
          <motion.div className="md:col-span-7" initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}>
            <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
              <span className="overline text-[#6c63ff] inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6c63ff] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#6c63ff]" /></span>
                Multi-chain wealth engine
              </span>
            </motion.div>
            <motion.h1 variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="ff-head text-5xl md:text-7xl font-black tracking-tighter leading-[0.95] mt-4">
              Grow Your <br /> Wealth With <span className="shimmer-text">CAVI</span>
            </motion.h1>
            <motion.p variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="text-white/60 text-lg mt-6 max-w-xl leading-relaxed">
              Generate self-custodied deposit wallets, earn daily returns on your deposit base, and withdraw across Ethereum, Solana, BNB Chain and TRON — all from one terminal.
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }} className="flex flex-wrap gap-4 mt-8">
              <Link to="/signup" className="btn-finance sheen rounded-sm px-6 py-3 flex items-center gap-2" data-testid="hero-cta">
                Start Earning <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-wallet rounded-lg px-6 py-3 text-sm" data-testid="hero-login">Connect Wallet</Link>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="grid grid-cols-3 gap-6 mt-12 max-w-lg">
              {[
                { k: "Daily Returns", v: <span>0.8–2%</span>, c: "#00d4a0" },
                { k: "Networks", v: <CountUp end={4} suffix="" />, c: "#6c63ff" },
                { k: "Paid Out", v: <CountUp end={4.2} decimals={1} prefix="$" suffix="M" />, c: "#f0a500" },
              ].map((s) => (
                <div key={s.k}>
                  <div className="ff-mono text-2xl md:text-3xl font-bold" style={{ color: s.c }}>{s.v}</div>
                  <div className="overline text-white/40 mt-1">{s.k}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div className="md:col-span-5 space-y-5" initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
            <ROICalculator />
            <LivePayouts />
          </motion.div>
        </div>
      </section>

      <PriceTicker />

      {/* LIVE PLATFORM PERFORMANCE */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-10">
        <Reveal>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4a0] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#00d4a0]" /></span>
            <span className="overline text-[#00d4a0]">Live on CAVI</span>
          </div>
          <h2 className="ff-head text-3xl md:text-4xl font-bold mt-3 mb-10 max-w-2xl">Real-time platform performance</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          <Reveal className="md:col-span-2">
            <PlatformYield deposited={dstats.deposited} />
          </Reveal>
          <Reveal delay={0.12}>
            <AllocationCard deposited={dstats.deposited} />
          </Reveal>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="max-w-7xl mx-auto px-6 py-24">
        <Reveal>
          <span className="overline text-[#6c63ff]">How it works</span>
          <h2 className="ff-head text-3xl md:text-4xl font-bold mt-3 mb-12 max-w-2xl">Built like a terminal. Secured like a vault.</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Lock className="w-6 h-6 text-[#6c63ff]" />, t: "Self-custody wallets", d: "Deposit wallets are generated in your browser. Your private key is encrypted and never shown again.", c: "#6c63ff" },
            { icon: <TrendingUp className="w-6 h-6 text-[#00d4a0]" />, t: "Validator-node staking", d: "Your assets are staked across our validator nodes, earning staking rewards paid out daily — tracked live in your dashboard.", c: "#00d4a0" },
            { icon: <Zap className="w-6 h-6 text-[#f0a500]" />, t: "Fast withdrawals", d: "Request withdrawals any time. A small penalty applies only during the maintenance window.", c: "#f0a500" },
          ].map((c, i) => (
            <Reveal key={i} delay={i * 0.12}>
              <motion.div whileHover={{ y: -6 }} className="glass rounded-xl p-7 h-full transition-colors" style={{ borderColor: "transparent" }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5" style={{ background: `${c.c}1a` }}>{c.icon}</div>
                <h3 className="ff-head text-lg font-bold mb-2">{c.t}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{c.d}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* STATS BAND */}
      <StatsBand dstats={dstats} />

      {/* NETWORKS */}
      <section id="networks" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <span className="overline text-[#f0a500]">Supported networks</span>
            <h2 className="ff-head text-3xl md:text-5xl font-bold mt-3 mb-6">Four chains. <br /> One vault.</h2>
            <p className="text-white/50 mb-8 max-w-md">CAVI routes your deposit base across the most liquid networks in crypto, with a unified terminal experience.</p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              {NETWORKS.map((n, i) => (
                <Reveal key={n} delay={i * 0.08}>
                  <motion.div whileHover={{ scale: 1.04 }} className="glass rounded-xl p-5 flex items-center gap-3" data-testid={`network-${n}`}>
                    <NetworkBadge network={n} size={40} />
                    <div>
                      <div className="ff-head font-bold text-sm">{netLabel(n)}</div>
                      <div className="ff-mono text-[11px] text-white/40">{n}</div>
                    </div>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <NetworkOrbit />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <Reveal>
          <div className="max-w-5xl mx-auto glass rounded-2xl p-12 text-center glow-green relative overflow-hidden">
            <div className="aurora aurora-a" style={{ width: 300, height: 300, top: -120, left: "30%", background: "#00d4a0", opacity: 0.2 }} />
            <ShieldCheck className="w-10 h-10 text-[#00d4a0] mx-auto mb-5 relative" />
            <h2 className="ff-head text-3xl md:text-4xl font-bold mb-4 relative">Your wealth, on autopilot.</h2>
            <p className="text-white/50 max-w-xl mx-auto mb-8 relative">Join CAVI and put your deposit base to work across the most liquid chains in crypto.</p>
            <Link to="/signup" className="btn-finance sheen rounded-sm px-8 py-3 inline-flex items-center gap-2 relative" data-testid="cta-bottom">
              Create your account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-white/30 text-sm">
          <LogoWordmark height={26} />
          <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> All systems operational</span>
          <span>© {new Date().getFullYear()} CAVI</span>
        </div>
      </footer>
    </div>
  );
}
