const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
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
  plan: {
    type: DataTypes.ENUM('basic', 'pro', 'business'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial'),
    defaultValue: 'trial'
  },
  stripeSubscriptionId: {
    type: DataTypes.STRING,
    unique: true
  },
  currentPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  currentPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  trialEnd: {
    type: DataTypes.DATE
  },
  features: {
    type: DataTypes.JSONB,
    defaultValue: {
      maxDevices: 1,
      dataLimit: 100,
      servers: ['all'],
      priority: 'standard'
    }
  },
  usage: {
    type: DataTypes.JSONB,
    defaultValue: {
      currentMonth: {
        dataUsed: 0,
        devicesConnected: 0
      }
    }
  }
});

Subscription.getPlanFeatures = function(plan) {
  const features = {
    basic: {
      maxDevices: 1,
      dataLimit: 100,
      servers: ['us', 'eu'],
      priority: 'standard',
      price: 4.99
    },
    pro: {
      maxDevices: 5,
      dataLimit: 500,
      servers: ['all'],
      priority: 'high',
      price: 9.99
    },
    business: {
      maxDevices: 20,
      dataLimit: -1,
      servers: ['all'],
      priority: 'premium',
      price: 29.99
    }
  };
  return features[plan];
};

module.exports = Subscription;