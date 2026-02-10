#!/bin/bash
# Run the AccuWeather Culver City server
# Can be run from any directory - resolves paths relative to script location

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR" || exit 1
exec node server.js
