const winston = require('winston');
const { ElasticsearchTransport } = require('winston-elasticsearch');
const { performance } = require('perf_hooks');
const os = require('os');
const v8 = require('v8');

class MonitoringService {
  constructor() {
    this.metrics = new Map();
    this.alerts = new Map();
    this.healthChecks = new Map();
    
    this.setupLogger();
    this.setupMetricsCollection();
    this.setupHealthChecks();
    
    // Start periodic collection
    this.startMetricsCollection();
  }

  setupLogger() {
    const transports = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        )
      }),
      
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    ];

    // Add Elasticsearch transport in production
    if (process.env.ELASTICSEARCH_URL) {
      transports.push(new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: process.env.ELASTICSEARCH_URL,
          auth: {
            username: process.env.ELASTICSEARCH_USER,
            password: process.env.ELASTICSEARCH_PASSWORD
          }
        },
        index: 'undertheradar-vpn-logs'
      }));
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports,
      exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' })
      ],
      rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' })
      ]
    });
  }

  setupMetricsCollection() {
    // Request metrics
    this.requestMetrics = {
      count: 0,
      errors: 0,
      totalTime: 0,
      byEndpoint: new Map(),
      byStatusCode: new Map()
    };

    // System metrics
    this.systemMetrics = {
      memory: { used: 0, free: 0, total: 0 },
      cpu: { usage: 0 },
      connections: { active: 0, total: 0 },
      database: { connections: 0, queries: 0, errors: 0 }
    };
  }

  setupHealthChecks() {
    this.healthChecks.set('database', async () => {
      try {
        const { sequelize } = require('../config/database');
        await sequelize.authenticate();
        return { status: 'healthy', latency: 0 };
      } catch (error) {
        return { status: 'unhealthy', error: error.message };
      }
    });

    this.healthChecks.set('redis', async () => {
      try {
        const redis = require('../config/redis');
        const start = performance.now();
        await redis.ping();
        const latency = performance.now() - start;
        return { status: 'healthy', latency };
      } catch (error) {
        return { status: 'unhealthy', error: error.message };
      }
    });

    this.healthChecks.set('external_apis', async () => {
      try {
        // Check Stripe API
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.accounts.retrieve();
        return { status: 'healthy' };
      } catch (error) {
        return { status: 'degraded', error: error.message };
      }
    });
  }

  // Middleware for request tracking
  trackRequest() {
    return (req, res, next) => {
      const start = performance.now();
      const originalSend = res.send;

      res.send = function(data) {
        const duration = performance.now() - start;
        
        // Update metrics
        this.requestMetrics.count++;
        this.requestMetrics.totalTime += duration;
        
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        const endpointMetrics = this.requestMetrics.byEndpoint.get(endpoint) || 
          { count: 0, totalTime: 0, errors: 0 };
        
        endpointMetrics.count++;
        endpointMetrics.totalTime += duration;
        
        if (res.statusCode >= 400) {
          this.requestMetrics.errors++;
          endpointMetrics.errors++;
        }
        
        this.requestMetrics.byEndpoint.set(endpoint, endpointMetrics);
        
        const statusMetrics = this.requestMetrics.byStatusCode.get(res.statusCode) || 0;
        this.requestMetrics.byStatusCode.set(res.statusCode, statusMetrics + 1);

        // Log slow requests
        if (duration > 1000) {
          this.logger.warn('Slow request detected', {
            method: req.method,
            path: req.path,
            duration,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          });
        }

        // Log errors
        if (res.statusCode >= 500) {
          this.logger.error('Server error', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            userId: req.user?.id
          });
        }

        originalSend.call(this, data);
      }.bind(this);

      next();
    }.bind(this);
  }

  // Security event logging
  logSecurityEvent(event, details = {}) {
    this.logger.warn('Security event', {
      event,
      ...details,
      timestamp: new Date().toISOString(),
      severity: 'high'
    });

    // Trigger alerts if needed
    this.checkSecurityAlerts(event, details);
  }

  checkSecurityAlerts(event, details) {
    const alertRules = {
      'failed_login_attempts': { threshold: 5, window: 300000 }, // 5 attempts in 5 minutes
      'rate_limit_exceeded': { threshold: 10, window: 600000 },  // 10 times in 10 minutes
      'admin_action': { threshold: 1, window: 0 }                // Immediate alert
    };

    const rule = alertRules[event];
    if (!rule) return;

    const key = `${event}:${details.ip || details.userId || 'unknown'}`;
    const now = Date.now();
    const events = this.alerts.get(key) || [];
    
    // Clean old events
    const recentEvents = events.filter(time => now - time < rule.window);
    recentEvents.push(now);
    
    this.alerts.set(key, recentEvents);

    if (recentEvents.length >= rule.threshold) {
      this.sendAlert(event, { ...details, count: recentEvents.length });
      this.alerts.delete(key); // Reset after alert
    }
  }

  async sendAlert(event, details) {
    // In production, this would send to Slack, PagerDuty, etc.
    this.logger.error('ALERT TRIGGERED', {
      alert: event,
      details,
      timestamp: new Date().toISOString()
    });

    // You could integrate with external alerting services here
    if (process.env.SLACK_WEBHOOK_URL) {
      // Send to Slack
    }
    
    if (process.env.PAGERDUTY_API_KEY) {
      // Send to PagerDuty for critical alerts
    }
  }

  // System metrics collection
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.systemMetrics.memory = {
      used: memUsage.heapUsed,
      free: os.freemem(),
      total: os.totalmem(),
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    };

    this.systemMetrics.cpu = {
      usage: process.cpuUsage(cpuUsage),
      loadAvg: os.loadavg()
    };

    // V8 heap statistics
    this.systemMetrics.v8 = v8.getHeapStatistics();
  }

  startMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Log metrics summary every 5 minutes
    setInterval(() => {
      this.logMetricsSummary();
    }, 300000);
  }

  logMetricsSummary() {
    const avgResponseTime = this.requestMetrics.count > 0 
      ? this.requestMetrics.totalTime / this.requestMetrics.count 
      : 0;

    const errorRate = this.requestMetrics.count > 0 
      ? (this.requestMetrics.errors / this.requestMetrics.count) * 100 
      : 0;

    this.logger.info('Metrics Summary', {
      requests: {
        total: this.requestMetrics.count,
        errors: this.requestMetrics.errors,
        errorRate: `${errorRate.toFixed(2)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`
      },
      system: {
        memoryUsed: `${Math.round(this.systemMetrics.memory.used / 1024 / 1024)}MB`,
        memoryFree: `${Math.round(this.systemMetrics.memory.free / 1024 / 1024)}MB`,
        loadAvg: this.systemMetrics.cpu.loadAvg
      }
    });
  }

  // Health check endpoint
  async getHealthStatus() {
    const results = {};
    const checks = Array.from(this.healthChecks.entries());
    
    const healthPromises = checks.map(async ([name, check]) => {
      try {
        const result = await Promise.race([
          check(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        results[name] = result;
      } catch (error) {
        results[name] = { status: 'unhealthy', error: error.message };
      }
    });

    await Promise.all(healthPromises);

    const overall = Object.values(results).every(r => r.status === 'healthy') 
      ? 'healthy' 
      : Object.values(results).some(r => r.status === 'unhealthy') 
        ? 'unhealthy' 
        : 'degraded';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      checks: results,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  // Get current metrics
  getMetrics() {
    return {
      requests: this.requestMetrics,
      system: this.systemMetrics,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new MonitoringService();