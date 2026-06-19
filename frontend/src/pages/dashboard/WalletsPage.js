import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Loader2, ShieldAlert, Check, X, AlertTriangle, History, Ban } from "lucide-react";
import api from "@/lib/api";
import { generateWallet } from "@/lib/web3";
import { NetworkBadge, netLabel, copyText, shortAddr } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";

const NETWORKS = ["ETH", "SOL", "BNB", "TRC20"];

export default function WalletsPage() {
  const { refresh, user, meta } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [network, setNetwork] = useState("ETH");
  const [generating, setGenerating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [depositInputs, setDepositInputs] = useState({});
  const [confirmDep, setConfirmDep] = useState(null); // {walletId, amount}
  const [detail, setDetail] = useState(null); // wallet detail modal data

  const ownedNetworks = wallets.map((w) => w.network);
  const flagged = !!user?.securityFlag;
  const attemptsLeft = meta?.attemptsRemaining ?? 3;

  const load = async () => {
    const { data } = await api.get("/wallets");
    setWallets(data.wallets);
    const avail = NETWORKS.find((n) => !data.wallets.some((w) => w.network === n));
    if (avail) setNetwork(avail);
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
      toast.error(e.response?.data?.detail || "Could not generate wallet");
    } finally {
      setGenerating(false);
    }
  };

  const askDeposit = (walletId) => {
    const amount = Number(depositInputs[walletId]);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (flagged) return toast.error("Your account is flagged. Contact the admin.");
    setConfirmDep({ walletId, amount });
  };

  const doDeposit = async () => {
    const { walletId, amount } = confirmDep;
    setConfirmDep(null);
    try {
      const { data } = await api.post(`/wallets/${walletId}/deposit`, { amount });
      toast.success(`Deposit recorded · ROI starts ${data.roiStartDate} · ${data.attemptsRemaining} attempt(s) left`);
      setDepositInputs((s) => ({ ...s, [walletId]: "" }));
      await load();
      await refresh();
    } catch (e) {
      const msg = e.response?.data?.detail || "Deposit failed";
      toast.error(msg);
      await refresh();
    }
  };

  const openDetail = async (wallet) => {
    try {
      const { data } = await api.get(`/wallets/${wallet.id}/deposits`);
      setDetail(data);
    } catch (e) {
      toast.error("Could not load wallet details");
    }
  };

  const allOwned = ownedNetworks.length >= NETWORKS.length;

  return (
    <div className="max-w-5xl">
      <span className="overline text-[#6c63ff]">Self-custody</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-2" data-testid="wallets-title">Deposit Wallets</h1>
      <p className="text-white/50 mb-6 max-w-2xl">
        One wallet per network (Ethereum, Solana, BNB, TRON). Wallets are generated in your browser;
        the private key is encrypted and shown to you <span className="text-white">only once</span>.
      </p>

      {flagged && (
        <div className="rounded-xl border border-[#ff4757]/40 bg-[#ff4757]/5 p-4 mb-6 flex items-center gap-3" data-testid="flag-banner">
          <Ban className="w-5 h-5 text-[#ff4757] shrink-0" />
          <span className="text-sm text-white/80">
            Your account is under security review and deposits are blocked. Please contact the admin at{" "}
            <a href={`mailto:${meta?.supportEmail}`} className="text-[#ff4757] underline">{meta?.supportEmail}</a>.
          </span>
        </div>
      )}

      {/* Generator */}
      {!allOwned ? (
        <div className="glass rounded-xl p-6 mb-6">
          <h3 className="ff-head font-bold mb-4">Generate new wallet</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2 flex-wrap">
              {NETWORKS.map((n) => {
                const owned = ownedNetworks.includes(n);
                return (
                  <button
                    key={n}
                    disabled={owned}
                    onClick={() => setNetwork(n)}
                    data-testid={`net-select-${n}`}
                    className={`px-4 py-2 rounded-sm text-sm ff-mono flex items-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                      network === n && !owned ? "bg-[#6c63ff]/20 border border-[#6c63ff]/50 text-white" : "bg-white/5 border border-transparent text-white/50 hover:bg-white/10"
                    }`}
                  >
                    <NetworkBadge network={n} size={20} /> {n} {owned && <Check className="w-3 h-3 text-[#00d4a0]" />}
                  </button>
                );
              })}
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn-finance rounded-sm px-5 py-2 flex items-center gap-2 ml-auto" data-testid="generate-wallet-btn">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate
            </button>
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-4 mb-6 text-sm text-white/50" data-testid="all-networks-owned">
          You have a wallet on every supported network.
        </div>
      )}

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
          <div key={w.id} className="glass rounded-xl p-5 card-hover" data-testid={`wallet-row-${w.network}`}>
            <div className="flex items-center gap-4 flex-wrap">
              <NetworkBadge network={w.network} size={42} />
              <div className="min-w-0">
                <div className="ff-head font-bold">{netLabel(w.network)}</div>
                <button onClick={() => copyText(w.address, "Address copied")} className="ff-mono text-xs text-white/40 hover:text-white flex items-center gap-1">
                  {shortAddr(w.address)} <Copy className="w-3 h-3" />
                </button>
              </div>
              <button onClick={() => openDetail(w)} className="btn-wallet rounded-lg px-3 py-1.5 text-xs flex items-center gap-1" data-testid={`wallet-detail-${w.network}`}>
                <History className="w-3 h-3" /> Deposits
              </button>
              <div className="ml-auto text-right">
                <div className="overline text-white/40">Deposited</div>
                <div className="ff-mono text-lg font-bold text-[#00d4a0]" data-testid={`wallet-deposit-${w.network}`}>${(w.depositAmount || 0).toLocaleString()}</div>
                {(w.depositAmount || 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] ff-mono uppercase tracking-wider text-[#00d4a0]" data-testid={`wallet-status-${w.network}`}>
                    <Check className="w-3 h-3" /> Funded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] ff-mono uppercase tracking-wider text-white/40" data-testid={`wallet-status-${w.network}`}>
                    Awaiting deposit
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
              <input
                type="number"
                placeholder="Demo deposit amount (USDT)"
                value={depositInputs[w.id] || ""}
                onChange={(e) => setDepositInputs((s) => ({ ...s, [w.id]: e.target.value }))}
                disabled={flagged}
                className="inp rounded-sm px-3 py-2 text-sm flex-1 disabled:opacity-40"
                data-testid={`deposit-input-${w.network}`}
              />
              <button onClick={() => askDeposit(w.id)} disabled={flagged} className="btn-wallet rounded-lg px-4 py-2 text-sm disabled:opacity-40" data-testid={`deposit-btn-${w.network}`}>
                Record deposit
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/25 mt-4">
        "Record deposit" is a demo action simulating an on-chain deposit so you can see the ROI engine
        work. You have a limited number of attempts ({attemptsLeft} left). Deposits made 05:00–05:59 AM
        PKT join the same day's 6 AM ROI cycle; otherwise they start the next day at 6 AM PKT.
      </p>

      {/* Deposit confirm dialog */}
      {confirmDep && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="deposit-confirm" onClick={() => setConfirmDep(null)}>
          <div className="glass rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[#f0a500] mb-3">
              <AlertTriangle className="w-5 h-5" />
              <span className="ff-head font-bold">Confirm deposit</span>
            </div>
            <p className="text-white/70 text-sm mb-2">
              You're about to deposit <span className="ff-mono text-white">${confirmDep.amount.toLocaleString()}</span> and
              trust the platform with these funds.
            </p>
            <p className="text-white/50 text-xs mb-5">
              You have <span className="text-[#f0a500] font-bold">{attemptsLeft}</span> deposit attempt(s)
              remaining. After exceeding the limit your account will be flagged and you'll need to contact the admin.
            </p>
            <div className="flex gap-3">
              <button onClick={doDeposit} className="btn-finance rounded-sm px-4 py-2 text-sm flex-1" data-testid="deposit-confirm-yes">I understand, deposit</button>
              <button onClick={() => setConfirmDep(null)} className="btn-wallet rounded-lg px-4 py-2 text-sm" data-testid="deposit-confirm-no">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet detail / deposit ledger modal */}
      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="wallet-detail-modal" onClick={() => setDetail(null)}>
          <div className="glass rounded-2xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <NetworkBadge network={detail.wallet.network} size={36} />
                <div>
                  <div className="ff-head font-bold">{netLabel(detail.wallet.network)} wallet</div>
                  <div className="ff-mono text-xs text-white/40 break-all">{shortAddr(detail.wallet.address)}</div>
                </div>
              </div>
              <button onClick={() => setDetail(null)} data-testid="wallet-detail-close" className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex items-center justify-between mb-4 bg-[#05080f] rounded-sm p-3">
              <span className="text-white/50 text-sm">Total deposited</span>
              <span className="ff-mono text-xl font-bold text-[#00d4a0]">${detail.total.toLocaleString()}</span>
            </div>
            <div className="overline text-white/40 mb-2">Deposit history ({detail.deposits.length})</div>
            <div className="space-y-2 max-h-72 overflow-y-auto" data-testid="deposit-ledger">
              {detail.deposits.length === 0 && <p className="text-white/40 text-sm">No deposits made on this wallet yet.</p>}
              {detail.deposits.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div>
                    <div className="ff-mono font-bold text-white">${d.amount.toLocaleString()}</div>
                    <div className="text-[11px] text-white/40 ff-mono">{(d.depositedAt || "").slice(0, 16).replace("T", " ")} UTC</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] ff-mono uppercase" style={{ color: "#00d4a0" }}>✓ {d.status}</div>
                    {d.roiActive ? (
                      <div className="text-[11px] ff-mono text-[#00d4a0]">ROI active</div>
                    ) : (
                      <div className="text-[11px] ff-mono text-[#f0a500]">ROI starts {d.roiStartDate}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
