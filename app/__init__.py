import os
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from config import Config

# Initialize SQLAlchemy instance
db = SQLAlchemy()

def create_app(config_class=Config):
    """Application Factory Pattern"""
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static"
    )
    app.config.from_object(config_class)

    # Enable CORS for secure cross-origin streaming
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize database
    db.init_app(app)

    # Register Blueprints
    from app.routes.view_routes import view_bp
    from app.routes.auth_routes import auth_bp
    from app.routes.file_routes import file_bp
    from app.routes.folder_routes import folder_bp
    from app.routes.admin_routes import admin_bp

    app.register_blueprint(view_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(file_bp, url_prefix="/api/files")
    app.register_blueprint(folder_bp, url_prefix="/api/folders")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    # Global Health Check endpoint
    @app.route("/api/health")
    def health_check():
        return jsonify({
            "status": "healthy",
            "auth_enabled": app.config.get("ENABLE_AUTH", False),
            "storage_bridge": bool(app.config.get("GAS_WEBHOOK_URL")),
            "database": "connected"
        }), 200

    # Direct Favicon endpoint (prevents 404 from browser requests)
    from flask import send_from_directory
    @app.route("/favicon.ico")
    def favicon():
        return send_from_directory(
            os.path.join(app.root_path, "static"),
            "favicon.ico",
            mimetype="image/vnd.microsoft.icon"
        )

    # Prevent browser caching on authenticated pages & APIs (Bfcache Back-Button Protection)
    @app.after_request
    def set_security_headers(response):
        content_type = response.headers.get("Content-Type", "")
        if "text/html" in content_type or "application/json" in content_type or response.status_code in (401, 403):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    # Ensure tables are created and schema is migrated
    with app.app_context():
        from app.utils.db_models import User, Folder, FileItem, SystemNotice, ChunkUploadPart
        db.create_all()

        # Database Schema Migrations for PostgreSQL / SQLite
        from sqlalchemy import text
        db_uri = str(db.engine.url).lower()
        if "postgres" in db_uri:
            migration_statements = [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255);",
                "ALTER TABLE folders ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255);",
                "ALTER TABLE file_items ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);",
                "DROP INDEX IF EXISTS ix_file_items_drive_file_id;",
                "ALTER TABLE file_items ALTER COLUMN drive_file_id TYPE TEXT;",
                "ALTER TABLE file_items ALTER COLUMN drive_url DROP NOT NULL;",
                "ALTER TABLE chunk_upload_parts DROP CONSTRAINT IF EXISTS chunk_upload_parts_user_id_fkey;",
                "ALTER TABLE chunk_upload_parts ALTER COLUMN user_id DROP NOT NULL;",
                "ALTER TABLE chunk_upload_parts ALTER COLUMN drive_file_id TYPE TEXT;",
                "ALTER TABLE chunk_upload_parts ALTER COLUMN filename TYPE VARCHAR(512);",
                "ALTER TABLE file_items ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id);",
                "ALTER TABLE file_items ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE file_items ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN DEFAULT FALSE;",
                "CREATE INDEX IF NOT EXISTS ix_file_items_folder_id ON file_items(folder_id);",
                "CREATE INDEX IF NOT EXISTS ix_file_items_is_starred ON file_items(is_starred);",
                "CREATE INDEX IF NOT EXISTS ix_file_items_is_trashed ON file_items(is_trashed);"
            ]
            for stmt in migration_statements:
                try:
                    with db.engine.connect() as conn:
                        conn.execute(text(stmt))
                        conn.commit()
                        print(f"[DB MIGRATION] Executed: {stmt}")
                except Exception as pg_err:
                    print(f"[DB MIGRATION] Notice on ({stmt}): {pg_err}")
        else:
            # SQLite migration check
            try:
                with db.engine.connect() as conn:
                    # Check users table
                    user_res = conn.execute(text("PRAGMA table_info(users);")).fetchall()
                    user_cols = {row[1] for row in user_res}
                    if "drive_folder_id" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN drive_folder_id VARCHAR(255);"))

                    # Check folders table
                    folder_res = conn.execute(text("PRAGMA table_info(folders);")).fetchall()
                    folder_cols = {row[1] for row in folder_res}
                    if "drive_folder_id" not in folder_cols:
                        conn.execute(text("ALTER TABLE folders ADD COLUMN drive_folder_id VARCHAR(255);"))

                    # Check file_items table
                    result = conn.execute(text("PRAGMA table_info(file_items);")).fetchall()
                    existing_cols = {row[1] for row in result}
                    if "folder_id" not in existing_cols:
                        conn.execute(text("ALTER TABLE file_items ADD COLUMN folder_id INTEGER;"))
                    if "is_starred" not in existing_cols:
                        conn.execute(text("ALTER TABLE file_items ADD COLUMN is_starred BOOLEAN DEFAULT 0;"))
                    if "is_trashed" not in existing_cols:
                        conn.execute(text("ALTER TABLE file_items ADD COLUMN is_trashed BOOLEAN DEFAULT 0;"))
                    conn.commit()
            except Exception as sqlite_err:
                print(f"[DB MIGRATION] SQLite notice: {sqlite_err}")

    return app
