from functools import wraps
from flask import session, request, jsonify, redirect, url_for
from config import Config

def require_pin(view_func):
    """
    Decorator to protect routes with Master PIN.
    If Config.ENABLE_AUTH is False (Option 3 toggle), access is automatically granted.
    """
    @wraps(view_func)
    def decorated_function(*args, **kwargs):
        # If Auth is disabled in config, bypass completely
        if not Config.ENABLE_AUTH:
            return view_func(*args, **kwargs)

        # Check session or header token
        is_authenticated = session.get("is_authenticated", False)
        header_pin = request.headers.get("X-Master-PIN")

        if is_authenticated or (header_pin and header_pin == Config.MASTER_PIN):
            return view_func(*args, **kwargs)

        # Handle API vs Browser View redirection
        if request.path.startswith("/api/"):
            return jsonify({
                "success": False,
                "error": "Unauthorized. Please authenticate with Master PIN."
            }), 401
        
        return redirect(url_for("view_bp.login_page", next=request.url))

    return decorated_function
