// backend/config/vyin-config.js
// VYIN IA - CON M2M100 - COMPLETO

const { getVyinService } = require('../services/vyin-ia.service');

function setupVyinRoutes(app, read, write, auth) {
    const vyinService = getVyinService();

    console.log('🤖 [Vyin IA] Configurando rutas (M2M100 - MIT)...');

    // ============================================================
    // 🔥 RUTA: TRADUCIR TEXTO - CON sourceLanguage
    // ============================================================
    app.post('/api/vyin/translate', auth, async (req, res) => {
        try {
            const { text, targetLanguage, sourceLanguage } = req.body;
            
            if (!text) {
                return res.status(400).json({ error: 'Texto requerido' });
            }
            
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            const lang = targetLanguage || vyinService.getUserLanguage(currentUser);
            
            if (!vyinService.isEnabled()) {
                return res.status(503).json({ 
                    error: 'Servicio de traducción no disponible',
                    details: 'El servidor M2M100 no está corriendo. Ejecuta: python backend/m2m100_server.py'
                });
            }
            
            // 🔥 PASAR sourceLanguage SI VIENE
            const translated = await vyinService.translateText(text, lang, sourceLanguage || null);
            
            const isTranslated = translated !== text && translated.trim() !== text.trim();
            
            res.json({
                success: true,
                original: text,
                translated: translated,
                language: lang,
                isTranslated: isTranslated,
                engine: 'M2M100 (Meta)',
                license: 'MIT',
                sourceUsed: sourceLanguage || 'auto',
                languageInfo: vyinService.getLanguageInfo(lang)
            });
        } catch (error) {
            console.error('❌ [Vyin] Error traduciendo:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: TRADUCIR MÚLTIPLES TEXTOS
    // ============================================================
    app.post('/api/vyin/translate-batch', auth, async (req, res) => {
        try {
            const { texts, targetLanguage } = req.body;
            
            if (!texts || !Array.isArray(texts) || texts.length === 0) {
                return res.status(400).json({ error: 'Array de textos requerido' });
            }
            
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            const lang = targetLanguage || vyinService.getUserLanguage(currentUser);
            const translated = await vyinService.translateBatch(texts, lang);
            
            res.json({
                success: true,
                original: texts,
                translated: translated,
                language: lang,
                engine: 'M2M100 (Meta)',
                license: 'MIT'
            });
        } catch (error) {
            console.error('❌ [Vyin] Error traduciendo batch:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: DETECTAR IDIOMA
    // ============================================================
    app.post('/api/vyin/detect-language', auth, async (req, res) => {
        try {
            const { text } = req.body;
            
            if (!text) {
                return res.status(400).json({ error: 'Texto requerido' });
            }
            
            if (!vyinService.isEnabled()) {
                return res.status(503).json({ 
                    error: 'Servicio de detección de idioma no disponible',
                    details: 'El servidor M2M100 no está corriendo. Ejecuta: python backend/m2m100_server.py'
                });
            }
            
            const language = await vyinService.detectLanguage(text);
            
            res.json({
                success: true,
                language: language,
                engine: 'M2M100 (Meta)',
                license: 'MIT',
                languageInfo: vyinService.getLanguageInfo(language)
            });
        } catch (error) {
            console.error('❌ [Vyin] Error detectando idioma:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: IDIOMAS SOPORTADOS
    // ============================================================
    app.get('/api/vyin/languages', auth, async (req, res) => {
        try {
            const languages = vyinService.getSupportedLanguages();
            
            res.json({
                success: true,
                total: languages.length,
                languages: languages,
                engine: 'M2M100 (Meta)',
                license: 'MIT'
            });
        } catch (error) {
            console.error('❌ [Vyin] Error obteniendo idiomas:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: IDIOMA DEL USUARIO
    // ============================================================
    app.get('/api/vyin/user-language', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const lang = vyinService.getUserLanguage(currentUser);
            
            res.json({
                success: true,
                language: lang,
                languageInfo: vyinService.getLanguageInfo(lang),
                country: currentUser.country,
                countryName: currentUser.countryName,
                engine: 'M2M100 (Meta)',
                license: 'MIT'
            });
        } catch (error) {
            console.error('❌ [Vyin] Error obteniendo idioma:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: MODERAR CONTENIDO
    // ============================================================
    app.post('/api/vyin/moderate', auth, async (req, res) => {
        try {
            const { text } = req.body;
            
            if (!text) {
                return res.status(400).json({ error: 'Texto requerido' });
            }
            
            const result = vyinService.moderateContent(text);
            
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('❌ [Vyin] Error moderando:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: ESTADÍSTICAS (SOLO ADMIN)
    // ============================================================
    app.get('/api/vyin/stats', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            res.json({
                success: true,
                stats: vyinService.getStats()
            });
        } catch (error) {
            console.error('❌ [Vyin] Error obteniendo stats:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: LIMPIAR CACHÉ (SOLO ADMIN)
    // ============================================================
    app.post('/api/vyin/clear-cache', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            vyinService.clearCache();
            
            res.json({
                success: true,
                message: 'Caché de traducciones limpiado'
            });
        } catch (error) {
            console.error('❌ [Vyin] Error limpiando caché:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    console.log('✅ [Vyin IA] Rutas configuradas (M2M100 - MIT)');
}

module.exports = { setupVyinRoutes };