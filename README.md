# ⚡ Stealth Cloud Storage Vault (Multi-User & Enterprise Ready)

A high-performance, private cloud storage and stealth streaming gateway built with **Python Flask**, **Modular Architecture**, **PostgreSQL / SQLite**, and **Modern Glassmorphism UI (HTML5/CSS3/Vanilla JS)**.

Designed specifically to **bypass restricted corporate office networks/firewalls (Zscaler, Cisco Umbrella, Fortinet)** where direct Google Drive downloads or interactions are blocked, by streaming data through a **Zero-Memory Server-Side Reverse Proxy** on Railway/Render.

---

## ✨ Key Features

### 1. 👥 Multi-User Authentication & 100% Data Isolation
- **Private User Vaults:** Each user has their own isolated storage. Users can ONLY see, search, upload, stream, and delete their own files.
- **Secure Password Hashing:** Powered by `werkzeug.security` (`pbkdf2:sha256`).
- **Clean Session Lifecycles:** Independent user and administrator sessions with strict boundary enforcement.

### 2. 🛡️ Dedicated Super Admin Control Panel (`/admin/login`)
- **Isolated Admin Portal:** Separate login portal protected by Master Security PIN / Key (`MASTER_PIN`).
- **403 Security Guard:** Standard user accounts are strictly forbidden from accessing administrative routes.
- **Live Platform Metrics:** Total registered users, total files stored, and total storage utilization.
- **1-Click Password Reset:** Admin can set a custom password or click **"Auto-Generate"** to create a secure 10-character password, with an instant **"Copy"** button to share with the user.

### 3. 🚀 Zero-Memory 5MB Chunking & Batch Multi-File Upload Engine
- **No More Timeout / 502 Errors:** Streams 5MB client-side slices directly to disk and onward to Google Drive, maintaining container RAM strictly **under 30MB** (safe for Railway 512MB RAM containers).
- **Large File Support:** Seamlessly handles files up to **2 GB**.
- **Batch Upload Queue:** Select or drag & drop multiple files at once. Live Queue HUD displays `Batch: 2 / 5 | 3 remaining` and real-time MB/s upload speeds.

### 4. 🎬 Stealth In-Browser Media Streaming & Proxy
- **Firewall Bypass:** Streams files through your custom server domain, completely hiding Google Drive URLs from corporate firewalls.
- **Direct Usercontent Streamer:** Bypasses Google's 2,438-byte HTML virus scan warning pages on large downloads (`drive.usercontent.google.com/download?id=...&confirm=t`).
- **Rich In-Browser Previews:**
  - 🎥 **Video Player** with smooth seeking (HTTP `206 Partial Content` Range requests).
  - 🎵 **Audio Player** with waveform bar.
  - 📄 **PDF Reader** for documents.
  - 🖼️ **Image Lightbox** with high-resolution rendering.
  - 💻 **Code & Text Viewer** with syntax rendering.

---

## 🏗️ Project Architecture

```
stroage system/
├── app/
│   ├── routes/
│   │   ├── admin_routes.py      # Super Admin management & password reset APIs
│   │   ├── auth_routes.py       # User Register, Login, Admin Login, & Logout
│   │   ├── file_routes.py       # 5MB Chunk upload, stream, download & stats
│   │   └── view_routes.py       # HTML template rendering (/ , /login, /admin)
│   ├── static/
│   │   ├── css/
│   │   │   ├── style.css        # Core layout, tokens & responsive styles
│   │   │   └── components.css   # Glassmorphism cards, modals, dropzone & tables
│   │   └── js/
│   │       ├── admin.js         # Admin dashboard, stats & reset password logic
│   │       ├── app.js           # Batch Upload Queue, 5MB chunker & file manager
│   │       ├── auth.js          # Tabbed Sign In / Sign Up & eye toggle logic
│   │       └── preview.js       # In-browser media modal viewers (Video/Audio/PDF)
│   ├── templates/
│   │   ├── 403.html             # Access Denied page for standard users
│   │   ├── admin.html           # Super Admin Dashboard
│   │   ├── admin_login.html     # Dedicated Super Admin PIN login portal
│   │   ├── base.html            # Base template with responsive navbar & toast helper
│   │   ├── index.html           # Main Storage Vault dashboard & batch dropzone
│   │   └── login.html           # User Sign In & Sign Up tabbed view
│   └── utils/
│       ├── auth_guard.py        # @require_login & @require_admin decorators
│       ├── db_models.py         # User and FileItem SQLAlchemy models
│       ├── drive_streamer.py    # Zero-memory chunk streaming & range proxy
│       └── gas_bridge.py        # Google Apps Script disk streamer bridge
├── config.py                    # Application environment configuration
├── gas_bridge_script.js         # Apps Script bridge (Deploy on Google Drive)
├── gunicorn.conf.py             # Lightweight multithreaded worker config
├── requirements.txt             # Python dependencies
└── run.py                       # Application entrypoint
```

---

## 🚀 Getting Started (Local Setup)

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/Himanshu24091/Stroage_System.git
cd Stroage_System

python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Flask Secret Key
SECRET_KEY=your-super-secret-random-key-here-12345

# Master Security PIN for Super Admin Access (/admin/login)
MASTER_PIN=1234

# Database (Uses SQLite locally, PostgreSQL in Production)
DATABASE_URL=sqlite:///vault.db

# Google Apps Script Webhook URL (Optional for direct Google Drive upload)
GAS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# Server Port
PORT=5000
```

### 3. Start the Server
```bash
python run.py
```
Open **`http://localhost:5000`** in your browser!

---

## ⚡ Google Apps Script Bridge Setup (Direct Drive Upload)

If you want files to upload directly into your Google Drive:

1. Open [Google Apps Script](https://script.google.com/home).
2. Click **New project**.
3. Replace all code with the content of [`gas_bridge_script.js`](gas_bridge_script.js).
4. Run `testAuth()` once from the editor to grant Google Drive permissions with 1 click.
5. Click **Deploy** -> **New deployment**.
   - Select **Web app**.
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
6. Copy the generated **Web App URL** and paste it into your `GAS_WEBHOOK_URL` in `.env`.

---

## ☁️ Deployment Guide (Railway / Render)

### Deploy on Railway (Recommended):
1. Push this repository to your GitHub account.
2. Go to [Railway.app](https://railway.app) and create a **New Project** -> **Deploy from GitHub repo**.
3. Add a **PostgreSQL** database service in Railway.
4. In your Web Service settings, add the Environment Variables:
   - `SECRET_KEY` = `<random-32-character-string>`
   - `MASTER_PIN` = `<your-admin-pin>`
   - `GAS_WEBHOOK_URL` = `<your-google-apps-script-url>`
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
5. Railway will automatically build the app using `gunicorn.conf.py` (2 workers, 4 threads, `gthread` engine for minimal RAM footprint).

---

## 🛡️ Default Super Admin Access

- **Admin Login Portal:** `http://your-domain.com/admin/login`
- **Default PIN:** `1234` (Configurable via `MASTER_PIN` in `.env`)

---

## 📄 License
MIT License. Free for personal and commercial usage.
