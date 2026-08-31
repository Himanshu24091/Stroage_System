import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

class Config:
    """Application Configuration Settings"""
    
    # Secret Key for Flask session management
    SECRET_KEY = os.getenv("SECRET_KEY", "stealth-vault-secret-key-change-in-prod-987654321")
    
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
