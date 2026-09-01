from flask import Blueprint, request, jsonify, session, g
from app import db
from app.utils.db_models import User
from app.utils.auth_guard import require_login
from config import Config

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a standard regular user account (Always is_admin=False)"""
    data = request.get_json() or {}
    username = data.get("username", "").strip().lower()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    if not username or len(username) < 3:
        return jsonify({"success": False, "error": "Username must be at least 3 characters"}), 400

    if not email or "@" not in email:
        return jsonify({"success": False, "error": "Valid email address is required"}), 400

    if not password or len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters"}), 400

    # Check for existing username or email
    if User.query.filter_by(username=username).first():
        return jsonify({"success": False, "error": "Username is already taken"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "error": "Email is already registered"}), 400

    # Normal users are NEVER admins
    user = User(
        username=username,
        email=email,
        is_admin=False
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Automatically log the user in upon registration as a STANDARD USER
    session.clear()
    session["auth_type"] = "user"
    session["user_id"] = user.id
    session["username"] = user.username
    session["is_admin"] = False
    session.permanent = True

    return jsonify({
        "success": True,
        "message": "Account created successfully!",
        "user": user.to_dict()
    }), 201

@auth_bp.route("/admin-login", methods=["POST"])
def admin_login():
    """Separate dedicated Master Admin authentication using Master Key / PIN"""
    data = request.get_json() or {}
    pin = data.get("pin", "").strip()

    expected_pin = str(getattr(Config, "MASTER_PIN", "1234")).strip()
    admin_secret = str(getattr(Config, "ADMIN_SECRET", expected_pin)).strip()

    # Allow login with Master PIN OR Master Admin Key
    if pin and (pin == expected_pin or pin == admin_secret):
        session.clear()
        session["auth_type"] = "admin"
        session["is_admin"] = True
        session["admin_logged_in"] = True
        session["username"] = "SuperAdmin"
        session.permanent = True
        return jsonify({
            "success": True,
            "message": "Super Admin access granted",
            "redirect": "/admin"
        }), 200

    return jsonify({"success": False, "error": "Invalid Master Admin Security PIN"}), 401

@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate standard user with username/email and password"""
    data = request.get_json() or {}
    identifier = data.get("identifier", "").strip().lower()
    password = data.get("password", "").strip()

    if not identifier or not password:
        return jsonify({"success": False, "error": "Username/Email and password are required"}), 400

    user = User.query.filter((User.username == identifier) | (User.email == identifier)).first()

    if not user or not user.check_password(password):
        return jsonify({"success": False, "error": "Invalid username/email or password"}), 401

    session.clear()
    session["auth_type"] = "user"
    session["user_id"] = user.id
    session["username"] = user.username
    session["is_admin"] = False
    session.permanent = True

    return jsonify({
        "success": True,
        "message": f"Welcome back, {user.username}!",
        "user": user.to_dict()
    }), 200

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Log out current user"""
    session.clear()
    return jsonify({"success": True, "message": "Logged out successfully"}), 200

@auth_bp.route("/me", methods=["GET"])
@require_login
def get_current_user():
    """Return current authenticated user profile"""
    return jsonify({
        "success": True,
        "user": g.current_user.to_dict()
    }), 200
