import os

# Dynamically bind to Railway / Render provided PORT (defaults to 5000)
port = os.getenv("PORT", "5000")
bind = f"0.0.0.0:{port}"

# -----------------------------------------------------------------------
# Worker Configuration for Concurrent Multi-User Large File Uploads
# -----------------------------------------------------------------------
# gthread (sync + threads): good for CPU tasks but threads BLOCK each other
# during long GAS HTTP calls (10-30s each), leading to website freezes
# when 2+ users upload simultaneously.
#
# gevent (async I/O): each worker handles MANY concurrent connections via
# greenlets. Long GAS HTTP calls yield the event loop, so other users'
# requests are processed in parallel without blocking. This prevents the
# site from becoming unresponsive during heavy uploads.
# -----------------------------------------------------------------------
worker_class = "gevent"
workers = 2          # 2 gevent workers on Railway free tier (512MB RAM)
worker_connections = 100  # max concurrent connections per worker (200 total)

# Railway/Cloudflare hard request timeout = ~300s. Set gunicorn slightly
# higher so it doesn't kill a chunk before the proxy does.
timeout = 300
keepalive = 65
graceful_timeout = 30

# Prevent memory leaks by recycling workers after many requests
max_requests = 500
max_requests_jitter = 50

# Max upload body size: 20MB per chunk request (4MB chunk + multipart overhead)
# This must match or exceed the client-side CHUNK_SIZE.
# Note: actual limit enforced per-request, not globally.
limit_request_line = 8190
limit_request_fields = 200

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
