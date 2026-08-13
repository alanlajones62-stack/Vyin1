// backend/server.js - COMPLETO CON TODOS LOS MÓDULOS (VERIFICACIÓN, VYIN PAY, ASIGNACIÓN, MODERACIÓN, VYIN IA, BLOQUEOS, PUBLICIDAD)
// 🔥 CORREGIDO: Rutas de login, register y chat

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const os = require('os');

// ============================================================
// IMPORTAR IA CLASSIFIER
// ============================================================

const iaClassifier = require('./ia_classifier');

// ============================================================
// IMPORTAR NUEVOS MÓDULOS
// ============================================================

const ReportAssignment = require('./modules/assignments/report-assignment');
const StoryModeration = require('./modules/moderation/story-moderation');
const UserNotifications = require('./modules/notifications/user-notifications');

// ============================================================
// 🔥 SISTEMA DE ADMINISTRADORES UNIFICADO
// ============================================================

const adminConfig = require('./config/admin-config');

// ============================================================
// 🔥 VYIN IA - CONFIGURACIÓN
// ============================================================

const { setupVyinRoutes } = require('./config/vyin-config');

const app = express();
const server = http.createServer(app);

// ============================================================
// 🔥 CONFIGURACIÓN CORS
// ============================================================

const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Content-Type-Options'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ============================================================
// 🔥 SOCKET.IO CON CORS
// ============================================================

const io = socketIO(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    }, 
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// ========== LOGGER CONFIGURATION ==========
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ========== MIDDLEWARES ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// 🔥 CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS
// ============================================================

const FRONTEND_DIR = path.join(__dirname, '../frontend');
const MOBILE_DIR = path.join(__dirname, '../frontend/mobile');
const UPLOADS_DIR = path.join(FRONTEND_DIR, 'uploads');

// Crear carpetas si no existen
if (!fs.existsSync(FRONTEND_DIR)) fs.mkdirSync(FRONTEND_DIR, { recursive: true });
if (!fs.existsSync(MOBILE_DIR)) fs.mkdirSync(MOBILE_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ============================================================
// 🔥 MIDDLEWARE PARA HEADERS
// ============================================================

app.use((req, res, next) => {
    const url = req.url || req.path || '';
    
    const isJs = url.endsWith('.js') || url.endsWith('.mjs') || 
                 url.includes('.js?') || url.includes('.mjs?') ||
                 url.match(/\/feed\/.*\.js/) ||
                 url.match(/\.js($|\?)/);
    
    if (isJs) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    if (url.endsWith('.css') || url.includes('.css?')) {
        res.setHeader('Content-Type', 'text/css');
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    
    if (url.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    next();
});

// ============================================================
// 🔥 ARCHIVOS JS
// ============================================================

app.get(/.*\.js$/, (req, res) => {
    const cleanPath = req.path || req.url.split('?')[0];
    
    const locations = [
        path.join(FRONTEND_DIR, cleanPath),
        path.join(FRONTEND_DIR, 'feed', path.basename(cleanPath)),
        path.join(FRONTEND_DIR, 'feed', cleanPath.replace(/^\/feed\//, '')),
        path.join(MOBILE_DIR, cleanPath.replace(/^\/mobile\//, '')),
        path.join(MOBILE_DIR, 'components', path.basename(cleanPath)),
        path.join(__dirname, '..', cleanPath)
    ];
    
    for (const filePath of locations) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.sendFile(filePath);
            return;
        }
    }
    
    res.status(404).send('File not found');
});

// ============================================================
// 🔥 ARCHIVOS ESTÁTICOS
// ============================================================

// Frontend principal
app.use(express.static(FRONTEND_DIR, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || 
            filePath.endsWith('.cjs') || filePath.endsWith('.jsm')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
        }
        
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return;
        }
        
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            return;
        }
        
        if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return;
        }
        
        if (filePath.match(/\.(woff|woff2|ttf|eot|otf)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return;
        }
    }
}));

// Mobile
app.use('/mobile', express.static(MOBILE_DIR, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return;
        }
        
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            return;
        }
    }
}));

// Uploads
app.use('/uploads', express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// ============================================================
// 🔥 COMPRESSION
// ============================================================

app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// ============================================================
// 🔥 CACHÉ
// ============================================================

class Cache {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 30000;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, {
            value: value,
            expires: Date.now() + ttl
        });
    }

    invalidatePattern(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()).slice(0, 20)
        };
    }
}

const cache = new Cache();

// ========== DATA FOLDER ==========
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ========== FUNCIONES DE LECTURA/ESCRITURA ==========
const read = (file) => {
    try {
        const cacheKey = `file_${file}`;
        const cached = cache.get(cacheKey);
        if (cached !== null) return cached;
        
        const p = path.join(DATA_DIR, file);
        if (!fs.existsSync(p)) return [];
        
        const data = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(data);
        cache.set(cacheKey, parsed, file === 'messages.json' ? 10000 : 30000);
        return parsed;
    } catch (error) {
        logger.error(`Error crítico leyendo ${file}:`, { error: error.message });
        return [];
    }
};

const write = (file, data) => {
    try {
        const p = path.join(DATA_DIR, file);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        cache.invalidatePattern(`file_${file}`);
        
        if (file === 'users.json') {
            cache.invalidatePattern('suggestions_');
            cache.invalidatePattern('stories_user_');
            cache.invalidatePattern('popular_');
            cache.invalidatePattern('feed_');
            rebuildUserIndex();
        }
        if (file === 'stories.json') {
            cache.invalidatePattern('stories_');
            cache.invalidatePattern('feed_');
            cache.invalidatePattern('hashtags');
            cache.invalidatePattern('trending');
        }
        if (file === 'hashtags.json') {
            cache.invalidatePattern('hashtags');
            cache.invalidatePattern('trending');
        }
        if (file === 'reports.json') {
            cache.invalidatePattern('reports_');
            cache.invalidatePattern('report_stats');
        }
        if (file === 'wallets.json') {
            cache.invalidatePattern('wallet_');
            cache.invalidatePattern('transactions_');
        }
        if (file === 'report-assignments.json') {
            cache.invalidatePattern('report_assignments_');
        }
        if (file === 'moderation-log.json') {
            cache.invalidatePattern('moderation_');
        }
        if (file === 'ads.json') {
            cache.invalidatePattern('ads_');
            cache.invalidatePattern('active_ads');
        }
    } catch (error) {
        logger.error(`Error escribiendo ${file}:`, { error: error.message });
        throw error;
    }
};

// ========== USER INDEX ==========
const userIndex = new Map();

function rebuildUserIndex() {
    try {
        const users = read('users.json');
        userIndex.clear();
        users.forEach(u => userIndex.set(u.id, u));
        logger.info(`Índice de usuarios reconstruido: ${userIndex.size} usuarios`);
    } catch (error) {
        logger.error('Error reconstruyendo índice de usuarios:', { error: error.message });
    }
}

// ========== CHAT: CLAVE PARA CIFRADO ==========
const CHAT_SECRET_KEY = process.env.CHAT_SECRET_KEY || 'mi_clave_secreta_para_cifrar_mensajes_1234567890';

function encryptMessage(message) {
    return CryptoJS.AES.encrypt(message, CHAT_SECRET_KEY).toString();
}

function decryptMessage(encryptedMessage) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedMessage, CHAT_SECRET_KEY);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        logger.error('Error descifrando mensaje:', { error: error.message });
        return '[Mensaje corrupto]';
    }
}

// ========== SISTEMA DE PRESENCIA ==========
const userConnections = new Map();
const userStatuses = new Map();
const GRACE_PERIOD_MS = 30000;
const CLEANUP_INTERVAL_MS = 60000;
const MAX_CONNECTION_AGE_MS = 120000;

function getUserStatus(userId) {
    if (userStatuses.has(userId)) {
        return userStatuses.get(userId);
    }
    
    const user = userIndex.get(userId);
    if (user && user.lastSeen) {
        return { status: 'offline', lastSeen: user.lastSeen, currentPage: null };
    }
    
    return { status: 'offline', lastSeen: null, currentPage: null };
}

function notifyContacts(userId, status, lastSeen = null) {
    const currentUser = userIndex.get(userId);
    if (!currentUser) return;
    
    const usersToNotify = new Set();
    const messages = read('messages.json');
    messages.forEach(msg => {
        if (msg.from === userId) usersToNotify.add(msg.to);
        if (msg.to === userId) usersToNotify.add(msg.from);
    });
    
    if (currentUser.followers) {
        currentUser.followers.forEach(followerId => usersToNotify.add(followerId));
    }
    if (currentUser.following) {
        currentUser.following.forEach(followingId => usersToNotify.add(followingId));
    }
    if (currentUser.pendingRequests) {
        currentUser.pendingRequests.forEach(reqId => usersToNotify.add(reqId));
    }
    if (currentUser.pendingSent) {
        currentUser.pendingSent.forEach(sentId => usersToNotify.add(sentId));
    }
    
    usersToNotify.forEach(otherUserId => {
        io.to(`user_${otherUserId}`).emit('user_status_changed', {
            userId: userId,
            status: status,
            lastSeen: lastSeen,
            username: currentUser.username,
            fullName: currentUser.fullName
        });
    });
}

function sendInitialStatuses(socket, userId) {
    const currentUser = userIndex.get(userId);
    if (!currentUser) return;
    
    const contacts = new Set();
    const messages = read('messages.json');
    messages.forEach(msg => {
        if (msg.from === userId) contacts.add(msg.to);
        if (msg.to === userId) contacts.add(msg.from);
    });
    if (currentUser.following) {
        currentUser.following.forEach(id => contacts.add(id));
    }
    if (currentUser.followers) {
        currentUser.followers.forEach(id => contacts.add(id));
    }
    if (currentUser.pendingRequests) {
        currentUser.pendingRequests.forEach(id => contacts.add(id));
    }
    if (currentUser.pendingSent) {
        currentUser.pendingSent.forEach(id => contacts.add(id));
    }
    
    contacts.forEach(contactId => {
        const status = getUserStatus(contactId);
        socket.emit('user_status_changed', {
            userId: contactId,
            status: status.status,
            lastSeen: status.lastSeen
        });
    });
}

setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [userId, connections] of userConnections.entries()) {
        let hasActive = false;
        
        for (const [socketId, data] of connections.entries()) {
            if (now - data.lastPing > MAX_CONNECTION_AGE_MS) {
                connections.delete(socketId);
                cleanedCount++;
            } else {
                hasActive = true;
            }
        }
        
        if (connections.size === 0) {
            userConnections.delete(userId);
            
            const previousStatus = userStatuses.get(userId);
            if (previousStatus && previousStatus.status !== 'offline') {
                const lastSeen = new Date().toISOString();
                userStatuses.set(userId, { status: 'offline', lastSeen, currentPage: null });
                
                const users = read('users.json');
                const userIndex2 = users.findIndex(u => u.id === userId);
                if (userIndex2 !== -1) {
                    users[userIndex2].lastSeen = lastSeen;
                    write('users.json', users);
                }
                
                notifyContacts(userId, 'offline', lastSeen);
            }
        }
    }
    
    if (cleanedCount > 0) {
        logger.info(`Limpiados ${cleanedCount} sockets inactivos`);
    }
}, 60000);

app.set('userConnections', userConnections);
app.set('userStatuses', userStatuses);
app.set('getUserStatus', getUserStatus);

// ========== FUNCIÓN PARA GENERAR NÚMERO VYIN PAY ==========
function generateVyinPayNumber() {
    const prefix = 'VP';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// ========== INICIALIZAR BILLETERA PARA NUEVO USUARIO ==========
function initializeWallet(userId, userData = {}) {
    try {
        const wallets = read('wallets.json');
        
        const existingWallet = wallets.find(w => w.userId === userId);
        if (existingWallet) {
            return existingWallet;
        }

        const newWallet = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            vyinPayNumber: generateVyinPayNumber(),
            balance: 0,
            currency: 'VYN',
            status: 'inactive',
            tier: 1,
            dailyLimit: 0,
            monthlyLimit: 0,
            bankAccounts: [],
            kycStatus: 'pending',
            kycData: {
                fullName: userData.fullName || '',
                documentType: null,
                documentNumber: null,
                birthDate: null,
                phone: null,
                address: null,
                country: null,
                verifiedAt: null
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastTransaction: null,
            dailySpent: 0,
            monthlySpent: 0,
            lastResetDaily: new Date().toISOString().split('T')[0],
            lastResetMonthly: new Date().toISOString().split('T')[0]
        };
        
        wallets.push(newWallet);
        write('wallets.json', wallets);

        logger.info(`✅ Billetera Vyin Pay creada para usuario ${userId}: ${newWallet.vyinPayNumber} (INACTIVA)`);
        return newWallet;
    } catch (error) {
        logger.error('Error inicializando billetera:', { error: error.message });
        return null;
    }
}

// ========== MIGRACIÓN DE DATOS ==========
function migrateAllData() {
    logger.info('🔄 VERIFICANDO Y MIGRANDO DATOS...');
    let anyChange = false;

    let users = read('users.json');
    let usersModified = false;
    users = users.map(user => {
        let modified = false;
        if (user.privacy === undefined) { user.privacy = 'public'; modified = true; }
        if (user.followers === undefined) { user.followers = []; modified = true; }
        if (user.following === undefined) { user.following = []; modified = true; }
        if (user.bio === undefined) { user.bio = ''; modified = true; }
        if (!user.avatar) {
            user.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName || user.username)}&background=a855f7&color=fff`;
            modified = true;
        }
        if (user.pendingRequests === undefined) { user.pendingRequests = []; modified = true; }
        if (user.pendingSent === undefined) { user.pendingSent = []; modified = true; }
        if (user.lastSeen === undefined) {
            user.lastSeen = user.createdAt || new Date().toISOString();
            modified = true;
        }
        if (user.birthDate === undefined) { user.birthDate = null; modified = true; }
        if (user.age === undefined) { user.age = null; modified = true; }
        if (user.language === undefined) { user.language = 'es'; modified = true; }
        if (user.region === undefined) { user.region = 'other'; modified = true; }
        if (user.country === undefined) { user.country = null; modified = true; }
        if (user.countryName === undefined) { user.countryName = null; modified = true; }
        if (user.timezone === undefined) { 
            try {
                user.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
            } catch(e) {
                user.timezone = null;
            }
            modified = true; 
        }
        if (user.feedPreferences === undefined) { 
            user.feedPreferences = {
                countryWeight: 34,
                regionWeight: 27,
                nearbyRegionsWeight: 23,
                farRegionsWeight: 5,
                followingWeight: 11
            };
            modified = true;
        }
        if (user.role === undefined) { 
            user.role = 'user';
            modified = true;
        }
        if (user.vyinPayNumber === undefined) {
            user.vyinPayNumber = null;
            modified = true;
        }
        if (user.isVerified === undefined) {
            user.isVerified = false;
            modified = true;
        }
        if (user.accountType === undefined) {
            user.accountType = 'personal';
            modified = true;
        }
        if (user.businessInfo === undefined) {
            user.businessInfo = null;
            modified = true;
        }
        if (user.suspended === undefined) {
            user.suspended = false;
            modified = true;
        }
        if (user.suspendedUntil === undefined) {
            user.suspendedUntil = null;
            modified = true;
        }
        if (user.suspensionReason === undefined) {
            user.suspensionReason = null;
            modified = true;
        }
        if (user.suspendedAt === undefined) {
            user.suspendedAt = null;
            modified = true;
        }
        // 🔥 NUEVO: BLOQUEOS
        if (user.blocked === undefined) {
            user.blocked = [];
            modified = true;
        }
        if (user.blockedBy === undefined) {
            user.blockedBy = [];
            modified = true;
        }
        
        if (modified) usersModified = true;
        return user;
    });
    if (usersModified) { write('users.json', users); anyChange = true; }

    let stories = read('stories.json');
    let storiesModified = false;
    stories = stories.map(story => {
        let modified = false;
        if (story.mediaType === undefined) { story.mediaType = 'image'; modified = true; }
        if (story.views === undefined) { story.views = []; modified = true; }
        if (story.caption === undefined) { story.caption = ''; modified = true; }
        if (story.textContent === undefined) { story.textContent = null; modified = true; }
        if (story.textBgColor === undefined) { story.textBgColor = '#1a1a2e'; modified = true; }
        if (story.likes === undefined) { story.likes = []; modified = true; }
        if (story.comments === undefined) { story.comments = []; modified = true; }
        if (story.score === undefined) { story.score = 0; modified = true; }
        if (story.hidden === undefined) { story.hidden = false; modified = true; }
        if (modified) storiesModified = true;
        return story;
    });
    if (storiesModified) { write('stories.json', stories); anyChange = true; }

    let hashtags = read('hashtags.json');
    let hashtagsModified = false;
    hashtags = hashtags.map(tag => {
        let modified = false;
        if (tag.stories === undefined) { tag.stories = []; modified = true; }
        if (tag.count === undefined) { tag.count = tag.stories?.length || 0; modified = true; }
        if (modified) hashtagsModified = true;
        return tag;
    });
    if (hashtagsModified) { write('hashtags.json', hashtags); anyChange = true; }

    let messages = read('messages.json');
    let messagesModified = false;
    messages = messages.map(msg => {
        let modified = false;
        if (msg.read === undefined) { msg.read = false; modified = true; }
        if (msg.encrypted === undefined) {
            if (msg.content && !msg.encrypted) {
                msg.content = encryptMessage(msg.content);
                msg.encrypted = true;
                modified = true;
            } else {
                msg.encrypted = false;
                modified = true;
            }
        }
        if (modified) messagesModified = true;
        return msg;
    });
    if (messagesModified) { write('messages.json', messages); anyChange = true; }

    const initFiles = [
        'users.json', 'stories.json', 'messages.json', 'hashtags.json', 
        'notifications.json', 'reports.json', 'wallets.json', 'transactions.json', 
        'business-requests.json', 'report-assignments.json', 'moderation-log.json',
        'ads.json'
    ];
    initFiles.forEach(f => {
        const filePath = path.join(DATA_DIR, f);
        if (!fs.existsSync(filePath)) {
            write(f, []);
            logger.info(`📄 Archivo ${f} creado`);
        }
    });

    if (anyChange) {
        logger.info('🎉 MIGRACIÓN COMPLETADA');
    } else {
        logger.info('✅ Todos los datos están actualizados');
    }
}

migrateAllData();
rebuildUserIndex();

// ============================================================
// 🔥 SINCRONIZAR ADMINISTRADORES
// ============================================================

try {
    adminConfig.syncUserRoles();
    console.log('\n👑 ADMINISTRADORES OFICIALES:');
    const admins = adminConfig.getAllAdmins();
    admins.forEach(a => {
        console.log(`   ✅ ${a.fullName || a.username} (@${a.username})`);
    });
    console.log('');
} catch (error) {
    console.error('❌ Error sincronizando administradores:', error);
}

app.set('adminConfig', adminConfig);

const JWT_SECRET = process.env.JWT_SECRET || 'mi_super_secreto_123';

// ========== SOCKET AUTH ==========
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch (e) {
        next(new Error('Invalid token'));
    }
});

// ========== IMPORTAR MÓDULOS ==========
const auth = require('./middleware/auth');

// ========== MÓDULOS DE PRIVACIDAD Y NOTIFICACIONES ==========
let isProfileVisible = (user, viewerId) => true;
let areStoriesVisible = (user, viewerId) => true;
let createNotification = (userId, type, fromUserId, data) => {};

try {
    const privacyModule = require('./privacy')(read, write, io);
    isProfileVisible = privacyModule.isProfileVisible;
    areStoriesVisible = privacyModule.areStoriesVisible;
    logger.info('✅ Privacy module loaded');
} catch (error) {
    logger.warn('⚠️ Privacy module not found, using default');
}

try {
    const notificationsModule = require('./notifications')(read, write, io);
    createNotification = notificationsModule.createNotification;
    logger.info('✅ Notifications module loaded');
} catch (error) {
    logger.warn('⚠️ Notifications module not found, using default');
}

// ========== HASHTAGS MODULE ==========
let processHashtags = (story) => { return story; };
try {
    const hashtagsModule = require('./hashtags')(read, write);
    processHashtags = hashtagsModule.processHashtags;
    logger.info('✅ Hashtags module loaded');
} catch (error) {
    logger.warn('⚠️ Hashtags module not found');
}

app.set('areStoriesVisible', areStoriesVisible);

// ============================================================
// MAPA DE REGIONES CERCANAS
// ============================================================
const REGION_NEARBY_MAP = {
    'south_america': ['central_america', 'north_america', 'europe'],
    'central_america': ['south_america', 'north_america', 'europe'],
    'north_america': ['central_america', 'south_america', 'europe'],
    'europe': ['north_america', 'asia', 'africa'],
    'asia': ['europe', 'oceania', 'africa'],
    'africa': ['europe', 'asia', 'south_america'],
    'oceania': ['asia', 'south_america', 'north_america'],
    'antarctica': ['south_america', 'africa', 'oceania'],
    'other': ['north_america', 'europe', 'asia']
};

// ========== RATE LIMITERS ==========
const storyLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 100,
    message: { error: 'Has excedido el límite de historias diarias' },
    keyGenerator: (req) => req.userId,
    skip: (req) => !req.userId
});

const likeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Demasiados likes, espera un momento' },
    keyGenerator: (req) => req.userId,
    skip: (req) => !req.userId
});

// ============================================================
// 🔥 RUTAS DE AUTENTICACIÓN (SEPARADAS)
// ============================================================
const { router: authRouter, initAuthRoutes } = require('./routes/auth');
initAuthRoutes(read, write, initializeWallet, logger);
app.use('/api/auth', authRouter);

// ============================================================
// 🔥 RUTAS DE MÓDULOS
// ============================================================

// 1. RUTAS DE USUARIOS
try {
    const usersRoutes = require('./users')(read, write, isProfileVisible, areStoriesVisible, userIndex, logger);
    app.use('/api/users', usersRoutes);
    logger.info('✅ Users routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando users:', { error: error.message });
}

// 2. RUTAS DE RANKING
try {
    const rankingModule = require('./ranking')(read, write, io, logger);
    app.use('/api/ranking', rankingModule);
    logger.info('✅ Ranking routes cargadas en /api/ranking');
} catch (error) {
    logger.error('❌ Error cargando ranking:', { error: error.message });
}

// 3. RUTAS DE STORIES
try {
    const storiesRoutes = require('./stories')(read, write, io, processHashtags, isProfileVisible, areStoriesVisible, logger, storyLimiter, likeLimiter);
    app.use('/api/stories', storiesRoutes);
    logger.info('✅ Stories routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando stories:', { error: error.message });
}

// 4. RUTAS DE STORY INTERACTIONS
try {
    const storyInteractionsRoutes = require('./storyInteractions')(read, write, io, areStoriesVisible, logger);
    app.use('/api/stories', storyInteractionsRoutes);
    logger.info('✅ StoryInteractions routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando storyInteractions:', { error: error.message });
}

// 5. RUTAS DE FOLLOWS
try {
    const followsRoutes = require('./follows')(read, write, io, createNotification, logger);
    app.use('/api/follows', followsRoutes);
    logger.info('✅ Follows routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando follows:', { error: error.message });
}

// 6. RUTAS DE CHATS
try {
    const chatsRoutes = require('./chats')(read, write, io, encryptMessage, decryptMessage, createNotification, logger);
    app.use('/api/chats', chatsRoutes);
    logger.info('✅ Chats routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando chats:', { error: error.message });
}

// 7. RUTAS DE HASHTAGS
try {
    const hashtagsModule = require('./hashtags')(read, write);
    app.use('/api/hashtags', hashtagsModule.router);
    logger.info('✅ Hashtags routes cargadas en /api/hashtags');
} catch (error) {
    logger.error('❌ Error cargando hashtags:', { error: error.message });
}

// 8. RUTAS DE PRIVACY
try {
    const privacyModule = require('./privacy')(read, write, io);
    app.use('/api/privacy', privacyModule.router);
    logger.info('✅ Privacy routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando privacy:', { error: error.message });
}

// 9. RUTAS DE NOTIFICATIONS
try {
    const notificationsModule = require('./notifications')(read, write, io);
    app.use('/api/notifications', notificationsModule.router);
    logger.info('✅ Notifications routes cargadas');
} catch (error) {
    logger.error('❌ Error cargando notifications:', { error: error.message });
}

// ============================================================
// 🔥 10. 📌 CUENTAS VERIFICADAS Y DE EMPRESA
// ============================================================
try {
    const verifiedAccountsModule = require('./verified-accounts')(read, write, io, logger);
    app.use('/api/verified', verifiedAccountsModule.router);
    
    app.set('checkAndVerifyUser', verifiedAccountsModule.checkAndVerifyUser);
    app.set('addVerificationBadge', verifiedAccountsModule.addVerificationBadge);
    app.set('ACCOUNT_TYPES', verifiedAccountsModule.ACCOUNT_TYPES);
    
    logger.info('✅ Verified accounts routes cargadas en /api/verified');
    console.log('👑 SISTEMA DE VERIFICACIÓN ACTIVADO:');
    console.log(`   ✅ Verificación automática con ${verifiedAccountsModule.VERIFIED_FOLLOWERS_THRESHOLD} seguidores`);
    console.log('   ✅ Cuentas de empresa');
    console.log('   ✅ Panel de administración');
} catch (error) {
    logger.error('❌ Error cargando verified accounts:', { error: error.message });
}

// ============================================================
// 🔥 11. 🚨 SISTEMA DE DENUNCIAS (CON ASIGNACIÓN Y MODERACIÓN)
// ============================================================
try {
    const reportsModule = require('./reports')(read, write, io, logger);
    app.use('/api/reports', reportsModule);
    logger.info('✅ Reports routes cargadas en /api/reports');
    console.log('📢 SISTEMA DE DENUNCIAS ACTIVADO:');
    console.log('   ✅ Gestión de denuncias de usuarios');
    console.log('   ✅ Asignación automática a administradores');
    console.log('   ✅ Panel de moderación y estadísticas');
    console.log('   ✅ Eliminación automática de NSFW');
    console.log('   ✅ Sistema de advertencias y suspensiones');
} catch (error) {
    logger.error('❌ Error cargando reports:', { error: error.message });
    console.error('❌ Error cargando sistema de denuncias:', error.message);
}

// ============================================================
// 🔥 12. 💳 SISTEMA VYIN PAY
// ============================================================
try {
    const walletModule = require('./wallet')(read, write, io, logger);
    app.use('/api/wallet', walletModule);
    logger.info('✅ Vyin Pay wallet routes cargadas en /api/wallet');
    console.log('💳 SISTEMA VYIN PAY ACTIVADO:');
    console.log('   ✅ Billetera digital para usuarios');
    console.log('   ✅ Transferencias entre usuarios');
    console.log('   ✅ Depósitos y retiros (simulados)');
    console.log('   ✅ Cuentas bancarias vinculadas');
    console.log('   ✅ Historial de transacciones');
    console.log('   ⚠️ Billeteras inactivas por defecto');
} catch (error) {
    logger.error('❌ Error cargando wallet:', { error: error.message });
    console.error('❌ Error cargando sistema Vyin Pay:', error.message);
}

// ============================================================
// 🔥 13. 🤖 VYIN IA - INTELIGENCIA ARTIFICIAL
// ============================================================

try {
    setupVyinRoutes(app, read, write, auth);
    console.log('🤖 VYIN IA: Activado');
    console.log(`   🌐 Traducción: Híbrida (Local + Web)`);
    console.log(`   🛡️ Moderación: Activada`);
    console.log(`   📚 Idiomas: 33+ idiomas`);
} catch (error) {
    logger.error('❌ Error configurando Vyin IA:', { error: error.message });
    console.error('❌ Error configurando Vyin IA:', error.message);
}

// ============================================================
// 🔥 14. 🚫 SISTEMA DE BLOQUEOS
// ============================================================
try {
    const blockedModule = require('./blocked')(read, write, io, logger);
    app.use('/api/blocked', blockedModule);
    logger.info('✅ Blocked routes cargadas en /api/blocked');
    console.log('🚫 SISTEMA DE BLOQUEOS ACTIVADO:');
    console.log('   ✅ Bloquear/Desbloquear usuarios');
    console.log('   ✅ Verificación de bloqueos');
    console.log('   ✅ Bloqueos silenciosos');
    console.log('   ✅ Lista de usuarios bloqueados');
    console.log('   ✅ Filtrado automático en feeds y chats');
} catch (error) {
    logger.error('❌ Error cargando bloqueos:', { error: error.message });
    console.error('❌ Error cargando sistema de bloqueos:', error.message);
}

// ============================================================
// 🔥 15. 📢 SISTEMA DE PUBLICIDAD/ANUNCIOS
// ============================================================
try {
    const adsModule = require('./ads')(read, write, io, logger);
    app.use('/api/ads', adsModule.router);
    logger.info('✅ Ads routes cargadas en /api/ads');
    console.log('📢 SISTEMA DE PUBLICIDAD ACTIVADO:');
    console.log('   ✅ Creación de anuncios para cuentas de empresa');
    console.log('   ✅ NO requiere verificación, solo ser cuenta de empresa');
    console.log('   ✅ Aprobación/Rechazo por administradores');
    console.log('   ✅ Estadísticas de anuncios');
    console.log('   ✅ Anuncios en el feed');
    console.log('   ✅ Límite de 5 anuncios activos');
} catch (error) {
    logger.error('❌ Error cargando ads:', { error: error.message });
    console.error('❌ Error cargando sistema de publicidad:', error.message);
}

// ============================================================
// 🔥 RUTA PARA ANALIZAR IMAGEN CON IA
// ============================================================

app.post('/api/stories/analyze-image', auth, async (req, res) => {
    try {
        const { imageUrl, fullUrl } = req.body;
        
        if (!imageUrl) {
            return res.status(400).json({ error: 'URL de imagen requerida' });
        }
        
        const imagePath = path.join(__dirname, '../frontend', imageUrl);
        
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({ error: 'Imagen no encontrada en: ' + imagePath });
        }
        
        const iaResult = await iaClassifier.classifyImageFile(imagePath);
        
        if (!iaResult.success) {
            return res.status(500).json({ error: 'Error clasificando imagen: ' + (iaResult.error || 'Error desconocido') });
        }
        
        res.json({
            label: iaResult.label,
            confidence: iaResult.confidence,
            percentage: iaResult.percentage,
            is_safe: iaResult.is_safe,
            success: true
        });
        
    } catch (error) {
        console.error('❌ Error analizando imagen:', error);
        res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
});

// ============================================================
// 🔥 RUTA PARA ABRIR HISTORIA DESDE NOTIFICACIÓN
// ============================================================
app.get('/story/:storyId', (req, res) => {
    const storyId = req.params.storyId;
    const commentId = req.query.commentId || '';
    logger.info(`📂 Redirigiendo a historia: ${storyId}, comentario: ${commentId}`);
    res.redirect(`/feed.html?storyId=${storyId}&commentId=${commentId}&fromNotification=true`);
});

// ========== ENDPOINTS DE DIAGNÓSTICO ==========
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Servidor funcionando correctamente', 
        timestamp: new Date().toISOString(),
        ip: req.ip || req.socket.remoteAddress
    });
});

app.get('/api/cache/stats', (req, res) => {
    res.json(cache.getStats());
});

app.get('/health', (req, res) => {
    const networkInterfaces = os.networkInterfaces();
    const ips = [];
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    
    const stats = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        connections: userConnections.size,
        cache: cache.getStats(),
        usersIndexed: userIndex.size,
        ips: ips,
        port: PORT,
        version: process.env.npm_package_version || '1.0.0',
        ranking: {
            enabled: true,
            weights: {
                recency: 0.25,
                engagement: 0.30,
                social: 0.20,
                geographic: 0.15,
                trending: 0.10
            }
        },
        reports: {
            enabled: true,
            features: {
                textAnalysis: true,
                autoModeration: true,
                autoAssignment: true,
                autoDeletion: true,
                warnings: true,
                suspensions: true
            }
        },
        wallet: {
            enabled: true,
            currency: 'VYN',
            features: {
                transfers: true,
                deposits: true,
                withdrawals: true,
                bankAccounts: true
            }
        },
        verified: {
            enabled: true,
            threshold: 1000000,
            accountTypes: ['personal', 'business', 'verified', 'business_verified']
        },
        moderation: {
            enabled: true,
            warningThreshold: 3,
            suspensionDays: {
                1: 1,
                2: 3,
                3: 7,
                4: 30,
                5: 'permanent'
            }
        },
        vyin: {
            enabled: true,
            translation: true,
            moderation: true,
            languages: 33
        },
        blocked: {
            enabled: true,
            features: {
                block: true,
                unblock: true,
                silent: true,
                filterFeeds: true,
                filterChats: true
            }
        },
        ads: {
            enabled: true,
            features: {
                create: true,
                approve: true,
                reject: true,
                stats: true,
                pause: true,
                resume: true,
                limit: 5
            }
        }
    };
    
    try {
        read('users.json');
        stats.filesystem = 'healthy';
    } catch (error) {
        stats.filesystem = 'unhealthy';
        stats.filesystemError = error.message;
    }
    
    res.json(stats);
});

// ============================================================
// 🔥 RUTAS DEL FRONTEND PARA RENDER - CORREGIDO
// ============================================================

const FRONTEND_PATH = path.join(__dirname, '../frontend');
const MOBILE_PATH = path.join(FRONTEND_PATH, 'mobile');

console.log(`📁 Frontend path: ${FRONTEND_PATH}`);
console.log(`📁 Mobile path: ${MOBILE_PATH}`);

// Servir archivos estáticos
app.use(express.static(FRONTEND_PATH));
app.use('/mobile', express.static(MOBILE_PATH));
app.use('/uploads', express.static(path.join(FRONTEND_PATH, 'uploads')));

// 🔥 RUTA PRINCIPAL - App móvil
app.get('/', (req, res) => {
    res.sendFile(path.join(MOBILE_PATH, 'index.html'));
});

// 🔥 FEED - App móvil
app.get('/feed.html', (req, res) => {
    res.sendFile(path.join(MOBILE_PATH, 'index.html'));
});

// 🔥 LOGIN - RUTA ESPECÍFICA (CORREGIDO)
app.get('/login.html', (req, res) => {
    const loginPath = path.join(FRONTEND_PATH, 'login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        // Fallback: si no existe login.html, redirigir al feed
        res.redirect('/feed.html');
    }
});

// 🔥 REGISTER - RUTA ESPECÍFICA
app.get('/register.html', (req, res) => {
    const registerPath = path.join(FRONTEND_PATH, 'register.html');
    if (fs.existsSync(registerPath)) {
        res.sendFile(registerPath);
    } else {
        res.redirect('/login.html');
    }
});

// 🔥 CHAT - RUTA ESPECÍFICA (RENOMBRADA de chats.html a chat.html)
app.get('/chat.html', (req, res) => {
    const chatPath = path.join(MOBILE_PATH, 'chat.html');
    // Si existe chat.html, usarlo
    if (fs.existsSync(chatPath)) {
        res.sendFile(chatPath);
    } else {
        // Fallback: si no existe, buscar chats.html
        const chatsPath = path.join(MOBILE_PATH, 'chats.html');
        if (fs.existsSync(chatsPath)) {
            res.sendFile(chatsPath);
        } else {
            res.redirect('/feed.html');
        }
    }
});

// 🔥 CHATS - RUTA ANTIGUA (REDIRECCIÓN)
app.get('/chats.html', (req, res) => {
    // Redirigir de chats.html a chat.html
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(`/chat.html${query}`);
});

// 🔥 MOBILE CHATS - RUTA DIRECTA
app.get('/mobile/chats.html', (req, res) => {
    // Redirigir a la nueva ruta
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(`/chat.html${query}`);
});

// 🔥 MOBILE CHAT - RUTA DIRECTA
app.get('/mobile/chat.html', (req, res) => {
    const chatPath = path.join(MOBILE_PATH, 'chat.html');
    if (fs.existsSync(chatPath)) {
        res.sendFile(chatPath);
    } else {
        const chatsPath = path.join(MOBILE_PATH, 'chats.html');
        if (fs.existsSync(chatsPath)) {
            res.sendFile(chatsPath);
        } else {
            res.redirect('/feed.html');
        }
    }
});

// 🔥 Cualquier otra ruta no API - App móvil (SPA)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        // Excluir rutas de archivos estáticos
        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.json'];
        if (staticExtensions.some(ext => req.path.endsWith(ext))) {
            return res.status(404).send('Archivo no encontrado');
        }
        res.sendFile(path.join(MOBILE_PATH, 'index.html'));
    }
});

// ============================================================
// 🔥 SOCKET.IO
// ============================================================

io.on('connection', (socket) => {
    logger.info(`🔌 Nueva conexión: ${socket.id}`);
    socket.join(`user_${socket.userId}`);
    
    socket.on('user_online', (data) => {
        const userId = socket.userId;
        const now = Date.now();
        
        if (!userConnections.has(userId)) {
            userConnections.set(userId, new Map());
        }
        
        const wasOffline = userConnections.get(userId).size === 0;
        userConnections.get(userId).set(socket.id, {
            lastPing: now,
            page: data?.page || 'unknown'
        });
        
        if (wasOffline) {
            userStatuses.set(userId, {
                status: 'online',
                lastSeen: new Date().toISOString(),
                currentPage: data?.page || 'unknown'
            });
            
            const users = read('users.json');
            const userIndex2 = users.findIndex(u => u.id === userId);
            if (userIndex2 !== -1) {
                users[userIndex2].lastSeen = new Date().toISOString();
                write('users.json', users);
            }
            
            notifyContacts(userId, 'online', null);
        }
        
        sendInitialStatuses(socket, userId);
    });
    
    socket.on('ping', (data) => {
        const userId = socket.userId;
        if (userConnections.has(userId)) {
            const conn = userConnections.get(userId).get(socket.id);
            if (conn) {
                conn.lastPing = Date.now();
                socket.emit('pong', { timestamp: Date.now() });
            }
        }
    });
    
    socket.on('user_published_story', (data) => {
        logger.info(`📸 Usuario ${socket.userId} publicó una historia:`, data.storyId);
        
        try {
            const stories = read('stories.json');
            const story = stories.find(s => s.id === data.storyId);
            
            if (story && !story.hidden) {
                const users = read('users.json');
                const storyOwner = users.find(u => u.id === story.userId);
                
                if (storyOwner) {
                    const storyWithUser = {
                        ...story,
                        user: {
                            id: storyOwner.id,
                            username: storyOwner.username,
                            fullName: storyOwner.fullName,
                            avatar: storyOwner.avatar,
                            isVerified: storyOwner.isVerified || false,
                            accountType: storyOwner.accountType || 'personal'
                        }
                    };
                    
                    let sentCount = 0;
                    users.forEach(user => {
                        if (user.id !== socket.userId) {
                            // 🔥 VERIFICAR BLOQUEOS
                            const isBlocked = user.blocked?.includes(storyOwner.id) || false;
                            const isBlockedBy = storyOwner.blockedBy?.includes(user.id) || false;
                            
                            if (!isBlocked && !isBlockedBy && areStoriesVisible(storyOwner, user.id)) {
                                io.to(`user_${user.id}`).emit('new_story', storyWithUser);
                                sentCount++;
                            }
                        }
                    });
                    logger.info(`✅ Historia ${story.id} enviada a ${sentCount} usuarios`);
                }
            }
        } catch (error) {
            logger.error('❌ Error en user_published_story:', { error: error.message });
        }
    });
    
    socket.on('disconnect', () => {
        const userId = socket.userId;
        if (userId && userConnections.has(userId)) {
            userConnections.get(userId).delete(socket.id);
            
            if (userConnections.get(userId).size === 0) {
                userConnections.delete(userId);
                
                setTimeout(() => {
                    if (!userConnections.has(userId)) {
                        const lastSeen = new Date().toISOString();
                        const previousStatus = userStatuses.get(userId);
                        
                        userStatuses.set(userId, {
                            status: 'offline',
                            lastSeen: lastSeen,
                            currentPage: null
                        });
                        
                        const users = read('users.json');
                        const userIndex2 = users.findIndex(u => u.id === userId);
                        if (userIndex2 !== -1) {
                            users[userIndex2].lastSeen = lastSeen;
                            write('users.json', users);
                        }
                        
                        if (!previousStatus || previousStatus.status !== 'offline') {
                            notifyContacts(userId, 'offline', lastSeen);
                        }
                    }
                }, 30000);
            }
        }
    });
    
    // ========== CHAT ==========
    socket.on('send_message', async (data) => {
        try {
            const { to, content } = data;
            if (!content || content.trim().length === 0) return;
            
            // 🔥 VERIFICAR BLOQUEOS
            const users = read('users.json');
            const fromUser = users.find(u => u.id === socket.userId);
            const toUser = users.find(u => u.id === to);
            
            if (!fromUser || !toUser) {
                return socket.emit('error', { message: 'Usuario no encontrado' });
            }
            
            // Si el bloqueador intenta enviar mensaje al bloqueado
            if (fromUser.blocked?.includes(to)) {
                return socket.emit('error', { message: 'No puedes enviar mensajes a este usuario' });
            }
            
            // Si el bloqueado intenta enviar mensaje al bloqueador (bloqueo silencioso)
            if (toUser.blockedBy?.includes(socket.userId)) {
                return socket.emit('error', { message: 'Usuario no encontrado' });
            }
            
            const messages = read('messages.json');
            const encryptedContent = encryptMessage(content);
            
            const newMessage = {
                id: Date.now().toString(),
                from: socket.userId,
                to: to,
                content: encryptedContent,
                encrypted: true,
                read: false,
                timestamp: new Date().toISOString()
            };
            
            messages.push(newMessage);
            write('messages.json', messages);
            
            const responseMessage = {
                id: newMessage.id,
                from: socket.userId,
                to: to,
                content: content,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true
            };
            
            // Solo enviar si no hay bloqueo
            const isBlockedBy = fromUser.blocked?.includes(to) || false;
            const isBlocked = toUser.blockedBy?.includes(socket.userId) || false;
            
            if (!isBlocked && !isBlockedBy) {
                io.to(`user_${to}`).emit('receive_message', { ...responseMessage, isOwn: false });
            }
            
            socket.emit('message_sent', responseMessage);
            
            if (fromUser && createNotification && !isBlocked && !isBlockedBy) {
                createNotification(to, 'message', socket.userId, {
                    message: `${fromUser.fullName} te envió un mensaje`,
                    preview: content.substring(0, 50)
                });
            }
        } catch (error) {
            logger.error('Error enviando mensaje:', { error: error.message });
        }
    });
    
    socket.on('typing', (data) => {
        // 🔥 VERIFICAR BLOQUEOS
        const users = read('users.json');
        const fromUser = users.find(u => u.id === socket.userId);
        const toUser = users.find(u => u.id === data.to);
        
        if (!fromUser || !toUser) return;
        
        const isBlocked = fromUser.blocked?.includes(data.to) || false;
        const isBlockedBy = toUser.blockedBy?.includes(socket.userId) || false;
        
        if (!isBlocked && !isBlockedBy) {
            socket.to(`user_${data.to}`).emit('user_typing', {
                from: socket.userId,
                isTyping: data.isTyping
            });
        }
    });
    
    socket.on('mark_messages_read', (data) => {
        try {
            const { withUserId } = data;
            let messages = read('messages.json');
            let updated = false;
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === socket.userId && msg.from === withUserId && !msg.read) {
                    updated = true;
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                write('messages.json', updatedMessages);
                io.to(`user_${withUserId}`).emit('messages_read', {
                    byUserId: socket.userId,
                    withUserId: withUserId
                });
            }
        } catch (error) {
            logger.error('Error marcando mensajes como leídos:', { error: error.message });
        }
    });
    
    socket.on('delete_message', (data) => {
        try {
            const { messageId } = data;
            let messages = read('messages.json');
            const messageIndex = messages.findIndex(m => m.id === messageId);
            
            if (messageIndex !== -1 && messages[messageIndex].from === socket.userId) {
                const deletedMessage = messages[messageIndex];
                messages.splice(messageIndex, 1);
                write('messages.json', messages);
                
                io.to(`user_${deletedMessage.to}`).emit('message_deleted', { messageId });
                socket.emit('message_deleted', { messageId });
            }
        } catch (error) {
            logger.error('Error eliminando mensaje:', { error: error.message });
        }
    });
});

// ============================================================
// 🔥 TAREAS EN SEGUNDO PLANO
// ============================================================

// 1. LIMPIEZA DE HISTORIAS EXPIRADAS
setInterval(() => {
    try {
        const stories = read('stories.json');
        const now = new Date().toISOString();
        const filtered = stories.filter(s => s.expiresAt > now);
        if (filtered.length !== stories.length) {
            write('stories.json', filtered);
            io.emit('stories_updated');
            cache.invalidatePattern('stories_');
            cache.invalidatePattern('feed_');
            cache.invalidatePattern('hashtags');
            cache.invalidatePattern('trending');
            logger.info(`🧹 ${stories.length - filtered.length} historias expiradas eliminadas`);
        }
    } catch (error) {
        logger.error('Error limpiando historias:', { error: error.message });
    }
}, 3600000);

// 2. LIMPIEZA DE ASIGNACIONES EXPIRADAS (cada 30 minutos)
setInterval(() => {
    try {
        const assignmentSystem = new ReportAssignment(read, write, logger);
        const cleaned = assignmentSystem.cleanupExpired();
        if (cleaned > 0) {
            logger.info(`🧹 ${cleaned} asignaciones expiradas limpiadas`);
        }
    } catch (error) {
        logger.error('Error limpiando asignaciones:', { error: error.message });
    }
}, 30 * 60 * 1000);

// 3. REASIGNACIÓN DE DENUNCIAS EXPIRADAS (cada hora)
setInterval(() => {
    try {
        const assignments = read('report-assignments.json') || [];
        const expired = assignments.filter(a => a.status === 'expired');
        
        if (expired.length > 0) {
            const assignmentSystem = new ReportAssignment(read, write, logger);
            const reports = read('reports.json');
            
            let reassignedCount = 0;
            for (const exp of expired) {
                const report = reports.find(r => r.id === exp.reportId);
                if (report && report.status === 'pending') {
                    const result = assignmentSystem.reassignExpired(exp.reportId);
                    if (result) {
                        reassignedCount++;
                        logger?.info(`🔄 Denuncia ${exp.reportId} reasignada`);
                    }
                }
            }
            
            if (reassignedCount > 0) {
                logger.info(`🔄 ${reassignedCount} denuncias reasignadas automáticamente`);
            }
        }
    } catch (error) {
        logger.error('Error reasignando denuncias:', { error: error.message });
    }
}, 60 * 60 * 1000);

// 4. LIMPIEZA DE SUSPENSIONES EXPIRADAS (cada hora)
setInterval(() => {
    try {
        const users = read('users.json');
        const now = new Date();
        let updated = false;
        
        users.forEach(user => {
            if (user.suspended && user.suspendedUntil) {
                const suspensionDate = new Date(user.suspendedUntil);
                if (now > suspensionDate) {
                    user.suspended = false;
                    user.suspendedUntil = null;
                    user.suspensionReason = null;
                    user.suspendedAt = null;
                    updated = true;
                    
                    logger.info(`✅ Suspensión expirada para usuario ${user.username} (${user.id})`);
                    
                    const notifier = new UserNotifications(read, write, io, logger);
                    notifier.notifyWarning(
                        user.id,
                        'suspensión expirada',
                        {
                            message: 'Tu suspensión ha expirado. Ya puedes volver a usar la plataforma.',
                            action: 'reactivated'
                        }
                    );
                }
            }
        });
        
        if (updated) {
            write('users.json', users);
        }
    } catch (error) {
        logger.error('Error limpiando suspensiones:', { error: error.message });
    }
}, 60 * 60 * 1000);

// ============================================================
// 🔥 INICIAR SERVIDOR
// ============================================================

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    const networkInterfaces = os.networkInterfaces();
    const ips = [];
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    
    console.log(`
    🚀 ========================================
    🚀 SERVIDOR VYN SOCIAL INICIADO
    🚀 ========================================
    
    📱 LOCAL:     http://localhost:${PORT}
    📱 LOCAL:     http://127.0.0.1:${PORT}
    
    🌐 RED (IPs disponibles):
    ${ips.map(ip => `   📱 http://${ip}:${PORT}`).join('\n')}
    
    📍 REGIÓN: Sudamérica (Ecuador)
    💳 VYIN PAY: Inactivo por defecto
    👑 VERIFICACIÓN: Automática con 1M seguidores
    
    🔥 ========================================
    📢 SISTEMA DE DENUNCIAS: ACTIVADO
       ✅ Asignación automática a administradores
       ✅ Eliminación automática de NSFW
       ✅ Sistema de advertencias (3 = advertencia, 5 = suspensión)
    
    💳 VYIN PAY: ACTIVADO (inactivo por defecto)
    🤖 IA CLASIFICADOR: ACTIVADO
    👑 CUENTAS VERIFICADAS: ACTIVADO
    🏢 CUENTAS DE EMPRESA: ACTIVADO
    🤖 VYIN IA: ACTIVADO
       🛡️ Moderación: Activada
       📚 Idiomas: 100+ idiomas
    
    🚫 SISTEMA DE BLOQUEOS: ACTIVADO
       ✅ Bloqueos silenciosos
       ✅ Filtrado automático en feeds y chats
       ✅ El bloqueado no se entera
       ✅ El bloqueador ve al bloqueado normalmente
    
    📢 SISTEMA DE PUBLICIDAD: ACTIVADO
       ✅ Creación de anuncios para cuentas de empresa
       ✅ NO requiere verificación, solo ser cuenta de empresa
       ✅ Aprobación/Rechazo por administradores
       ✅ Estadísticas de anuncios
       ✅ Límite de 5 anuncios activos
    
    🔥 ========================================
    
    🔄 TAREAS EN SEGUNDO PLANO:
       ✅ Limpieza de historias expiradas (cada hora)
       ✅ Limpieza de asignaciones expiradas (cada 30 min)
       ✅ Reasignación de denuncias (cada hora)
       ✅ Limpieza de suspensiones (cada hora)
       ✅ Limpieza de anuncios expirados (cada hora)
    
    📌 RUTAS CORREGIDAS:
       ✅ /login.html - Página de inicio de sesión
       ✅ /register.html - Página de registro
       ✅ /chat.html - Chat principal (renombrado de chats.html)
       ✅ /chats.html - Redirige a /chat.html
    `);
});

module.exports = { io, userConnections, userStatuses, getUserStatus, cache, userIndex, logger };