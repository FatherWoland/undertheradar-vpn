const express = require('express');
const { Op } = require('sequelize');
const { User, Subscription, VPNServer, VPNConnection } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);
router.use(authorize(['admin']));

router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalServers,
      activeConnections,
      revenueStats
    ] = await Promise.all([
      User.count(),
      User.count({ where: { status: 'active' } }),
      VPNServer.count(),
      VPNConnection.count({ where: { status: 'connected' } }),
      Subscription.findAll({
        attributes: [
          'plan',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'active' THEN 1 ELSE 0 END")), 'active']
        ],
        group: ['plan']
      })
    ]);
    
    res.json({
      stats: {
        totalUsers,
        activeUsers,
        totalServers,
        activeConnections
      },
      revenue: revenueStats
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (status) {
      whereClause.status = status;
    }
    
    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      include: [{
        model: Subscription,
        attributes: ['plan', 'status', 'currentPeriodEnd']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      users: rows,
      total: count,
      pages: Math.ceil(count / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = status;
    await user.save();
    
    logger.info(`Admin changed user ${user.email} status to ${status}`);
    
    res.json({ message: 'User status updated', user: user.toJSON() });
  } catch (error) {
    next(error);
  }
});

router.get('/servers', async (req, res, next) => {
  try {
    const servers = await VPNServer.findAll({
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM "VPNConnections"
              WHERE "VPNConnections"."serverId" = "VPNServer"."id"
              AND "VPNConnections"."status" = 'connected'
            )`),
            'activeConnections'
          ]
        ]
      },
      order: [['region', 'ASC'], ['name', 'ASC']]
    });
    
    res.json({ servers });
  } catch (error) {
    next(error);
  }
});

router.post('/servers', async (req, res, next) => {
  try {
    const server = await VPNServer.create(req.body);
    logger.info(`Admin created new VPN server: ${server.name}`);
    res.status(201).json({ server });
  } catch (error) {
    next(error);
  }
});

router.put('/servers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const server = await VPNServer.findByPk(id);
    
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    
    await server.update(req.body);
    logger.info(`Admin updated VPN server: ${server.name}`);
    
    res.json({ server });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate) dateFilter[Op.gte] = new Date(startDate);
    if (endDate) dateFilter[Op.lte] = new Date(endDate);
    
    const [
      userGrowth,
      connectionStats,
      dataUsage
    ] = await Promise.all([
      User.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: dateFilter.length ? { createdAt: dateFilter } : {},
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
      }),
      VPNConnection.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('connectedAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'connections'],
          [sequelize.fn('SUM', sequelize.col('bytesIn')), 'totalBytesIn'],
          [sequelize.fn('SUM', sequelize.col('bytesOut')), 'totalBytesOut']
        ],
        where: dateFilter.length ? { connectedAt: dateFilter } : {},
        group: [sequelize.fn('DATE', sequelize.col('connectedAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('connectedAt')), 'ASC']]
      }),
      VPNServer.findAll({
        attributes: ['region', 'country', 'load', 'currentUsers'],
        include: [{
          model: VPNConnection,
          attributes: [],
          where: { status: 'connected' },
          required: false
        }]
      })
    ]);
    
    res.json({
      userGrowth,
      connectionStats,
      serverLoad: dataUsage
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;