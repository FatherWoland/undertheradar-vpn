const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');

describe('Authentication', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'Test123!@#',
        confirmPassword: 'Test123!@#',
        acceptTerms: true
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Registration successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        email: userData.email,
        username: userData.username,
        role: 'user',
        status: 'active'
      });
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.token).toBeDefined();
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'weak',
        confirmPassword: 'weak',
        acceptTerms: true
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response).toHaveValidationError('password');
    });

    it('should reject registration with mismatched passwords', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'Test123!@#',
        confirmPassword: 'Different123!@#',
        acceptTerms: true
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response).toHaveValidationError('confirmPassword');
    });

    it('should reject registration without accepting terms', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'Test123!@#',
        confirmPassword: 'Test123!@#',
        acceptTerms: false
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response).toHaveValidationError('acceptTerms');
    });

    it('should reject duplicate email', async () => {
      const user = await testUtils.createTestUser();
      
      const userData = {
        email: user.email,
        username: 'differentuser',
        password: 'Test123!@#',
        confirmPassword: 'Test123!@#',
        acceptTerms: true
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should sanitize input data', async () => {
      const userData = {
        email: 'test@example.com',
        username: '<script>alert("xss")</script>',
        password: 'Test123!@#',
        confirmPassword: 'Test123!@#',
        acceptTerms: true
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.username).not.toContain('<script>');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await testUtils.createTestUser();
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'Test123!@#'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject login for suspended user', async () => {
      testUser.status = 'suspended';
      await testUser.save();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#'
        })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Account is not active');
    });

    it('should update last login timestamp', async () => {
      const beforeLogin = testUser.lastLogin;
      
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#'
        })
        .expect(200);

      await testUser.reload();
      expect(testUser.lastLogin).not.toEqual(beforeLogin);
    });

    it('should rate limit login attempts', async () => {
      const loginData = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      // Make multiple failed attempts
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(loginData);
      }

      // Should be rate limited now
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(429);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/me', () => {
    let testUser, authToken;

    beforeEach(async () => {
      testUser = await testUtils.createTestUser();
      authToken = testUtils.generateToken(testUser.id, testUser.role);
    });

    it('should return user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        username: testUser.username
      });
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Please authenticate');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Please authenticate');
    });

    it('should reject request for deleted user', async () => {
      await testUser.destroy();

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Please authenticate');
    });
  });

  describe('POST /api/auth/change-password', () => {
    let testUser, authToken;

    beforeEach(async () => {
      testUser = await testUtils.createTestUser();
      authToken = testUtils.generateToken(testUser.id, testUser.role);
    });

    it('should change password with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'Test123!@#',
          newPassword: 'NewTest123!@#',
          confirmNewPassword: 'NewTest123!@#'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Password changed successfully');

      // Verify can login with new password
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'NewTest123!@#'
        })
        .expect(200);
    });

    it('should reject with wrong current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPassword123!@#',
          newPassword: 'NewTest123!@#',
          confirmNewPassword: 'NewTest123!@#'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Current password is incorrect');
    });

    it('should reject weak new password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'Test123!@#',
          newPassword: 'weak',
          confirmNewPassword: 'weak'
        })
        .expect(400);

      expect(response).toHaveValidationError('newPassword');
    });
  });
});

describe('Authorization', () => {
  let regularUser, adminUser, regularToken, adminToken;

  beforeEach(async () => {
    regularUser = await testUtils.createTestUser();
    adminUser = await testUtils.createTestAdmin();
    regularToken = testUtils.generateToken(regularUser.id, 'user');
    adminToken = testUtils.generateToken(adminUser.id, 'admin');
  });

  it('should allow admin access to admin endpoints', async () => {
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('stats');
  });

  it('should deny user access to admin endpoints', async () => {
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${regularToken}`)
      .expect(403);

    expect(response.body).toHaveProperty('error', 'Access denied');
  });

  it('should allow user access to user endpoints', async () => {
    const response = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${regularToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('user');
  });
});