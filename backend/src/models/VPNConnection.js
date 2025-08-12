const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VPNConnection = sequelize.define('VPNConnection', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  serverId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'VPNServers',
      key: 'id'
    }
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  deviceName: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.ENUM('connected', 'disconnected', 'connecting'),
    defaultValue: 'disconnected'
  },
  connectedAt: {
    type: DataTypes.DATE
  },
  disconnectedAt: {
    type: DataTypes.DATE
  },
  bytesIn: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  bytesOut: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  clientIp: {
    type: DataTypes.STRING
  },
  assignedIp: {
    type: DataTypes.STRING
  },
  publicKey: {
    type: DataTypes.STRING
  },
  lastHandshake: {
    type: DataTypes.DATE
  }
});

VPNConnection.prototype.getDuration = function() {
  if (this.status === 'connected' && this.connectedAt) {
    return new Date() - this.connectedAt;
  }
  if (this.disconnectedAt && this.connectedAt) {
    return this.disconnectedAt - this.connectedAt;
  }
  return 0;
};

VPNConnection.prototype.getTotalData = function() {
  return (parseInt(this.bytesIn) || 0) + (parseInt(this.bytesOut) || 0);
};

module.exports = VPNConnection;