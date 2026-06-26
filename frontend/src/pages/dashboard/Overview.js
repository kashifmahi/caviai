import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { Wallet, TrendingUp, ArrowUpFromLine, Coins, ArrowRight, PieChart as PieIcon } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const NET_COLOR = { ETH: "#627EEA", ETHEREUM: "#627EEA", SOL: "#14F195", SOLANA: "#14F195", BNB: "#F3BA2F", TRC20: "#FF4D67", TRON: "#FF4D67" };

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

function StatTile({ label, value, accent, icon, testId }) {
  return (
    <motion.div variants={item} className="glass rounded-2xl p-5 card-hover" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <span className="overline text-white/40">{label}</span>
        {icon}
      </div>
      <div className="ff-mono text-2xl font-bold tracking-tight" style={{ color: accent }}>{value}</div>
    </motion.div>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-lg p-3 text-xs ff-mono">
      <div className="text-white/50">{d.label || d.name}</div>
      <div className="text-[#00d4a0]">+${(d.amount ?? d.value ?? 0).toLocaleString()}</div>
    </div>
  );
}

export default function Overview() {
  const { user, financials, refresh } = useAuth();
  const [roi, setRoi] = useState(null);
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    refresh();
    api.get("/roi").then(({ data }) => setRoi(data)).catch(() => {});
    api.get("/wallets").then(({ data }) => setWallets(Array.isArray(data) ? data : data?.wallets || [])).catch(() => {});
  }, []); // eslint-disable-line

  const fin = financials || { depositBase: 0, roiEarned: 0, withdrawn: 0, balance: 0 };
  const chartData = (roi?.history || []).map((h) => ({ ...h, label: h.cycleDate?.slice(5) }));

  const byNet = {};
  wallets.forEach((w) => {
    const amt = Number(w.depositAmount || 0);
    if (amt > 0) byNet[w.network] = (byNet[w.network] || 0) + amt;
  });
  const donut = Object.entries(byNet).map(([name, value]) => ({ name, value }));

  const QUICK = [
    { to: "/app/wallets", color: "#6c63ff", icon: Wallet, title: "Generate a wallet", desc: "Create a self-custodied deposit address.", testId: "quick-wallets" },
    { to: "/app/roi", color: "#00d4a0", icon: TrendingUp, title: "Track ROI", desc: roi?.hasDeposits ? "View today's rate and 30-day history." : "Make a deposit to start earning.", testId: "quick-roi" },
    { to: "/app/withdrawals", color: "#f0a500", icon: ArrowUpFromLine, title: "Withdraw funds", desc: "Request a withdrawal to any address.", testId: "quick-withdrawals" },
  ];

  return (
    <motion.div className="max-w-6xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <span className="overline text-[#6c63ff]">Terminal</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-8 tracking-tight" data-testid="overview-title">
        Welcome back, {user?.username?.split(" ")[0] || "investor"}
      </h1>

      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" variants={container} initial="hidden" animate="show">
        <StatTile label="Balance" value={`$${fin.balance.toLocaleString()}`} accent="#ffffff" testId="stat-balance" icon={<Coins className="w-4 h-4 text-white/30" />} />
        <StatTile label="Deposit Base" value={`$${fin.depositBase.toLocaleString()}`} accent="#6c63ff" testId="stat-deposit" icon={<Wallet className="w-4 h-4 text-white/30" />} />
        <StatTile label="ROI Earned" value={`+$${fin.roiEarned.toLocaleString()}`} accent="#00d4a0" testId="stat-roi" icon={<TrendingUp className="w-4 h-4 text-white/30" />} />
        <StatTile label="Withdrawn" value={`$${fin.withdrawn.toLocaleString()}`} accent="#f0a500" testId="stat-withdrawn" icon={<ArrowUpFromLine className="w-4 h-4 text-white/30" />} />
      </motion.div>

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <motion.div className="md:col-span-2 glass rounded-2xl p-6" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} data-testid="overview-roi-chart">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-4 h-4 text-[#00d4a0]" />
            <h3 className="ff-head font-bold">ROI Performance</h3>
          </div>
          {chartData.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center text-center">
              <p className="text-white/40 text-sm max-w-xs">Your daily returns will chart here once your first ROI cycle runs.</p>
              <Link to="/app/wallets" className="text-[#6c63ff] text-sm mt-3 hover:underline">Make a deposit →</Link>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
                <defs>
                  <linearGradient id="ovRoi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6c63ff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6c63ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="amount" stroke="#6c63ff" strokeWidth={2} fill="url(#ovRoi)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div className="glass rounded-2xl p-6" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }} data-testid="overview-network-chart">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-[#6c63ff]" />
            <h3 className="ff-head font-bold">Deposits by Network</h3>
          </div>
          {donut.length === 0 ? (
            <div className="h-[210px] flex items-center justify-center text-center">
              <p className="text-white/40 text-sm">No deposits yet.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
                    {donut.map((d) => <Cell key={d.name} fill={NET_COLOR[d.network] || NET_COLOR[d.name] || "#6c63ff"} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {donut.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs ff-mono">
                    <span className="flex items-center gap-2 text-white/60">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: NET_COLOR[d.name] || "#6c63ff" }} />
                      {d.name}
                    </span>
                    <span className="text-white/80">${d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div className="grid md:grid-cols-3 gap-5" variants={container} initial="hidden" animate="show">
        {QUICK.map((q) => (
          <motion.div key={q.to} variants={item} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link to={q.to} className="glass rounded-2xl p-6 card-hover group block h-full" style={{ borderColor: "rgba(255,255,255,0.08)" }} data-testid={q.testId}>
              <q.icon className="w-6 h-6 mb-4" style={{ color: q.color }} />
              <h3 className="ff-head font-bold mb-1">{q.title}</h3>
              <p className="text-white/50 text-sm">{q.desc}</p>
              <span className="text-sm flex items-center gap-1 mt-4 group-hover:gap-2 transition-all" style={{ color: q.color }}>
                Open <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
