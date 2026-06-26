import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { LayoutDashboard, Wallet, TrendingUp, ArrowUpFromLine, Shield, LogOut, Menu, X, Settings, Gift } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { shortAddr, Avatar } from "@/components/shared";
import { LogoMark } from "@/components/Logo";

const LINKS = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, testId: "nav-overview" },
  { to: "/app/wallets", label: "Wallets", icon: Wallet, testId: "nav-wallets" },
  { to: "/app/roi", label: "ROI", icon: TrendingUp, testId: "nav-roi" },
  { to: "/app/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, testId: "nav-withdrawals" },
  { to: "/app/referrals", label: "Referrals", icon: Gift, testId: "nav-referrals" },
  { to: "/app/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const SidebarContent = () => (
    <>
      <Link to="/" className="flex items-center gap-2 px-2 mb-8" data-testid="dash-logo">
        <LogoMark size={34} />
        <span className="ff-head font-bold text-lg">CAVI</span>
      </Link>
      <nav className="space-y-1 flex-1">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={() => setOpen(false)}
            data-testid={l.testId}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive ? "bg-[#6c63ff]/15 text-white border border-[#6c63ff]/30" : "text-white/50 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <l.icon className="w-4 h-4" /> {l.label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={() => setOpen(false)}
            data-testid="nav-admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#f0a500] hover:bg-[#f0a500]/10 transition-all mt-2"
          >
            <Shield className="w-4 h-4" /> Admin Panel
          </NavLink>
        )}
      </nav>
      <div className="border-t border-white/5 pt-4 mt-4">
        <Link to="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 mb-3 group" data-testid="user-profile-link">
          <Avatar user={user} size={36} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate group-hover:text-white" data-testid="user-name">{user?.username}</div>
            <div className="ff-mono text-xs text-white/40 truncate">
              {user?.email || shortAddr(user?.walletAddress)}
            </div>
          </div>
        </Link>
        <button
          onClick={() => { logout(); navigate("/"); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-[#ff4757] hover:bg-[#ff4757]/10 w-full transition-all"
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="grain min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/5 bg-[#0a0f1a]/40 p-4 fixed inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-[#0a0f1a]/90 backdrop-blur border-b border-white/5">
        <span className="ff-head font-bold">CAVI</span>
        <button onClick={() => setOpen(true)} data-testid="mobile-dash-toggle"><Menu /></button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-[#0a0f1a] p-4 flex flex-col" data-testid="mobile-dash-drawer">
            <button onClick={() => setOpen(false)} className="self-end mb-2"><X /></button>
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 md:ml-64 px-5 md:px-10 py-8 pt-20 md:pt-8 max-w-full">
        <Outlet />
      </main>
    </div>
  );
}
