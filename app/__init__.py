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
        try:
            from sqlalchemy import text
            with db.engine.connect() as conn:
                # 1. Ensure user_id column exists
                try:
                    conn.execute(text("ALTER TABLE file_items ADD COLUMN user_id INTEGER REFERENCES users(id);"))
                    conn.commit()
                except Exception:
                    pass

                # 2. PostgreSQL migrations: expand drive_file_id from VARCHAR(255) to TEXT
                # and drop btree index that crashes on strings > 2704 bytes
                db_uri = str(db.engine.url).lower()
                if "postgres" in db_uri:
                    try:
                        conn.execute(text("DROP INDEX IF EXISTS ix_file_items_drive_file_id;"))
                        conn.execute(text("ALTER TABLE file_items ALTER COLUMN drive_file_id TYPE TEXT;"))
                        conn.execute(text("ALTER TABLE file_items ALTER COLUMN drive_url DROP NOT NULL;"))
                        conn.commit()
                        print("[DB MIGRATION] Successfully updated drive_file_id to TEXT in PostgreSQL")
                    except Exception as pg_err:
                        print(f"[DB MIGRATION] PostgreSQL migration notice: {pg_err}")
        except Exception as e:
            print(f"[DB MIGRATION] General migration notice: {e}")

    return app
