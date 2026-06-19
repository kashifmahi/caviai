import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import WalletButtons from "@/components/WalletButtons";

const ABSTRACT =
  "https://images.pexels.com/photos/26559580/pexels-photo-26559580.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export function AuthShell({ children, title, subtitle }) {
  return (
    <div className="grain min-h-screen grid md:grid-cols-2">
      <div className="relative hidden md:block">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(5,8,15,0.7), rgba(5,8,15,0.95)), url(${ABSTRACT})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative h-full flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-2 w-fit" data-testid="auth-logo">
            <div className="w-9 h-9 rounded-lg bg-[#6c63ff]/15 border border-[#6c63ff]/40 flex items-center justify-center ff-head font-black text-[#6c63ff]">C</div>
            <span className="ff-head font-bold text-lg">CAVI</span>
          </Link>
          <div className="glass rounded-2xl p-8 max-w-md">
            <p className="ff-head text-2xl font-bold leading-snug">
              "The most disciplined way to grow a deposit base across four chains."
            </p>
            <p className="text-white/40 ff-mono text-xs mt-4 uppercase tracking-wider">
              Deposit-only · Never compounded
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="md:hidden flex items-center gap-2 text-white/50 mb-8 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <h1 className="ff-head text-3xl font-bold mb-1">{title}</h1>
          <p className="text-white/50 mb-8">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/app");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Log in" subtitle="Access your CAVI terminal">
      <WalletButtons />
      <div className="flex items-center gap-4 my-6">
        <div className="h-px bg-white/10 flex-1" />
        <span className="text-white/30 text-xs ff-mono uppercase">or email</span>
        <div className="h-px bg-white/10 flex-1" />
      </div>

      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        <input
          type="email" required placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="login-email"
        />
        <input
          type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="login-password"
        />
        <button type="submit" disabled={loading} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="login-submit">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Log in
        </button>
      </form>

      <p className="text-white/40 text-sm mt-6 text-center">
        No account?{" "}
        <Link to="/signup" className="text-[#6c63ff] hover:underline" data-testid="goto-signup">Create one</Link>
      </p>
    </AuthShell>
  );
}
