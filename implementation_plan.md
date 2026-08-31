# Stealth Cloud Storage Vault (Flask + Google Drive Proxy)

A personal cloud storage application built with **Python Flask**, **Modular Routes & Utils**, **PostgreSQL/SQLite (SQLAlchemy)**, and **Vanilla HTML5/CSS3/JS**. It provides a sleek, glassmorphic web dashboard allowing users to upload, download, preview (video/audio/PDF/images/code), and delete large files in real time.

By utilizing a **Server-Side Streaming Reverse Proxy Engine**, the app streams files directly through your Render/Railway domain, bypassing corporate office firewalls and restrictions that block direct Google Drive access—all without needing the complex GCP Google Drive API console.

---

## User Review Required

> [!IMPORTANT]
> **Key Decisions in this Plan:**
> 1. **Auth Mode (Option 3):** Configurable in `config.py` via `ENABLE_AUTH = True/False`. When `False`, the dashboard is completely open and frictionless. When `True`, a clean Master PIN screen guards access.
> 2. **Dual Storage Mechanism:**
>    - **Direct Upload via Google Apps Script (GAS) Webhook Bridge:** Clean, zero GCP OAuth setup; files go directly into your personal Google Drive.
>    - **Link Ingestion Engine:** Paste any existing public Google Drive link, and the system automatically indexes it for stealth proxy streaming.
> 3. **Database Flexibility:** Uses **SQLAlchemy** configured to run on **SQLite** locally (zero config) and automatically switch to **PostgreSQL** in production via `DATABASE_URL` (ideal for Render/Railway).
> 4. **Streaming Engine:** Implements HTTP Range headers (`206 Partial Content`) for smooth video scrubbing/seeking and chunked downloads without memory overload on free 512MB RAM servers.

---

## Proposed Changes

```
stroage-system/
├── Dockerfile                  # Production container configuration
├── docker-compose.yml          # Local multi-service testing (Flask + PostgreSQL)
├── requirements.txt            # Python dependencies
├── config.py                   # Centralized configuration (Auth toggle, DB URI, etc.)
├── run.py                      # Application entrypoint
├── render.yaml                 # 1-click deployment blueprint for Render
├── gas_bridge_script.js        # Ready-to-paste Google Apps Script code for your Google Drive
│
├── app/
│   ├── __init__.py             # Flask App Factory & database initialization
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth_routes.py      # Master PIN verification, login/logout session handlers
│   │   ├── file_routes.py      # Upload, list, stream/download proxy, view, delete, link-import
│   │   └── view_routes.py      # Web page rendering (dashboard, login)
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── db_models.py        # SQLAlchemy models (FileItem, SystemConfig)
│   │   ├── drive_streamer.py   # Chunked streaming generator, HTTP Range parser, Stealth Proxy
│   │   ├── gas_bridge.py       # Google Apps Script Webhook client (Upload/Delete)
│   │   └── auth_guard.py       # Session validation & route protection decorator
│   │
│   ├── templates/
│   │   ├── base.html           # Base layout with responsive meta tags and font styling
│   │   ├── index.html          # Main Dashboard: Dropzone, Search, Filter tags, File grid & table
│   │   ├── login.html          # Sleek Master PIN authentication screen
│   │   └── preview_modal.html  # In-browser multi-media previewer modal
│   │
│   └── static/
│       ├── css/
│       │   ├── style.css       # Design tokens, dark glassmorphism theme, layout
│       │   └── components.css  # Dropzone, upload progress bars, file cards, modals, toast alerts
│       └── js/
│           ├── app.js          # Main app logic: drag & drop, upload progress, search/filter, delete
│           ├── preview.js      # Media viewer (Video player, PDF renderer, Image zoom, Text viewer)
│           └── auth.js         # PIN authentication handler
```

---

### Backend Core & Configuration

#### [NEW] [requirements.txt](file:///c:/Users/himan/Desktop/stroage%20system/requirements.txt)
- Dependencies: `Flask`, `Flask-SQLAlchemy`, `Flask-Cors`, `requests`, `gunicorn`, `psycopg2-binary` (PostgreSQL adapter), `python-dotenv`.

#### [NEW] [config.py](file:///c:/Users/himan/Desktop/stroage%20system/config.py)
- Configuration class supporting `ENABLE_AUTH` (default `False` / toggleable), `MASTER_PIN`, `SECRET_KEY`, `SQLALCHEMY_DATABASE_URI` (SQLite fallback if `DATABASE_URL` is unset), and `GAS_WEBHOOK_URL`.

#### [NEW] [run.py](file:///c:/Users/himan/Desktop/stroage%20system/run.py)
- Entrypoint script that initializes the database tables and starts the development server.

#### [NEW] [app/__init__.py](file:///c:/Users/himan/Desktop/stroage%20system/app/__init__.py)
- Flask application factory registering blueprints (`auth_bp`, `file_bp`, `view_bp`) and initializing SQLAlchemy.

---

### Database Models & Utilities

#### [NEW] [app/utils/db_models.py](file:///c:/Users/himan/Desktop/stroage%20system/app/utils/db_models.py)
- `FileItem` Model: `id`, `filename`, `file_size`, `mime_type`, `drive_file_id`, `drive_download_url`, `source_type` (`gas_upload` or `direct_link`), `category` (`video`, `image`, `audio`, `pdf`, `archive`, `code`, `other`), `created_at`, `updated_at`.

#### [NEW] [app/utils/drive_streamer.py](file:///c:/Users/himan/Desktop/stroage%20system/app/utils/drive_streamer.py)
- Stealth Reverse Proxy streaming engine:
  - Fetches stream chunks from Google Drive or GAS endpoint.
  - Supports HTTP `Range` headers to enable video seeking and resuming interrupted downloads.
  - Formats responses with `Content-Disposition: inline` (for preview) or `attachment` (for download).

#### [NEW] [app/utils/gas_bridge.py](file:///c:/Users/himan/Desktop/stroage%20system/app/utils/gas_bridge.py)
- Helper to interact with the Google Apps Script Web App for uploading files to Google Drive and deleting files.

#### [NEW] [app/utils/auth_guard.py](file:///c:/Users/himan/Desktop/stroage%20system/app/utils/auth_guard.py)
- `@require_pin` decorator that checks session authentication only if `ENABLE_AUTH` is set to `True`.

---

### Routes & API Endpoints

#### [NEW] [app/routes/view_routes.py](file:///c:/Users/himan/Desktop/stroage%20system/app/routes/view_routes.py)
- `GET /`: Renders main dashboard.
- `GET /login`: Renders PIN login page (redirects to `/` if auth is disabled).

#### [NEW] [app/routes/auth_routes.py](file:///c:/Users/himan/Desktop/stroage%20system/app/routes/auth_routes.py)
- `POST /api/auth/verify`: Verifies Master PIN and sets session cookie.
- `POST /api/auth/logout`: Clears session.
- `GET /api/auth/status`: Returns current auth state (`enabled`, `authenticated`).

#### [NEW] [app/routes/file_routes.py](file:///c:/Users/himan/Desktop/stroage%20system/app/routes/file_routes.py)
- `GET /api/files`: Returns list of files with filtering & search.
- `POST /api/files/upload`: Handles chunked multipart upload via GAS bridge or local buffer.
- `POST /api/files/import-link`: Imports a Google Drive public link, extracts metadata, and stores it.
- `GET /api/files/download/<int:file_id>`: Stealth streaming download proxy.
- `GET /api/files/stream/<int:file_id>`: In-browser streaming (Range request support for video/audio/PDF).
- `DELETE /api/files/<int:file_id>`: Deletes metadata from DB and triggers deletion from Google Drive.

---

### Frontend UI & Client Engine

#### [NEW] [app/templates/base.html](file:///c:/Users/himan/Desktop/stroage%20system/app/templates/base.html)
- HTML5 shell with modern typography (Inter/Outfit fonts), meta tags for SEO/viewport, and CSS/JS inclusions.

#### [NEW] [app/templates/index.html](file:///c:/Users/himan/Desktop/stroage%20system/app/templates/index.html)
- Interactive Dashboard:
  - Header with storage statistics & quick settings.
  - Multi-function Upload Area: Drag & drop file dropzone AND "Import Google Drive Link" tab.
  - Search & Category Filter pills (All, Videos, Documents, Images, Audio, Archives).
  - Toggleable Grid / Table View of all files.
  - Live progress indicators for ongoing uploads.

#### [NEW] [app/templates/login.html](file:///c:/Users/himan/Desktop/stroage%20system/app/templates/login.html)
- Minimalist glassmorphic PIN entry screen with shake animation on invalid entry.

#### [NEW] [app/templates/preview_modal.html](file:///c:/Users/himan/Desktop/stroage%20system/app/templates/preview_modal.html)
- Universal Preview Modal:
  - Video Player with seek controls.
  - Audio Player with waveform visualizer.
  - Full-screen PDF viewer.
  - Image lightbox with zoom/rotate.
  - Code/Text viewer with copy action.

#### [NEW] [app/static/css/style.css](file:///c:/Users/himan/Desktop/stroage%20system/app/static/css/style.css) & [app/static/css/components.css](file:///c:/Users/himan/Desktop/stroage%20system/app/static/css/components.css)
- Sleek modern dark mode (deep blues, zinc grays, cyan/purple glowing accents, backdrop-filter glassmorphism).
- Smooth CSS animations, transitions, responsive layouts for mobile and desktop.

#### [NEW] [app/static/js/app.js](file:///c:/Users/himan/Desktop/stroage%20system/app/static/js/app.js) & [app/static/js/preview.js](file:///c:/Users/himan/Desktop/stroage%20system/app/static/js/preview.js) & [app/static/js/auth.js](file:///c:/Users/himan/Desktop/stroage%20system/app/static/js/auth.js)
- Vanilla JS modules for asynchronous file uploads with percentage progress, realtime UI updates, search filtering, media preview handling, and toast notifications.

---

### Deployment & Google Apps Script Setup

#### [NEW] [Dockerfile](file:///c:/Users/himan/Desktop/stroage%20system/Dockerfile) & [docker-compose.yml](file:///c:/Users/himan/Desktop/stroage%20system/docker-compose.yml)
- Multi-stage lightweight Python 3.11 Docker configuration with Gunicorn worker setup.

#### [NEW] [gas_bridge_script.js](file:///c:/Users/himan/Desktop/stroage%20system/gas_bridge_script.js)
- Complete Google Apps Script source code with instructions to copy-paste into script.google.com and deploy as a Web App with 1 click.

---

## Verification Plan

### Automated Tests & Verification
1. **Virtual Environment & Dependencies:** Verify Python packages install cleanly without conflicts.
2. **Database Initialization:** Run automated script to verify SQLAlchemy initializes SQLite and PostgreSQL schemas.
3. **Route & API Testing:**
   - Test `/api/auth/status` and PIN verification.
   - Test link import parser with sample Google Drive URLs.
   - Test file listing and metadata response format.
   - Test stream generator with HTTP Range requests (Range: bytes=0-1024).

### Manual Verification
1. **Local Server Start:** Launch Flask server via `python run.py`.
2. **Dashboard & UI Verification:** Open in browser, test responsive layouts, drag-and-drop animations, search filter pills, and table/grid view toggling.
3. **File Preview Testing:** Verify video/image/audio/PDF playback and modal open/close actions.
4. **Stealth Download Test:** Verify downloading a file streams through `localhost:5000/api/files/download/...` with correct content headers.
