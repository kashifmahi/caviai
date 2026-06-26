#!/usr/bin/env bash
# =============================================================================
# CAVI — APPLY ENV (standalone, no git pull)
# Reconciles secrets from deploy/config.env into backend/.env + frontend/.env,
# then rebuilds the frontend and restarts the backend. Run this directly when
# email / WalletConnect Project ID aren't taking effect after a deploy.
#   bash deploy/apply-env.sh
# Preserves JWT_SECRET / ENCRYPTION_KEY (never regenerated). config.env values win.
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/var/www/cavi"

if [ ! -f "${SCRIPT_DIR}/config.env" ]; then
  echo "!! ${SCRIPT_DIR}/config.env not found. Create it from config.env.example and fill in your values."
  exit 1
fi
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/config.env"

upsert_env() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  grep -v "^${key}=" "$file" > "${file}.tmp" 2>/dev/null || true
  printf '%s="%s"\n' "$key" "$val" >> "${file}.tmp"
  mv "${file}.tmp" "$file"
}

DOMAIN="${DOMAIN:-$(hostname -f)}"
DOMAIN="${DOMAIN%/}"

echo "==> Writing backend/.env (secrets preserved)..."
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
echo "    backend/.env keys:"; sed -E 's/=.*/=<set>/' "$BENV" | sed 's/^/      /'

echo "==> Writing frontend/.env..."
cat > "${APP_DIR}/frontend/.env" <<EOF
REACT_APP_BACKEND_URL=https://${DOMAIN}
REACT_APP_REOWN_PROJECT_ID=${REOWN_PROJECT_ID:-}
EOF
sed 's/^/      /' "${APP_DIR}/frontend/.env"

echo "==> Restarting backend..."
sudo systemctl restart cavi-backend

echo "==> Rebuilding frontend..."
cd "${APP_DIR}/frontend"
yarn install
yarn build
sudo systemctl reload nginx

echo ""
echo "============================================================"
[ -n "${SMTP_PASS:-}" ] && echo " ✅ SMTP configured (emails will send)" || echo " ⚠️  SMTP_PASS empty — emails will NOT send"
[ -n "${REOWN_PROJECT_ID:-}" ] && echo " ✅ WalletConnect Project ID set" || echo " ⚠️  REOWN_PROJECT_ID empty — wallet login will fail"
echo "============================================================"
