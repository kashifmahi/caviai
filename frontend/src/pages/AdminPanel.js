import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, TrendingUp, ArrowUpFromLine, Wallet, ShieldCheck, Settings as SettingsIcon,
  LayoutDashboard, Search, Download, Play, Eye, Pause, Check, X, Copy, ArrowLeft, KeyRound, ShieldAlert,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Toggle, copyText, shortAddr, NetworkBadge } from "@/components/shared";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "All Users", icon: Users },
  { id: "roi", label: "ROI Control", icon: TrendingUp },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { id: "wallets", label: "Deposits & Wallets", icon: Wallet },
  { id: "access", label: "Admin Access", icon: ShieldCheck },
  { id: "security", label: "Security", icon: ShieldAlert },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function Stat({ label, value, accent }) {
  return (
    <div className="glass rounded-xl p-5" data-testid={`admin-stat-${label.replace(/\s/g, "-").toLowerCase()}`}>
      <div className="overline text-white/40 mb-2">{label}</div>
      <div className="ff-mono text-2xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [audit, setAudit] = useState([]);
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [roleEmail, setRoleEmail] = useState("");
  const [roleValue, setRoleValue] = useState("admin");
  const [keyModal, setKeyModal] = useState(null);
  const [fraud, setFraud] = useState([]);
  const isSuper = user?.role === "superadmin";

  const loadStats = async () => setStats((await api.get("/admin/stats")).data);
  const loadUsers = async () => setUsers((await api.get("/admin/users")).data.users);
  const loadWithdrawals = async () => setWithdrawals((await api.get("/admin/withdrawals")).data.withdrawals);
  const loadWallets = async () => setWallets((await api.get("/admin/wallets")).data.wallets);
  const loadAudit = async () => setAudit((await api.get("/admin/audit")).data.audit);
  const loadSettings = async () => setSettings((await api.get("/admin/settings")).data.settings);
  const loadFraud = async () => setFraud((await api.get("/admin/fraud")).data.flagged);

  useEffect(() => {
    loadStats(); loadUsers();
  }, []);
  useEffect(() => {
    if (tab === "dashboard") { loadStats(); loadAudit(); }
    if (tab === "users" || tab === "roi") loadUsers();
    if (tab === "withdrawals") loadWithdrawals();
    if (tab === "wallets") loadWallets();
    if (tab === "security") loadFraud();
    if (tab === "settings") loadSettings();
  }, [tab]);

  // --- actions ---
  const toggleRoi = async (u, v) => {
    await api.patch(`/admin/users/${u.id}/roi`, { value: v });
    toast.success(`ROI ${v ? "enabled" : "paused"} for ${u.username}`);
    loadUsers();
  };
  const toggleWd = async (u, v) => {
    await api.patch(`/admin/users/${u.id}/wd`, { value: v });
    toast.success(`Withdrawals ${v ? "enabled" : "disabled"} for ${u.username}`);
    loadUsers();
  };
  const actWithdrawal = async (id, status) => {
    await api.patch(`/admin/withdrawals/${id}`, { status });
    toast.success(`Withdrawal ${status}`);
    loadWithdrawals(); loadStats();
  };
  const runCycle = async () => {
    const { data } = await api.post("/admin/roi/run-cycle");
    toast.success(`ROI cycle ran — ${data.generated} records generated`);
    loadStats(); loadUsers();
  };
  const toggleGlobalRoi = async (paused) => {
    await api.patch("/admin/settings/global-roi", { paused });
    toast.success(paused ? "Global ROI paused" : "Global ROI resumed");
    loadStats(); loadSettings();
  };
  const viewKey = async (w) => {
    try {
      const { data } = await api.get(`/admin/wallets/${w.keyId}/key`);
      setKeyModal({ privateKey: data.privateKey, network: data.network, address: w.address, owner: w.ownerUsername });
      loadWallets();
    } catch (e) {
      toast.error("Could not decrypt key");
    }
  };
  const clearFlag = async (u) => {
    await api.patch(`/admin/users/${u.id}/clear-flag`);
    toast.success(`${u.username} cleared — deposit attempts reset`);
    loadFraud();
  };
  const setRole = async () => {    try {
      await api.patch("/admin/users/role", { email: roleEmail, role: roleValue });
      toast.success(`Set ${roleEmail} to ${roleValue}`);
      setRoleEmail(""); loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const exportCsv = () => {
    const rows = [["Username", "Email", "Role", "DepositBase", "ROIEarned", "Balance", "ROIAllowed", "WDAllowed"]];
    users.forEach((u) => rows.push([
      u.username, u.email || u.walletAddress, u.role,
      u.financials.depositBase, u.financials.roiEarned, u.financials.balance,
      u.roiAllowed, u.wdAllowed,
    ]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cavi-users.csv";
    a.click();
  };

  const filtered = users.filter((u) =>
    (u.username || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.walletAddress || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grain min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-60 shrink-0 border-r border-white/5 bg-[#0a0f1a]/50 p-4 md:fixed md:inset-y-0">
        <Link to="/app" className="flex items-center gap-2 px-2 mb-8 text-white/60 hover:text-white text-sm" data-testid="admin-back">
          <ArrowLeft className="w-4 h-4" /> Back to app
        </Link>
        <div className="flex items-center gap-2 px-2 mb-6">
          <ShieldCheck className="w-5 h-5 text-[#f0a500]" />
          <span className="ff-head font-bold">Admin</span>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`admin-tab-${t.id}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-all ${
                tab === t.id ? "bg-[#f0a500]/15 text-white border border-[#f0a500]/30" : "text-white/50 hover:text-white hover:bg-white/5"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 md:ml-60 p-5 md:p-10">
        {/* DASHBOARD */}
        {tab === "dashboard" && stats && (
          <div data-testid="admin-dashboard">
            <h1 className="ff-head text-2xl font-bold mb-6">Platform Overview</h1>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <Stat label="Total Users" value={stats.totalUsers} accent="#fff" />
              <Stat label="Total Deposited" value={`$${stats.totalDeposited.toLocaleString()}`} accent="#6c63ff" />
              <Stat label="Total ROI Paid" value={`$${stats.totalRoiPaid.toLocaleString()}`} accent="#00d4a0" />
              <Stat label="Penalties Collected" value={`$${stats.penalties.toLocaleString()}`} accent="#ff4757" />
              <Stat label="Pending Withdrawals" value={stats.pendingWithdrawals} accent="#f0a500" />
              <Stat label="Paused Users" value={stats.pausedUsers} accent="#ff4757" />
            </div>
            <div className="glass rounded-xl p-6">
              <h3 className="ff-head font-bold mb-4">Recent Activity</h3>
              <div className="space-y-2" data-testid="admin-activity">
                {(audit.length ? audit : stats.recentActivity).slice(0, 12).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-white/5 py-2">
                    <span className="text-white/70">{a.description}</span>
                    <span className="ff-mono text-xs text-white/30">{(a.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                  </div>
                ))}
                {!audit.length && !stats.recentActivity.length && <p className="text-white/40 text-sm">No activity yet.</p>}
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div data-testid="admin-users">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h1 className="ff-head text-2xl font-bold">All Users</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
                    className="inp rounded-sm pl-9 pr-3 py-2 text-sm" data-testid="user-search" />
                </div>
                <button onClick={exportCsv} className="btn-wallet rounded-lg px-4 py-2 text-sm flex items-center gap-2" data-testid="export-csv">
                  <Download className="w-4 h-4" /> CSV
                </button>
              </div>
            </div>
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm" data-testid="users-table">
                <thead>
                  <tr className="text-white/40 overline text-left border-b border-white/10">
                    <th className="p-4 font-normal">User</th>
                    <th className="p-4 font-normal">Role</th>
                    <th className="p-4 font-normal">Deposit Base</th>
                    <th className="p-4 font-normal">ROI</th>
                    <th className="p-4 font-normal">Balance</th>
                    <th className="p-4 font-normal text-center">ROI</th>
                    <th className="p-4 font-normal text-center">WD</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 ff-mono" data-testid={`user-row-${u.id}`}>
                      <td className="p-4">
                        <div className="text-white font-medium ff-body">{u.username}</div>
                        <div className="text-xs text-white/40">{u.email || shortAddr(u.walletAddress)}</div>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-sm ${u.role === "superadmin" ? "bg-[#f0a500]/15 text-[#f0a500]" : u.role === "admin" ? "bg-[#6c63ff]/15 text-[#6c63ff]" : "bg-white/5 text-white/50"}`}>{u.role}</span>
                      </td>
                      <td className="p-4 text-white/70">${u.financials.depositBase.toLocaleString()}</td>
                      <td className="p-4 text-[#00d4a0]">+${u.financials.roiEarned.toLocaleString()}</td>
                      <td className="p-4 text-white">${u.financials.balance.toLocaleString()}</td>
                      <td className="p-4 text-center"><div className="flex justify-center"><Toggle checked={u.roiAllowed} onChange={(v) => toggleRoi(u, v)} testId={`roi-toggle-${u.id}`} /></div></td>
                      <td className="p-4 text-center"><div className="flex justify-center"><Toggle checked={u.wdAllowed} onChange={(v) => toggleWd(u, v)} testId={`wd-toggle-${u.id}`} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ROI CONTROL */}
        {tab === "roi" && stats && (
          <div data-testid="admin-roi">
            <h1 className="ff-head text-2xl font-bold mb-6">ROI Control</h1>
            <div className="glass rounded-xl p-6 mb-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="ff-head font-bold mb-1">Global ROI Engine</h3>
                <p className="text-white/50 text-sm">
                  Currently <span className={stats.globalRoiPaused ? "text-[#ff4757]" : "text-[#00d4a0]"}>{stats.globalRoiPaused ? "PAUSED" : "ACTIVE"}</span>. Pausing stops all daily ROI generation.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => toggleGlobalRoi(!stats.globalRoiPaused)} data-testid="global-roi-toggle"
                  className={`rounded-sm px-5 py-2.5 text-sm flex items-center gap-2 ${stats.globalRoiPaused ? "btn-finance" : "bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/40"}`}>
                  {stats.globalRoiPaused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause All</>}
                </button>
                <button onClick={runCycle} className="btn-wallet rounded-lg px-5 py-2.5 text-sm flex items-center gap-2" data-testid="run-cycle-btn">
                  <Play className="w-4 h-4 text-[#6c63ff]" /> Run Cycle Now
                </button>
              </div>
            </div>
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 overline text-left border-b border-white/10">
                    <th className="p-4 font-normal">User</th>
                    <th className="p-4 font-normal">Deposit Base</th>
                    <th className="p-4 font-normal">ROI Earned</th>
                    <th className="p-4 font-normal text-center">ROI Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 ff-mono">
                      <td className="p-4 ff-body">{u.username}</td>
                      <td className="p-4 text-[#6c63ff]">${u.financials.depositBase.toLocaleString()}</td>
                      <td className="p-4 text-[#00d4a0]">+${u.financials.roiEarned.toLocaleString()}</td>
                      <td className="p-4 text-center"><div className="flex justify-center"><Toggle checked={u.roiAllowed} onChange={(v) => toggleRoi(u, v)} testId={`roi-ctrl-toggle-${u.id}`} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WITHDRAWALS */}
        {tab === "withdrawals" && (
          <div data-testid="admin-withdrawals">
            <h1 className="ff-head text-2xl font-bold mb-6">Withdrawal Management</h1>
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm" data-testid="admin-wd-table">
                <thead>
                  <tr className="text-white/40 overline text-left border-b border-white/10">
                    <th className="p-4 font-normal">User</th>
                    <th className="p-4 font-normal">Amount</th>
                    <th className="p-4 font-normal">Net</th>
                    <th className="p-4 font-normal">Network</th>
                    <th className="p-4 font-normal">Status</th>
                    <th className="p-4 font-normal text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.id} className="border-b border-white/5 ff-mono" data-testid={`admin-wd-${w.id}`}>
                      <td className="p-4 ff-body">{w.username}</td>
                      <td className="p-4 text-white">${w.amount.toLocaleString()}</td>
                      <td className="p-4 text-white/60">${w.netAmount.toLocaleString()}{w.penaltyAmount > 0 && <span className="text-[#ff4757] text-xs"> (-{w.penaltyAmount})</span>}</td>
                      <td className="p-4 text-white/60">{w.network}</td>
                      <td className="p-4"><span className="text-xs uppercase" style={{ color: { pending: "#f0a500", approved: "#00d4a0", rejected: "#ff4757" }[w.status] }}>{w.status}</span></td>
                      <td className="p-4 text-right">
                        {w.status === "pending" ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => actWithdrawal(w.id, "approved")} data-testid={`wd-approve-${w.id}`} className="bg-[#00d4a0]/10 text-[#00d4a0] border border-[#00d4a0]/40 rounded-sm px-3 py-1 text-xs flex items-center gap-1"><Check className="w-3 h-3" /> Approve</button>
                            <button onClick={() => actWithdrawal(w.id, "rejected")} data-testid={`wd-reject-${w.id}`} className="bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/40 rounded-sm px-3 py-1 text-xs flex items-center gap-1"><X className="w-3 h-3" /> Reject</button>
                          </div>
                        ) : <span className="text-white/20 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!withdrawals.length && <tr><td colSpan={6} className="p-8 text-center text-white/40">No withdrawal requests.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WALLETS */}
        {tab === "wallets" && (
          <div data-testid="admin-wallets">
            <h1 className="ff-head text-2xl font-bold mb-2">Deposits & Wallets</h1>
            <p className="text-white/50 text-sm mb-6">Viewing a private key decrypts it server-side and is logged to the audit trail.</p>
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm" data-testid="admin-wallets-table">
                <thead>
                  <tr className="text-white/40 overline text-left border-b border-white/10">
                    <th className="p-4 font-normal">Owner</th>
                    <th className="p-4 font-normal">Network</th>
                    <th className="p-4 font-normal">Address</th>
                    <th className="p-4 font-normal">Deposited</th>
                    <th className="p-4 font-normal text-right">Private Key</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w.id} className="border-b border-white/5 ff-mono" data-testid={`admin-wallet-${w.id}`}>
                      <td className="p-4 ff-body">{w.ownerUsername}</td>
                      <td className="p-4"><div className="flex items-center gap-2"><NetworkBadge network={w.network} size={20} /> {w.network}</div></td>
                      <td className="p-4"><button onClick={() => copyText(w.address)} className="text-white/60 hover:text-white flex items-center gap-1">{shortAddr(w.address)} <Copy className="w-3 h-3" /></button></td>
                      <td className="p-4 text-[#00d4a0]">${(w.depositAmount || 0).toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => viewKey(w)} data-testid={`view-key-${w.id}`} className="bg-[#f0a500]/10 text-[#f0a500] border border-[#f0a500]/40 rounded-sm px-3 py-1 text-xs flex items-center gap-1 ml-auto">
                          <Eye className="w-3 h-3" /> {w.keyViewed ? "View again" : "View Key"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!wallets.length && <tr><td colSpan={5} className="p-8 text-center text-white/40">No wallets generated yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ADMIN ACCESS */}
        {tab === "access" && (
          <div data-testid="admin-access">
            <h1 className="ff-head text-2xl font-bold mb-6">Admin Access</h1>
            {!isSuper ? (
              <div className="glass rounded-xl p-8 text-center text-white/50" data-testid="access-denied">
                <KeyRound className="w-8 h-8 mx-auto mb-3 text-white/30" />
                Only superadmins can grant or revoke roles.
              </div>
            ) : (
              <div className="glass rounded-xl p-6 max-w-lg">
                <h3 className="ff-head font-bold mb-4">Grant / revoke role by email</h3>
                <input value={roleEmail} onChange={(e) => setRoleEmail(e.target.value)} placeholder="user@email.com"
                  className="inp w-full rounded-sm px-4 py-3 text-sm mb-3" data-testid="role-email" />
                <div className="flex gap-2 mb-4">
                  {["user", "admin", "superadmin"].map((r) => (
                    <button key={r} onClick={() => setRoleValue(r)} data-testid={`role-opt-${r}`}
                      className={`flex-1 py-2 rounded-sm text-sm ff-mono ${roleValue === r ? "bg-[#6c63ff] text-white" : "bg-white/5 text-white/50"}`}>{r}</button>
                  ))}
                </div>
                <button onClick={setRole} className="btn-finance w-full rounded-sm py-3" data-testid="set-role-btn">Apply role</button>
              </div>
            )}
          </div>
        )}

        {/* SECURITY */}
        {tab === "security" && (
          <div data-testid="admin-security">
            <h1 className="ff-head text-2xl font-bold mb-2">Security Threats</h1>
            <p className="text-white/50 text-sm mb-6">Users flagged for exceeding deposit limits or suspicious activity. Deposits are blocked until you remove the flag.</p>
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm" data-testid="fraud-table">
                <thead>
                  <tr className="text-white/40 overline text-left border-b border-white/10">
                    <th className="p-4 font-normal">User</th>
                    <th className="p-4 font-normal">Reason</th>
                    <th className="p-4 font-normal">Deposit Base</th>
                    <th className="p-4 font-normal text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fraud.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 ff-mono" data-testid={`fraud-row-${u.id}`}>
                      <td className="p-4">
                        <div className="ff-body text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ff4757]" /> {u.username}</div>
                        <div className="text-xs text-white/40">{u.email || shortAddr(u.walletAddress)}</div>
                      </td>
                      <td className="p-4 text-[#ff4757] text-xs">{u.flagReason || "Flagged"}</td>
                      <td className="p-4 text-white/60">${(u.financials?.depositBase || 0).toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => clearFlag(u)} data-testid={`clear-flag-${u.id}`} className="bg-[#00d4a0]/10 text-[#00d4a0] border border-[#00d4a0]/40 rounded-sm px-3 py-1 text-xs flex items-center gap-1 ml-auto">
                          <Check className="w-3 h-3" /> Remove flag
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!fraud.length && <tr><td colSpan={4} className="p-8 text-center text-white/40">No flagged users. All clear.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && settings && (
          <div data-testid="admin-settings">
            <h1 className="ff-head text-2xl font-bold mb-6">Settings</h1>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="glass rounded-xl p-6">
                <div className="overline text-white/40 mb-2">Global ROI</div>
                <div className="flex items-center justify-between">
                  <span className={settings.globalRoiPaused ? "text-[#ff4757]" : "text-[#00d4a0]"}>{settings.globalRoiPaused ? "Paused" : "Active"}</span>
                  <Toggle checked={!settings.globalRoiPaused} onChange={(v) => toggleGlobalRoi(!v)} testId="settings-roi-toggle" />
                </div>
              </div>
              <div className="glass rounded-xl p-6">
                <div className="overline text-white/40 mb-2">Withdrawal Penalty Rate</div>
                <div className="ff-mono text-2xl font-bold text-[#ff4757]">{(settings.penaltyRate * 100).toFixed(2)}%</div>
                <p className="text-white/40 text-xs mt-1">Applied 05:00–06:00 PKT</p>
              </div>
              <div className="glass rounded-xl p-6">
                <div className="overline text-white/40 mb-2">ROI Run Time (UTC)</div>
                <div className="ff-mono text-2xl font-bold text-[#6c63ff]">{String(settings.roiRunHourUtc).padStart(2, "0")}:00</div>
                <p className="text-white/40 text-xs mt-1">06:00 PKT daily</p>
              </div>
              <div className="glass rounded-xl p-6">
                <div className="overline text-white/40 mb-2">Rate Tiers (hidden engine)</div>
                <div className="ff-mono text-xs text-white/60 space-y-1 mt-2">
                  <div>80% → 0.80–0.94%</div>
                  <div>15% → 1.00–1.50%</div>
                  <div>5% → 1.51–2.00%</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Private key modal */}
      {keyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="key-modal" onClick={() => setKeyModal(null)}>
          <div className="glass rounded-2xl p-6 max-w-lg w-full" style={{ borderColor: "rgba(240,165,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#f0a500]"><KeyRound className="w-5 h-5" /><span className="ff-head font-bold">Private Key</span></div>
              <button onClick={() => setKeyModal(null)} data-testid="key-modal-close" className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-white/40 mb-1">{keyModal.owner} · {keyModal.network}</div>
            <div className="ff-mono text-xs text-white/40 break-all mb-4">{keyModal.address}</div>
            <div className="bg-[#05080f] border border-white/10 rounded-sm p-4 ff-mono text-sm text-[#f0a500] break-all" data-testid="key-modal-value">
              {keyModal.privateKey}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => copyText(keyModal.privateKey, "Private key copied")} className="btn-finance rounded-sm px-4 py-2 text-sm flex items-center gap-2" data-testid="key-modal-copy">
                <Copy className="w-4 h-4" /> Copy key
              </button>
              <button onClick={() => setKeyModal(null)} className="btn-wallet rounded-lg px-4 py-2 text-sm">Close</button>
            </div>
            <p className="text-[11px] text-[#ff4757]/80 mt-4">This decryption was logged to the audit trail. Handle with care.</p>
          </div>
        </div>
      )}
    </div>
  );
}
