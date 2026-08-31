import os
from datetime import datetime, timezone
from app import db

class FileItem(db.Model):
    """File metadata model stored in SQLite/PostgreSQL"""
    __tablename__ = "file_items"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False, index=True)
    file_size = db.Column(db.BigInteger, default=0)  # In bytes
    mime_type = db.Column(db.String(128), default="application/octet-stream")
    category = db.Column(db.String(64), default="other", index=True)  # video, audio, image, pdf, archive, code, doc
    drive_file_id = db.Column(db.String(255), nullable=True, index=True)
    drive_url = db.Column(db.Text, nullable=False)
    source_type = db.Column(db.String(64), default="direct_link")  # 'gas_upload' or 'direct_link'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

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
        """Serialize model for JSON API"""
        return {
            "id": self.id,
            "filename": self.filename,
            "file_size": self.file_size,
            "formatted_size": self.formatted_size,
            "mime_type": self.mime_type,
            "category": self.category,
            "drive_file_id": self.drive_file_id,
            "source_type": self.source_type,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else "",
            "download_url": f"/api/files/download/{self.id}",
            "stream_url": f"/api/files/stream/{self.id}"
        }
