const { Sequelize } = require('sequelize');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Redis = require('ioredis-mock');

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32chars';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock external services
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123' })
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_test_client_secret'
          }
        }
      }),
      update: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123' })
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_test123', status: 'active' } }
      })
    }
  }));
});

// Test database setup
let sequelize;
let mongoServer;

beforeAll(async () => {
  // Setup test database
  sequelize = new Sequelize('sqlite::memory:', {
    logging: false,
    define: {
      timestamps: true
    }
  });

  // Import models
  const { User, Subscription, VPNServer, VPNConnection } = require('../models');
  
  // Sync database
  await sequelize.sync({ force: true });
  
  // Setup Redis mock
  global.redis = new Redis();
});

afterAll(async () => {
  if (sequelize) {
    await sequelize.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  // Clean database before each test
  if (sequelize) {
    await sequelize.truncate({ cascade: true, restartIdentity: true });
  }
  
  // Clear Redis mock
  if (global.redis) {
    global.redis.flushall();
  }
  
  // Reset all mocks
  jest.clearAllMocks();
});

// Test utilities
global.testUtils = {
  // Create test user
  createTestUser: async (userData = {}) => {
    const { User } = require('../models');
    const defaultData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Test123!@#',
      role: 'user',
      status: 'active',
      emailVerified: true
    };
    
    return await User.create({ ...defaultData, ...userData });
  },

  // Create test admin
  createTestAdmin: async (userData = {}) => {
    return await global.testUtils.createTestUser({
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
      ...userData
    });
  },

  // Create test server
  createTestServer: async (serverData = {}) => {
    const { VPNServer } = require('../models');
    const defaultData = {
      name: 'Test Server',
      region: 'us-east-1',
      country: 'US',
      city: 'New York',
      ipAddress: '192.168.1.1',
      hostname: 'test.undertheradar.work',
      port: 51820,
      protocol: 'wireguard',
      status: 'active',
      maxUsers: 1000
    };
    
    return await VPNServer.create({ ...defaultData, ...serverData });
  },

  // Generate JWT token
  generateToken: (userId, role = 'user') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { id: userId, role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock request/response
  mockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ip: '127.0.0.1',
    get: jest.fn(),
    ...overrides
  }),

  mockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    return res;
  },

  // Validate response structure
  validateApiResponse: (response, expectedFields = []) => {
    expect(response).toHaveProperty('status');
    expectedFields.forEach(field => {
      expect(response).toHaveProperty(field);
    });
  },

  // Mock external API calls
  mockExternalAPI: (url, response) => {
    const nock = require('nock');
    return nock(url).get('/').reply(200, response);
  }
};

// Custom matchers
expect.extend({
  toBeValidUUID: (received) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
      pass
    };
  },

  toBeValidEmail: (received) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
      pass
    };
  },

  toHaveValidationError: (received, field) => {
    const hasError = received.body?.error === 'Validation failed' &&
                    received.body?.details?.some(detail => detail.field === field);
    
    return {
      message: () => `expected response ${hasError ? 'not ' : ''}to have validation error for field ${field}`,
      pass: hasError
    };
  }
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = {
  sequelize,
  testUtils: global.testUtils
};