# Blueprints Package
from app.routes.view_routes import view_bp
from app.routes.auth_routes import auth_bp
from app.routes.file_routes import file_bp

__all__ = ["view_bp", "auth_bp", "file_bp"]
