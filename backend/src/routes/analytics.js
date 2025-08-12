const express = require('express');
const { Op } = require('sequelize');
const { VPNConnection, Subscription } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/usage/daily', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const dailyUsage = await VPNConnection.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('connectedAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('bytesIn')), 'bytesIn'],
        [sequelize.fn('SUM', sequelize.col('bytesOut')), 'bytesOut'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('deviceId'))), 'devices']
      ],
      where: {
        userId: req.user.id,
        connectedAt: { [Op.gte]: startDate }
      },
      group: [sequelize.fn('DATE', sequelize.col('connectedAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('connectedAt')), 'ASC']]
    });
    
    res.json({ usage: dailyUsage });
  } catch (error) {
    next(error);
  }
});

router.get('/usage/monthly', async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    
    const monthlyUsage = await VPNConnection.findAll({
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('connectedAt')), 'month'],
        [sequelize.fn('SUM', sequelize.col('bytesIn')), 'bytesIn'],
        [sequelize.fn('SUM', sequelize.col('bytesOut')), 'bytesOut'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('deviceId'))), 'devices'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('serverId'))), 'serversUsed']
      ],
      where: {
        userId: req.user.id,
        connectedAt: {
          [Op.gte]: new Date(currentYear, 0, 1)
        }
      },
      group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('connectedAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('connectedAt')), 'ASC']]
    });
    
    res.json({ usage: monthlyUsage });
  } catch (error) {
    next(error);
  }
});

router.get('/locations', async (req, res, next) => {
  try {
    const locationStats = await VPNConnection.findAll({
      attributes: [
        [sequelize.col('VPNServer.country'), 'country'],
        [sequelize.col('VPNServer.city'), 'city'],
        [sequelize.fn('COUNT', sequelize.col('VPNConnection.id')), 'connections'],
        [sequelize.fn('SUM', sequelize.col('bytesIn')), 'bytesIn'],
        [sequelize.fn('SUM', sequelize.col('bytesOut')), 'bytesOut']
      ],
      where: {
        userId: req.user.id,
        status: 'disconnected'
      },
      include: [{
        model: VPNServer,
        attributes: []
      }],
      group: ['VPNServer.country', 'VPNServer.city'],
      order: [[sequelize.fn('COUNT', sequelize.col('VPNConnection.id')), 'DESC']]
    });
    
    res.json({ locations: locationStats });
  } catch (error) {
    next(error);
  }
});

router.get('/devices', async (req, res, next) => {
  try {
    const devices = await VPNConnection.findAll({
      attributes: [
        'deviceId',
        'deviceName',
        [sequelize.fn('MAX', sequelize.col('connectedAt')), 'lastSeen'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalConnections'],
        [sequelize.fn('SUM', sequelize.col('bytesIn')), 'totalBytesIn'],
        [sequelize.fn('SUM', sequelize.col('bytesOut')), 'totalBytesOut']
      ],
      where: { userId: req.user.id },
      group: ['deviceId', 'deviceName'],
      order: [[sequelize.fn('MAX', sequelize.col('connectedAt')), 'DESC']]
    });
    
    res.json({ devices });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const [
      totalData,
      totalConnections,
      uniqueServers,
      subscription
    ] = await Promise.all([
      VPNConnection.findOne({
        attributes: [
          [sequelize.fn('SUM', sequelize.col('bytesIn')), 'totalBytesIn'],
          [sequelize.fn('SUM', sequelize.col('bytesOut')), 'totalBytesOut']
        ],
        where: { userId: req.user.id }
      }),
      VPNConnection.count({
        where: { userId: req.user.id }
      }),
      VPNConnection.count({
        distinct: true,
        col: 'serverId',
        where: { userId: req.user.id }
      }),
      Subscription.findOne({
        where: { userId: req.user.id }
      })
    ]);
    
    const totalBytes = (parseInt(totalData?.totalBytesIn || 0) + parseInt(totalData?.totalBytesOut || 0));
    const dataLimit = subscription?.features?.dataLimit || 0;
    
    res.json({
      summary: {
        totalDataUsed: totalBytes,
        dataLimit: dataLimit * 1073741824,
        dataUsagePercentage: dataLimit > 0 ? (totalBytes / (dataLimit * 1073741824) * 100).toFixed(2) : 0,
        totalConnections,
        uniqueServersUsed: uniqueServers,
        accountCreated: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;