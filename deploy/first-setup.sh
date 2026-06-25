#!/usr/bin/env bash
# =============================================================================
# CAVI — ONE-TIME VPS SETUP (Hostinger KVM, Ubuntu 22.04)
# Run this ONCE as root on your VPS. It installs everything, deploys CAVI,
# configures Nginx + free HTTPS, and sets up auto-restart.
#
#   1) Edit the 5 variables below.
#   2) bash first-setup.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Load your settings from deploy/config.env (untracked, never conflicts) ----
if [ ! -f "${SCRIPT_DIR}/config.env" ]; then
  cp "${SCRIPT_DIR}/config.env.example" "${SCRIPT_DIR}/config.env"
  echo ""
  echo ">> Created ${SCRIPT_DIR}/config.env"
  echo ">> Edit it with your values, then run this script again:"
  echo "       nano ${SCRIPT_DIR}/config.env"
  echo "       bash ${SCRIPT_DIR}/first-setup.sh"
  exit 1
fi
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/config.env"

APP_DIR="/var/www/cavi"

echo "==> [1/8] Installing system packages..."
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs python3 python3-venv python3-pip nginx git ufw
npm install -g yarn

echo "==> [2/8] Installing MongoDB 7..."
if ! command -v mongod >/dev/null 2>&1; then
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt update && apt install -y mongodb-org
fi
systemctl enable --now mongod

echo "==> [3/8] Cloning repo to ${APP_DIR}..."
mkdir -p /var/www
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" pull
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi

echo "==> [4/8] Writing backend .env (secrets auto-generated)..."
JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_hex(32))")
ENC_KEY=$(python3 -c "import secrets;print(secrets.token_hex(32))")
cat > "${APP_DIR}/backend/.env" <<EOF
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="cavi_production"
CORS_ORIGINS="https://${DOMAIN},https://www.${DOMAIN}"
JWT_SECRET="${JWT_SECRET}"
ENCRYPTION_KEY="${ENC_KEY}"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
SUPPORT_EMAIL="${SUPPORT_EMAIL}"
EOF
echo "    -> backend/.env created. KEEP ENCRYPTION_KEY SAFE & NEVER CHANGE IT."

echo "==> [5/8] Backend venv + dependencies..."
cd "${APP_DIR}/backend"
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

echo "==> [6/8] Installing systemd service..."
cp "${APP_DIR}/deploy/cavi-backend.service" /etc/systemd/system/cavi-backend.service
systemctl daemon-reload
systemctl enable --now cavi-backend
sleep 3
systemctl --no-pager status cavi-backend | head -n 5 || true

echo "==> [7/8] Building frontend..."
cd "${APP_DIR}/frontend"
echo "REACT_APP_BACKEND_URL=https://${DOMAIN}" > .env
yarn install
yarn build

echo "==> [8/8] Configuring Nginx + HTTPS..."
cp "${APP_DIR}/deploy/nginx-cavi.conf" /etc/nginx/sites-available/cavi
sed -i "s/yourdomain.com/${DOMAIN}/g" /etc/nginx/sites-available/cavi
ln -sf /etc/nginx/sites-available/cavi /etc/nginx/sites-enabled/cavi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

apt install -y certbot python3-certbot-nginx
certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect || \
  echo "!! Certbot failed (check DNS points to this VPS). Re-run: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"

echo ""
echo "============================================================"
echo " ✅ CAVI is live:  https://${DOMAIN}"
echo " Admin login:      ${ADMIN_EMAIL}"
echo " Future updates:   git pull + bash deploy/deploy.sh (or via GitHub Actions)"
echo "============================================================"
