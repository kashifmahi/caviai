import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import { AuthShell } from "@/pages/Login";
import { PasswordStrength, isPasswordStrong } from "@/components/PasswordStrength";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) toast.error("Missing or invalid reset link.");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPasswordStrong(password)) {
      toast.error("Please choose a stronger password.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="">
        <div className="text-center space-y-4" data-testid="reset-done">
          <div className="flex justify-center text-green-400"><CheckCircle2 className="w-12 h-12" /></div>
          <p className="text-white/60 text-sm">You can now log in with your new password.</p>
          <Link to="/login" className="inline-block text-[#6c63ff] hover:underline text-sm" data-testid="reset-goto-login">
            Go to log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password for your account">
      <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
        <div>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"} required placeholder="New password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="inp w-full rounded-sm px-4 py-3 pr-11 text-sm" data-testid="reset-password"
            />
            <button
              type="button" onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              data-testid="reset-password-toggle" aria-label="Toggle password visibility"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>
        <input
          type={showPw ? "text" : "password"} required placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="reset-confirm"
        />
        <button type="submit" disabled={loading || !token} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="reset-submit">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Update password
        </button>
      </form>
      <p className="text-white/40 text-sm mt-6 text-center">
        <Link to="/login" className="text-[#6c63ff] hover:underline" data-testid="reset-back-login">Back to log in</Link>
      </p>
    </AuthShell>
  );
}
