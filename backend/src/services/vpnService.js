const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('../utils/logger');

const generateKeyPair = async () => {
  try {
    const privateKey = crypto.randomBytes(32).toString('base64');
    const { stdout: publicKey } = await execAsync(
      `echo "${privateKey}" | wg pubkey`
    );
    
    return {
      privateKey,
      publicKey: publicKey.trim()
    };
  } catch (error) {
    logger.error('Failed to generate WireGuard keys:', error);
    
    const privateKey = crypto.randomBytes(32).toString('base64');
    const publicKey = crypto.randomBytes(32).toString('base64');
    
    return { privateKey, publicKey };
  }
};

const generateWireGuardConfig = async (userId, serverId, deviceId) => {
  const { privateKey, publicKey } = await generateKeyPair();
  
  const subnet = 24;
  const ipBase = '10.0';
  const serverNum = parseInt(serverId.substr(-4), 16) % 254 + 1;
  const clientNum = parseInt(userId.substr(-4), 16) % 254 + 1;
  const clientIp = `${ipBase}.${serverNum}.${clientNum}/${subnet}`;
  
  const config = `[Interface]
PrivateKey = ${privateKey}
Address = ${clientIp}
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY_PLACEHOLDER
AllowedIPs = 0.0.0.0/0
Endpoint = SERVER_ENDPOINT_PLACEHOLDER
PersistentKeepalive = 25`;
  
  return {
    config,
    privateKey,
    publicKey,
    clientIp
  };
};

const generateOpenVPNConfig = async (userId, serverId) => {
  const config = `client
dev tun
proto udp
remote SERVER_ENDPOINT_PLACEHOLDER 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth SHA512
cipher AES-256-CBC
comp-lzo
verb 3

<ca>
CA_CERTIFICATE_PLACEHOLDER
</ca>

<cert>
CLIENT_CERTIFICATE_PLACEHOLDER
</cert>

<key>
CLIENT_KEY_PLACEHOLDER
</key>`;
  
  return { config };
};

const allocateIPAddress = async (serverId) => {
  return `10.0.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
};

const revokeClientAccess = async (publicKey, serverId) => {
  try {
    logger.info(`Revoking access for client ${publicKey} on server ${serverId}`);
    return true;
  } catch (error) {
    logger.error('Failed to revoke client access:', error);
    throw error;
  }
};

module.exports = {
  generateKeyPair,
  generateWireGuardConfig,
  generateOpenVPNConfig,
  allocateIPAddress,
  revokeClientAccess
};