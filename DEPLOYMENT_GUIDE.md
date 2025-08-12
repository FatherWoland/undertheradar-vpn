# 🚀 UnderTheRadar VPN - Deployment Guide

**Ready to launch your own VPN service in 10 minutes? Let's do this!**

---

## ⚡ **One-Click Deployment**

### **Option 1: Automatic Deployment (Recommended)**

```bash
# Download and run the deployment script
curl -sSL https://raw.githubusercontent.com/your-repo/undertheradar-vpn/main/deploy.sh | sudo bash
```

**OR run locally:**

```bash
# Make scripts executable
chmod +x deploy.sh
sudo ./deploy.sh
```

The script will:
- ✅ Install all dependencies automatically
- ✅ Configure WireGuard VPN server
- ✅ Set up PostgreSQL database
- ✅ Deploy management API
- ✅ Install web interface
- ✅ Configure Nginx with SSL
- ✅ Set up firewall and security
- ✅ Create your admin account

---

## 🖥️ **Server Requirements**

### **Minimum Requirements:**
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: 1GB (2GB recommended)
- **Storage**: 10GB SSD
- **Network**: 100 Mbps connection
- **⚠️ IMPORTANT**: Stripe account for payments (required for users to access VPN)

### **Recommended Providers:**
- **DigitalOcean**: $5/month droplet
- **Vultr**: $6/month VPS
- **Linode**: $5/month nanode
- **AWS EC2**: t3.micro instance

---

## 🔧 **Manual Installation**

If you prefer step-by-step control:

### **1. Prepare Server**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git
```

### **2. Clone Repository**
```bash
git clone https://github.com/your-repo/undertheradar-vpn
cd undertheradar-vpn
```

### **3. Run VPN Server Installation**
```bash
cd vpn-server
sudo ./install.sh
```

### **4. Configure Environment**
Edit `/opt/undertheradar-vpn/.env`:
```bash
sudo nano /opt/undertheradar-vpn/.env
```

### **5. Start Services**
```bash
sudo systemctl start undertheradar-vpn
sudo systemctl enable undertheradar-vpn
```

---

## 🌐 **Domain Setup (Optional but Recommended)**

### **1. Point Domain to Server**
Create an A record pointing your domain to your server IP:
```
Type: A
Name: vpn (or @)
Value: YOUR_SERVER_IP
TTL: 300
```

### **2. Deploy with Domain**
```bash
DOMAIN=vpn.yourdomain.com EMAIL=you@yourdomain.com sudo ./deploy.sh
```

This automatically sets up SSL certificates via Let's Encrypt.

---

## 📊 **Post-Deployment Checklist**

### **1. Verify Services**
```bash
# Check VPN server status
sudo systemctl status undertheradar-vpn

# Check WireGuard interface
sudo wg show

# Check database connection
sudo -u postgres psql -c "\l" undertheradar_vpn

# Check web server
curl -I http://your-server-ip
```

### **2. Create Admin Account**
```bash
curl -X POST http://your-server-ip:3001/api/admin/create \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-secure-password"}'
```

### **3. Configure Stripe Payments** ⚠️ **CRITICAL**
**Your VPN service requires payment to function. Users cannot create devices without an active subscription.**

```bash
# Edit environment file
sudo nano /opt/undertheradar-vpn/.env

# Configure these Stripe settings:
STRIPE_SECRET_KEY=sk_test_your_actual_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret
```

**📖 Full Stripe setup guide:** [STRIPE_SETUP.md](STRIPE_SETUP.md)

### **4. Test VPN Connection**
1. Visit your web interface
2. Login with admin credentials
3. Create a test user account
4. **Subscribe to a plan** (payment required)
5. Add a device and download config
6. Test connection with WireGuard client

---

## 🔐 **Security Hardening**

### **1. Change Default Passwords**
```bash
# Change database password
sudo -u postgres psql
ALTER USER vpn_admin PASSWORD 'new-secure-password';
\q

# Update .env file with new password
sudo nano /opt/undertheradar-vpn/.env
sudo systemctl restart undertheradar-vpn
```

### **2. Configure Firewall**
```bash
# Check firewall status
sudo ufw status

# Only allow necessary ports
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 51820/udp
sudo ufw enable
```

### **3. Set Up Fail2Ban**
```bash
sudo apt install fail2ban

# Configure SSH protection
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
```

### **4. Enable Automatic Updates**
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 📈 **Scaling and Optimization**

### **For High Traffic (1000+ users):**

#### **1. Database Optimization**
```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/*/main/postgresql.conf

# Increase these values:
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
```

#### **2. Server Optimization**
```bash
# Increase file limits
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Optimize network settings
echo "net.core.somaxconn = 65536" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65536" >> /etc/sysctl.conf
sysctl -p
```

#### **3. Load Balancer Setup**
For multiple servers, use nginx as a load balancer:
```nginx
upstream vpn_backend {
    server 10.0.1.10:3001;
    server 10.0.1.11:3001;
    server 10.0.1.12:3001;
}

server {
    location /api {
        proxy_pass http://vpn_backend;
    }
}
```

---

## 🚨 **Troubleshooting**

### **Common Issues:**

#### **VPN Server Won't Start**
```bash
# Check logs
journalctl -u undertheradar-vpn -f

# Check database connection
sudo -u postgres psql undertheradar_vpn -c "SELECT 1;"

# Restart services
sudo systemctl restart postgresql
sudo systemctl restart undertheradar-vpn
```

#### **WireGuard Interface Issues**
```bash
# Check WireGuard status
sudo wg show

# Restart WireGuard
sudo systemctl restart wg-quick@wg0

# Check IP forwarding
cat /proc/sys/net/ipv4/ip_forward  # Should return 1
```

#### **Web Interface Not Loading**
```bash
# Check nginx status
sudo systemctl status nginx

# Check nginx config
sudo nginx -t

# Check if port is open
sudo netstat -tlnp | grep :80
```

#### **Database Connection Failed**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
sudo -u postgres psql -c "\conninfo"

# Check database exists
sudo -u postgres psql -l | grep undertheradar
```

### **Port Conflicts**
If default ports are in use:
```bash
# Change ports in .env file
sudo nano /opt/undertheradar-vpn/.env

# Update these values:
PORT=3002  # API port
VPN_PORT=51821  # WireGuard port

# Restart services
sudo systemctl restart undertheradar-vpn
sudo systemctl restart wg-quick@wg0
```

---

## 📊 **Monitoring and Logs**

### **View Live Logs**
```bash
# VPN server logs
journalctl -u undertheradar-vpn -f

# WireGuard logs
journalctl -u wg-quick@wg0 -f

# Nginx access logs
tail -f /var/log/nginx/access.log

# System logs
tail -f /var/log/syslog
```

### **Monitor Performance**
```bash
# Check system resources
htop

# Monitor network traffic
sudo iftop -i wg0

# Check connected clients
sudo wg show wg0 peers

# Database performance
sudo -u postgres psql undertheradar_vpn -c "
  SELECT query, calls, total_time, mean_time 
  FROM pg_stat_statements 
  ORDER BY total_time DESC LIMIT 10;"
```

---

## 🔄 **Backup and Recovery**

### **Automated Backup Script**
```bash
#!/bin/bash
# /opt/backup-vpn.sh

BACKUP_DIR="/opt/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup database
sudo -u postgres pg_dump undertheradar_vpn > $BACKUP_DIR/database.sql

# Backup WireGuard config
cp -r /etc/wireguard $BACKUP_DIR/

# Backup application config
cp /opt/undertheradar-vpn/.env $BACKUP_DIR/

# Compress backup
tar -czf $BACKUP_DIR.tar.gz -C /opt/backups $(basename $BACKUP_DIR)
rm -rf $BACKUP_DIR

# Keep only last 7 days
find /opt/backups -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR.tar.gz"
```

Set up daily backups:
```bash
chmod +x /opt/backup-vpn.sh
echo "0 2 * * * /opt/backup-vpn.sh" | crontab -
```

### **Disaster Recovery**
```bash
# Restore from backup
tar -xzf backup_20240115_020000.tar.gz

# Restore database
sudo -u postgres psql undertheradar_vpn < backup_20240115_020000/database.sql

# Restore WireGuard
sudo cp -r backup_20240115_020000/wireguard/* /etc/wireguard/

# Restore config
sudo cp backup_20240115_020000/.env /opt/undertheradar-vpn/

# Restart services
sudo systemctl restart undertheradar-vpn
sudo systemctl restart wg-quick@wg0
```

---

## 🎯 **Next Steps**

### **1. Customize Your Service**
- Add your branding to the web interface
- Configure custom pricing plans
- Set up Stripe for payments
- Add more server locations

### **2. Marketing and Growth**
- Create landing pages for different markets
- Set up customer support channels
- Implement referral programs
- Add mobile apps (iOS/Android)

### **3. Advanced Features**
- Multi-hop VPN chains
- Kill switch for clients
- Split tunneling
- Custom DNS servers

---

## 📞 **Support**

### **Community Support**
- GitHub Issues: Report bugs and feature requests
- Documentation: Comprehensive guides and tutorials
- Community Forum: Connect with other VPN operators

### **Professional Support**
For enterprise deployments and custom solutions:
- Email: support@undertheradar.work
- Priority support with SLA guarantees
- Custom development services
- 24/7 monitoring and maintenance

---

**🚀 Ready to launch your VPN empire? Run that deployment script and let's go!**

```bash
sudo ./deploy.sh
```

**Your customers are waiting for a better VPN experience. Give it to them.**