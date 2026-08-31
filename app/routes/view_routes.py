from flask import Blueprint, render_template, redirect, url_for, session
from config import Config
from app.utils.auth_guard import require_pin
from app.utils.gas_bridge import is_gas_configured

view_bp = Blueprint("view_bp", __name__)

@view_bp.route("/")
@require_pin
def index():
    """Renders the main Storage Vault dashboard"""
    return render_template(
        "index.html",
        enable_auth=Config.ENABLE_AUTH,
        gas_configured=is_gas_configured(),
        app_title="Stealth Cloud Vault"
    )

@view_bp.route("/login")
def login_page():
    """Renders Master PIN login page"""
    if not Config.ENABLE_AUTH or session.get("is_authenticated", False):
        return redirect(url_for("view_bp.index"))
    return render_template("login.html", app_title="Unlock Vault")
