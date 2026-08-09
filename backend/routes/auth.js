// backend/routes/auth.js - Rutas de autenticación (SEPARADO)

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mi_super_secreto_123';

// Variables globales para dependencias
let readFn, writeFn, initializeWalletFn, loggerFn;

// Función para inicializar dependencias
function initAuthRoutes(read, write, initializeWallet, logger) {
    readFn = read;
    writeFn = write;
    initializeWalletFn = initializeWallet;
    loggerFn = logger;
    return router;
}

// ============================================================
// REGISTRO DE USUARIO
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { 
            username, email, password, fullName, 
            birthDate, age, language, region, country, countryName 
        } = req.body;
        
        const users = readFn('users.json');
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        let timezone = null;
        try {
            timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch(e) {}
        
        // Verificar si el usuario es administrador por configuración
        const { isAdmin } = require('../config/admin-config');
        const adminConfig = isAdmin(null, email);
        const role = adminConfig ? 'admin' : 'user';
        
        const vyinPayNumber = initializeWalletFn ? `VP-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : null;
        
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            fullName,
            bio: '',
            privacy: 'public',
            followers: [],
            following: [],
            pendingRequests: [],
            pendingSent: [],
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=a855f7&color=fff`,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            birthDate: birthDate || null,
            age: age || null,
            language: language || 'es',
            region: region || 'other',
            country: country || null,
            countryName: countryName || null,
            timezone: timezone || null,
            role: role,
            feedPreferences: {
                countryWeight: 34,
                regionWeight: 27,
                nearbyRegionsWeight: 23,
                farRegionsWeight: 5,
                followingWeight: 11
            },
            vyinPayNumber: vyinPayNumber,
            isVerified: false,
            accountType: 'personal',
            businessInfo: null
        };
        
        users.push(newUser);
        writeFn('users.json', users);
        
        if (initializeWalletFn) {
            initializeWalletFn(newUser.id, newUser);
        }
        
        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
        
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.status(201).json({
            token,
            user: userWithoutPassword,
            wallet: {
                vyinPayNumber: vyinPayNumber,
                balance: 0,
                currency: 'VYN',
                status: 'inactive'
            }
        });
        
        if (loggerFn) loggerFn.info(`✅ Usuario registrado: ${username} - Rol: ${role}`);
        
    } catch (err) {
        if (loggerFn) loggerFn.error('Error en registro:', { error: err.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============================================================
// LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = readFn('users.json');
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        user.lastSeen = new Date().toISOString();
        writeFn('users.json', users);
        
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        const { password: _, ...userWithoutPassword } = user;
        
        const wallets = readFn('wallets.json');
        const wallet = wallets.find(w => w.userId === user.id);
        
        res.json({
            token,
            user: userWithoutPassword,
            wallet: wallet ? {
                vyinPayNumber: wallet.vyinPayNumber,
                balance: wallet.balance,
                currency: wallet.currency,
                status: wallet.status
            } : null
        });
        
        if (loggerFn) loggerFn.info(`✅ Usuario logueado: ${user.username}`);
        
    } catch (err) {
        if (loggerFn) loggerFn.error('Error en login:', { error: err.message });
        res.status(500).json({ error: 'Error interno' });
    }
});

// ============================================================
// VERIFICAR TOKEN
// ============================================================
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const users = readFn('users.json');
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }
        
        const { password, ...userWithoutPassword } = user;
        
        const wallets = readFn('wallets.json');
        const wallet = wallets.find(w => w.userId === user.id);
        
        res.json({ 
            success: true, 
            user: userWithoutPassword,
            wallet: wallet ? {
                vyinPayNumber: wallet.vyinPayNumber,
                balance: wallet.balance,
                currency: wallet.currency,
                status: wallet.status
            } : null
        });
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        return res.status(401).json({ error: 'Token inválido' });
    }
});

// ============================================================
// EXPORTAR router y initAuthRoutes
// ============================================================
module.exports = {
    router,
    initAuthRoutes
};