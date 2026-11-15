#!/bin/sh
# Serve the site locally at http://localhost:8080 (Ctrl+C to stop).
# Usage: ./serve.sh [port]
cd "$(dirname "$0")" || exit 1
PORT="${1:-8080}"
echo "Serving $(pwd) at http://localhost:$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
