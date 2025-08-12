const express = require('express');
const { VPNServer, VPNConnection } = require('../models');
const { authenticate } = require('../middleware/auth');
const { generateWireGuardConfig } = require('../services/vpnService');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { region, protocol } = req.query;
    
    const whereClause = { status: 'active' };
    if (region) whereClause.region = region;
    if (protocol) whereClause.protocol = protocol;
    
    const servers = await VPNServer.findAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'country', 'city', 'region', 
        'load', 'protocol', 'ipAddress', 'port'
      ],
      order: [['load', 'ASC'], ['name', 'ASC']]
    });
    
    const serversWithAvailability = servers.map(server => ({
      ...server.toJSON(),
      available: server.isAvailable()
    }));
    
    res.json({ servers: serversWithAvailability });
  } catch (error) {
    next(error);
  }
});

router.get('/regions', async (req, res, next) => {
  try {
    const regions = await VPNServer.findAll({
      attributes: [
        'region',
        'country',
        [sequelize.fn('COUNT', sequelize.col('id')), 'serverCount'],
        [sequelize.fn('AVG', sequelize.col('load')), 'avgLoad']
      ],
      where: { status: 'active' },
      group: ['region', 'country'],
      order: [['region', 'ASC']]
    });
    
    res.json({ regions });
  } catch (error) {
    next(error);
  }
});

router.post('/connect', async (req, res, next) => {
  try {
    const { serverId, deviceId, deviceName } = req.body;
    
    const server = await VPNServer.findByPk(serverId);
    if (!server || !server.isAvailable()) {
      return res.status(400).json({ error: 'Server not available' });
    }
    
    const activeConnection = await VPNConnection.findOne({
      where: {
        userId: req.user.id,
        deviceId,
        status: 'connected'
      }
    });
    
    if (activeConnection) {
      return res.status(400).json({ 
        error: 'Device already connected to a server',
        currentServer: activeConnection.serverId
      });
    }
    
    const config = await generateWireGuardConfig(req.user.id, serverId, deviceId);
    
    const connection = await VPNConnection.create({
      userId: req.user.id,
      serverId,
      deviceId,
      deviceName,
      status: 'connecting',
      publicKey: config.publicKey,
      assignedIp: config.clientIp
    });
    
    server.currentUsers += 1;
    await server.save();
    
    res.json({
      connection,
      config: {
        ...config,
        serverEndpoint: `${server.ipAddress}:${server.port}`
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/disconnect', async (req, res, next) => {
  try {
    const { connectionId } = req.body;
    
    const connection = await VPNConnection.findOne({
      where: {
        id: connectionId,
        userId: req.user.id,
        status: 'connected'
      },
      include: [VPNServer]
    });
    
    if (!connection) {
      return res.status(404).json({ error: 'Active connection not found' });
    }
    
    connection.status = 'disconnected';
    connection.disconnectedAt = new Date();
    await connection.save();
    
    if (connection.VPNServer) {
      connection.VPNServer.currentUsers = Math.max(0, connection.VPNServer.currentUsers - 1);
      await connection.VPNServer.save();
    }
    
    res.json({ 
      message: 'Disconnected successfully',
      connection 
    });
  } catch (error) {
    next(error);
  }
});

router.get('/optimal', async (req, res, next) => {
  try {
    const { latitude, longitude } = req.query;
    
    const servers = await VPNServer.findAll({
      where: { 
        status: 'active',
        load: { [Op.lt]: 80 }
      },
      order: [['load', 'ASC']],
      limit: 5
    });
    
    const optimal = servers.find(server => server.isAvailable());
    
    if (!optimal) {
      return res.status(503).json({ error: 'No servers available' });
    }
    
    res.json({ server: optimal });
  } catch (error) {
    next(error);
  }
});

module.exports = router;