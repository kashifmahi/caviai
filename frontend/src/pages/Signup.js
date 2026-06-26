import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, MailCheck, ArrowLeft, Gift } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import WalletButtons from "@/components/WalletButtons";
import { AuthShell } from "@/pages/Login";
import { PasswordStrength, isPasswordStrong } from "@/components/PasswordStrength";

export default function Signup() {
  const { register, verifyOtp, resendOtp, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState("form"); // form | otp
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [refCode, setRefCode] = useState("");

  useEffect(() => {
    const r = params.get("ref");
    if (r) {
      const code = r.trim().toUpperCase();
      setRefCode(code);
      localStorage.setItem("cavi_ref", code);
    } else {
      const stored = localStorage.getItem("cavi_ref");
      if (stored) setRefCode(stored);
    }
  }, [params]);

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPasswordStrong(password)) {
      toast.error("Please choose a stronger password.");
      return;
    }
    setLoading(true);
    try {
      const data = await register(username, email, password, refCode || undefined);
      if (data?.emailSent === false) {
        toast.warning("Account pending — but we couldn't send the email. Contact support.");
      } else {
        toast.success("Verification code sent to your email");
      }
      setStep("otp");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(email, otp.trim());
      localStorage.removeItem("cavi_ref");
      toast.success("Email verified — welcome to CAVI");
      navigate("/app");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await resendOtp(email);
      toast.success("A new code is on its way");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  if (step === "otp") {
    return (
      <AuthShell title="Verify your email" subtitle={`Enter the 6-digit code we sent to ${email}`}>
        <form onSubmit={verify} className="space-y-5" data-testid="otp-form">
          <div className="flex items-center justify-center text-[#6c63ff]">
            <MailCheck className="w-10 h-10" />
          </div>
          <input
            type="text" inputMode="numeric" maxLength={6} required autoFocus
            placeholder="······" value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="inp w-full rounded-sm px-4 py-3 text-center text-2xl tracking-[0.5em] ff-mono"
            data-testid="otp-input"
          />
          <button type="submit" disabled={loading || otp.length !== 6} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="otp-submit">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Verify & continue
          </button>
        </form>
        <div className="flex items-center justify-between mt-6 text-sm">
          <button onClick={() => setStep("form")} className="text-white/40 hover:text-white flex items-center gap-1" data-testid="otp-back">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button onClick={resend} disabled={resending} className="text-[#6c63ff] hover:underline flex items-center gap-1" data-testid="otp-resend">
            {resending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Resend code
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create account" subtitle="Start growing your wealth with CAVI">
      {refCode && (
        <div className="flex items-center gap-3 rounded-sm border border-[#00d4a0]/40 bg-[#00d4a0]/5 px-4 py-3 mb-5" data-testid="signup-ref-banner">
          <Gift className="w-4 h-4 text-[#00d4a0] shrink-0" />
          <span className="text-sm text-white/70">You were invited with code <span className="ff-mono text-[#00d4a0]">{refCode}</span></span>
        </div>
      )}
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
        <div>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"} required placeholder="Create a strong password" value={password}
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
          <PasswordStrength password={password} />
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
