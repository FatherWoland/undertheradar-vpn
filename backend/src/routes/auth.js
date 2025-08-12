const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, username } = req.body;
    
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists with this email or username' 
      });
    }
    
    const verificationToken = uuidv4();
    const user = await User.create({
      email,
      password,
      username,
      verificationToken
    });
    
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    logger.info(`New user registered: ${user.email}`);
    
    res.status(201).json({
      message: 'Registration successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ where: { email } });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: user.role === 'admin' ? process.env.ADMIN_JWT_EXPIRE : process.env.JWT_EXPIRE }
    );
    
    logger.info(`User logged in: ${user.email}`);
    
    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authenticate, async (req, res) => {
  logger.info(`User logged out: ${req.user.email}`);
  res.json({ message: 'Logout successful' });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    res.json({ token });
  } catch (error) {
    next(error);
  }
});

module.exports = router;