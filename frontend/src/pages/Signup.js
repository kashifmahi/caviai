import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import WalletButtons from "@/components/WalletButtons";
import { AuthShell } from "@/pages/Login";

export default function Signup() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(username, email, password);
      toast.success("Account created");
      navigate("/app");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Start growing your wealth with CAVI">
      <WalletButtons />
      <div className="flex items-center gap-4 my-6">
        <div className="h-px bg-white/10 flex-1" />
        <span className="text-white/30 text-xs ff-mono uppercase">or email</span>
        <div className="h-px bg-white/10 flex-1" />
      </div>

      <form onSubmit={submit} className="space-y-4" data-testid="signup-form">
        <input
          type="text" required placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="signup-username"
        />
        <input
          type="email" required placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="signup-email"
        />
        <div className="relative">
          <input
            type={showPw ? "text" : "password"} required minLength={6} placeholder="Password (min 6 chars)" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="inp w-full rounded-sm px-4 py-3 pr-11 text-sm" data-testid="signup-password"
          />
          <button
            type="button" onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            data-testid="signup-password-toggle" aria-label="Toggle password visibility"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button type="submit" disabled={loading} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="signup-submit">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create account
        </button>
      </form>

      <p className="text-white/40 text-sm mt-6 text-center">
        Already registered?{" "}
        <Link to="/login" className="text-[#6c63ff] hover:underline" data-testid="goto-login">Log in</Link>
      </p>
    </AuthShell>
  );
}
