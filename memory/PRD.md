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

## Iteration 3 (2026-06-19) — Business rules
- ✅ One wallet per network (max 4), immutable; UI gates owned networks, backend 400 on duplicate.
- ✅ Wallet detail modal: per-wallet deposit ledger (amount, time, ROI active / "starts <date>").
- ✅ Deposit abuse guard: confirm dialog each deposit; 3 attempts allowed; 4th → 403 + securityFlag + "contact admin" banner. Admin "Security" tab lists flagged users; Remove flag resets attempts (audit logged).
- ✅ ROI activation timing: deposit 05:00–05:59 AM PKT → same-day 6 AM cycle; any other time → next-day 6 AM. run_roi_cycle uses activated deposit base only (PKT cycle date). Auto-runs unattended at 6 AM PKT.
- Tested: 38 regression + 7 new-rule backend tests pass; full frontend E2E verified.
