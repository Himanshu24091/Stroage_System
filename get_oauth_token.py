import os
import sys
import json
import re
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
]

def update_env_file(refresh_token: str, client_id: str = None, client_secret: str = None) -> bool:
    """Updates GOOGLE_REFRESH_TOKEN in .env automatically"""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return False

    try:
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()

        if "GOOGLE_REFRESH_TOKEN=" in content:
            content = re.sub(r"GOOGLE_REFRESH_TOKEN=.*", f"GOOGLE_REFRESH_TOKEN={refresh_token}", content)
        else:
            content += f"\nGOOGLE_REFRESH_TOKEN={refresh_token}\n"

        if client_id:
            if "GOOGLE_CLIENT_ID=" in content:
                content = re.sub(r"GOOGLE_CLIENT_ID=.*", f"GOOGLE_CLIENT_ID={client_id}", content)
            else:
                content += f"\nGOOGLE_CLIENT_ID={client_id}\n"

        if client_secret:
            if "GOOGLE_CLIENT_SECRET=" in content:
                content = re.sub(r"GOOGLE_CLIENT_SECRET=.*", f"GOOGLE_CLIENT_SECRET={client_secret}", content)
            else:
                content += f"\nGOOGLE_CLIENT_SECRET={client_secret}\n"

        with open(env_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Warning: Could not auto-update .env file: {e}")
        return False

def main():
    if not os.path.exists("client_secret.json"):
        print("ERROR: client_secret.json not found!", flush=True)
        return

    print("\nStarting Google Drive OAuth authorization flow...")
    print("A browser window will open automatically. Please sign in to your Google Account and grant Drive permissions.\n")

    flow = InstalledAppFlow.from_client_secrets_file(
        "client_secret.json",
        SCOPES,
        redirect_uri="http://localhost:8090/"
    )

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true"
    )

    print("If browser does not open automatically, open this link manually in your browser:")
    print(auth_url, flush=True)
    print("\nWaiting for authentication...\n", flush=True)

    creds = flow.run_local_server(port=8090, open_browser=True)

    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes
    }

    with open("token.json", "w", encoding="utf-8") as f:
        json.dump(token_data, f, indent=2)

    env_updated = update_env_file(
        refresh_token=creds.refresh_token,
        client_id=creds.client_id,
        client_secret=creds.client_secret
    )

    print("\n" + "=" * 65)
    print(" SUCCESS: New Google OAuth Refresh Token Generated!")
    print("=" * 65)
    if env_updated:
        print(" [x] Local .env file updated automatically with new token.")
    print(" [x] token.json saved successfully.")
    print("\n COPY THIS VALUE TO RAILWAY (GOOGLE_REFRESH_TOKEN):")
    print(f"\n{creds.refresh_token}\n")
    print("=" * 65)
    print(" IMPORTANT: PREVENT TOKEN EXPIRING AFTER 7 DAYS:")
    print(" 1. Open Google Cloud Console -> APIs & Services -> OAuth consent screen")
    print(" 2. Under 'Publishing status', click 'PUBLISH APP' (change to Production)")
    print(" 3. This ensures your refresh token NEVER expires after 7 days!")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
