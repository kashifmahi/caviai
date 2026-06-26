import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatError } from "@/lib/api";
import { AuthShell } from "@/pages/Login";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="">
        <div className="text-center space-y-4" data-testid="forgot-sent">
          <div className="flex justify-center text-[#6c63ff]"><MailCheck className="w-12 h-12" /></div>
          <p className="text-white/60 text-sm">
            If an account exists for <span className="text-white">{email}</span>, we've sent a password reset link.
            It expires in 30 minutes.
          </p>
          <Link to="/login" className="inline-block text-[#6c63ff] hover:underline text-sm" data-testid="forgot-back-login">
            Back to log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a secure reset link">
      <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
        <input
          type="email" required placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="inp w-full rounded-sm px-4 py-3 text-sm" data-testid="forgot-email"
        />
        <button type="submit" disabled={loading} className="btn-finance w-full rounded-sm py-3 flex items-center justify-center gap-2" data-testid="forgot-submit">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Send reset link
        </button>
      </form>
      <p className="text-white/40 text-sm mt-6 text-center">
        Remembered it?{" "}
        <Link to="/login" className="text-[#6c63ff] hover:underline" data-testid="forgot-goto-login">Log in</Link>
      </p>
    </AuthShell>
  );
}
