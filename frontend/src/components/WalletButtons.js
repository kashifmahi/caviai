import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const WALLETS = [
  { id: "metamask", name: "MetaMask", chain: "evm", rdns: "metamask", color: "#f6851b", glyph: "🦊" },
  { id: "phantom", name: "Phantom", chain: "solana", rdns: null, color: "#ab9ff2", glyph: "👻" },
  { id: "coinbase", name: "Coinbase Wallet", chain: "evm", rdns: "coinbase", color: "#0052ff", glyph: "🔵" },
  { id: "walletconnect", name: "WalletConnect", chain: "evm", rdns: "walletconnect", color: "#3b99fc", glyph: "🔗" },
];

export default function WalletButtons() {
  const { walletAuth } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const handle = async (w) => {
    setBusy(w.id);
    try {
      await walletAuth(w.chain, w.rdns);
      toast.success(`Connected with ${w.name}`);
      navigate("/app");
    } catch (e) {
      toast.error(e.message || `Could not connect ${w.name}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="wallet-buttons">
      {WALLETS.map((w) => (
        <button
          key={w.id}
          data-testid={`wallet-btn-${w.id}`}
          onClick={() => handle(w)}
          disabled={!!busy}
          className="btn-wallet rounded-lg px-4 py-3 flex items-center justify-between text-sm font-medium disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <span style={{ filter: "saturate(1.2)" }}>{w.glyph}</span>
            {w.name}
          </span>
          {busy === w.id && <Loader2 className="w-4 h-4 animate-spin text-[#6c63ff]" />}
        </button>
      ))}
    </div>
  );
}
