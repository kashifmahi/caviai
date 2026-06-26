import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import { base58encode } from "@/lib/web3";

function readableError(e, label) {
  const detail = e?.response?.data?.detail;
  if (detail) return formatError(detail);
  if (e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || "")) {
    return "Request cancelled in your wallet.";
  }
  if (typeof e?.message === "string" && e.message) return e.message;
  return `Could not connect ${label}. Please try again.`;
}

export default function WalletButtons() {
  const { walletSignIn } = useAuth();
  const navigate = useNavigate();
  const { open } = useAppKit();
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const { walletProvider: evmProvider } = useAppKitProvider("eip155");
  const { walletProvider: solProvider } = useAppKitProvider("solana");
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);

  const runLogin = useCallback(async () => {
    setBusy(true);
    try {
      const namespace = (caipAddress || "").split(":")[0] || "eip155";
      const chain = namespace === "solana" ? "solana" : "evm";
      const signMessageFn = async (message) => {
        if (chain === "evm") {
          if (!evmProvider) throw new Error("EVM wallet provider unavailable");
          return evmProvider.request({ method: "personal_sign", params: [message, address] });
        }
        if (!solProvider?.signMessage) throw new Error("Solana wallet provider unavailable");
        const encoded = new TextEncoder().encode(message);
        const res = await solProvider.signMessage(encoded);
        const sig = res?.signature ?? res;
        return base58encode(new Uint8Array(sig));
      };
      await walletSignIn(chain, address, signMessageFn);
      toast.success("Wallet connected");
      navigate("/app");
    } catch (e) {
      console.error("[walletconnect]", e);
      toast.error(readableError(e, "wallet"));
    } finally {
      setBusy(false);
    }
  }, [address, caipAddress, evmProvider, solProvider, walletSignIn, navigate]);

  useEffect(() => {
    if (pendingRef.current && isConnected && address) {
      pendingRef.current = false;
      runLogin();
    }
  }, [isConnected, address, caipAddress, runLogin]);

  const handleConnect = async () => {
    if (busy) return;
    if (isConnected && address) {
      await runLogin();
    } else {
      pendingRef.current = true;
      await open();
    }
  };

  return (
    <div className="space-y-3" data-testid="wallet-buttons">
      <button
        onClick={handleConnect}
        disabled={busy}
        data-testid="wallet-connect-btn"
        className="btn-wallet w-full rounded-lg px-4 py-3.5 flex items-center justify-center gap-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-[#6c63ff]" /> : <Wallet className="w-4 h-4 text-[#6c63ff]" />}
        {busy ? "Connecting…" : "Connect Wallet"}
      </button>
      <p className="text-white/30 text-xs text-center leading-relaxed">
        MetaMask · Phantom · Trust · Coinbase · Bitget &amp; more — desktop or mobile via QR
      </p>
    </div>
  );
}
