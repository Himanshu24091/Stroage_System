from flask import Blueprint, render_template, redirect, url_for, session, g
from config import Config
from app.utils.auth_guard import require_login, require_admin
from app.utils.gas_bridge import is_gas_configured

view_bp = Blueprint("view_bp", __name__)

@view_bp.route("/")
@require_login
def index():
    """Renders the main Storage Vault dashboard for authenticated user"""
    return render_template(
        "index.html",
        current_user=g.current_user,
        gas_configured=is_gas_configured(),
        app_title="Stealth Cloud Vault"
    )

@view_bp.route("/admin")
@require_admin
def admin_page():
    """Renders the Admin Control Dashboard"""
    return render_template(
        "admin.html",
        current_user=g.current_user,
        app_title="Vault Admin Control"
    )

@view_bp.route("/admin/login")
def admin_login_page():
    """Renders Dedicated Super Admin Security Login Portal"""
    # If already logged in as Super Admin, go to Admin Dashboard
    if session.get("auth_type") == "admin" and session.get("is_admin"):
        return redirect(url_for("view_bp.admin_page"))

    # If logged in as standard user, block them with 403 Access Denied
    if session.get("user_id"):
        return render_template("403.html", app_title="Access Denied"), 403

    return render_template("admin_login.html", app_title="Super Admin Security Portal")

@view_bp.route("/login")
def login_page():
    """Renders Standard User Sign In / Sign Up page"""
    if session.get("user_id"):
        return redirect(url_for("view_bp.index"))
    return render_template("login.html", app_title="Vault Access | Login & Register")
