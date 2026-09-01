import os

# Dynamically bind to Railway / Render provided PORT (defaults to 5000)
port = os.getenv("PORT", "5000")
bind = f"0.0.0.0:{port}"

# Concurrency & Performance Settings (Optimized to stay well below 512MB RAM on Railway)
workers = 2
threads = 4
worker_class = "gthread"
timeout = 600
keepalive = 65
max_requests = 1000
max_requests_jitter = 50
