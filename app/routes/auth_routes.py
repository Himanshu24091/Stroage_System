from flask import Blueprint, request, jsonify, session
from config import Config

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.route("/verify", methods=["POST"])
def verify_pin():
    """Verify Master PIN from client"""
    if not Config.ENABLE_AUTH:
        session["is_authenticated"] = True
        return jsonify({"success": True, "message": "Auth is disabled, access granted"}), 200

    data = request.get_json() or {}
    pin = data.get("pin", "").strip()

    if pin == Config.MASTER_PIN:
        session["is_authenticated"] = True
        session.permanent = True  # Keep logged in for the session
        return jsonify({"success": True, "message": "Authenticated successfully"}), 200

    return jsonify({"success": False, "error": "Invalid Master PIN"}), 401

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Clear session authentication"""
    session.pop("is_authenticated", None)
    return jsonify({"success": True, "message": "Logged out successfully"}), 200

@auth_bp.route("/status", methods=["GET"])
def auth_status():
    """Return current auth requirements and session state"""
    return jsonify({
        "auth_enabled": Config.ENABLE_AUTH,
        "is_authenticated": session.get("is_authenticated", False) if Config.ENABLE_AUTH else True
    }), 200
