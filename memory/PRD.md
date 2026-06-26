# CAVI — Crypto Investment Platform (PRD)

## Original Problem
Build CAVI, a multi-chain crypto investment platform with self-custody deposit wallets, a deposit-only ROI engine, withdrawals with a penalty window, and a role-protected admin panel. Two emphasized rules: (1) ROI is deposit-only and never compounds; (2) users see wallet addresses only — admins alone can decrypt private keys.

## Stack & Choices
- FastAPI (Python) + React + MongoDB (user-selected over Node/Express for stability).
- Auth: JWT email/password (bcrypt) + Web3 wallet login (MetaMask EVM personal_sign, Phantom Solana signMessage; backend verifies signatures via eth-account / PyNaCl).
- Live prices: CoinGecko (free, no key), cached 60s.
- Private keys: AES-256-GCM encrypted at rest.

## Architecture
- Backend `server.py`: models (users, wallets, wallet_keys, roi, withdrawals, settings, audit, auth_nonces), JWT middleware, admin/superadmin guards, ROI rate engine (hidden tiers 80/15/5%), asyncio daily scheduler at 01:00 UTC (06:00 PKT), penalty window 05:00–06:00 PKT.
- Frontend: AuthContext (Bearer token in localStorage `cavi_token`), Landing, Login/Signup (split-screen + wallet buttons), Dashboard (Overview/Wallets/ROI/Withdrawals), Admin Panel (7 sections).

## Implemented (2026-06-19)
- ✅ Phases 1–9: DB models, auth (email + wallet), landing+auth UI, client-side wallet generation w/ one-time key reveal, deposit-only ROI w/ scheduler + manual run, withdrawals + penalty window, full admin panel (stats, users+toggles, ROI control+global pause, withdrawal approve/reject, deposits & wallets view-key w/ audit, role management superadmin-only, settings), audit logging, role-protected routes.
- ✅ Seeded superadmin: superadmin@cavi.io / Cavi@Admin2025
- ✅ Tested: 38 backend pytest cases + full frontend e2e — 100% pass. ROI verified deposit-only.

## Notes / Mocks
- "Record deposit" on Wallets page is a DEMO action simulating an on-chain deposit (increases deposit base) so the ROI engine is observable. No real blockchain deposit monitoring.
- Client-side generated wallet addresses are illustrative (not funded on-chain wallets); the security model (key encrypted, shown once, admin-only decrypt) is fully real.
- Web3 wallet login requires a real browser wallet; not testable headlessly.

## Backlog / Next
- P1: Real on-chain deposit detection (per network), WalletConnect/Coinbase SDK full support.
- P1: Google OAuth login (deferred per user choice).
- P2: Email notifications (SendGrid) for withdrawal approvals; rate-limit/lockout on login.
- P2: Split server.py into routers; production CORS allowlist; Phase 10 deployment (Netlify + Railway + Atlas).

## Iteration 5 (2026-06-26) — Email notifications + WalletConnect (mobile multi-wallet)
- ✅ Transactional emails (live Hostinger SMTP, stdlib smtplib): welcome email after OTP verify; "password changed" security alert after reset; deposit confirmation to user + alert to admin (kashifmahi271@gmail.com); withdrawal-request confirmation to user + approval-needed alert to admin. Sent fire-and-forget via asyncio.create_task so requests don't block. New env: ADMIN_NOTIFY_EMAIL.
- ✅ WalletConnect / Reown AppKit (v1.8.21) multi-wallet connect: single "Connect Wallet" button opens AppKit modal listing MetaMask, Phantom(Solana), Trust, Binance/Bitget, SafePal + 530 searchable wallets + WalletConnect QR for mobile apps. EVM (mainnet+bsc) via wagmi adapter, Solana via solana adapter. Sign-in reuses existing nonce→sign→verify backend flow (walletSignIn in AuthContext). Replaced the old 4 extension-only buttons that only worked for MetaMask.
- ✅ CRA/webpack5 polyfills added in craco.config.js (Buffer/process/crypto/stream/etc + fullySpecified:false + alias accounts:false). .yarnrc set --ignore-engines true (deps want Node22, VPS has Node20). Env: REACT_APP_REOWN_PROJECT_ID. Deploy files (config.env.example, first-setup.sh) updated with REOWN_PROJECT_ID + ADMIN_NOTIFY_EMAIL + FRONTEND_URL.
- ✅ Security hardening: forgot-password invalidates prior unused reset tokens; reset-password checks token validity before password rule.
- Tested: testing_agent iteration_4 — backend 11/11 pass, frontend 100% on login/signup/forgot/reset/OTP/wallet-modal. No bugs. NOTE: preview env blocks Reown's remote config endpoint (config.reown.com) so AppKit logs a warning and uses local defaults — modal still works; expected to fetch full config in production.
- PENDING (deferred, needs API keys): real on-chain deposit detection (Etherscan/BscScan/Solana RPC/TronGrid). Email path implemented instead per user choice.

## Iteration 6 (2026-06-26) — Withdrawal decision emails
- ✅ When an admin approves/rejects a withdrawal (PATCH /api/admin/withdrawals/{id}), the user now receives an email: "approved ✅" (with amount/net/network/destination) or "rejected" (funds remain in balance, contact support). Helper notify_withdrawal_decision in server.py. Closes the loop after the earlier "pending" email.
- Tested: live curl flow — created withdrawals as test user, approved+rejected as superadmin; both emails confirmed sent to user in backend logs.
- ✅ Strong password validation: min 8 + upper + lower + number + special. Enforced in backend (`validate_password_strength`) and frontend (`PasswordStrength.jsx` live meter on signup & reset).
- ✅ Email OTP on registration: register now stores a `pending_registrations` doc + 6-digit OTP (10 min expiry), emails it via Hostinger SMTP; account is created only after `/auth/verify-otp`. Resend supported (`/auth/resend-otp`). Signup.js is now 2-step (form → OTP).
- ✅ Forgot/Reset password: `/auth/forgot-password` emails a secure `secrets.token_urlsafe(32)` reset link (1h expiry, single-use, anti-enumeration); `/auth/reset-password` validates token+strength. New pages ForgotPassword.js, ResetPassword.js + routes; "Forgot password?" link on Login.
- ✅ SMTP via stdlib smtplib (SMTP_SSL 465) — no extra pip deps. Env: SMTP_HOST/PORT/USER/PASS/FROM, FRONTEND_URL. Deploy: config.env.example + first-setup.sh write these to backend/.env.
- ✅ TTL indexes: pending_registrations (1h), password_reset_tokens (1h).
- Tested: full backend flow via curl — weak pw rejected, OTP email delivered live, verify-otp creates user, forgot-password reset email delivered live, reset works + token single-use + login with new pw. Frontend smoke screenshots OK.
- ✅ One wallet per network (max 4), immutable; UI gates owned networks, backend 400 on duplicate.
- ✅ Wallet detail modal: per-wallet deposit ledger (amount, time, ROI active / "starts <date>").
- ✅ Deposit abuse guard: confirm dialog each deposit; 3 attempts allowed; 4th → 403 + securityFlag + "contact admin" banner. Admin "Security" tab lists flagged users; Remove flag resets attempts (audit logged).
- ✅ ROI activation timing: deposit 05:00–05:59 AM PKT → same-day 6 AM cycle; any other time → next-day 6 AM. run_roi_cycle uses activated deposit base only (PKT cycle date). Auto-runs unattended at 6 AM PKT.
- Tested: 38 regression + 7 new-rule backend tests pass; full frontend E2E verified.
