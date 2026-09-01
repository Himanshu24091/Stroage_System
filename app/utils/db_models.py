import os
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from app import db

class User(db.Model):
    """User account model with secure password hashing and admin privileges"""
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to files
    files = db.relationship("FileItem", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")

    def set_password(self, password: str):
        """Hashes and sets user password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verifies password against hash"""
        return check_password_hash(self.password_hash, password)

    @property
    def total_storage_bytes(self) -> int:
        """Calculates total bytes stored by this user"""
        return sum(f.file_size or 0 for f in self.files.all())

    @property
    def total_file_count(self) -> int:
        """Total number of files in user's vault"""
        return self.files.count()

    def to_dict(self):
        """Serializes user metadata"""
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "is_admin": self.is_admin,
            "total_files": self.total_file_count,
            "total_bytes": self.total_storage_bytes,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class FileItem(db.Model):
    """File metadata model stored in SQLite/PostgreSQL, scoped to individual users"""
    __tablename__ = "file_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    filename = db.Column(db.String(255), nullable=False, index=True)
    file_size = db.Column(db.BigInteger, default=0)  # In bytes
    mime_type = db.Column(db.String(128), default="application/octet-stream")
    category = db.Column(db.String(64), default="other", index=True)  # video, audio, image, pdf, archive, code, doc
    drive_file_id = db.Column(db.String(255), nullable=True, index=True)
    drive_url = db.Column(db.Text, nullable=False)
    source_type = db.Column(db.String(64), default="direct_link")  # 'gas_upload' or 'direct_link'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship to user
    user = db.relationship("User", back_populates="files")

    @property
    def formatted_size(self):
        """Human-readable size format (KB, MB, GB)"""
        bytes_val = self.file_size or 0
        if bytes_val < 1024:
            return f"{bytes_val} B"
        elif bytes_val < 1024 * 1024:
            return f"{(bytes_val / 1024):.1f} KB"
        elif bytes_val < 1024 * 1024 * 1024:
            return f"{(bytes_val / (1024 * 1024)):.2f} MB"
        else:
            return f"{(bytes_val / (1024 * 1024 * 1024)):.2f} GB"

    @staticmethod
    def detect_category(filename: str, mime_type: str = "") -> str:
        """Detect file category based on extension and mime type"""
        ext = os.path.splitext(filename)[1].lower().strip(".")
        mime = (mime_type or "").lower()

        video_exts = {"mp4", "mkv", "avi", "mov", "webm", "flv", "m4v", "wmv"}
        audio_exts = {"mp3", "wav", "ogg", "m4a", "flac", "aac", "wma"}
        image_exts = {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff"}
        doc_exts = {"doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf"}
        archive_exts = {"zip", "rar", "7z", "tar", "gz", "bz2", "iso"}
        code_exts = {"py", "js", "ts", "html", "css", "json", "xml", "cpp", "c", "java", "sql", "sh", "yml", "yaml"}

        if ext == "pdf" or "pdf" in mime:
            return "pdf"
        elif ext in video_exts or "video" in mime:
            return "video"
        elif ext in audio_exts or "audio" in mime:
            return "audio"
        elif ext in image_exts or "image" in mime:
            return "image"
        elif ext in code_exts or "text/x-" in mime:
            return "code"
        elif ext in archive_exts or "zip" in mime or "compressed" in mime:
            return "archive"
        elif ext in doc_exts or "document" in mime or "text" in mime:
            return "document"
        return "other"

    def to_dict(self):
        """Serializes file record to dictionary for API responses"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "filename": self.filename,
            "file_size": self.file_size,
            "formatted_size": self.formatted_size,
            "mime_type": self.mime_type,
            "category": self.category,
            "drive_file_id": self.drive_file_id,
            "drive_url": self.drive_url,
            "source_type": self.source_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "download_url": f"/api/files/download/{self.id}",
            "stream_url": f"/api/files/stream/{self.id}"
        }
