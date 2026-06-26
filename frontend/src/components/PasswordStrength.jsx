import React from "react";
import { Check, X } from "lucide-react";

export const PW_RULES = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "num", label: "A number", test: (p) => /\d/.test(p) },
  { id: "special", label: "A special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const isPasswordStrong = (p) => PW_RULES.every((r) => r.test(p || ""));

export function PasswordStrength({ password }) {
  if (!password) return null;
  const passed = PW_RULES.filter((r) => r.test(password)).length;
  const pct = (passed / PW_RULES.length) * 100;
  const color = passed <= 2 ? "#ef4444" : passed <= 4 ? "#eab308" : "#22c55e";
  return (
    <div className="mt-2 space-y-2" data-testid="password-strength">
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <ul className="grid grid-cols-1 gap-1">
        {PW_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.id}
              className="flex items-center gap-2 text-xs"
              style={{ color: ok ? "#22c55e" : "rgba(255,255,255,0.45)" }}
              data-testid={`pw-rule-${r.id}`}
            >
              {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
