#!/bin/bash
# UnderTheRadar VPN Server Installation Script
# Installs and configures WireGuard VPN server with management API

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_PORT=${VPN_PORT:-51820}
API_PORT=${API_PORT:-3001}
DOMAIN=${DOMAIN:-""}
EMAIL=${EMAIL:-""}

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║        UnderTheRadar VPN Server Setup        ║"
    echo "║              Real. Working. Fast.            ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
    fi
}

detect_os() {
    if [[ -f /etc/debian_version ]]; then
        OS="debian"
        log "Detected Debian/Ubuntu system"
    elif [[ -f /etc/redhat-release ]]; then
        OS="rhel"
        log "Detected RHEL/CentOS system"
    else
        error "Unsupported operating system"
    fi
}

install_dependencies() {
    log "Installing system dependencies..."
    
    if [[ $OS == "debian" ]]; then
        apt update
        apt install -y wireguard wireguard-tools iptables-persistent \
                       curl wget gnupg2 software-properties-common \
                       qrencode nginx certbot python3-certbot-nginx \
                       nodejs npm postgresql postgresql-contrib redis-server
    elif [[ $OS == "rhel" ]]; then
        yum update -y
        yum install -y epel-release
        yum install -y wireguard-tools iptables-services \
                       curl wget gnupg2 qrencode nginx certbot \
                       nodejs npm postgresql postgresql-server redis
    fi
}

setup_firewall() {
    log "Configuring firewall..."
    
    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf
    sysctl -p
    
    # Configure iptables
    iptables -A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    iptables -A INPUT -p udp -m udp --dport $SERVER_PORT -m conntrack --ctstate NEW -j ACCEPT
    iptables -A INPUT -p tcp -m tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT
    iptables -A INPUT -p tcp -m tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
    iptables -A INPUT -p tcp -m tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
    iptables -A INPUT -p tcp -m tcp --dport $API_PORT -m conntrack --ctstate NEW -j ACCEPT
    
    # NAT rules for VPN traffic
    iptables -t nat -A POSTROUTING -s 10.66.66.0/24 -o $(ip route | grep default | awk '{print $5}') -j MASQUERADE
    iptables -A INPUT -s 10.66.66.0/24 -p tcp -m tcp --dport 53 -m conntrack --ctstate NEW -j ACCEPT
    iptables -A INPUT -s 10.66.66.0/24 -p udp -m udp --dport 53 -m conntrack --ctstate NEW -j ACCEPT
    
    # Save iptables rules
    if [[ $OS == "debian" ]]; then
        iptables-save > /etc/iptables/rules.v4
    else
        service iptables save
    fi
}

generate_server_keys() {
    log "Generating WireGuard server keys..."
    
    mkdir -p /etc/wireguard
    cd /etc/wireguard
    
    # Generate server private key
    wg genkey | tee server_private_key | wg pubkey > server_public_key
    
    # Set proper permissions
    chmod 600 server_private_key
    chmod 644 server_public_key
    
    SERVER_PRIVATE_KEY=$(cat server_private_key)
    SERVER_PUBLIC_KEY=$(cat server_public_key)
    
    log "Server public key: $SERVER_PUBLIC_KEY"
}

create_wg_config() {
    log "Creating WireGuard server configuration..."
    
    cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
Address = 10.66.66.1/24
ListenPort = $SERVER_PORT
SaveConfig = false

# DNS for clients
DNS = 1.1.1.1, 1.0.0.1

# Post-up and post-down scripts for iptables management
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o $(ip route | grep default | awk '{print $5}') -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o $(ip route | grep default | awk '{print $5}') -j MASQUERADE

# Peers will be added dynamically by the API
EOF

    # Enable and start WireGuard
    systemctl enable wg-quick@wg0
    systemctl start wg-quick@wg0
    
    log "WireGuard server started successfully"
}

setup_database() {
    log "Setting up PostgreSQL database..."
    
    if [[ $OS == "rhel" ]]; then
        postgresql-setup initdb
    fi
    
    systemctl enable postgresql
    systemctl start postgresql
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE DATABASE undertheradar_vpn;
CREATE USER vpn_admin WITH ENCRYPTED PASSWORD 'secure_password_change_me';
GRANT ALL PRIVILEGES ON DATABASE undertheradar_vpn TO vpn_admin;
\q
EOF
}

install_api_server() {
    log "Installing VPN management API..."
    
    mkdir -p /opt/undertheradar-vpn
    cd /opt/undertheradar-vpn
    
    # Create package.json for API server
    cat > package.json << 'EOF'
{
  "name": "undertheradar-vpn-server",
  "version": "1.0.0",
  "description": "UnderTheRadar VPN Server Management API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.3",
    "sequelize": "^6.33.0",
    "qrcode": "^1.5.3",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.10.0",
    "winston": "^3.10.0",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  }
}
EOF
    
    npm install
    
    log "API dependencies installed"
}

create_systemd_service() {
    log "Creating systemd service..."
    
    cat > /etc/systemd/system/undertheradar-vpn.service << EOF
[Unit]
Description=UnderTheRadar VPN Management API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/undertheradar-vpn
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable undertheradar-vpn
}

setup_nginx() {
    log "Configuring nginx reverse proxy..."
    
    cat > /etc/nginx/sites-available/undertheradar-vpn << EOF
server {
    listen 80;
    server_name ${DOMAIN:-localhost};
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /api {
        proxy_pass http://localhost:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/undertheradar-vpn /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t && systemctl restart nginx
}

setup_ssl() {
    if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
        log "Setting up SSL certificate with Let's Encrypt..."
        certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive
    else
        warn "Domain and email not provided, skipping SSL setup"
    fi
}

create_env_file() {
    log "Creating environment configuration..."
    
    cat > /opt/undertheradar-vpn/.env << EOF
# Database
DATABASE_URL=postgresql://vpn_admin:secure_password_change_me@localhost:5432/undertheradar_vpn

# Server
PORT=$API_PORT
NODE_ENV=production

# JWT
JWT_SECRET=$(openssl rand -base64 32)

# WireGuard
WG_INTERFACE=wg0
WG_CONFIG_PATH=/etc/wireguard/wg0.conf
SERVER_PRIVATE_KEY=$SERVER_PRIVATE_KEY
SERVER_PUBLIC_KEY=$SERVER_PUBLIC_KEY
VPN_PORT=$SERVER_PORT

# Server info
SERVER_ENDPOINT=${DOMAIN:-$(curl -s ifconfig.me)}:$SERVER_PORT
ALLOWED_IPS=0.0.0.0/0,::/0
DNS_SERVERS=1.1.1.1,1.0.0.1
EOF
}

print_success() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║           Installation Complete! ✅          ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "🎉 UnderTheRadar VPN Server is now running!"
    echo ""
    echo "📋 Server Information:"
    echo "   • WireGuard Port: $SERVER_PORT"
    echo "   • API Port: $API_PORT"
    echo "   • Server Public Key: $SERVER_PUBLIC_KEY"
    if [[ -n "$DOMAIN" ]]; then
        echo "   • Domain: $DOMAIN"
        echo "   • Management URL: https://$DOMAIN"
    else
        echo "   • Server IP: $(curl -s ifconfig.me)"
        echo "   • Management URL: http://$(curl -s ifconfig.me)"
    fi
    echo ""
    echo "🔧 Next Steps:"
    echo "   1. Deploy the web interface: npm run deploy:frontend"
    echo "   2. Create admin account: curl -X POST http://localhost:$API_PORT/api/admin/create"
    echo "   3. Add your first VPN user through the web interface"
    echo ""
    echo "📖 Documentation: /opt/undertheradar-vpn/README.md"
    echo "🔍 Logs: journalctl -u undertheradar-vpn -f"
}

# Main installation flow
main() {
    print_header
    
    check_root
    detect_os
    install_dependencies
    setup_firewall
    generate_server_keys
    create_wg_config
    setup_database
    install_api_server
    create_env_file
    create_systemd_service
    setup_nginx
    
    if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
        setup_ssl
    fi
    
    print_success
}

# Run installation
main "$@"