import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, TrendingUp, Lock, Menu, X, Sparkles, Activity } from "lucide-react";
import PriceTicker from "@/components/PriceTicker";
import { NetworkBadge, netLabel } from "@/components/shared";

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
          <div className="w-9 h-9 rounded-lg bg-[#6c63ff]/15 border border-[#6c63ff]/40 flex items-center justify-center ff-head font-black text-[#6c63ff]">C</div>
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
  const dailyRate = 0.0095;
  const projected = useMemo(() => amount * dailyRate * days, [amount, days]);

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
            Returns are calculated on your deposit base only and never compound. Daily rates vary and are illustrative.
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
      <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-2xl glass flex items-center justify-center ff-head font-black text-2xl text-[#6c63ff] glow-purple">
        CAVI
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

export default function Landing() {
  const heroRef = useRef(null);
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
                { k: "Daily Returns", v: <CountUp end={2.0} decimals={1} suffix="%" />, c: "#00d4a0" },
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

      {/* HOW */}
      <section id="how" className="max-w-7xl mx-auto px-6 py-24">
        <Reveal>
          <span className="overline text-[#6c63ff]">How it works</span>
          <h2 className="ff-head text-3xl md:text-4xl font-bold mt-3 mb-12 max-w-2xl">Built like a terminal. Secured like a vault.</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Lock className="w-6 h-6 text-[#6c63ff]" />, t: "Self-custody wallets", d: "Deposit wallets are generated in your browser. Your private key is encrypted and never shown again.", c: "#6c63ff" },
            { icon: <TrendingUp className="w-6 h-6 text-[#00d4a0]" />, t: "Deposit-only ROI", d: "Daily returns are computed on your deposit base. No compounding, no surprises — full transparency.", c: "#00d4a0" },
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
      <section className="px-6 py-8">
        <Reveal>
          <div className="max-w-6xl mx-auto glass rounded-2xl px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { v: <CountUp end={128450} prefix="$" />, k: "Total deposited", c: "#6c63ff" },
              { v: <CountUp end={42900} prefix="$" />, k: "ROI paid out", c: "#00d4a0" },
              { v: <CountUp end={9300} suffix="+" />, k: "Active wallets", c: "#f0a500" },
              { v: <CountUp end={99.9} decimals={1} suffix="%" />, k: "Uptime", c: "#fff" },
            ].map((s) => (
              <div key={s.k}>
                <div className="ff-mono text-2xl md:text-3xl font-bold" style={{ color: s.c }}>{s.v}</div>
                <div className="overline text-white/40 mt-2">{s.k}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

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
          <span className="ff-head font-bold text-white/50">CAVI</span>
          <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> All systems operational</span>
          <span>© {new Date().getFullYear()} CAVI. For demonstration purposes.</span>
        </div>
      </footer>
    </div>
  );
}
