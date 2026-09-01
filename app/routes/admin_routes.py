import os
from flask import Blueprint, request, jsonify, g
from app import db
from app.utils.db_models import User, FileItem, SystemNotice
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

@admin_bp.route("/files/batch-assign", methods=["POST"])
@require_admin
def batch_assign_files():
    """Admin assigns multiple selected files to a target user at once"""
    data = request.get_json() or {}
    file_ids = data.get("file_ids", [])
    target_user_id = data.get("user_id")

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected"}), 400

    target_user = None
    username = "Unassigned"
    if target_user_id is not None:
        target_user = User.query.get(target_user_id)
        if not target_user:
            return jsonify({"success": False, "error": "Target user not found"}), 404
        username = target_user.username

    files = FileItem.query.filter(FileItem.id.in_(file_ids)).all()
    for f in files:
        f.user_id = target_user.id if target_user else None

    db.session.commit()
    return jsonify({
        "success": True,
        "message": f"Successfully assigned {len(files)} file(s) to '{username}'!",
        "count": len(files)
    }), 200

@admin_bp.route("/files/batch-delete", methods=["POST"])
@require_admin
def batch_delete_files():
    """Admin deletes multiple selected files at once"""
    data = request.get_json() or {}
    file_ids = data.get("file_ids", [])

    if not file_ids:
        return jsonify({"success": False, "error": "No files selected"}), 400

    files = FileItem.query.filter(FileItem.id.in_(file_ids)).all()
    count = len(files)
    for f in files:
        db.session.delete(f)

    db.session.commit()
    return jsonify({
        "success": True,
        "message": f"Successfully deleted {count} file(s)!",
        "count": count
    }), 200

@admin_bp.route("/users/<int:user_id>/profile", methods=["GET"])
@require_admin
def get_user_profile_data(user_id):
    """Admin deep inspection: Returns user metadata, files list, and active deletion notices"""
    user = User.query.get_or_404(user_id)
    files = FileItem.query.filter_by(user_id=user.id).order_by(FileItem.created_at.desc()).all()
    notices = SystemNotice.query.filter((SystemNotice.user_id == user.id) | (SystemNotice.user_id.is_(None))).order_by(SystemNotice.created_at.desc()).all()

    return jsonify({
        "success": True,
        "user": user.to_dict(),
        "files": [f.to_dict() for f in files],
        "notices": [n.to_dict() for n in notices]
    }), 200

@admin_bp.route("/users/<int:user_id>/notice", methods=["POST"])
@require_admin
def send_user_deletion_notice(user_id):
    """Admin sends a 2-day (or custom deadline) Deletion Warning Popup notice to a user"""
    data = request.get_json() or {}
    message = data.get("message", "").strip()
    title = data.get("title", "⚠️ Important Storage & Data Notice").strip()
    deadline_days = int(data.get("deadline_days", 2))

    if not message:
        message = f"Storage Maintenance: Old data is scheduled for cleanup within {deadline_days} days. Please backup or download necessary files."

    target_user_id = user_id if user_id > 0 else None

    new_notice = SystemNotice(
        user_id=target_user_id,
        title=title,
        message=message,
        deadline_days=deadline_days,
        notice_type="warning",
        is_active=True
    )
    db.session.add(new_notice)
    db.session.commit()

    recipient = f"user ID #{user_id}" if target_user_id else "All Platform Users"
    return jsonify({
        "success": True,
        "message": f"Deletion warning popup notice sent to {recipient} (Deadline: {deadline_days} days)!",
        "notice": new_notice.to_dict()
    }), 201

@admin_bp.route("/users/<int:user_id>/purge-old", methods=["POST"])
@require_admin
def purge_old_user_files(user_id):
    """Admin purges files belonging to this user older than specified days"""
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    days = int(data.get("days", 30))

    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    old_files = FileItem.query.filter(
        FileItem.user_id == user.id,
        FileItem.created_at <= cutoff
    ).all()

    count = len(old_files)
    for f in old_files:
        db.session.delete(f)

    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Successfully deleted {count} file(s) older than {days} days for user '{user.username}'.",
        "purged_count": count
    }), 200

@admin_bp.route("/notices/<int:notice_id>", methods=["DELETE"])
@require_admin
def delete_notice(notice_id):
    """Admin cancels/deactivates a warning notice"""
    notice = SystemNotice.query.get_or_404(notice_id)
    db.session.delete(notice)
    db.session.commit()
    return jsonify({"success": True, "message": "Notice removed successfully"}), 200
