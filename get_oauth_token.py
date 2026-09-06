import os
import sys
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
]

def main():
    if not os.path.exists("client_secret.json"):
        print("ERROR: client_secret.json not found!", flush=True)
        return

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

    print("AUTH_URL_START", flush=True)
    print(auth_url, flush=True)
    print("AUTH_URL_END", flush=True)

    creds = flow.run_local_server(port=8090, open_browser=True)

    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes
    }

    with open("token.json", "w") as f:
        json.dump(token_data, f, indent=2)

    print("\nSUCCESS: token.json created!", flush=True)
    print(f"Refresh token: {creds.refresh_token[:15]}...", flush=True)

if __name__ == "__main__":
    main()
