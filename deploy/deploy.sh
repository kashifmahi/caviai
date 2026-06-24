#!/usr/bin/env bash
# =============================================================================
# CAVI — UPDATE / REDEPLOY
# Run on the VPS to pull the latest code and apply it. Safe to run anytime.
# Used both manually and by the GitHub Actions auto-deploy workflow.
# (backend/.env and frontend/.env are NOT touched — your secrets persist.)
# =============================================================================
set -euo pipefail
APP_DIR="/var/www/cavi"
cd "${APP_DIR}"

echo "==> Pulling latest code..."
git pull --ff-only

echo "==> Updating backend..."
cd "${APP_DIR}/backend"
./venv/bin/pip install -r requirements.txt
sudo systemctl restart cavi-backend

echo "==> Rebuilding frontend..."
cd "${APP_DIR}/frontend"
# Ensure the API URL env exists (set during first-setup); keep it if present.
[ -f .env ] || echo "REACT_APP_BACKEND_URL=https://$(hostname -f)" > .env
yarn install
yarn build
sudo systemctl reload nginx

echo "✅ Deploy complete."
