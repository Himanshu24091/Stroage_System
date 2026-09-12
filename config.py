import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

class Config:
    """Application Configuration Settings"""
    
    # Secret Key for Flask session management
    SECRET_KEY = os.getenv("SECRET_KEY", "stealth-vault-secret-key-change-in-prod-987654321")
    SESSION_PERMANENT = False
    
    # Auth Toggle (Option 3): Set to True to require Master PIN, False for direct frictionless access
    ENABLE_AUTH = os.getenv("ENABLE_AUTH", "False").lower() in ("true", "1", "yes")
    
    # Master Security PIN (used when ENABLE_AUTH is True)
    MASTER_PIN = os.getenv("MASTER_PIN", "1234")
    
    # Database Configuration:
    # Uses PostgreSQL if DATABASE_URL is set (e.g. on Render / Railway), otherwise falls back to local SQLite.
    raw_db_url = os.getenv("DATABASE_URL", "sqlite:///vault.db")
    # Fix for SQLAlchemy requiring 'postgresql://' instead of legacy 'postgres://' (Render default)
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
    
    SQLALCHEMY_DATABASE_URI = raw_db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Google Apps Script Web App URL (Optional bridge for direct Drive upload/delete without GCP API)
    GAS_WEBHOOK_URL = os.getenv("GAS_WEBHOOK_URL", "")
    
    # Max file upload size allowed directly through Flask (2 GB)
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024  # 2 GB
    
    # Streaming Chunk Size (2 MB chunks for optimal network throughput and low RAM footprint)
    STREAM_CHUNK_SIZE = 2 * 1024 * 1024

    # Official Google Drive API v3 Configuration (OAuth 2.0)
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN", "")
    GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "1idvdhTd1GI3RAs6MSoC8FXrCkmY8GOtA")

    # If env vars are not set, attempt to auto-load from token.json
    if not GOOGLE_REFRESH_TOKEN:
        token_path = os.path.join(os.path.dirname(__file__), "token.json")
        if os.path.exists(token_path):
            try:
                import json
                with open(token_path, "r") as tf:
                    tdata = json.load(tf)
                    GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID or tdata.get("client_id", "")
                    GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET or tdata.get("client_secret", "")
                    GOOGLE_REFRESH_TOKEN = tdata.get("refresh_token", "")
            except Exception:
                pass
