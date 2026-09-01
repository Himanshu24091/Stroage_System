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

@admin_bp.route("/files", methods=["GET"])
@require_admin
def list_all_files():
    """Returns all files in the system with owner information (including legacy uploads)"""
    files = FileItem.query.order_by(FileItem.created_at.desc()).all()
    user_map = {u.id: u.username for u in User.query.all()}

    file_list = []
    for f in files:
        item = f.to_dict()
        item["owner_username"] = user_map.get(f.user_id, "Unassigned (Legacy)")
        item["is_unassigned"] = (f.user_id is None)
        file_list.append(item)

    return jsonify({
        "success": True,
        "count": len(file_list),
        "files": file_list
    }), 200

@admin_bp.route("/files/<int:file_id>/assign", methods=["POST"])
@require_admin
def assign_file(file_id):
    """Admin assigns or transfers a file to a specific user"""
    file_item = FileItem.query.get_or_404(file_id)
    data = request.get_json() or {}
    target_user_id = data.get("user_id")

    if target_user_id is not None:
        target_user = User.query.get(target_user_id)
        if not target_user:
            return jsonify({"success": False, "error": "Target user not found"}), 404
        file_item.user_id = target_user.id
        username = target_user.username
    else:
        file_item.user_id = None
        username = "Unassigned"

    db.session.commit()
    return jsonify({
        "success": True,
        "message": f"File '{file_item.filename}' assigned to '{username}' successfully!",
        "file": file_item.to_dict()
    }), 200

@admin_bp.route("/files/claim-all", methods=["POST"])
@require_admin
def claim_all_unassigned():
    """1-Click: Assign all unassigned/legacy files to a target user"""
    data = request.get_json() or {}
    target_user_id = data.get("user_id")

    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({"success": False, "error": "Target user not found"}), 404

    unassigned_files = FileItem.query.filter(FileItem.user_id.is_(None)).all()
    for f in unassigned_files:
        f.user_id = target_user.id

    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Successfully assigned {len(unassigned_files)} legacy files to user '{target_user.username}'!",
        "count": len(unassigned_files)
    }), 200
