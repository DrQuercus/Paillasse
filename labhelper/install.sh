#!/bin/bash
set -e

INSTALL_DIR="/opt/labhelper"
PORT=${1:-3001}

echo ""
echo "  ⚗  LabHelper v3 — Installation"
echo "  ================================"
echo ""

# Node.js
if ! command -v node &> /dev/null; then
    echo "→ Node.js non trouve, installation..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✓ Node.js $(node -v) detecte"
fi

# Copie
echo "→ Installation dans $INSTALL_DIR..."
sudo mkdir -p $INSTALL_DIR
sudo cp -r ./* $INSTALL_DIR/
sudo chown -R www-data:www-data $INSTALL_DIR

# Deps
echo "→ Installation des dependances..."
cd $INSTALL_DIR
sudo -u www-data npm install 2>&1 | tail -3

# Build
echo "→ Build de l'application..."
sudo -u www-data npx vite build 2>&1 | tail -5

# Systemd
echo "→ Configuration du service..."
sudo sed -i "s/PORT=3001/PORT=$PORT/" $INSTALL_DIR/labhelper.service
sudo cp $INSTALL_DIR/labhelper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable labhelper
sudo systemctl restart labhelper

# Firewall
if command -v ufw &> /dev/null; then
    sudo ufw allow $PORT/tcp 2>/dev/null || true
fi

echo ""
echo "  ✅ Installation terminee !"
echo "  ──────────────────────────"
IP=$(hostname -I | awk '{print $1}')
echo "  Local:   http://localhost:$PORT"
echo "  Reseau:  http://$IP:$PORT"
echo ""
echo "  Commandes utiles :"
echo "    sudo systemctl status labhelper"
echo "    sudo systemctl restart labhelper"
echo "    sudo journalctl -u labhelper -f"
echo ""
