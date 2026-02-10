#!/bin/bash
# Install AccuWeather Culver City server as a systemd service on Raspberry Pi
# Run with: sudo ./install.sh

set -e

SERVICE_NAME="accuweather-culver-city"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_INSTALL_DIR="/home/pi/accuweather-culver-city"

echo "=== AccuWeather Culver City - Raspberry Pi Startup Install ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run with sudo."
    echo "Usage: sudo ./install.sh [install_directory]"
    exit 1
fi

# Determine install directory
INSTALL_DIR="${1:-$DEFAULT_INSTALL_DIR}"

# If not using default, check if project is being installed from its current location
if [ "$INSTALL_DIR" != "$PROJECT_DIR" ] && [ -d "$PROJECT_DIR" ]; then
    echo "Note: Project is at $PROJECT_DIR"
    echo "      Service will run from $INSTALL_DIR"
    echo "      To run from current directory, use: sudo ./install.sh $PROJECT_DIR"
    echo ""
fi

# Create install directory if it doesn't exist
if [ ! -d "$INSTALL_DIR" ]; then
    echo "Creating directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/"
    cp "$PROJECT_DIR/.env.example" "$INSTALL_DIR/" 2>/dev/null || true
    [ -f "$INSTALL_DIR/.env.example" ] && [ ! -f "$INSTALL_DIR/.env" ] && cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
else
    echo "Install directory exists: $INSTALL_DIR"
    # Update files if we're installing from a different location
    if [ "$INSTALL_DIR" != "$PROJECT_DIR" ]; then
        echo "Updating files from $PROJECT_DIR..."
        cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/"
    fi
fi

# Fix ownership
echo "Setting ownership to pi:pi..."
chown -R pi:pi "$INSTALL_DIR"

# Install npm dependencies if needed
if [ ! -d "$INSTALL_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    sudo -u pi bash -c "cd $INSTALL_DIR && npm install"
else
    echo "node_modules exists, skipping npm install"
fi

# Create systemd service file with correct paths
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
echo "Installing systemd service to $SERVICE_FILE..."

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=AccuWeather Culver City Forecast Server
Documentation=https://github.com/your-repo/accuweather-culver-city
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
EnvironmentFile=-$INSTALL_DIR/.env
ExecStart=$(which node) server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo ""
echo "=== Installation complete ==="
echo ""
echo "The server will start automatically on boot."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status $SERVICE_NAME   # Check status"
echo "  sudo systemctl restart $SERVICE_NAME  # Restart server"
echo "  sudo systemctl stop $SERVICE_NAME     # Stop server"
echo "  sudo journalctl -u $SERVICE_NAME -f   # View logs (Ctrl+C to exit)"
echo ""
echo "Server should be available at: http://$(hostname -I | awk '{print $1}'):3000"
