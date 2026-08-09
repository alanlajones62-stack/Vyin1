// backend/server-static.js - Configuración de archivos estáticos
const path = require('path');
const fs = require('fs');

module.exports = function(app) {
    const FRONTEND_DIR = path.join(__dirname, '../frontend');
    
    // ============================================================
    // 🔥 MIDDLEWARE PARA FORZAR MIME TYPES
    // ============================================================
    app.use((req, res, next) => {
        const url = req.url || req.path || '';
        
        // Detectar archivos JS
        if (url.endsWith('.js') || url.endsWith('.mjs') || 
            url.includes('.js?') || url.includes('.mjs?') ||
            url.match(/\/feed\/.*\.js/) ||
            url.match(/\.js($|\?)/)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        
        if (url.endsWith('.css') || url.includes('.css?')) {
            res.setHeader('Content-Type', 'text/css');
        }
        
        if (url.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        
        next();
    });
    
    // ============================================================
    // 🔥 RUTA MANUAL PARA ARCHIVOS JS
    // ============================================================
    app.get(/.*\.js$/, (req, res) => {
        const cleanPath = req.path || req.url.split('?')[0];
        
        // Buscar en diferentes ubicaciones
        const locations = [
            path.join(FRONTEND_DIR, cleanPath),
            path.join(FRONTEND_DIR, 'feed', path.basename(cleanPath)),
            path.join(FRONTEND_DIR, 'feed', cleanPath.replace(/^\/feed\//, ''))
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
    // 🔥 SERVIDOR ESTÁTICO PARA EL RESTO DE ARCHIVOS
    // ============================================================
    app.use(express.static(FRONTEND_DIR, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
            if (filePath.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css');
            }
            if (filePath.endsWith('.html')) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
            }
        }
    }));
};