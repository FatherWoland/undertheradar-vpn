const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const QRCode = require('qrcode');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        }),
        new winston.transports.File({ filename: 'vpn-server.log' })
    ]
});

// Database setup
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false
});

// User model
const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    subscriptionType: {
        type: DataTypes.ENUM('trial', 'basic', 'premium'),
        defaultValue: 'trial'
    },
    subscriptionExpiry: {
        type: DataTypes.DATE
    },
    dataUsed: {
        type: DataTypes.BIGINT,
        defaultValue: 0
    },
    lastLogin: {
        type: DataTypes.DATE
    }
});

// VPN Client model
const VPNClient = sequelize.define('VPNClient', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    publicKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    privateKey: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    lastSeen: {
        type: DataTypes.DATE
    },
    dataTransferred: {
        type: DataTypes.BIGINT,
        defaultValue: 0
    }
});

// Associations
User.hasMany(VPNClient, { foreignKey: 'userId' });
VPNClient.belongsTo(User, { foreignKey: 'userId' });

// Express app setup
const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Auth middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId);
        
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid or inactive user' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Utility functions
const generateWGKeys = async () => {
    return new Promise((resolve, reject) => {
        exec('wg genkey', (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const privateKey = stdout.trim();
            
            exec(`echo "${privateKey}" | wg pubkey`, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                const publicKey = stdout.trim();
                resolve({ privateKey, publicKey });
            });
        });
    });
};

const getNextAvailableIP = async () => {
    const usedIPs = await VPNClient.findAll({
        attributes: ['ipAddress'],
        where: { isActive: true }
    });
    
    const usedIPSet = new Set(usedIPs.map(client => client.ipAddress));
    
    // Start from 10.66.66.2 (server uses .1)
    for (let i = 2; i <= 254; i++) {
        const ip = `10.66.66.${i}`;
        if (!usedIPSet.has(ip)) {
            return ip;
        }
    }
    
    throw new Error('No available IP addresses');
};

const updateWireGuardConfig = async () => {
    try {
        const clients = await VPNClient.findAll({
            where: { isActive: true },
            include: [{ model: User, where: { isActive: true } }]
        });

        let configContent = await fs.readFile(process.env.WG_CONFIG_PATH, 'utf8');
        
        // Remove existing peer sections
        configContent = configContent.split('[Peer]')[0];

        // Add active peers
        for (const client of clients) {
            configContent += `\n[Peer]
PublicKey = ${client.publicKey}
AllowedIPs = ${client.ipAddress}/32
`;
        }

        await fs.writeFile(process.env.WG_CONFIG_PATH, configContent);
        
        // Reload WireGuard configuration
        return new Promise((resolve, reject) => {
            exec('wg syncconf wg0 <(wg-quick strip wg0)', { shell: '/bin/bash' }, (error) => {
                if (error) {
                    logger.error('Failed to reload WireGuard config:', error);
                    reject(error);
                } else {
                    logger.info('WireGuard configuration reloaded');
                    resolve();
                }
            });
        });
    } catch (error) {
        logger.error('Error updating WireGuard config:', error);
        throw error;
    }
};

const generateClientConfig = (client, serverEndpoint) => {
    return `[Interface]
PrivateKey = ${client.privateKey}
Address = ${client.ipAddress}/24
DNS = ${process.env.DNS_SERVERS || '1.1.1.1, 1.0.0.1'}

[Peer]
PublicKey = ${process.env.SERVER_PUBLIC_KEY}
Endpoint = ${serverEndpoint}
AllowedIPs = ${process.env.ALLOWED_IPS || '0.0.0.0/0, ::/0'}
PersistentKeepalive = 25`;
};

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public registration
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Set trial expiry to 7 days from now
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + 7);

        const user = await User.create({
            email,
            password: hashedPassword,
            subscriptionType: 'trial',
            subscriptionExpiry: trialExpiry
        });

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        logger.info(`New user registered: ${email}`);

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                subscriptionType: user.subscriptionType,
                subscriptionExpiry: user.subscriptionExpiry
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ error: 'Account deactivated' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        logger.info(`User logged in: ${email}`);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                isAdmin: user.isAdmin,
                subscriptionType: user.subscriptionType,
                subscriptionExpiry: user.subscriptionExpiry
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] },
            include: [{
                model: VPNClient,
                where: { isActive: true },
                required: false
            }]
        });

        res.json({ user });
    } catch (error) {
        logger.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create VPN client
app.post('/api/clients', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Client name required' });
        }

        // Check subscription limits
        const clientCount = await VPNClient.count({
            where: { userId: req.user.id, isActive: true }
        });

        const limits = {
            trial: 1,
            basic: 3,
            premium: 10
        };

        if (clientCount >= limits[req.user.subscriptionType]) {
            return res.status(400).json({ 
                error: `Subscription limit reached. ${req.user.subscriptionType} allows ${limits[req.user.subscriptionType]} devices.` 
            });
        }

        // Generate WireGuard keys
        const keys = await generateWGKeys();
        const ipAddress = await getNextAvailableIP();

        const client = await VPNClient.create({
            userId: req.user.id,
            name,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
            ipAddress
        });

        // Update WireGuard configuration
        await updateWireGuardConfig();

        logger.info(`New VPN client created: ${name} for user ${req.user.email}`);

        res.status(201).json({
            message: 'VPN client created successfully',
            client: {
                id: client.id,
                name: client.name,
                ipAddress: client.ipAddress,
                createdAt: client.createdAt
            }
        });
    } catch (error) {
        logger.error('Client creation error:', error);
        res.status(500).json({ error: 'Failed to create VPN client' });
    }
});

// Get client configuration
app.get('/api/clients/:id/config', authenticateToken, async (req, res) => {
    try {
        const client = await VPNClient.findOne({
            where: {
                id: req.params.id,
                userId: req.user.id,
                isActive: true
            }
        });

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const config = generateClientConfig(client, process.env.SERVER_ENDPOINT);

        res.json({ config });
    } catch (error) {
        logger.error('Config fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});

// Get client QR code
app.get('/api/clients/:id/qr', authenticateToken, async (req, res) => {
    try {
        const client = await VPNClient.findOne({
            where: {
                id: req.params.id,
                userId: req.user.id,
                isActive: true
            }
        });

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const config = generateClientConfig(client, process.env.SERVER_ENDPOINT);
        const qrCode = await QRCode.toDataURL(config);

        res.json({ qrCode });
    } catch (error) {
        logger.error('QR code generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Delete client
app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    try {
        const client = await VPNClient.findOne({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        client.isActive = false;
        await client.save();

        // Update WireGuard configuration
        await updateWireGuardConfig();

        logger.info(`VPN client deleted: ${client.name} for user ${req.user.email}`);

        res.json({ message: 'Client deleted successfully' });
    } catch (error) {
        logger.error('Client deletion error:', error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});

// Admin routes
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [totalUsers, activeUsers, totalClients, activeClients] = await Promise.all([
            User.count(),
            User.count({ where: { isActive: true } }),
            VPNClient.count(),
            VPNClient.count({ where: { isActive: true } })
        ]);

        const subscriptionStats = await User.findAll({
            attributes: [
                'subscriptionType',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['subscriptionType']
        });

        res.json({
            totalUsers,
            activeUsers,
            totalClients,
            activeClients,
            subscriptionStats
        });
    } catch (error) {
        logger.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const { count, rows } = await User.findAndCountAll({
            attributes: { exclude: ['password'] },
            include: [{
                model: VPNClient,
                attributes: ['id', 'name', 'isActive', 'lastSeen'],
                required: false
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
        logger.error('Admin users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Create admin user (for initial setup)
app.post('/api/admin/create', async (req, res) => {
    try {
        // Check if admin already exists
        const existingAdmin = await User.findOne({ where: { isAdmin: true } });
        if (existingAdmin) {
            return res.status(400).json({ error: 'Admin user already exists' });
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await User.create({
            email,
            password: hashedPassword,
            isAdmin: true,
            subscriptionType: 'premium',
            subscriptionExpiry: new Date('2099-12-31') // Never expires
        });

        logger.info(`Admin user created: ${email}`);

        res.status(201).json({
            message: 'Admin user created successfully',
            admin: {
                id: admin.id,
                email: admin.email,
                isAdmin: admin.isAdmin
            }
        });
    } catch (error) {
        logger.error('Admin creation error:', error);
        res.status(500).json({ error: 'Failed to create admin user' });
    }
});

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        // Test database connection
        await sequelize.authenticate();
        logger.info('Database connection established');

        // Sync database
        await sequelize.sync({ alter: true });
        logger.info('Database synchronized');

        // Start server
        app.listen(PORT, () => {
            logger.info(`UnderTheRadar VPN Server running on port ${PORT}`);
            logger.info(`Server endpoint: ${process.env.SERVER_ENDPOINT}`);
            logger.info('🚀 VPN service is ready!');
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();