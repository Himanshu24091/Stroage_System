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
    from app.routes.admin_routes import admin_bp

    app.register_blueprint(view_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(file_bp, url_prefix="/api/files")
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

    # Ensure tables are created and schema is migrated
    with app.app_context():
        from app.utils.db_models import User, FileItem, SystemNotice, ChunkUploadPart
        db.create_all()

        # Database Schema Migrations for PostgreSQL / SQLite
        from sqlalchemy import text
        db_uri = str(db.engine.url).lower()
        if "postgres" in db_uri:
            migration_statements = [
                "ALTER TABLE file_items ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);",
                "DROP INDEX IF EXISTS ix_file_items_drive_file_id;",
                "ALTER TABLE file_items ALTER COLUMN drive_file_id TYPE TEXT;",
                "ALTER TABLE file_items ALTER COLUMN drive_url DROP NOT NULL;",
                "ALTER TABLE chunk_upload_parts DROP CONSTRAINT IF EXISTS chunk_upload_parts_user_id_fkey;",
                "ALTER TABLE chunk_upload_parts ALTER COLUMN user_id DROP NOT NULL;",
            ]
            for stmt in migration_statements:
                try:
                    with db.engine.connect() as conn:
                        conn.execute(text(stmt))
                        conn.commit()
                        print(f"[DB MIGRATION] Executed: {stmt}")
                except Exception as pg_err:
                    print(f"[DB MIGRATION] Notice on ({stmt}): {pg_err}")

    return app
