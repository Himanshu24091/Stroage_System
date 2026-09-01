import os
from flask import Blueprint, request, jsonify, g
from app import db
from app.utils.db_models import User, FileItem
from app.utils.auth_guard import require_admin

admin_bp = Blueprint("admin_bp", __name__)

@admin_bp.route("/stats", methods=["GET"])
@require_admin
def get_system_stats():
    """Returns platform-wide metrics for the Admin Dashboard"""
    total_users = User.query.count()
    total_files = FileItem.query.count()
    total_bytes = db.session.query(db.func.sum(FileItem.file_size)).scalar() or 0

    return jsonify({
        "success": True,
        "total_users": total_users,
        "total_files": total_files,
        "total_bytes": total_bytes
    }), 200

@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users():
    """Lists all registered users with file count and storage metrics"""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({
        "success": True,
        "count": len(users),
        "users": [u.to_dict() for u in users]
    }), 200

@admin_bp.route("/users/<int:user_id>/reset-password", methods=["POST"])
@require_admin
def reset_user_password(user_id):
    """Admin resets a user's password to a new password"""
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json() or {}
    new_password = data.get("password", "").strip()

    if not new_password or len(new_password) < 6:
        return jsonify({"success": False, "error": "New password must be at least 6 characters"}), 400

    target_user.set_password(new_password)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Password for user '{target_user.username}' successfully updated!",
        "username": target_user.username,
        "new_password": new_password
    }), 200

@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id):
    """Admin deletes a user and removes their files"""
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({"success": False, "error": "User not found"}), 404

    if target_user.id == g.current_user.id:
        return jsonify({"success": False, "error": "Cannot delete your own admin account"}), 400

    username = target_user.username
    db.session.delete(target_user)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"User '{username}' and all associated vault files deleted successfully"
    }), 200

@admin_bp.route("/users/<int:user_id>/toggle-admin", methods=["POST"])
@require_admin
def toggle_admin(user_id):
    """Promote or demote a user to/from Admin status"""
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({"success": False, "error": "User not found"}), 404

    if target_user.id == g.current_user.id:
        return jsonify({"success": False, "error": "Cannot modify your own admin privileges"}), 400

    target_user.is_admin = not target_user.is_admin
    db.session.commit()

    role = "Admin" if target_user.is_admin else "Regular User"
    return jsonify({
        "success": True,
        "message": f"User '{target_user.username}' role updated to {role}",
        "is_admin": target_user.is_admin
    }), 200
