import os

# Dynamically bind to Railway / Render provided PORT (defaults to 5000)
port = os.getenv("PORT", "5000")
bind = f"0.0.0.0:{port}"

# Concurrency & Performance Settings
workers = 4
threads = 2
timeout = 300
keepalive = 5
