#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="accuweather-server"
APP_DIR_DEFAULT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${1:-$APP_DIR_DEFAULT}"
RUN_USER="${2:-${SUDO_USER:-$USER}}"

if [ ! -d "$APP_DIR" ]; then
  echo "Error: app directory does not exist: $APP_DIR" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Error: package.json not found in: $APP_DIR" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not available in PATH." >&2
  exit 1
fi

NPM_BIN="$(command -v npm)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$(id -u)" -ne 0 ]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Error: sudo is required when not running as root." >&2
    exit 1
  fi
  SUDO="sudo"
else
  SUDO=""
fi

echo "Creating systemd service: ${SERVICE_NAME}"

${SUDO} tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=AccuWeather forecast server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${APP_DIR}/.env
ExecStart=${NPM_BIN} start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

${SUDO} systemctl daemon-reload
${SUDO} systemctl enable "${SERVICE_NAME}.service"
${SUDO} systemctl restart "${SERVICE_NAME}.service"

echo
echo "Done. The server will now start automatically on boot."
echo "Check status with:"
echo "  ${SUDO} systemctl status ${SERVICE_NAME}.service"
echo "View logs with:"
echo "  ${SUDO} journalctl -u ${SERVICE_NAME}.service -f"
