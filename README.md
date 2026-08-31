# ⚡ Stealth Cloud Storage Vault

A high-performance personal cloud storage and streaming gateway built with **Python Flask**, **Modular Routes/Utils**, **PostgreSQL/SQLite**, and **Vanilla HTML5/CSS3/JS**.

Designed specifically to **bypass restricted corporate office networks/firewalls (Zscaler, Cisco Umbrella, Fortinet)** where direct Google Drive downloads or interactions are blocked, by streaming data through a **Stealth Server-Side Reverse Proxy** on Render/Railway.

---

## ✨ Features

- 🚀 **Stealth Reverse Proxy Streaming:** Streams files directly through your Render domain (`your-vault.onrender.com`), completely hiding Google Drive domains from corporate firewalls.
- 🎬 **In-Browser Multi-Media Previews:**
  - **Video Player** with seek controls (HTTP `206 Partial Content` Range requests).
  - **Audio Player** for music/podcasts.
  - **PDF Viewer** for full-page document reading.
  - **Image Lightbox** with high-resolution rendering.
  - **Code/Text Viewer** for scripts and documents.
- 📤 **Dual Ingestion Engine:**
  1. **Direct File Upload via Google Apps Script (GAS) Bridge:** Uploads directly to your personal Google Drive without touching Google Cloud Console OAuth.
  2. **Drive Link Importer:** Paste any public Google Drive link to instantly index and stealth-stream it.
- 🔒 **Configurable Auth Toggle (Option 3):**
  - Set `ENABLE_AUTH=False` for instant 1-click frictionless access.
  - Set `ENABLE_AUTH=True` to protect your storage with a Master PIN.
- 🐘 **Database Versatility:** Runs on **SQLite** locally and automatically switches to **PostgreSQL** on Render/Railway with zero configuration.
- 🎨 **Glassmorphism UI:** Modern dark theme, responsive grid/table views, live upload progress bars, search, and category filter pills.
- 🐳 **Docker & 1-Click Deploy:** Ready for Render (`render.yaml`) and Docker (`docker-compose.yml`).

---

## 🚀 Quick Start (Local Setup)

### 1. Install Dependencies
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Application
```bash
python run.py
```
Open **`http://localhost:5000`** in your browser!

---

## ⚡ Google Apps Script Setup (Upload directly to Google Drive)

If you want direct uploads from the Web UI to go straight into your Google Drive:

1. Open [Google Apps Script](https://script.google.com/home).
2. Click **New project**.
3. Copy and paste the entire code from [`gas_bridge_script.js`](gas_bridge_script.js).
4. Click **Deploy** -> **New deployment**.
5. Select type: **Web app**.
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
6. Click **Deploy** and authorize permissions.
7. Copy the generated **Web app URL** and set it in your `.env` or Render environment:
   ```env
   GAS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
   ```

---

## ☁️ Deployment Guide (Render / Railway)

### Deploy on Render:
1. Push this repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com).
3. Click **New** -> **Blueprint**, and select your repository (it will automatically detect [`render.yaml`](render.yaml) and create both the Web App and a Free PostgreSQL database).
4. Set your environment variables (`ENABLE_AUTH`, `MASTER_PIN`, `GAS_WEBHOOK_URL`).
5. Click **Apply**!
