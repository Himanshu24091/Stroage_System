# 🔑 Google Drive OAuth Token Guide

A complete guide explaining **WHY**, **WHEN**, and **HOW** to use the token generator script:
```powershell
.\venv\Scripts\python get_oauth_token.py
```

---

## 1. Kyon Use Karna Hai? (WHY?)

Yeh script aapke application ko **Google Drive API** se jodne ke liye ek naya **OAuth 2.0 Refresh Token** generate karta hai.

### Background & Reason:
1. **Google Cloud Policy**: Jab aapka Google Cloud Console project **"Testing"** mode mein hota hai, to Google security reasons se **7 din baad** refresh token ko automatically expire/revoke kar deta hai.
2. **Token Revocation / Password Change**: Agar aap apne Google Account ka password change karte hain ya permissions reset karte hain, tab bhi purana token invalid ho jata hai.
3. **Direct Uploads to Google Drive**: Stealth Vault aapki files ko chunk-by-chunk Google Drive par upload karta hai. Iske liye backend ko valid token ki zaroorat hoti hai.

Yeh script chalane se:
- Google se instant naya, fresh refresh token milta hai.
- Aapka local `.env` file automatically update ho jata hai.
- Aapko Railway par dalne ke liye ek naya token mil jata hai.

---

## 2. Kab Use Karna Hai? (WHEN?)

Aapko yeh command tab chalani hai jab aapko niche diye gaye symptoms ya errors dikhein:

### Symptoms & Error Messages:
1. **File Upload Karte Waqt Error**:
   ```json
   "error": "invalid_grant",
   "error_description": "Token has been expired or revoked."
   ```
2. **Railway Deploy / Application Logs Mein**:
   ```text
   [GOOGLE API AUTH ERROR] Status 400: {"error": "invalid_grant"}
   Failed to refresh Google OAuth token
   ```
3. **Storage Quota / Stats Error**:
   - Dashboard par storage quota load na ho raha ho ya Google Drive disconnected dikha raha ho.
4. **New Setup / New Machine**:
   - Jab aap project ko kisi nayi machine par clone karein ya naya Google Account attach karna chahein.

---

## 3. Kaise Use Karna Hai? (HOW - Step-by-Step)

### Step 1: Terminal Mein Command Run Karein
VS Code / PowerShell terminal open karein aur project ke root folder mein ye command run karein:

```powershell
# Windows (Virtual Environment ke sath):
.\venv\Scripts\python get_oauth_token.py

# Ya agar venv already activate hai ((venv) dikh raha hai):
python get_oauth_token.py
```

---

### Step 2: Browser Mein Login & Permission Grant Karein
1. Command chalate hi aapke default browser mein ek Google Sign-In tab open hoga.
2. Apna Google Account select kijiye.
3. Agar **"Google hasn't verified this app"** screen dikhe:
   - Click **"Advanced"** (niche left mein)
   - Click **"Go to StealthVault (unsafe)"** *(ye personal app ke liye 100% safe hai)*
4. Click **"Continue"** ya **"Allow"** karke permissions approve karein.
5. Browser mein *"The authentication flow has completed. You may close this window."* aate hi tab band kar dein.

---

### Step 3: Script Auto-Update Karega
Script terminal mein output show karega:
- `[x] Local .env file updated automatically with new token.`
- `[x] token.json saved successfully.`
- Aur terminal mein **New Refresh Token** print ho jayega (e.g., `1//0g...`).

---

### Step 4: Railway Par Update Karein (For Production)
1. Apna [Railway Dashboard](https://railway.app/) open kijiye.
2. Apne project par click karke **Variables** tab mein jaiye.
3. **`GOOGLE_REFRESH_TOKEN`** variable ko edit kijiye.
4. Terminal mein print hua naya token wahan paste karke **Save** kar dijiye.
5. Railway automatically 30-40 seconds mein redeploy ho jayega.

---

## 4. Quick Summary Table

| Question | Answer |
|---|---|
| **Command** | `.\venv\Scripts\python get_oauth_token.py` |
| **Kyun?** | Google OAuth token refresh karne aur Drive API authorization renew karne ke liye. |
| **Kab?** | Jab upload karte waqt `invalid_grant` ya `Token expired or revoked` error aaye (har 7 din baad testing mode mein). |
| **Kahan update karna hai?** | Script local `.env` ko khud update kar deta hai; Railway par `GOOGLE_REFRESH_TOKEN` variable mein paste karna hota hai. |
| **Time taken?** | Sirf 5–10 seconds. |

---

## 5. Troubleshooting & FAQs

### Q1: VS Code mein `Cannot find module 'google_auth_oauthlib.flow'` ka red mark dikhe to?
- **Reason**: VS Code global Python interpreter use kar raha hota hai.
- **Solution**: VS Code mein `Ctrl + Shift + P` dabayein → Type karein `Python: Select Interpreter` → Select karein `('venv': venv)`.

### Q2: `client_secret.json not found` error aaye to?
- Make sure project root folder mein `client_secret.json` file maujood hai. Yeh file Google Cloud Console ke Credentials section se download hoti hai.

### Q3: `Port 8090 already in use` error aaye to?
- Kisi dusre terminal mein script chal rahi ho to use close karein ya port 8090 ko free karein.
