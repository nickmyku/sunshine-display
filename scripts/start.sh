#!/bin/bash
# Run the AccuWeather Culver City server
# Use from project root or scripts/raspberry-pi/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"
exec node server.js
