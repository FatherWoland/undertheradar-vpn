#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install WireGuard
apt-get install -y wireguard

# Install monitoring tools
apt-get install -y htop iotop nethogs curl wget

# Create WireGuard directory
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

# Generate server keys
wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
chmod 600 /etc/wireguard/private.key

# Get private key
PRIVATE_KEY=$(cat /etc/wireguard/private.key)

# Create WireGuard configuration
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = 10.66.${server_index}.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

EOF

# Enable IP forwarding
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
sysctl -p

# Start and enable WireGuard
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Create management API script
cat > /opt/vpn-manager.py << 'EOF'
#!/usr/bin/env python3
import subprocess
import json
import sys
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/add_peer', methods=['POST'])
def add_peer():
    data = request.json
    peer_public_key = data.get('public_key')
    peer_ip = data.get('ip')
    
    if not peer_public_key or not peer_ip:
        return jsonify({'error': 'Missing public_key or ip'}), 400
    
    try:
        subprocess.run([
            'wg', 'set', 'wg0', 'peer', peer_public_key,
            'allowed-ips', peer_ip
        ], check=True)
        return jsonify({'success': True})
    except subprocess.CalledProcessError as e:
        return jsonify({'error': str(e)}), 500

@app.route('/remove_peer', methods=['POST'])
def remove_peer():
    data = request.json
    peer_public_key = data.get('public_key')
    
    if not peer_public_key:
        return jsonify({'error': 'Missing public_key'}), 400
    
    try:
        subprocess.run(['wg', 'set', 'wg0', 'peer', peer_public_key, 'remove'], check=True)
        return jsonify({'success': True})
    except subprocess.CalledProcessError as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF

# Install Python and Flask
apt-get install -y python3 python3-pip
pip3 install flask

# Create systemd service for VPN manager
cat > /etc/systemd/system/vpn-manager.service << EOF
[Unit]
Description=VPN Manager API
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /opt/vpn-manager.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start VPN manager
systemctl enable vpn-manager
systemctl start vpn-manager

# Log completion
echo "VPN server setup completed" >> /var/log/user-data.log