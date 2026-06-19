import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, ArrowUpFromLine, Coins, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatCard } from "@/components/shared";

export default function Overview() {
  const { user, financials, refresh } = useAuth();
  const [roi, setRoi] = useState(null);

  useEffect(() => {
    refresh();
    api.get("/roi").then(({ data }) => setRoi(data)).catch(() => {});
  }, []); // eslint-disable-line

  const fin = financials || { depositBase: 0, roiEarned: 0, withdrawn: 0, balance: 0 };

  return (
    <div className="max-w-5xl">
      <span className="overline text-[#6c63ff]">Terminal</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-8" data-testid="overview-title">
        Welcome back, {user?.username?.split(" ")[0] || "investor"}
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Balance" value={`$${fin.balance.toLocaleString()}`} accent="#ffffff" testId="stat-balance" icon={<Coins className="w-4 h-4 text-white/30" />} />
        <StatCard label="Deposit Base" value={`$${fin.depositBase.toLocaleString()}`} accent="#6c63ff" testId="stat-deposit" icon={<Wallet className="w-4 h-4 text-white/30" />} />
        <StatCard label="ROI Earned" value={`+$${fin.roiEarned.toLocaleString()}`} accent="#00d4a0" testId="stat-roi" icon={<TrendingUp className="w-4 h-4 text-white/30" />} />
        <StatCard label="Withdrawn" value={`$${fin.withdrawn.toLocaleString()}`} accent="#f0a500" testId="stat-withdrawn" icon={<ArrowUpFromLine className="w-4 h-4 text-white/30" />} />
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Link to="/app/wallets" className="glass rounded-xl p-6 card-hover hover:border-[#6c63ff]/40 group" data-testid="quick-wallets">
          <Wallet className="w-6 h-6 text-[#6c63ff] mb-4" />
          <h3 className="ff-head font-bold mb-1">Generate a wallet</h3>
          <p className="text-white/50 text-sm">Create a self-custodied deposit address.</p>
          <span className="text-[#6c63ff] text-sm flex items-center gap-1 mt-4 group-hover:gap-2 transition-all">Open <ArrowRight className="w-4 h-4" /></span>
        </Link>
        <Link to="/app/roi" className="glass rounded-xl p-6 card-hover hover:border-[#00d4a0]/40 group" data-testid="quick-roi">
          <TrendingUp className="w-6 h-6 text-[#00d4a0] mb-4" />
          <h3 className="ff-head font-bold mb-1">Track ROI</h3>
          <p className="text-white/50 text-sm">
            {roi?.hasDeposits ? "View today's rate and 30-day history." : "Make a deposit to start earning."}
          </p>
          <span className="text-[#00d4a0] text-sm flex items-center gap-1 mt-4 group-hover:gap-2 transition-all">Open <ArrowRight className="w-4 h-4" /></span>
        </Link>
        <Link to="/app/withdrawals" className="glass rounded-xl p-6 card-hover hover:border-[#f0a500]/40 group" data-testid="quick-withdrawals">
          <ArrowUpFromLine className="w-6 h-6 text-[#f0a500] mb-4" />
          <h3 className="ff-head font-bold mb-1">Withdraw funds</h3>
          <p className="text-white/50 text-sm">Request a withdrawal to any address.</p>
          <span className="text-[#f0a500] text-sm flex items-center gap-1 mt-4 group-hover:gap-2 transition-all">Open <ArrowRight className="w-4 h-4" /></span>
        </Link>
      </div>
    </div>
  );
}
