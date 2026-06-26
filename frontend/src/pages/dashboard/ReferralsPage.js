import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Gift, Users, Wallet, HandCoins, Clock, Share2, CheckCircle2 } from "lucide-react";
import api, { formatError } from "@/lib/api";
import { StatCard, copyText } from "@/components/shared";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ReferralsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showWd, setShowWd] = useState(false);
  const [wdAmount, setWdAmount] = useState("");
  const [wdNetwork, setWdNetwork] = useState("ETH");
  const [wdDest, setWdDest] = useState("");
  const [wdLoading, setWdLoading] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/referrals");
      setData(data);
    } catch (err) {
      toast.error("Could not load referrals");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const claim = async () => {
    setClaiming(true);
    try {
      const { data: res } = await api.post("/referrals/claim");
      toast.success(`Claimed ${money(res.claimed)} from ${res.count} reward(s)`);
      await load();
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Nothing to claim yet");
    } finally {
      setClaiming(false);
    }
  };

  const submitWd = async (e) => {
    e.preventDefault();
    setWdLoading(true);
    try {
      await api.post("/referrals/withdraw", {
        amount: Number(wdAmount), network: wdNetwork, destinationAddress: wdDest,
      });
      toast.success("Referral withdrawal requested");
      setWdAmount(""); setWdDest(""); setShowWd(false);
      await load();
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Withdrawal failed");
    } finally {
      setWdLoading(false);
    }
  };

  const shareLink = () => {
    if (navigator.share) {
      navigator.share({ title: "Join me on CAVI", url: data.referralLink }).catch(() => {});
    } else {
      copyText(data.referralLink, "Referral link copied");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!data) return null;

  return (
    <div className="max-w-5xl" data-testid="referrals-page">
      <span className="overline text-[#00d4a0]">Earn together</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-2" data-testid="referrals-title">Referrals</h1>
      <p className="text-white/50 text-sm mb-8 max-w-2xl">
        Invite friends with your link. When someone you refer deposits and keeps their funds staked, you earn{" "}
        <span className="text-[#00d4a0] font-semibold">{Math.round((data.rate || 0.1) * 100)}% of their monthly staking profit</span> — claimable every month, for as long as they stay active.
      </p>

      {/* Referral link */}
      <div className="glass rounded-xl p-6 mb-6" data-testid="referral-link-card">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-4 h-4 text-[#6c63ff]" />
          <span className="overline text-white/40">Your referral link</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            readOnly value={data.referralLink}
            className="inp flex-1 rounded-sm px-4 py-3 text-sm ff-mono text-white/70"
            data-testid="referral-link-input"
            onFocus={(e) => e.target.select()}
          />
          <div className="flex gap-2">
            <button onClick={() => copyText(data.referralLink, "Referral link copied")}
              className="btn-finance rounded-sm px-4 py-3 flex items-center justify-center gap-2 text-sm" data-testid="referral-copy-btn">
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button onClick={shareLink}
              className="rounded-sm px-4 py-3 flex items-center justify-center gap-2 text-sm border border-white/10 hover:bg-white/5 transition-colors" data-testid="referral-share-btn">
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </div>
        <div className="text-xs text-white/40 mt-3">
          Your code: <span className="ff-mono text-[#00d4a0]">{data.referralCode}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="People referred" value={data.referredCount} accent="#6c63ff"
          sub={`${data.activeCount} active`} testId="stat-referred" icon={<Users className="w-4 h-4 text-white/30" />} />
        <StatCard label="Claimable now" value={money(data.claimable)} accent="#00d4a0"
          sub="Completed months" testId="stat-claimable" icon={<HandCoins className="w-4 h-4 text-white/30" />} />
        <StatCard label="Pending this month" value={money(data.pendingThisMonth)} accent="#f0a500"
          sub="Claimable next month" testId="stat-pending" icon={<Clock className="w-4 h-4 text-white/30" />} />
        <StatCard label="Referral balance" value={money(data.balance)} accent="#ffffff"
          sub={`${money(data.earned)} earned all-time`} testId="stat-ref-balance" icon={<Wallet className="w-4 h-4 text-white/30" />} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button onClick={claim} disabled={claiming || data.claimable <= 0}
          className="btn-finance rounded-sm px-5 py-3 flex items-center gap-2 text-sm disabled:opacity-40" data-testid="referral-claim-btn">
          {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandCoins className="w-4 h-4" />}
          Claim {money(data.claimable)}
        </button>
        <button onClick={() => setShowWd((s) => !s)} disabled={data.balance <= 0}
          className="rounded-sm px-5 py-3 flex items-center gap-2 text-sm border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-40" data-testid="referral-withdraw-toggle">
          <Wallet className="w-4 h-4" /> Withdraw earnings
        </button>
      </div>

      {/* Withdraw form */}
      {showWd && (
        <form onSubmit={submitWd} className="glass rounded-xl p-6 mb-8 max-w-lg space-y-4" data-testid="referral-withdraw-form">
          <div className="flex justify-between items-baseline">
            <h3 className="ff-head font-bold">Withdraw referral earnings</h3>
            <span className="ff-mono text-sm text-white/50">Bal: <span className="text-white">{money(data.balance)}</span></span>
          </div>
          <div>
            <label className="overline text-white/40">Network</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {NETWORKS.map((n) => (
                <button type="button" key={n} onClick={() => setWdNetwork(n)} data-testid={`ref-wd-net-${n}`}
                  className={`px-3 py-1.5 rounded-sm text-xs ff-mono ${wdNetwork === n ? "bg-[#6c63ff]/20 border border-[#6c63ff]/50" : "bg-white/5 border border-transparent text-white/50"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="overline text-white/40">Amount (USDT)</label>
            <input type="number" required value={wdAmount} onChange={(e) => setWdAmount(e.target.value)}
              placeholder="0.00" className="inp w-full rounded-sm px-4 py-3 text-sm mt-2" data-testid="ref-wd-amount" />
          </div>
          <div>
            <label className="overline text-white/40">Destination address</label>
            <input type="text" required value={wdDest} onChange={(e) => setWdDest(e.target.value)}
              placeholder="0x… / address" className="inp w-full rounded-sm px-4 py-3 text-sm mt-2" data-testid="ref-wd-destination" />
          </div>
          <button type="submit" disabled={wdLoading} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="ref-wd-submit">
            {wdLoading && <Loader2 className="w-4 h-4 animate-spin" />} Request withdrawal
          </button>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Referees */}
        <div className="glass rounded-xl p-6">
          <h3 className="ff-head font-bold mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-white/40" /> Your referrals</h3>
          <div className="space-y-3" data-testid="referees-list">
            {data.referees.length === 0 && (
              <p className="text-white/40 text-sm">No referrals yet. Share your link to start earning.</p>
            )}
            {data.referees.map((r, i) => (
              <div key={i} className="border-b border-white/5 pb-3" data-testid={`referee-row-${i}`}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{r.username}</span>
                  <span className={`text-[11px] ff-mono uppercase px-2 py-0.5 rounded-sm ${r.active ? "text-[#00d4a0] bg-[#00d4a0]/10" : "text-white/40 bg-white/5"}`}>
                    {r.active ? "active" : "inactive"}
                  </span>
                </div>
                <div className="text-xs text-white/40 ff-mono mt-1 flex flex-wrap gap-x-3">
                  <span>their profit {money(r.theirProfit)}</span>
                  <span className="text-[#00d4a0]">claimable {money(r.claimable)}</span>
                  <span className="text-[#f0a500]">pending {money(r.pending)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Claims history */}
        <div className="glass rounded-xl p-6">
          <h3 className="ff-head font-bold mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white/40" /> Claim history</h3>
          <div className="space-y-3" data-testid="claims-list">
            {data.claims.length === 0 && <p className="text-white/40 text-sm">No claims yet.</p>}
            {data.claims.map((c) => (
              <div key={c.id} className="border-b border-white/5 pb-3 flex justify-between items-center" data-testid={`claim-row-${c.id}`}>
                <div>
                  <div className="text-sm font-medium">{c.refereeName}</div>
                  <div className="text-xs text-white/40 ff-mono">{c.month}</div>
                </div>
                <span className="ff-mono font-bold text-[#00d4a0]">+{money(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
