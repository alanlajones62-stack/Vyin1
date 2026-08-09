// backend/ranking.js - VERSIÓN SIMPLIFICADA QUE USA EL SERVICIO UNIFICADO

const auth = require('./middleware/auth');
const getRecommendationService = require('./services/recommendation');

module.exports = function(read, write, io, logger) {
    const router = require('express').Router();
    const recommendationService = getRecommendationService();

    console.log('✅ [RANKING] Módulo cargado (usando servicio unificado)');

    // ============================================================
    // 🔥 RECOMENDACIONES PRINCIPALES
    // ============================================================
    router.get('/recommendations', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 50;

            if (logger) logger.info(`📡 Recomendaciones para usuario ${userId}`);

            const recommendations = await recommendationService.recommendStories(userId, limit);

            // Enriquecer con datos de usuario
            const users = read('users.json');
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const enriched = recommendations.map(story => {
                const owner = userMap[story.userId];
                return {
                    ...story,
                    userData: {
                        id: owner?.id,
                        username: owner?.username,
                        fullName: owner?.fullName,
                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                        isVerified: owner?.isVerified || false,
                        accountType: owner?.accountType || 'personal',
                        country: owner?.country,
                        region: owner?.region
                    },
                    recommendationScore: story.recommendationScore || 0,
                    language: story.language || 'es',
                    hasSubtitles: story.hasSubtitles || false,
                    subtitles: story.subtitles || null
                };
            });

            res.json({
                data: enriched,
                meta: {
                    algorithm: 'recommendation_v3_unified',
                    userId: userId,
                    count: enriched.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /recommendations:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 FEED RANKEADO (LEGACY)
    // ============================================================
    router.get('/feed/ranked', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 50;
            const page = parseInt(req.query.page) || 1;
            const skip = (page - 1) * limit;

            const recommendations = await recommendationService.recommendStories(userId, limit + skip);
            
            const total = recommendations.length;
            const paginated = recommendations.slice(skip, skip + limit);
            const hasMore = skip + limit < total;

            const users = read('users.json');
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const enriched = paginated.map(story => {
                const owner = userMap[story.userId];
                return {
                    ...story,
                    userData: {
                        id: owner?.id,
                        username: owner?.username,
                        fullName: owner?.fullName,
                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                        isVerified: owner?.isVerified || false,
                        accountType: owner?.accountType || 'personal'
                    },
                    recommendationScore: story.recommendationScore || 0
                };
            });

            res.json({
                data: enriched,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore,
                    nextPage: hasMore ? page + 1 : null
                },
                meta: {
                    algorithm: 'recommendation_v3_unified',
                    userId: userId,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /feed/ranked:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 ESTADÍSTICAS (ADMIN)
    // ============================================================
    router.get('/stats', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            res.json({
                success: true,
                stats: recommendationService.getStats()
            });

        } catch (error) {
            if (logger) logger.error('Error en /stats:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 LIMPIAR CACHÉ (ADMIN)
    // ============================================================
    router.post('/clear-cache', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            recommendationService.clearCache();

            res.json({
                success: true,
                message: 'Caché de recomendaciones limpiado'
            });

        } catch (error) {
            if (logger) logger.error('Error limpiando caché:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // LEGACY - MANTENIDOS PARA COMPATIBILIDAD
    // ============================================================
    
    router.get('/suggestions', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 10;

            const recommendations = await recommendationService.recommendStories(userId, limit * 2);
            
            const users = read('users.json');
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const enriched = recommendations.slice(0, limit).map(story => {
                const owner = userMap[story.userId];
                return {
                    ...story,
                    userData: {
                        id: owner?.id,
                        username: owner?.username,
                        fullName: owner?.fullName,
                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`
                    },
                    topics: story.topics || [],
                    language: story.language || 'es'
                };
            });

            res.json({
                data: enriched,
                meta: {
                    algorithm: 'recommendation_v3_unified',
                    userId: userId,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /suggestions:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // POPULAR (legacy)
    router.get('/popular', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 20;

            const users = read('users.json');
            const stories = read('stories.json');
            const now = Date.now();

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            let popularStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                if (new Date(s.expiresAt).getTime() <= now) return false;
                if (s.hidden) return false;
                if (s.userId === userId) return false;
                return true;
            });

            const scored = popularStories.map(s => {
                const owner = userMap[s.userId];
                const likes = s.likes?.length || 0;
                const views = s.views?.length || 0;
                const comments = s.comments?.length || 0;
                const score = likes * 3 + views * 0.5 + comments * 2;
                
                return {
                    ...s,
                    userData: {
                        id: owner?.id,
                        username: owner?.username,
                        fullName: owner?.fullName,
                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`
                    },
                    score: score,
                    language: s.language || 'es'
                };
            });

            scored.sort((a, b) => (b.score || 0) - (a.score || 0));
            const result = scored.slice(0, limit);

            res.json({
                data: result,
                meta: {
                    totalConsidered: scored.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /popular:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};