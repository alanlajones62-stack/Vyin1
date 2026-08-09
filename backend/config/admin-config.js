// backend/config/admin-config.js - Sistema unificado de administradores

const fs = require('fs');
const path = require('path');

const ADMIN_CONFIG_PATH = path.join(__dirname, '..', 'data', 'admins.json');

// Asegurar que el directorio existe
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// ADMINISTRADORES OFICIALES (ÚNICOS RECONOCIDOS)
// ============================================================

const OFFICIAL_ADMINS = [
    {
        id: "1783122622538",
        username: "demo",
        email: "demo@vyn.com",
        fullName: "Usuario Demo",
        role: "admin",
        isVerified: true,
        accountType: "verified"
    },
    {
        id: "1783370679935",
        username: "Admin_Ecuador",
        email: "admin_ecu@gmail.com",
        fullName: "Admin_Ecuador",
        role: "admin",
        isVerified: true,
        accountType: "verified"
    }
];

// ============================================================
// FUNCIONES DE CARGA Y GUARDADO
// ============================================================

function loadAdmins() {
    try {
        if (fs.existsSync(ADMIN_CONFIG_PATH)) {
            const data = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(data);
            // Si el archivo está vacío o no es un array, inicializar
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return initializeAdmins();
            }
            return parsed;
        }
        return initializeAdmins();
    } catch (error) {
        console.error('Error cargando configuración de admins:', error);
        return initializeAdmins();
    }
}

function initializeAdmins() {
    console.log('👑 INICIALIZANDO ADMINISTRADORES OFICIALES...');
    // Guardar los admins oficiales
    saveAdmins(OFFICIAL_ADMINS);
    return OFFICIAL_ADMINS;
}

function saveAdmins(admins) {
    try {
        fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(admins, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error guardando configuración de admins:', error);
        return false;
    }
}

// ============================================================
// FUNCIONES DE VERIFICACIÓN
// ============================================================

function isAdmin(userId, email = null) {
    const admins = loadAdmins();
    return admins.some(admin => {
        if (userId && admin.id === userId) return true;
        if (email && admin.email === email) return true;
        return false;
    });
}

function getAdminByUserId(userId) {
    const admins = loadAdmins();
    return admins.find(a => a.id === userId) || null;
}

function getAdminByEmail(email) {
    const admins = loadAdmins();
    return admins.find(a => a.email === email) || null;
}

function getAllAdmins() {
    return loadAdmins();
}

// ============================================================
// FUNCIONES DE GESTIÓN
// ============================================================

function addAdmin(userId, email, username, fullName) {
    const admins = loadAdmins();
    
    // Verificar si ya existe
    if (admins.some(a => a.id === userId || a.email === email)) {
        return false;
    }
    
    admins.push({
        id: userId,
        email: email,
        username: username,
        fullName: fullName,
        role: "admin",
        isVerified: true,
        accountType: "verified",
        addedAt: new Date().toISOString()
    });
    
    return saveAdmins(admins);
}

function removeAdmin(userId) {
    const admins = loadAdmins();
    const filtered = admins.filter(a => a.id !== userId);
    if (filtered.length === admins.length) {
        return false;
    }
    return saveAdmins(filtered);
}

function isOfficialAdmin(userId) {
    return OFFICIAL_ADMINS.some(a => a.id === userId);
}

// ============================================================
// SINCRONIZAR USUARIOS EN users.json
// ============================================================

function syncUserRoles() {
    try {
        const DATA_DIR = path.join(__dirname, '..', 'data');
        const USERS_PATH = path.join(DATA_DIR, 'users.json');
        
        if (!fs.existsSync(USERS_PATH)) {
            console.warn('⚠️ users.json no encontrado');
            return false;
        }
        
        const usersData = fs.readFileSync(USERS_PATH, 'utf8');
        const users = JSON.parse(usersData);
        const admins = loadAdmins();
        const adminIds = admins.map(a => a.id);
        
        let modified = false;
        
        // Solo los admins oficiales deben tener role: "admin"
        users.forEach(user => {
            const isOfficialAdmin = adminIds.includes(user.id);
            const currentRole = user.role || 'user';
            
            if (isOfficialAdmin && currentRole !== 'admin') {
                user.role = 'admin';
                user.isVerified = true;
                user.accountType = 'verified';
                modified = true;
                console.log(`✅ Sincronizado: ${user.username} -> admin`);
            } else if (!isOfficialAdmin && currentRole === 'admin') {
                user.role = 'user';
                // No quitamos isVerified si ya lo tenía
                modified = true;
                console.log(`⬇️  Degradado: ${user.username} -> user`);
            }
        });
        
        if (modified) {
            fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
            console.log('✅ Roles de usuarios sincronizados correctamente');
            return true;
        }
        
        console.log('✅ Todos los roles de usuarios están correctos');
        return true;
        
    } catch (error) {
        console.error('❌ Error sincronizando roles:', error);
        return false;
    }
}

// ============================================================
// FUNCIÓN DE VERIFICACIÓN PARA MIDDLEWARE
// ============================================================

function requireAdmin(req, res, next) {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    
    if (!isAdmin(userId)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    
    next();
}

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
    // Carga y guardado
    loadAdmins,
    saveAdmins,
    initializeAdmins,
    
    // Verificación
    isAdmin,
    getAdminByUserId,
    getAdminByEmail,
    getAllAdmins,
    
    // Gestión
    addAdmin,
    removeAdmin,
    isOfficialAdmin,
    
    // Sincronización
    syncUserRoles,
    
    // Middleware
    requireAdmin,
    
    // Constantes
    OFFICIAL_ADMINS
};