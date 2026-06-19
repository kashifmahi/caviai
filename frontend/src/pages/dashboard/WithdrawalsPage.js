import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Ban } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];

const STATUS_COLOR = { pending: "#f0a500", approved: "#00d4a0", rejected: "#ff4757" };

export default function WithdrawalsPage() {
  const { user, financials, refresh } = useAuth();
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("ETH");
  const [destination, setDestination] = useState("");
  const [items, setItems] = useState([]);
  const [penaltyWindow, setPenaltyWindow] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get("/withdrawals");
    setItems(data.withdrawals);
    setPenaltyWindow(data.penaltyWindow);
  };
  useEffect(() => { load(); refresh(); }, []); // eslint-disable-line

  const wdAllowed = user?.wdAllowed !== false;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/withdrawals", {
        amount: Number(amount), network, destinationAddress: destination,
      });
      toast.success(data.penaltyApplied ? "Requested (0.5% penalty applied)" : "Withdrawal requested");
      setAmount(""); setDestination("");
      await load(); await refresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  const balance = financials?.balance || 0;

  return (
    <div className="max-w-4xl">
      <span className="overline text-[#f0a500]">Cash out</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-8" data-testid="withdrawals-title">Withdrawals</h1>

      {!wdAllowed && (
        <div className="rounded-xl border border-[#ff4757]/40 bg-[#ff4757]/5 p-4 mb-6 flex items-center gap-3" data-testid="wd-blocked-banner">
          <Ban className="w-5 h-5 text-[#ff4757]" />
          <span className="text-sm text-white/70">Withdrawals are currently disabled for your account by an administrator.</span>
        </div>
      )}

      {penaltyWindow && wdAllowed && (
        <div className="rounded-xl border border-[#f0a500]/40 bg-[#f0a500]/5 p-4 mb-6 flex items-center gap-3" data-testid="penalty-banner">
          <AlertTriangle className="w-5 h-5 text-[#f0a500]" />
          <span className="text-sm text-white/70">Maintenance window (05:00–06:00 PKT): a 0.5% penalty applies to withdrawals right now.</span>
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-6">
        {/* Form */}
        <form onSubmit={submit} className="glass rounded-xl p-6 md:col-span-3 space-y-4" data-testid="withdrawal-form">
          <div className="flex justify-between items-baseline">
            <h3 className="ff-head font-bold">Request withdrawal</h3>
            <span className="ff-mono text-sm text-white/50">Bal: <span className="text-white">${balance.toLocaleString()}</span></span>
          </div>

          <div>
            <label className="overline text-white/40">Network</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {NETWORKS.map((n) => (
                <button type="button" key={n} onClick={() => setNetwork(n)} data-testid={`wd-net-${n}`}
                  className={`px-3 py-1.5 rounded-sm text-xs ff-mono ${network === n ? "bg-[#6c63ff]/20 border border-[#6c63ff]/50" : "bg-white/5 border border-transparent text-white/50"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="overline text-white/40">Amount (USDT)</label>
            <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" className="inp w-full rounded-sm px-4 py-3 text-sm mt-2" data-testid="wd-amount" />
          </div>

          <div>
            <label className="overline text-white/40">Destination address</label>
            <input type="text" required value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="0x… / address" className="inp w-full rounded-sm px-4 py-3 text-sm mt-2" data-testid="wd-destination" />
          </div>

          <button type="submit" disabled={loading || !wdAllowed} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="wd-submit">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Request withdrawal
          </button>
          <p className="text-[11px] text-white/30">
            Free window: 06:00–05:00 PKT. Requests start as <span className="text-[#f0a500]">pending</span> until an admin approves.
          </p>
        </form>

        {/* History */}
        <div className="glass rounded-xl p-6 md:col-span-2">
          <h3 className="ff-head font-bold mb-4">History</h3>
          <div className="space-y-3" data-testid="wd-history">
            {items.length === 0 && <p className="text-white/40 text-sm">No withdrawals yet.</p>}
            {items.map((w) => (
              <div key={w.id} className="border-b border-white/5 pb-3" data-testid={`wd-item-${w.id}`}>
                <div className="flex justify-between items-center">
                  <span className="ff-mono font-bold">${w.amount.toLocaleString()}</span>
                  <span className="text-xs ff-mono uppercase" style={{ color: STATUS_COLOR[w.status] }}>{w.status}</span>
                </div>
                <div className="text-xs text-white/40 ff-mono mt-1">
                  {w.network} · net ${w.netAmount.toLocaleString()}
                  {w.penaltyAmount > 0 && <span className="text-[#ff4757]"> · -${w.penaltyAmount} fee</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
