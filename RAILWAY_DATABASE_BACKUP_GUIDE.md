# 🛡️ Railway PostgreSQL: Complete Backup & Restore In-Depth Guide

Ek comprehensive, step-by-step guide jo explain karti hai ki **Railway PostgreSQL database se 100% FREE aur securely connect kaise karein**, **complete backup kaise export karein**, aur **zaroorat padne par import (restore) kaise karein**.

---

## 📌 Index
1. [Kyun Zaroori Hai? (Background)](#1-kyun-zaroori-hai-background)
2. [Security Comparison: Tunnel vs Public Proxy](#2-security-comparison-tunnel-vs-public-proxy)
3. [Step 1: Secure Tunnel Setup (Railway CLI)](#step-1-secure-tunnel-setup-railway-cli)
4. [Step 2: pgAdmin ko Railway Database se Connect Karna](#step-2-pgadmin-ko-railway-database-se-connect-karna)
5. [Step 3: Database ka Backup Lena (Export)](#step-3-database-ka-backup-lena-export)
6. [Step 4: Database ko Restore / Import Karna](#step-4-database-ko-restore--import-karna)
7. [Important Security Rules & Gitignore](#7-important-security-rules--gitignore)
8. [Troubleshooting & Common Errors](#8-troubleshooting--common-errors)

---

## 1. Kyun Zaroori Hai? (Background)

* **Railway Pricing**: Railway ke dashboard par automatic point-in-time backups sirf **Pro Plan ($20/month)** users ke liye hote hain.
* **100% Free Alternative**: PostgreSQL ke standard tools (`pg_dump`, `psql`, aur `pgAdmin`) ka use karke aap apne poore database ka complete snapshot apne personal computer par bina kisi cost ke save kar sakte hain.
* **Data Safety**: Server crash, accidental delete, ya migration ke waqt aapke users, passwords, files metadata, aur support tickets hamesha safe rehte hain.

---

## 2. Security Comparison: Tunnel vs Public Proxy

| Feature | Method A: Railway Encrypted Tunnel | Method B: Public TCP Proxy |
|---|---|---|
| **Security Level** | ⭐⭐⭐⭐⭐ (100% Private) | ⭐⭐⭐ (Exposed to Internet) |
| **Internet Exposure** | **Zero**. Database internet par open nahi hota. | Poore internet par open ho jata hai (`xxxx.proxy.rlwy.net:port`). |
| **Brute-Force Risk** | **Zero**. Bahar ke bots isko dekh bhi nahi sakte. | Bots automated scanning aur password attacks try karte hain. |
| **Bandwidth Cost** | Free internal data transfer. | Public egress traffic bill ho sakta hai. |
| **Recommendation** | **Industry Best Practice (Recommended)** | Sirf tab jab tunnel option kaam na kare. |

---

## Step 1: Secure Tunnel Setup (Railway CLI)

Railway ka database by default private VPC network (`postgres.railway.internal`) mein hota hai. Isko apne local laptop se bina internet par khole connect karne ke liye Railway CLI encrypted tunnel banata hai.

### 1.1 Railway CLI Install Karein
Agar installed nahi hai to terminal mein run karein:
```powershell
npm i -g @railway/cli
```

### 1.2 Login Karein
```powershell
railway login
```
*(Browser open hoga, Railway account approve karein).*

### 1.3 Project Link Karein
Project folder ke andar terminal mein run karein:
```powershell
railway link
```
* **Select Project:** Arrow keys (`↑`/`↓`) se apna Storage project select karein aur `Enter` dabayein.
* **Select Environment:** `production` select karein aur `Enter` dabayein.

### 1.4 SSH Key Generate Karein (One-Time Setup)
Agar Railway CLI error de: `No SSH keys found in your SSH agent or ~/.ssh/`, to ek baar run karein:
```powershell
ssh-keygen -t ed25519
```
* 3 baar **Enter** press karein (default location, blank passphrase).

### 1.5 Tunnel Start Karein
```powershell
railway connect Postgres --tunnel-only
```
Yeh terminal session ek encrypted bridge bana dega. **Is terminal window ko open rehne dein jab tak aap backup ya pgAdmin use kar rahe hain.**

---

## Step 2: pgAdmin ko Railway Database se Connect Karna

1. Apne computer par **pgAdmin 4** open karein.
2. Left sidebar mein sabse upar **`Servers`** par **Right Click** karein.
3. Click karein: **`Register`** → **`Server...`**
4. Popup mein do tabs fill karein:

### General Tab:
* **Name:** `Railway Storage Vault` (ya koi bhi pehchan ka naam)

### Connection Tab:
* **Host name/address:** `127.0.0.1` *(Kyunki tunnel local machine par chal raha hai)*
* **Port:** `5432`
* **Maintenance database:** `railway`
* **Username:** `postgres`
* **Password:** *(Railway Dashboard → Postgres Service → Variables tab se `PGPASSWORD` copy karke paste karein)*
* **Save password:** Toggle ko **ON** kar dein.

5. Click **Save**.
6. Left sidebar mein aapka Railway database connect ho jayega!

---

## Step 3: Database ka Backup Lena (Export)

Backup file generate karne ke do aasan tareeqe hain:

### Option A: pgAdmin GUI se (Point & Click — Recommended)
1. pgAdmin mein `Railway Storage Vault` server expand karein → **`Databases`** par jayein.
2. **`railway`** database par **Right Click** karein.
3. Click karein: **`Backup...`**
4. Popup form mein:
   * **Filename:** Folder icon par click karein, path aur file name choose karein (e.g. `vault_backup.sql`).
   * **Format:** **`Plain`** (Readable SQL text) ya **`Custom`** (Compressed binary).
5. Niche blue button **`Backup`** par click karein.
6. Notification aayega: *"Process completed successfully"*. Aapka backup create ho gaya!

### Option B: Terminal Command se (`pg_dump` — 1 Single Line)
Jab tunnel active ho, ek naye terminal mein ye command run karein:
```powershell
pg_dump -h 127.0.0.1 -p 5432 -U postgres -d railway -f "vault_backup.sql"
```
* Password prompt aane par Railway ka `PGPASSWORD` paste karein.
* File turant aapki current directory mein save ho jayegi.

---

## Step 4: Database ko Restore / Import Karna

Agar kabhi server reset ho jaye ya aapko backup wapas live database mein daalna ho:

### Method 1: pgAdmin Restore Wizard
1. pgAdmin mein **`railway`** database par **Right Click** karein.
2. Click karein: **`Restore...`**
3. **Filename:** Folder icon par click karein → File type dropdown mein **`All Files (*.*)`** select karein taaki `.sql` file visible ho → apni `vault_backup.sql` select karein.
4. Click **`Restore`**. Pura database wapas restore ho jayega.

### Method 2: pgAdmin Query Tool (Direct SQL Execution)
1. **`railway`** database par **Right Click** karein → **`Query Tool`**.
2. Upar toolbar mein **Folder (Open)** icon par click karein (ya `Ctrl + O` dabayein).
3. Apni `vault_backup.sql` file open karein.
4. Upar **Execute / Play (▶)** icon dabayein (ya keyboard se `F5`).
5. Sari tables, users, files data turant insert ho jayenge.

### Method 3: Terminal Command se (`psql`)
Tunnel chalu hone par terminal se run karein:
```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -d railway -f "vault_backup.sql"
```

---

## 7. Important Security Rules & Gitignore

> [!CAUTION]
> **Database backup file (`.sql` / `.dump`) ko KABHI BHI GitHub par commit mat karna!**
> Iske andar aapke users ke hashed passwords, Google Drive folder IDs, aur sensitive data hota hai.

Make sure aapke `.gitignore` mein ye lines shamil hon:
```gitignore
# Database Backups & Dumps
*.sql
*.dump
vault_backup.sql
```

---

## 8. Troubleshooting & Common Errors

### Error: `Unable to connect to server: [Errno 11001] getaddrinfo failed`
* **Kyun hota hai:** Aapne host address mein `postgres.railway.internal` daal diya hai. Yeh internal domain aapke PC se access nahi ho sakta.
* **Solution:** Pehle terminal mein `railway connect Postgres --tunnel-only` chalayein aur pgAdmin mein host `127.0.0.1` use karein.

### Error: `ModuleNotFoundError: No module named 'psycopg'` on Railway
* **Kyun hota hai:** Railway ka connection string `postgresql+psycopg://` format use karta hai jiske liye `psycopg` (v3) chahiye hota hai.
* **Solution:** [requirements.txt](requirements.txt) mein `psycopg[binary]>=3.1.18` add karein (Already added in project).

### Error: `No linked project found`
* **Solution:** Project directory mein `railway link` run karein aur apna Storage project select karein.
