import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Loader2, Check, User, Shield, Wallet, Mail, KeyRound, Clock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, shortAddr, copyText } from "@/components/shared";
import { formatError } from "@/lib/api";
import { PasswordStrength, isPasswordStrong } from "@/components/PasswordStrength";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium", timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ProfileSection() {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const fileRef = useRef(null);
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isWallet = user?.loginType === "wallet";
  const dirty = username !== (user?.username || "") || bio !== (user?.bio || "");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast.error("Please choose a PNG, JPG or WEBP image.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be 5MB or smaller.");
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (username.trim().length < 2) return toast.error("Display name must be at least 2 characters.");
    setSaving(true);
    try {
      await updateProfile({ username: username.trim(), bio });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6" data-testid="profile-avatar-card">
        <button onClick={() => fileRef.current?.click()} className="relative group rounded-full" data-testid="avatar-upload-btn" aria-label="Change profile photo">
          <Avatar user={user} size={104} />
          <span className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : <Camera className="w-6 h-6 text-white" />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} data-testid="avatar-file-input" />
        <div className="text-center sm:text-left">
          <h3 className="ff-head font-bold text-lg">{user?.username}</h3>
          <p className="text-white/40 text-sm mt-1">Click the photo to upload a new one. PNG, JPG or WEBP, up to 5MB.</p>
          <span className="inline-flex items-center gap-1.5 mt-3 text-xs ff-mono px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
            {isWallet ? <Wallet className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
            {isWallet ? "Wallet account" : "Email account"}
          </span>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 md:p-8 space-y-5">
        <div>
          <label className="overline text-white/40 block mb-2">Display Name</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} className="inp w-full rounded-lg px-4 py-3 text-sm" placeholder="Your name" data-testid="profile-name-input" />
        </div>
        <div>
          <label className="overline text-white/40 block mb-2">Short Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} className="inp w-full rounded-lg px-4 py-3 text-sm resize-none" placeholder="Tell us a little about yourself" data-testid="profile-bio-input" />
          <div className="text-right text-xs text-white/30 mt-1 ff-mono">{bio.length}/280</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 md:p-8 space-y-4">
        <span className="overline text-white/40">Account Info</span>
        <div className="grid sm:grid-cols-2 gap-4">
          {!isWallet && (
            <div>
              <div className="text-xs text-white/40 mb-1">Email</div>
              <div className="ff-mono text-sm text-white/80 break-all" data-testid="profile-email">{user?.email}</div>
            </div>
          )}
          {isWallet && (
            <button onClick={() => copyText(user?.walletAddress, "Address copied")} className="text-left" data-testid="profile-wallet">
              <div className="text-xs text-white/40 mb-1">Wallet Address</div>
              <div className="ff-mono text-sm text-[#6c63ff]">{shortAddr(user?.walletAddress)}</div>
            </button>
          )}
          <div>
            <div className="text-xs text-white/40 mb-1">Role</div>
            <div className="ff-mono text-sm text-white/80 capitalize">{user?.role || "user"}</div>
          </div>
        </div>
      </div>

      <motion.button whileHover={{ scale: dirty ? 1.02 : 1 }} whileTap={{ scale: dirty ? 0.97 : 1 }} onClick={save} disabled={!dirty || saving} data-testid="settings-save-button" className="btn-finance rounded-lg px-7 py-3 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Changes
      </motion.button>
    </div>
  );
}

function SecuritySection() {
  const { user, changePassword } = useAuth();
  const isWallet = user?.loginType === "wallet";
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!isPasswordStrong(next)) return toast.error("Please choose a stronger new password.");
    if (next !== confirm) return toast.error("New passwords do not match.");
    setSaving(true);
    try {
      await changePassword(cur, next);
      toast.success("Password changed");
      setCur(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(formatError(err.response?.data?.detail) || "Could not change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 md:p-8 flex items-center gap-4" data-testid="security-lastlogin">
        <div className="w-11 h-11 rounded-full bg-[#6c63ff]/15 border border-[#6c63ff]/30 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#6c63ff]" />
        </div>
        <div>
          <div className="overline text-white/40">Last sign-in</div>
          <div className="ff-mono text-sm text-white/85 mt-0.5" data-testid="last-login-value">{fmtDate(user?.lastLoginAt)}</div>
        </div>
      </div>

      {isWallet ? (
        <div className="glass rounded-2xl p-6 md:p-8 text-center" data-testid="security-wallet-note">
          <Wallet className="w-8 h-8 text-white/30 mx-auto mb-3" />
          <p className="text-white/50 text-sm max-w-md mx-auto">
            You signed up with a Web3 wallet, so there's no password to manage. Your wallet signature is your secure login.
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 md:p-8 space-y-5" data-testid="change-password-card">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#6c63ff]" />
            <h3 className="ff-head font-bold">Change Password</h3>
          </div>
          <div className="relative">
            <input type={show ? "text" : "password"} value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" className="inp w-full rounded-lg px-4 py-3 pr-11 text-sm" data-testid="current-password-input" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white" aria-label="Toggle visibility">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div>
            <input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className="inp w-full rounded-lg px-4 py-3 text-sm" data-testid="new-password-input" />
            <PasswordStrength password={next} />
          </div>
          <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className="inp w-full rounded-lg px-4 py-3 text-sm" data-testid="confirm-password-input" />
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={submit} disabled={saving || !cur || !next} className="btn-finance rounded-lg px-7 py-3 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" data-testid="change-password-button">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update Password
          </motion.button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [tab, setTab] = useState("profile");
  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security", icon: Shield },
  ];

  return (
    <motion.div className="max-w-5xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <span className="overline text-[#6c63ff]">Account</span>
      <h1 className="ff-head text-3xl font-bold mt-2 mb-8 tracking-tight" data-testid="profile-title">Profile &amp; Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <aside className="md:col-span-3">
          <nav className="space-y-1 text-sm">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`settings-nav-${t.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  tab === t.id ? "bg-[#6c63ff]/15 text-white border border-[#6c63ff]/30" : "text-white/40 hover:text-white/70 border border-transparent"
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="md:col-span-9">
          {tab === "profile" ? <ProfileSection /> : <SecuritySection />}
        </div>
      </div>
    </motion.div>
  );
}
