# 🚀 Deploy CAVI on a Hostinger VPS (with your own domain)

CAVI = **React (frontend)** + **FastAPI (backend)** + **MongoDB**.
This guide deploys all three on **one Hostinger VPS** behind Nginx + free HTTPS.

> ⚠️ Hostinger **shared/web hosting (hPanel)** cannot run Python/MongoDB persistently. You need a **Hostinger VPS** (KVM 1 or higher, Ubuntu 22.04). Your domain can stay registered with Hostinger.

---

## 0) What you need
- A **Hostinger VPS** (KVM 1 is enough to start) with **Ubuntu 22.04** template.
- Your **domain** (in Hostinger hPanel).
- The CAVI source code — push it to GitHub from Emergent using the **"Save to GitHub"** button, then you'll `git clone` it on the VPS. (Or download the code and upload via SFTP.)

---

## 1) Point your domain to the VPS
1. In hPanel → **VPS** → your server → copy the **IP address** (e.g. `203.0.113.10`).
2. hPanel → **Domains** → your domain → **DNS / Nameservers** → **DNS Zone**.
3. Add/edit **A records**:
   | Type | Name | Points to       | TTL  |
   |------|------|-----------------|------|
   | A    | @    | YOUR_VPS_IP     | 3600 |
   | A    | www  | YOUR_VPS_IP     | 3600 |
4. DNS can take 5–60 min to propagate.

---

## 2) Connect to the VPS & install dependencies
SSH in (use hPanel's **Browser terminal** or any SSH client):
```bash
ssh root@YOUR_VPS_IP
```
Install everything:
```bash
apt update && apt upgrade -y
# Node 20 (to build the React app)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs python3 python3-venv python3-pip nginx git
npm install -g yarn

# MongoDB 7 (Community)
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org
systemctl enable --now mongod
```
> 💡 Prefer a managed DB? Use **MongoDB Atlas** (free tier) instead and skip the MongoDB install — just use its connection string in step 4.

---

## 3) Get the code
```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git cavi
cd cavi
```

---

## 4) Configure & start the BACKEND
```bash
cd /var/www/cavi/backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```
Create the production `.env` (replace the secrets with strong values):
```bash
nano /var/www/cavi/backend/.env
```
```env
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="cavi_production"
CORS_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
JWT_SECRET="PUT_A_LONG_RANDOM_64_CHAR_HEX_HERE"
ENCRYPTION_KEY="PUT_A_32_BYTE_64_CHAR_HEX_HERE"
ADMIN_EMAIL="you@yourdomain.com"
ADMIN_PASSWORD="ChooseAStrongAdminPassword"
```
Generate strong secrets:
```bash
python3 -c "import secrets;print('JWT_SECRET',secrets.token_hex(32));print('ENCRYPTION_KEY',secrets.token_hex(32))"
```
> ⚠️ `ENCRYPTION_KEY` must be exactly 64 hex chars (32 bytes) — it decrypts wallet private keys. **Never change it after users create wallets**, or existing keys can't be decrypted.

Install the systemd service:
```bash
cp /var/www/cavi/deploy/cavi-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cavi-backend
systemctl status cavi-backend     # should say "active (running)"
curl http://127.0.0.1:8001/api/   # -> {"message":"CAVI API online"}
```
The superadmin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) is auto-created on first start.
The **daily ROI cycle auto-runs at 6 AM PKT** inside this process — no extra cron needed.

---

## 5) Build & place the FRONTEND
The frontend must know the public API URL. Since Nginx serves both on the same domain:
```bash
cd /var/www/cavi/frontend
echo 'REACT_APP_BACKEND_URL=https://yourdomain.com' > .env
yarn install
yarn build           # outputs /var/www/cavi/frontend/build
```

---

## 6) Configure Nginx
```bash
cp /var/www/cavi/deploy/nginx-cavi.conf /etc/nginx/sites-available/cavi
# replace yourdomain.com inside the file:
sed -i 's/yourdomain.com/REALDOMAIN.com/g' /etc/nginx/sites-available/cavi
ln -s /etc/nginx/sites-available/cavi /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```
Visit `http://yourdomain.com` — CAVI should load.

---

## 7) Enable HTTPS (free, auto-renew)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Follow the prompts (enter email, agree, choose **redirect HTTP→HTTPS**). Certbot edits Nginx and auto-renews.

✅ Now `https://yourdomain.com` is live with a valid certificate. Web3 wallet login (MetaMask/Phantom/Trust) and all features work.

---

## 8) Updating the app later
```bash
cd /var/www/cavi && git pull
# backend changed?
cd backend && ./venv/bin/pip install -r requirements.txt && systemctl restart cavi-backend
# frontend changed?
cd ../frontend && yarn install && yarn build && systemctl reload nginx
```

---

## Security checklist
- [ ] Strong `ADMIN_PASSWORD`, unique `JWT_SECRET` & `ENCRYPTION_KEY`.
- [ ] Firewall: `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`.
- [ ] MongoDB stays bound to `127.0.0.1` (default) — never expose port 27017 publicly.
- [ ] Back up MongoDB regularly: `mongodump --db cavi_production --out /root/backups/$(date +%F)`.
- [ ] Keep the VPS patched: `apt update && apt upgrade -y`.

---

## Troubleshooting
| Symptom | Check |
|---|---|
| 502 Bad Gateway | `systemctl status cavi-backend`, `journalctl -u cavi-backend -n 50` |
| Frontend loads but API fails | `REACT_APP_BACKEND_URL` must match your https domain; rebuild frontend |
| Wallet login error | confirm HTTPS is active (wallets require a secure origin) |
| CORS error | `CORS_ORIGINS` in backend `.env` must list your exact https domain(s), then restart backend |
| ROI not generating | it runs at 6 AM PKT; trigger manually from Admin → ROI Control → "Run Cycle Now" |
