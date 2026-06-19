import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Loader2, ShieldAlert, Check } from "lucide-react";
import api from "@/lib/api";
import { generateWallet } from "@/lib/web3";
import { NetworkBadge, netLabel, copyText, shortAddr } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];

export default function WalletsPage() {
  const { refresh } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [network, setNetwork] = useState("ETH");
  const [generating, setGenerating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [depositInputs, setDepositInputs] = useState({});

  const load = async () => {
    const { data } = await api.get("/wallets");
    setWallets(data.wallets);
  };
  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { address, privateKey } = await generateWallet(network);
      const { data } = await api.post("/wallets", { network, address, privateKey });
      setJustCreated({ ...data.wallet, network });
      toast.success("Wallet generated — private key secured");
      await load();
    } catch (e) {
      toast.error("Could not generate wallet");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeposit = async (walletId) => {
    const amount = Number(depositInputs[walletId]);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    try {
      await api.post(`/wallets/${walletId}/deposit`, { amount });
      toast.success(`Deposit of $${amount} recorded`);
      setDepositInputs((s) => ({ ...s, [walletId]: "" }));
      await load();
      await refresh();
    } catch (e) {
      toast.error("Deposit failed");
    }
  };

  return (
    <div className="max-w-5xl">
      <span className="overline text-[#6c63ff]">Self-custody</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-2" data-testid="wallets-title">Deposit Wallets</h1>
      <p className="text-white/50 mb-8 max-w-2xl">
        Wallets are generated in your browser. The private key is encrypted on our servers and shown
        to you <span className="text-white">only once</span>, right after creation.
      </p>

      {/* Generator */}
      <div className="glass rounded-xl p-6 mb-6">
        <h3 className="ff-head font-bold mb-4">Generate new wallet</h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2 flex-wrap">
            {NETWORKS.map((n) => (
              <button
                key={n}
                onClick={() => setNetwork(n)}
                data-testid={`net-select-${n}`}
                className={`px-4 py-2 rounded-sm text-sm ff-mono flex items-center gap-2 transition-all ${
                  network === n ? "bg-[#6c63ff]/20 border border-[#6c63ff]/50 text-white" : "bg-white/5 border border-transparent text-white/50 hover:bg-white/10"
                }`}
              >
                <NetworkBadge network={n} size={20} /> {n}
              </button>
            ))}
          </div>
          <button onClick={handleGenerate} disabled={generating} className="btn-finance rounded-sm px-5 py-2 flex items-center gap-2 ml-auto" data-testid="generate-wallet-btn">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate
          </button>
        </div>
      </div>

      {/* One-time private key reveal */}
      {justCreated && (
        <div className="rounded-xl border border-[#f0a500]/40 bg-[#f0a500]/5 p-6 mb-6" data-testid="key-reveal">
          <div className="flex items-center gap-2 text-[#f0a500] mb-3">
            <ShieldAlert className="w-5 h-5" />
            <span className="ff-head font-bold">Wallet created</span>
          </div>
          <p className="text-white/60 text-sm mb-4">
            Your public address is saved below. For your security, the private key was encrypted and
            <span className="text-white"> cannot be retrieved again</span>.
          </p>
          <div className="bg-[#05080f] rounded-sm p-3 flex items-center justify-between gap-3">
            <span className="ff-mono text-sm text-white/80 break-all">{justCreated.address}</span>
            <button onClick={() => copyText(justCreated.address, "Address copied")} className="text-white/50 hover:text-white shrink-0"><Copy className="w-4 h-4" /></button>
          </div>
          <button onClick={() => setJustCreated(null)} className="mt-4 text-xs text-white/40 hover:text-white flex items-center gap-1" data-testid="dismiss-key-reveal">
            <Check className="w-3 h-3" /> I've saved my address
          </button>
        </div>
      )}

      {/* Wallet list */}
      <div className="space-y-4">
        {wallets.length === 0 && (
          <div className="glass rounded-xl p-10 text-center text-white/40" data-testid="wallets-empty">
            No wallets yet. Generate one above to get started.
          </div>
        )}
        {wallets.map((w) => (
          <div key={w.id} className="glass rounded-xl p-5" data-testid={`wallet-row-${w.network}`}>
            <div className="flex items-center gap-4 flex-wrap">
              <NetworkBadge network={w.network} size={42} />
              <div className="min-w-0">
                <div className="ff-head font-bold">{netLabel(w.network)}</div>
                <button onClick={() => copyText(w.address, "Address copied")} className="ff-mono text-xs text-white/40 hover:text-white flex items-center gap-1">
                  {shortAddr(w.address)} <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="ml-auto text-right">
                <div className="overline text-white/40">Deposited</div>
                <div className="ff-mono text-lg font-bold text-[#00d4a0]" data-testid={`wallet-deposit-${w.network}`}>${(w.depositAmount || 0).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
              <input
                type="number"
                placeholder="Demo deposit amount (USDT)"
                value={depositInputs[w.id] || ""}
                onChange={(e) => setDepositInputs((s) => ({ ...s, [w.id]: e.target.value }))}
                className="inp rounded-sm px-3 py-2 text-sm flex-1"
                data-testid={`deposit-input-${w.network}`}
              />
              <button onClick={() => handleDeposit(w.id)} className="btn-wallet rounded-lg px-4 py-2 text-sm" data-testid={`deposit-btn-${w.network}`}>
                Record deposit
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/25 mt-4">
        "Record deposit" is a demo action that simulates an on-chain deposit so you can see the ROI
        engine work. It increases your deposit base, which never decreases on withdrawal.
      </p>
    </div>
  );
}
