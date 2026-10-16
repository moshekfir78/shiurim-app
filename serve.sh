#!/bin/sh
# Serve the PWA on port ${PORT:-8080}
cd "$(dirname "$0")/public" && exec python3 -m http.server "${PORT:-8080}" --bind 0.0.0.0
