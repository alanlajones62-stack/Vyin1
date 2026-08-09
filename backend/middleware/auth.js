// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const adminConfig = require('../config/admin-config');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_super_secreto_123';

// ========== MIDDLEWARE NORMAL (Requiere autenticación) ==========
const auth = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Acceso denegado. No se proporcionó token.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expirado. Por favor, inicia sesión nuevamente.' 
            });
        }
        return res.status(401).json({ 
            success: false,
            error: 'Token inválido.' 
        });
    }
};

// ========== MIDDLEWARE OPCIONAL (No requiere autenticación) ==========
auth.optional = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.userId;
        } catch (err) {
            // Si el token es inválido, ignoramos y continuamos
        }
    }
    next();
};

// ========== MIDDLEWARE DE ADMINISTRADOR ==========
auth.admin = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Acceso denegado. No se proporcionó token.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        
        // Verificar si es administrador usando el sistema unificado
        if (!adminConfig.isAdmin(req.userId)) {
            return res.status(403).json({ 
                success: false,
                error: 'Acceso denegado. Se requieren permisos de administrador.' 
            });
        }
        
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expirado. Por favor, inicia sesión nuevamente.' 
            });
        }
        return res.status(401).json({ 
            success: false,
            error: 'Token inválido.' 
        });
    }
};

module.exports = auth;