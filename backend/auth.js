// backend/auth.js - Rutas de autenticación (login y register)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mi_super_secreto_123';

// ========== FUNCIONES DE LECTURA/ESCRITURA ==========
// Estas funciones se pasan desde server.js
let read, write;

const init = (readFn, writeFn) => {
    read = readFn;
    write = writeFn;
    return router;
};

// ========== REGISTRO DE USUARIO ==========
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        
        // Validaciones
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Todos los campos son obligatorios' 
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({ 
                error: 'El nombre de usuario debe tener al menos 3 caracteres' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        if (!email.includes('@')) {
            return res.status(400).json({ 
                error: 'Email inválido' 
            });
        }
        
        const users = read('users.json');
        
        // Verificar si el email ya existe
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ 
                error: 'El email ya está registrado' 
            });
        }
        
        // Verificar si el username ya existe
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ 
                error: 'El nombre de usuario ya existe' 
            });
        }
        
        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Crear nuevo usuario
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            fullName: fullName || username,
            bio: '',
            privacy: 'public',
            followers: [],
            following: [],
            pendingRequests: [],
            pendingSent: [],
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || username)}&background=a855f7&color=fff`,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };
        
        users.push(newUser);
        write('users.json', users);
        
        // Generar token JWT
        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
        
        // Responder sin enviar la contraseña
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.status(201).json({
            success: true,
            token,
            user: userWithoutPassword
        });
        
        console.log(`✅ Usuario registrado: ${username} (${email})`);
        
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// ========== LOGIN DE USUARIO ==========
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email y contraseña son obligatorios' 
            });
        }
        
        const users = read('users.json');
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        // Actualizar último login
        user.lastSeen = new Date().toISOString();
        write('users.json', users);
        
        // Generar token JWT
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        // Responder sin enviar la contraseña
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({
            success: true,
            token,
            user: userWithoutPassword
        });
        
        console.log(`✅ Usuario logueado: ${user.username} (${email})`);
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor' 
        });
    }
});

// ========== VERIFICAR TOKEN ==========
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                error: 'No se proporcionó token' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const users = read('users.json');
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Usuario no encontrado' 
            });
        }
        
        const { password, ...userWithoutPassword } = user;
        
        res.json({
            success: true,
            user: userWithoutPassword
        });
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expirado' 
            });
        }
        return res.status(401).json({ 
            error: 'Token inválido' 
        });
    }
});

// ========== CERRAR SESIÓN (opcional, solo para limpieza) ==========
router.post('/logout', (req, res) => {
    // El logout se maneja en el frontend eliminando el token
    // pero dejamos el endpoint por si se necesita
    res.json({ 
        success: true, 
        message: 'Sesión cerrada correctamente' 
    });
});

module.exports = { init };