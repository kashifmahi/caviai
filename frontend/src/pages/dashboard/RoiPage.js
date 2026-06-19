import React, { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-lg p-3 text-xs ff-mono">
      <div className="text-white/50">{d.cycleDate}</div>
      <div className="text-[#f0a500]">Rate: {d.rate}%</div>
      <div className="text-[#00d4a0]">+${d.amount.toLocaleString()}</div>
    </div>
  );
}

export default function RoiPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/roi").then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-white/40">Loading…</div>;

  if (!data?.hasDeposits) {
    return (
      <div className="max-w-3xl">
        <span className="overline text-[#00d4a0]">Returns</span>
        <h1 className="ff-head text-3xl font-bold mt-2 mb-8" data-testid="roi-title">ROI</h1>
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-16 text-center" data-testid="roi-empty">
          <Inbox className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="ff-head text-xl font-bold mb-2">No Deposits Yet</h3>
          <p className="text-white/40 max-w-sm mx-auto mb-6">
            Your daily returns are calculated on your deposit base. Make a deposit to activate the ROI engine.
          </p>
          <Link to="/app/wallets" className="btn-finance rounded-sm px-6 py-3 inline-block" data-testid="roi-empty-cta">
            Go to Wallets
          </Link>
        </div>
      </div>
    );
  }

  const today = data.today;
  const chartData = data.history.map((h) => ({ ...h, label: h.cycleDate?.slice(5) }));

  return (
    <div className="max-w-5xl">
      <span className="overline text-[#00d4a0]">Returns</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-8" data-testid="roi-title">ROI Performance</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-6" data-testid="roi-today">
          <span className="overline text-white/40">Today's Rate</span>
          <div className="ff-mono text-4xl font-bold text-[#f0a500] mt-2">
            {today ? `${today.rate}%` : "—"}
          </div>
          <p className="text-white/40 text-xs mt-2">
            {today ? `+$${today.amount.toLocaleString()} on your base` : "Next cycle runs at 06:00 PKT"}
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <span className="overline text-white/40">Deposit Base</span>
          <div className="ff-mono text-4xl font-bold text-[#6c63ff] mt-2">${data.depositBase.toLocaleString()}</div>
          <p className="text-white/40 text-xs mt-2">Returns computed on this base only</p>
        </div>
        <div className="glass rounded-xl p-6">
          <span className="overline text-white/40">Total ROI Earned</span>
          <div className="ff-mono text-4xl font-bold text-[#00d4a0] mt-2">+${data.totalRoi.toLocaleString()}</div>
          <p className="text-white/40 text-xs mt-2">Across {data.history.length} cycles</p>
        </div>
      </div>

      {/* Chart */}
      <div className="glass rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-4 h-4 text-[#00d4a0]" />
          <h3 className="ff-head font-bold">30-Day ROI History</h3>
        </div>
        {chartData.length === 0 ? (
          <p className="text-white/40 text-sm py-10 text-center">First ROI cycle will appear after the next daily run.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
              <defs>
                <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4a0" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00d4a0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="amount" stroke="#00d4a0" strokeWidth={2} fill="url(#roiFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily breakdown */}
      <div className="glass rounded-xl p-6">
        <h3 className="ff-head font-bold mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="roi-breakdown-table">
            <thead>
              <tr className="text-white/40 overline text-left border-b border-white/5">
                <th className="py-2 font-normal">Date</th>
                <th className="py-2 font-normal">Rate</th>
                <th className="py-2 font-normal">Base</th>
                <th className="py-2 font-normal text-right">Earned</th>
              </tr>
            </thead>
            <tbody className="ff-mono">
              {[...data.history].reverse().map((h) => (
                <tr key={h.id} className="border-b border-white/5">
                  <td className="py-3 text-white/70">{h.cycleDate}</td>
                  <td className="py-3 text-[#f0a500]">{h.rate}%</td>
                  <td className="py-3 text-white/50">${h.depositBase.toLocaleString()}</td>
                  <td className="py-3 text-[#00d4a0] text-right">+${h.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
