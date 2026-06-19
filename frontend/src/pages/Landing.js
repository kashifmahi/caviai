import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, TrendingUp, Lock, Menu, X } from "lucide-react";
import PriceTicker from "@/components/PriceTicker";
import { NetworkBadge, netLabel } from "@/components/shared";

const HERO_BG =
  "https://images.pexels.com/photos/13156181/pexels-photo-13156181.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="logo">
          <div className="w-9 h-9 rounded-lg bg-[#6c63ff]/15 border border-[#6c63ff]/40 flex items-center justify-center ff-head font-black text-[#6c63ff]">
            C
          </div>
          <span className="ff-head font-bold text-lg tracking-tight">CAVI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#networks" className="hover:text-white transition-colors">Networks</a>
          <a href="#calc" className="hover:text-white transition-colors">ROI Calculator</a>
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/70 hover:text-white transition-colors" data-testid="nav-login">
            Log in
          </Link>
          <Link to="/signup" className="btn-finance rounded-sm px-4 py-2 text-xs" data-testid="nav-signup">
            Get Started
          </Link>
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
          <Link to="/signup" className="btn-finance rounded-sm px-4 py-2 text-xs text-center" data-testid="drawer-signup">
            Get Started
          </Link>
        </div>
      )}
    </header>
  );
}

function ROICalculator() {
  const [amount, setAmount] = useState(5000);
  const [days, setDays] = useState(30);
  const dailyRate = 0.0095; // representative ~0.95%/day, deposit-only
  const projected = useMemo(() => amount * dailyRate * days, [amount, days]);

  return (
    <div className="glass rounded-2xl p-8 glow-purple" id="calc" data-testid="roi-calculator">
      <span className="overline text-[#f0a500]">Projection Engine</span>
      <h3 className="ff-head text-2xl font-bold mt-2 mb-6">ROI Calculator</h3>

      <label className="text-xs text-white/50 ff-mono uppercase tracking-wider">Deposit (USDT)</label>
      <div className="flex items-center gap-3 mt-2 mb-2">
        <input
          type="range" min="100" max="100000" step="100" value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-[#6c63ff]"
          data-testid="calc-amount-slider"
        />
      </div>
      <div className="ff-mono text-3xl font-bold text-white mb-6" data-testid="calc-amount-value">
        ${amount.toLocaleString()}
      </div>

      <label className="text-xs text-white/50 ff-mono uppercase tracking-wider">Horizon</label>
      <div className="flex gap-2 mt-2 mb-6">
        {[7, 30, 90, 180].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            data-testid={`calc-days-${d}`}
            className={`flex-1 py-2 rounded-sm text-sm ff-mono transition-all ${
              days === d ? "bg-[#6c63ff] text-white" : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="border-t border-white/10 pt-5">
        <div className="flex justify-between items-center">
          <span className="text-white/50 text-sm">Projected returns</span>
          <span className="ff-mono text-3xl font-bold text-[#00d4a0]" data-testid="calc-projected">
            +${projected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <p className="text-[11px] text-white/30 mt-3 leading-relaxed">
          Returns are calculated on your deposit base only and never compound. Daily rates vary and
          are illustrative.
        </p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="grain min-h-screen text-white overflow-x-hidden">
      <Nav />

      {/* HERO */}
      <section className="relative pt-36 pb-20 px-6">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(5,8,15,0.78), rgba(5,8,15,0.95)), url(${HERO_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-10 items-center">
          <motion.div
            className="md:col-span-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="overline text-[#6c63ff]">Multi-chain wealth engine</span>
            <h1 className="ff-head text-5xl md:text-7xl font-black tracking-tighter leading-[0.95] mt-4">
              Grow Your <br />
              Wealth With <span className="text-[#f0a500]">CAVI</span>
            </h1>
            <p className="text-white/60 text-lg mt-6 max-w-xl leading-relaxed">
              Generate self-custodied deposit wallets, earn daily returns on your deposit base, and
              withdraw across Ethereum, Solana, BNB Chain and TRON — all from one terminal.
            </p>
            <div className="flex flex-wrap gap-4 mt-8">
              <Link to="/signup" className="btn-finance rounded-sm px-6 py-3 flex items-center gap-2" data-testid="hero-cta">
                Start Earning <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-wallet rounded-lg px-6 py-3 text-sm" data-testid="hero-login">
                Connect Wallet
              </Link>
            </div>
            <div className="flex gap-8 mt-12">
              {[
                { k: "Daily", v: "0.8–2.0%", c: "#00d4a0" },
                { k: "Networks", v: "4 Chains", c: "#6c63ff" },
                { k: "Custody", v: "Self-held", c: "#f0a500" },
              ].map((s) => (
                <div key={s.k}>
                  <div className="ff-mono text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
                  <div className="overline text-white/40 mt-1">{s.k}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="md:col-span-5"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <ROICalculator />
          </motion.div>
        </div>
      </section>

      <PriceTicker />

      {/* HOW */}
      <section id="how" className="max-w-7xl mx-auto px-6 py-24">
        <span className="overline text-[#6c63ff]">How it works</span>
        <h2 className="ff-head text-3xl md:text-4xl font-bold mt-3 mb-12 max-w-2xl">
          Built like a terminal. Secured like a vault.
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Lock className="w-6 h-6 text-[#6c63ff]" />, t: "Self-custody wallets", d: "Deposit wallets are generated in your browser. Your private key is encrypted and never shown again." },
            { icon: <TrendingUp className="w-6 h-6 text-[#00d4a0]" />, t: "Deposit-only ROI", d: "Daily returns are computed on your deposit base. No compounding, no surprises — full transparency." },
            { icon: <Zap className="w-6 h-6 text-[#f0a500]" />, t: "Fast withdrawals", d: "Request withdrawals any time. A small penalty applies only during the maintenance window." },
          ].map((c, i) => (
            <div key={i} className="glass rounded-xl p-7 card-hover hover:border-[#6c63ff]/40">
              <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-5">{c.icon}</div>
              <h3 className="ff-head text-lg font-bold mb-2">{c.t}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* NETWORKS */}
      <section id="networks" className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <span className="overline text-[#f0a500]">Supported networks</span>
        <h2 className="ff-head text-3xl md:text-4xl font-bold mt-3 mb-12">Four chains. One vault.</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {NETWORKS.map((n) => (
            <div key={n} className="glass rounded-xl p-8 flex flex-col items-center gap-4 card-hover hover:border-white/20" data-testid={`network-${n}`}>
              <NetworkBadge network={n} size={56} />
              <div className="text-center">
                <div className="ff-head font-bold">{netLabel(n)}</div>
                <div className="ff-mono text-xs text-white/40 mt-1">{n}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto glass rounded-2xl p-12 text-center glow-green relative overflow-hidden">
          <ShieldCheck className="w-10 h-10 text-[#00d4a0] mx-auto mb-5" />
          <h2 className="ff-head text-3xl md:text-4xl font-bold mb-4">Your wealth, on autopilot.</h2>
          <p className="text-white/50 max-w-xl mx-auto mb-8">
            Join CAVI and put your deposit base to work across the most liquid chains in crypto.
          </p>
          <Link to="/signup" className="btn-finance rounded-sm px-8 py-3 inline-flex items-center gap-2" data-testid="cta-bottom">
            Create your account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-white/30 text-sm">
          <span className="ff-head font-bold text-white/50">CAVI</span>
          <span>© {new Date().getFullYear()} CAVI. For demonstration purposes.</span>
        </div>
      </footer>
    </div>
  );
}
