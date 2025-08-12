const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VPNServer = sequelize.define('VPNServer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  region: {
    type: DataTypes.STRING,
    allowNull: false
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  hostname: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  port: {
    type: DataTypes.INTEGER,
    defaultValue: 51820
  },
  protocol: {
    type: DataTypes.ENUM('wireguard', 'openvpn', 'ipsec'),
    defaultValue: 'wireguard'
  },
  status: {
    type: DataTypes.ENUM('active', 'maintenance', 'offline'),
    defaultValue: 'active'
  },
  load: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 1000
  },
  currentUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bandwidth: {
    type: DataTypes.JSONB,
    defaultValue: {
      total: 1000,
      used: 0,
      unit: 'mbps'
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {
      provider: 'aws',
      instanceType: 't3.medium',
      instanceId: null
    }
  },
  healthCheckUrl: {
    type: DataTypes.STRING
  },
  lastHealthCheck: {
    type: DataTypes.DATE
  }
});

VPNServer.prototype.isAvailable = function() {
  return this.status === 'active' && this.load < 80 && this.currentUsers < this.maxUsers;
};

VPNServer.prototype.calculateLoad = function() {
  const userLoad = (this.currentUsers / this.maxUsers) * 100;
  const bandwidthLoad = (this.bandwidth.used / this.bandwidth.total) * 100;
  return Math.max(userLoad, bandwidthLoad);
};

module.exports = VPNServer;