from functools import wraps
from flask import session, request, jsonify, redirect, url_for, g, render_template
from app.utils.db_models import User

def require_login(view_func):
    """
    Decorator to protect standard user routes ensuring a valid user is logged in.
    Sets g.current_user for the request context.
    """
    @wraps(view_func)
    def decorated_function(*args, **kwargs):
        # If logged in as Super Admin, allow viewing or redirect to admin
        if session.get("auth_type") == "admin":
            class SuperAdminProxy:
                id = 0
                username = "SuperAdmin"
                email = "admin@vault.system"
                is_admin = True
            g.current_user = SuperAdminProxy()
            return view_func(*args, **kwargs)

        user_id = session.get("user_id")
        if not user_id:
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "error": "Authentication required. Please log in."}), 401
            return redirect(url_for("view_bp.login_page", next=request.url))

        current_user = User.query.get(user_id)
        if not current_user:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "error": "User account not found. Please log in again."}), 401
            return redirect(url_for("view_bp.login_page"))

        g.current_user = current_user
        return view_func(*args, **kwargs)

    return decorated_function

def require_admin(view_func):
    """
    Decorator to protect admin routes.
    - If a standard user (e.g. him200) tries to access, BLOCKS them with 403 Forbidden.
    - Only allows dedicated Super Admin sessions (auth_type == 'admin').
    """
    @wraps(view_func)
    def decorated_function(*args, **kwargs):
        # CASE 1: Standard User logged in -> STRICTLY BLOCK
        if session.get("user_id"):
            current_user = User.query.get(session.get("user_id"))
            if not current_user or not current_user.is_admin:
                if request.path.startswith("/api/"):
                    return jsonify({"success": False, "error": "Forbidden: Standard users cannot access Admin portal."}), 403
                return render_template("403.html", app_title="Access Denied"), 403

        # CASE 2: Dedicated Super Admin session active
        if session.get("auth_type") == "admin" and session.get("is_admin"):
            class SuperAdminProxy:
                id = 0
                username = session.get("username", "SuperAdmin")
                email = "admin@vault.system"
                is_admin = True
            g.current_user = SuperAdminProxy()
            return view_func(*args, **kwargs)

        # CASE 3: Not logged in at all -> Send to dedicated Admin Login
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Super Admin authentication required."}), 401
        return redirect(url_for("view_bp.admin_login_page"))

    return decorated_function

# Backwards-compatible alias for existing endpoints
require_pin = require_login
