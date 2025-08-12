#!/bin/bash
# UnderTheRadar VPN - One-Click Deployment Script
# Deploys your VPN service to a fresh Ubuntu/Debian server

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
VPN_PORT=${VPN_PORT:-51820}
API_PORT=${API_PORT:-3001}
WEB_PORT=${WEB_PORT:-3000}
DOMAIN=${DOMAIN:-""}
EMAIL=${EMAIL:-""}
DB_PASSWORD=$(openssl rand -base64 32)

print_banner() {
    clear
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        🚀 UnderTheRadar VPN - One-Click Deployment 🚀            ║
║                                                                  ║
║              Deploy Your Own VPN Service in Minutes              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
}

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"
    exit 1
}

step() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] 🔄 $1${NC}"
}

success() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] 🎉 $1${NC}"
}

check_requirements() {
    step "Checking system requirements..."
    
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Use: sudo bash deploy.sh"
    fi
    
    # Check OS
    if ! command -v apt-get &> /dev/null; then
        error "This script requires Ubuntu or Debian"
    fi
    
    # Check memory
    total_mem=$(free -m | awk 'NR==2{printf "%d", $2}')
    if [[ $total_mem -lt 1024 ]]; then
        warn "Server has less than 1GB RAM. VPN may be slow under load."
    fi
    
    log "System requirements check passed"
}

collect_config() {
    echo -e "\n${BLUE}🔧 Configuration Setup${NC}\n"
    
    # Get server IP
    SERVER_IP=$(curl -s ifconfig.me)
    echo "📍 Detected server IP: $SERVER_IP"
    
    # Domain configuration
    if [[ -z "$DOMAIN" ]]; then
        echo -n "🌐 Enter your domain (optional, press Enter for IP-only): "
        read -r user_domain
        if [[ -n "$user_domain" ]]; then
            DOMAIN="$user_domain"
        fi
    fi
    
    # Email for SSL
    if [[ -n "$DOMAIN" && -z "$EMAIL" ]]; then
        echo -n "📧 Enter email for SSL certificate: "
        read -r user_email
        EMAIL="$user_email"
    fi
    
    # Admin credentials
    if [[ -z "$ADMIN_EMAIL" ]]; then
        echo -n "👤 Create admin email: "
        read -r ADMIN_EMAIL
    fi
    
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        echo -n "🔒 Create admin password (min 8 chars): "
        read -rs ADMIN_PASSWORD
        echo
        if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
            error "Password must be at least 8 characters"
        fi
    fi
    
    echo -e "\n${GREEN}✅ Configuration collected!${NC}\n"
}

install_dependencies() {
    step "Installing system dependencies..."
    
    # Update system
    apt update && apt upgrade -y
    
    # Install required packages
    apt install -y \
        curl wget gnupg2 software-properties-common \
        wireguard wireguard-tools \
        nodejs npm \
        postgresql postgresql-contrib \
        nginx \
        certbot python3-certbot-nginx \
        iptables-persistent \
        qrencode \
        ufw \
        fail2ban \
        htop \
        unattended-upgrades
    
    # Install latest Node.js
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    
    log "Dependencies installed successfully"
}

setup_firewall() {
    step "Configuring firewall and network..."
    
    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf
    sysctl -p
    
    # Configure UFW
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow essential ports
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow $VPN_PORT/udp
    ufw allow $API_PORT/tcp
    ufw allow $WEB_PORT/tcp
    
    # Enable firewall
    ufw --force enable
    
    log "Firewall configured successfully"
}

setup_database() {
    step "Setting up PostgreSQL database..."
    
    # Start PostgreSQL
    systemctl enable postgresql
    systemctl start postgresql
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE DATABASE undertheradar_vpn;
CREATE USER vpn_admin WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE undertheradar_vpn TO vpn_admin;
ALTER USER vpn_admin CREATEDB;
\q
EOF
    
    log "Database configured successfully"
}

setup_wireguard() {
    step "Setting up WireGuard VPN server..."
    
    # Create WireGuard directory
    mkdir -p /etc/wireguard
    chmod 700 /etc/wireguard
    
    # Generate server keys
    cd /etc/wireguard
    wg genkey | tee server_private_key | wg pubkey > server_public_key
    chmod 600 server_private_key
    chmod 644 server_public_key
    
    SERVER_PRIVATE_KEY=$(cat server_private_key)
    SERVER_PUBLIC_KEY=$(cat server_public_key)
    
    # Create WireGuard configuration
    cat > wg0.conf << EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
Address = 10.66.66.1/24
ListenPort = $VPN_PORT
SaveConfig = false
DNS = 1.1.1.1, 1.0.0.1

PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o \$(ip route | grep default | awk '{print \$5}') -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o \$(ip route | grep default | awk '{print \$5}') -j MASQUARD

# Clients will be added dynamically
EOF
    
    # Enable and start WireGuard
    systemctl enable wg-quick@wg0
    systemctl start wg-quick@wg0
    
    log "WireGuard server configured successfully"
}

deploy_vpn_server() {
    step "Deploying VPN management server..."
    
    # Create application directory
    mkdir -p /opt/undertheradar-vpn
    cd /opt/undertheradar-vpn
    
    # Copy server files
    cp /home/woland/undertheradar-vpn/vpn-server/server.js .
    cp /home/woland/undertheradar-vpn/vpn-server/package.json .
    
    # Install Node.js dependencies
    npm install --production
    
    # Create environment file
    cat > .env << EOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_URL=postgresql://vpn_admin:$DB_PASSWORD@localhost:5432/undertheradar_vpn
JWT_SECRET=$(openssl rand -base64 64)
WG_INTERFACE=wg0
WG_CONFIG_PATH=/etc/wireguard/wg0.conf
SERVER_PRIVATE_KEY=$SERVER_PRIVATE_KEY
SERVER_PUBLIC_KEY=$SERVER_PUBLIC_KEY
VPN_PORT=$VPN_PORT
SERVER_ENDPOINT=${DOMAIN:-$SERVER_IP}:$VPN_PORT
ALLOWED_IPS=0.0.0.0/0,::/0
DNS_SERVERS=1.1.1.1,1.0.0.1

# Stripe Configuration (MUST BE CONFIGURED!)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
FRONTEND_URL=${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$SERVER_IP}
EOF
    
    # Create systemd service
    cat > /etc/systemd/system/undertheradar-vpn.service << EOF
[Unit]
Description=UnderTheRadar VPN Management Server
After=network.target postgresql.service wireguard-wg0.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/undertheradar-vpn
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    # Start service
    systemctl daemon-reload
    systemctl enable undertheradar-vpn
    systemctl start undertheradar-vpn
    
    log "VPN server deployed successfully"
}

deploy_web_interface() {
    step "Deploying web interface..."
    
    # Create web directory
    mkdir -p /var/www/undertheradar-vpn
    
    # Copy web files
    cp /home/woland/undertheradar-vpn/web-portal/index.html /var/www/undertheradar-vpn/
    
    # Set permissions
    chown -R www-data:www-data /var/www/undertheradar-vpn
    
    log "Web interface deployed successfully"
}

setup_nginx() {
    step "Configuring Nginx..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Create VPN site configuration
    cat > /etc/nginx/sites-available/undertheradar-vpn << EOF
server {
    listen 80;
    server_name ${DOMAIN:-$SERVER_IP};
    
    # Serve static files
    location / {
        root /var/www/undertheradar-vpn;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS';
        add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
        
        if (\$request_method = 'OPTIONS') {
            return 204;
        }
    }
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/undertheradar-vpn /etc/nginx/sites-enabled/
    
    # Test and reload Nginx
    nginx -t && systemctl restart nginx
    
    log "Nginx configured successfully"
}

setup_ssl() {
    if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
        step "Setting up SSL certificate..."
        
        # Get SSL certificate
        certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --quiet
        
        log "SSL certificate installed successfully"
    else
        warn "Skipping SSL setup (no domain provided)"
    fi
}

create_admin_user() {
    step "Creating admin user..."
    
    # Wait for server to be ready
    sleep 5
    
    # Create admin user via API
    curl -X POST http://localhost:$API_PORT/api/admin/create \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
        --silent > /dev/null
    
    log "Admin user created successfully"
}

setup_monitoring() {
    step "Setting up monitoring..."
    
    # Configure fail2ban for SSH
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF
    
    systemctl restart fail2ban
    
    # Setup automatic updates
    echo 'Unattended-Upgrade::Automatic-Reboot "false";' >> /etc/apt/apt.conf.d/50unattended-upgrades
    
    # Create log rotation
    cat > /etc/logrotate.d/undertheradar-vpn << 'EOF'
/opt/undertheradar-vpn/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    create 644 root root
}
EOF
    
    log "Monitoring and security configured successfully"
}

cleanup_installation() {
    step "Cleaning up installation files..."
    
    # Clean package cache
    apt autoremove -y
    apt autoclean
    
    # Remove installation history
    history -c
    
    log "Cleanup completed"
}

print_success_info() {
    clear
    echo -e "${GREEN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║                    🎉 DEPLOYMENT SUCCESSFUL! 🎉                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
    
    success "UnderTheRadar VPN is now running!"
    echo
    echo -e "${BLUE}📋 Server Information:${NC}"
    echo "   🌐 Server IP: $SERVER_IP"
    if [[ -n "$DOMAIN" ]]; then
        echo "   🔗 Domain: $DOMAIN"
        echo "   📱 Web Interface: https://$DOMAIN"
    else
        echo "   📱 Web Interface: http://$SERVER_IP"
    fi
    echo "   🔌 VPN Port: $VPN_PORT"
    echo "   🔑 Server Public Key: $SERVER_PUBLIC_KEY"
    echo
    echo -e "${PURPLE}👤 Admin Credentials:${NC}"
    echo "   📧 Email: $ADMIN_EMAIL"
    echo "   🔒 Password: $ADMIN_PASSWORD"
    echo
    echo -e "${YELLOW}🎯 Next Steps:${NC}"
    echo "   1. Visit your web interface and login as admin"
    echo "   2. Create your first VPN user account"
    echo "   3. Download WireGuard app on your device"
    echo "   4. Add a new device and scan the QR code"
    echo "   5. Connect and enjoy secure browsing!"
    echo
    echo -e "${BLUE}🔧 Management Commands:${NC}"
    echo "   • Check VPN status:    systemctl status undertheradar-vpn"
    echo "   • View logs:           journalctl -u undertheradar-vpn -f"
    echo "   • Restart service:     systemctl restart undertheradar-vpn"
    echo "   • Update server:       apt update && apt upgrade"
    echo
    echo -e "${GREEN}🚀 Your VPN service is ready to use!${NC}"
    echo
}

# Main deployment flow
main() {
    print_banner
    
    # Collect configuration
    collect_config
    
    # Run deployment steps
    check_requirements
    install_dependencies
    setup_firewall
    setup_database
    setup_wireguard
    deploy_vpn_server
    deploy_web_interface
    setup_nginx
    setup_ssl
    create_admin_user
    setup_monitoring
    cleanup_installation
    
    # Show success message
    print_success_info
}

# Handle script interruption
trap 'echo -e "\n${RED}Deployment interrupted!${NC}"; exit 1' INT TERM

# Run main function
main "$@"