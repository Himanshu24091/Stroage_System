"""
Verification Script for Stealth Cloud Storage Vault
Tests Flask factory, DB models, routing, Drive ID extraction, and API responses.
"""
import unittest
from app import create_app, db
from app.utils.db_models import FileItem
from app.utils.drive_streamer import extract_drive_id
from config import Config

class TestVaultConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    ENABLE_AUTH = True
    MASTER_PIN = "9999"
    SECRET_KEY = "test-secret"

class VaultSystemTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestVaultConfig)
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_drive_id_extractor(self):
        """Test extraction of Drive IDs from various link structures"""
        url1 = "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P/view?usp=sharing"
        self.assertEqual(extract_drive_id(url1), "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P")

        url2 = "https://drive.google.com/open?id=1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P"
        self.assertEqual(extract_drive_id(url2), "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P")

        url3 = "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P"
        self.assertEqual(extract_drive_id(url3), "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P")

    def test_category_detection(self):
        """Test file category auto-detection"""
        self.assertEqual(FileItem.detect_category("movie.mp4"), "video")
        self.assertEqual(FileItem.detect_category("document.pdf"), "pdf")
        self.assertEqual(FileItem.detect_category("photo.jpg"), "image")
        self.assertEqual(FileItem.detect_category("song.mp3"), "audio")
        self.assertEqual(FileItem.detect_category("archive.zip"), "archive")
        self.assertEqual(FileItem.detect_category("script.py"), "code")

    def test_health_check_endpoint(self):
        """Test /api/health"""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "healthy")

    def test_auth_pin_verification(self):
        """Test Master PIN login and rejection"""
        # Invalid PIN
        resp = self.client.post("/api/auth/verify", json={"pin": "0000"})
        self.assertEqual(resp.status_code, 401)

        # Valid PIN
        resp = self.client.post("/api/auth/verify", json={"pin": "9999"})
        self.assertEqual(resp.status_code, 200)

    def test_file_import_and_list(self):
        """Test importing a public drive link and listing it"""
        # Authenticate first
        self.client.post("/api/auth/verify", json={"pin": "9999"})

        # Import link
        resp = self.client.post("/api/files/import-link", json={
            "url": "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P/view",
            "filename": "Sample_Presentation.pdf"
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file"]["filename"], "Sample_Presentation.pdf")
        self.assertEqual(data["file"]["category"], "pdf")

        # List files
        list_resp = self.client.get("/api/files")
        self.assertEqual(list_resp.status_code, 200)
        list_data = list_resp.get_json()
        self.assertEqual(list_data["count"], 1)

if __name__ == "__main__":
    unittest.main()
