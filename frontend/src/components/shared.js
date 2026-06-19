import React from "react";
import { toast } from "sonner";

const NET = {
  ETH: { label: "Ethereum", color: "#627eea", short: "Ξ" },
  ETHEREUM: { label: "Ethereum", color: "#627eea", short: "Ξ" },
  SOL: { label: "Solana", color: "#14f195", short: "◎" },
  SOLANA: { label: "Solana", color: "#14f195", short: "◎" },
  BNB: { label: "BNB Chain", color: "#f0b90b", short: "B" },
  TRC20: { label: "TRON", color: "#ff4757", short: "T" },
  TRON: { label: "TRON", color: "#ff4757", short: "T" },
};

export function NetworkBadge({ network, size = 36 }) {
  const n = NET[network] || { label: network, color: "#6c63ff", short: "?" };
  return (
    <div
      className="flex items-center justify-center rounded-full ff-head font-bold shrink-0"
      style={{
        width: size,
        height: size,
        background: `${n.color}22`,
        border: `1px solid ${n.color}66`,
        color: n.color,
        fontSize: size * 0.42,
      }}
    >
      {n.short}
    </div>
  );
}

export function netLabel(network) {
  return (NET[network] || {}).label || network;
}

export function Toggle({ checked, onChange, disabled, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? "#00d4a0" : "rgba(255,255,255,0.12)" }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
      />
    </button>
  );
}

export function StatCard({ label, value, accent = "#ffffff", sub, testId, icon }) {
  return (
    <div className="glass rounded-xl p-5 card-hover" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <span className="overline text-white/40">{label}</span>
        {icon}
      </div>
      <div className="ff-mono text-2xl font-bold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

export function copyText(text, msg = "Copied to clipboard") {
  navigator.clipboard.writeText(text);
  toast.success(msg);
}

export function shortAddr(a) {
  if (!a) return "—";
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
