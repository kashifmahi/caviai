#!/usr/bin/env bash
# =============================================================================
# CAVI — UPDATE / REDEPLOY
# Run on the VPS to pull the latest code and apply it. Safe to run anytime.
# Used both manually and by the GitHub Actions auto-deploy workflow.
#
# This script RECONCILES env vars from deploy/config.env into backend/.env and
# frontend/.env on every deploy (so newly-added settings like SMTP / WalletConnect
# Project ID propagate to production automatically), WITHOUT regenerating or
# touching JWT_SECRET / ENCRYPTION_KEY (those must never change).
# =============================================================================
set -euo pipefail
APP_DIR="/var/www/cavi"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${APP_DIR}"

echo "==> Pulling latest code..."
git fetch --all --quiet || echo "WARN: git fetch failed; using code on disk."
# Force working tree to match remote (config.env is gitignored, so secrets are safe).
git reset --hard "@{u}" || git pull --ff-only || echo "WARN: could not update code; continuing with current code."

# ---- Load your settings (untracked; lives only on the VPS) -------------------
if [ -f "${SCRIPT_DIR}/config.env" ]; then
  # shellcheck disable=SC1090
  source "${SCRIPT_DIR}/config.env"
else
  echo "!! deploy/config.env not found — env vars cannot be reconciled."
  echo "   Create it from config.env.example and fill in your values."
fi

# Idempotently set KEY="VALUE" in an env file (handles special chars; no sed).
upsert_env() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  grep -v "^${key}=" "$file" > "${file}.tmp" 2>/dev/null || true
  printf '%s="%s"\n' "$key" "$val" >> "${file}.tmp"
  mv "${file}.tmp" "$file"
}

DOMAIN="${DOMAIN:-$(hostname -f)}"

echo "==> Reconciling backend/.env (secrets preserved)..."
BENV="${APP_DIR}/backend/.env"
upsert_env "$BENV" CORS_ORIGINS "https://${DOMAIN},https://www.${DOMAIN}"
upsert_env "$BENV" FRONTEND_URL "https://${DOMAIN}"
[ -n "${SUPPORT_EMAIL:-}" ]      && upsert_env "$BENV" SUPPORT_EMAIL "${SUPPORT_EMAIL}"
[ -n "${ADMIN_NOTIFY_EMAIL:-}" ] && upsert_env "$BENV" ADMIN_NOTIFY_EMAIL "${ADMIN_NOTIFY_EMAIL}"
[ -n "${SMTP_HOST:-}" ]          && upsert_env "$BENV" SMTP_HOST "${SMTP_HOST}"
[ -n "${SMTP_PORT:-}" ]          && upsert_env "$BENV" SMTP_PORT "${SMTP_PORT}"
[ -n "${SMTP_USER:-}" ]          && upsert_env "$BENV" SMTP_USER "${SMTP_USER}"
[ -n "${SMTP_PASS:-}" ]          && upsert_env "$BENV" SMTP_PASS "${SMTP_PASS}"
[ -n "${SMTP_FROM:-${SMTP_USER:-}}" ] && upsert_env "$BENV" SMTP_FROM "${SMTP_FROM:-${SMTP_USER:-}}"

echo "==> Updating backend..."
cd "${APP_DIR}/backend"
./venv/bin/pip install -r requirements.txt
sudo systemctl restart cavi-backend

echo "==> Reconciling frontend/.env + rebuilding..."
cd "${APP_DIR}/frontend"
cat > .env <<EOF
REACT_APP_BACKEND_URL=https://${DOMAIN}
REACT_APP_REOWN_PROJECT_ID=${REOWN_PROJECT_ID:-}
EOF
yarn install
yarn build
sudo systemctl reload nginx

echo "✅ Deploy complete."
if [ -z "${SMTP_PASS:-}" ]; then
  echo "⚠️  SMTP_PASS is empty in config.env — password reset / notification emails will NOT send."
fi
if [ -z "${REOWN_PROJECT_ID:-}" ]; then
  echo "⚠️  REOWN_PROJECT_ID is empty in config.env — wallet login will show 'Project ID is missing'."
fi
