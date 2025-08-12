const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const xss = require('xss');

class SecurityConfig {
  static getSecurityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "https://api.stripe.com"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' }
    });
  }

  static getRateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
    return rateLimit({
      windowMs,
      max,
      message: {
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
    });
  }

  static getStrictRateLimiter(windowMs = 15 * 60 * 1000, max = 5) {
    return this.getRateLimiter(windowMs, max);
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return xss(validator.escape(input), {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
  }

  static generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  static hashPassword(password, salt = null) {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512');
    return {
      salt: actualSalt,
      hash: hash.toString('hex')
    };
  }

  static verifyPassword(password, salt, hash) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), verifyHash);
  }

  static validateEnvironment() {
    const required = [
      'DATABASE_URL',
      'JWT_SECRET',
      'REDIS_URL',
      'STRIPE_SECRET_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }

    if (process.env.NODE_ENV === 'production' && 
        process.env.DATABASE_URL.includes('localhost')) {
      throw new Error('Production database cannot be localhost');
    }
  }
}

module.exports = SecurityConfig;