const express = require('express');
const { User, Subscription, VPNConnection } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/profile', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{
        model: Subscription,
        attributes: ['plan', 'status', 'currentPeriodEnd', 'features']
      }]
    });
    
    res.json({ user: user.toJSON() });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const allowedUpdates = ['username', 'email'];
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});
    
    await req.user.update(updates);
    res.json({ user: req.user.toJSON() });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!(await req.user.comparePassword(currentPassword))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    req.user.password = newPassword;
    await req.user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/connections', async (req, res, next) => {
  try {
    const connections = await VPNConnection.findAll({
      where: { userId: req.user.id },
      include: [{
        model: VPNServer,
        attributes: ['name', 'country', 'city']
      }],
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    
    res.json({ connections });
  } catch (error) {
    next(error);
  }
});

router.get('/usage', async (req, res, next) => {
  try {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const usage = await VPNConnection.sum('bytesIn', {
      where: {
        userId: req.user.id,
        connectedAt: {
          [Op.between]: [startDate, endDate]
        }
      }
    }) + await VPNConnection.sum('bytesOut', {
      where: {
        userId: req.user.id,
        connectedAt: {
          [Op.between]: [startDate, endDate]
        }
      }
    });
    
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id }
    });
    
    res.json({
      usage: {
        month,
        year,
        totalBytes: usage || 0,
        limit: subscription?.features?.dataLimit || 0,
        percentage: subscription?.features?.dataLimit ? 
          ((usage || 0) / (subscription.features.dataLimit * 1073741824) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;