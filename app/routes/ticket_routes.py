import random
import string
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from app import db
from app.utils.db_models import User, SupportTicket

ticket_bp = Blueprint("ticket_bp", __name__)

def _generate_unique_ticket_id():
    """Generates a memorable, unique 5-6 digit ticket ID like TK-84921"""
    for _ in range(50):
        digits = "".join(random.choices(string.digits, k=5))
        candidate = f"TK-{digits}"
        if not SupportTicket.query.filter_by(ticket_id=candidate).first():
            return candidate
    # Fallback with letters
    rand_chars = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"TK-{rand_chars}"

@ticket_bp.route("/create", methods=["POST"])
def create_ticket():
    """
    Public Help Desk endpoint to raise a support or password reset ticket.
    Identified strictly by username and generated Ticket ID (no email/phone required).
    """
    data = request.get_json() or {}
    username = str(data.get("username", "")).strip()
    category = str(data.get("category", "password_reset")).strip().lower()
    subject = str(data.get("subject", "")).strip()
    message = str(data.get("message", "")).strip()

    if not username or len(username) < 3:
        return jsonify({"success": False, "error": "Please provide a valid username (at least 3 characters)"}), 400

    if not subject:
        return jsonify({"success": False, "error": "Please enter a subject for your request"}), 400

    if not message or len(message) < 5:
        return jsonify({"success": False, "error": "Please describe your issue or request in more detail (at least 5 characters)"}), 400

    valid_categories = {"password_reset", "account_access", "file_issue", "bug_issue", "other"}
    if category not in valid_categories:
        category = "password_reset"

    # Match existing registered user if possible
    user = User.query.filter(func.lower(User.username) == username.lower()).first()
    user_id = user.id if user else None

    ticket_id = _generate_unique_ticket_id()

    ticket = SupportTicket(
        ticket_id=ticket_id,
        user_id=user_id,
        username=username,
        category=category,
        subject=subject[:255],
        message=message,
        status="open"
    )
    db.session.add(ticket)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Support Ticket {ticket_id} created successfully!",
        "ticket_id": ticket_id,
        "ticket": ticket.to_dict()
    }), 201

@ticket_bp.route("/track/<ticket_id>", methods=["GET"])
def track_ticket(ticket_id):
    """
    Public endpoint to track status and read Admin response for a Ticket ID.
    """
    clean_id = ticket_id.strip().upper()
    ticket = SupportTicket.query.filter(func.upper(SupportTicket.ticket_id) == clean_id).first()

    if not ticket:
        return jsonify({
            "success": False,
            "error": f"No ticket found with ID '{clean_id}'. Please check the ticket number and try again."
        }), 404

    return jsonify({
        "success": True,
        "ticket": ticket.to_dict()
    }), 200

@ticket_bp.route("/by-username/<username>", methods=["GET"])
def get_user_tickets(username):
    """
    Public lookup to find recent tickets associated with a username.
    """
    clean_username = username.strip().lower()
    tickets = SupportTicket.query.filter(
        func.lower(SupportTicket.username) == clean_username
    ).order_by(SupportTicket.created_at.desc()).limit(10).all()

    return jsonify({
        "success": True,
        "count": len(tickets),
        "tickets": [t.to_dict() for t in tickets]
    }), 200
