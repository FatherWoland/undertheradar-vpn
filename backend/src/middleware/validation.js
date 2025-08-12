const Joi = require('joi');
const SecurityConfig = require('../config/security');

const schemas = {
  auth: {
    login: Joi.object({
      email: Joi.string().email().required().max(255),
      password: Joi.string().min(8).max(128).required()
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
        .message('Password must contain at least one uppercase letter, lowercase letter, number and special character'),
      rememberMe: Joi.boolean().optional()
    }),
    
    register: Joi.object({
      email: Joi.string().email().required().max(255),
      username: Joi.string().alphanum().min(3).max(30).required(),
      password: Joi.string().min(8).max(128).required()
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
        .message('Password must contain at least one uppercase letter, lowercase letter, number and special character'),
      confirmPassword: Joi.string().valid(Joi.ref('password')).required()
        .messages({ 'any.only': 'Passwords must match' }),
      acceptTerms: Joi.boolean().valid(true).required()
    }),

    changePassword: Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).max(128).required()
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
        .message('Password must contain at least one uppercase letter, lowercase letter, number and special character'),
      confirmNewPassword: Joi.string().valid(Joi.ref('newPassword')).required()
    })
  },

  user: {
    update: Joi.object({
      username: Joi.string().alphanum().min(3).max(30).optional(),
      email: Joi.string().email().max(255).optional(),
      firstName: Joi.string().max(50).optional(),
      lastName: Joi.string().max(50).optional()
    }),

    adminUpdate: Joi.object({
      status: Joi.string().valid('active', 'suspended', 'cancelled').required(),
      reason: Joi.string().max(500).optional()
    })
  },

  subscription: {
    create: Joi.object({
      plan: Joi.string().valid('basic', 'pro', 'business').required(),
      paymentMethodId: Joi.string().required(),
      couponCode: Joi.string().max(50).optional()
    }),

    upgrade: Joi.object({
      newPlan: Joi.string().valid('basic', 'pro', 'business').required()
    })
  },

  server: {
    connect: Joi.object({
      serverId: Joi.string().uuid().required(),
      deviceId: Joi.string().max(100).required(),
      deviceName: Joi.string().max(100).optional(),
      clientPublicKey: Joi.string().length(44).required() // Base64 WireGuard key
    }),

    create: Joi.object({
      name: Joi.string().max(100).required(),
      region: Joi.string().max(50).required(),
      country: Joi.string().length(2).required(), // ISO country code
      city: Joi.string().max(100).required(),
      ipAddress: Joi.string().ip().required(),
      hostname: Joi.string().hostname().required(),
      port: Joi.number().integer().min(1).max(65535).default(51820),
      protocol: Joi.string().valid('wireguard', 'openvpn', 'ipsec').default('wireguard'),
      maxUsers: Joi.number().integer().min(1).max(10000).default(1000)
    })
  },

  analytics: {
    dateRange: Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
      days: Joi.number().integer().min(1).max(365).optional()
    })
  }
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Sanitize all string inputs
    req.validatedBody = sanitizeObject(value);
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Query validation failed',
        details: errors
      });
    }

    req.validatedQuery = sanitizeObject(value);
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      return res.status(400).json({
        error: 'Parameter validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    req.validatedParams = value;
    next();
  };
};

function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return SecurityConfig.sanitizeInput(obj);
  }
  
  return obj;
}

module.exports = {
  schemas,
  validate,
  validateQuery,
  validateParams,
  sanitizeObject
};