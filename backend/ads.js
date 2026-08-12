// backend/ads.js - Sistema de publicidad para cuentas de empresa

const auth = require('./middleware/auth');

module.exports = function(read, write, io, logger) {
    const router = require('express').Router();

    // ============================================================
    // TIPOS DE ANUNCIOS
    // ============================================================
    const AD_TYPES = {
        TRENDING: 'trending',
        SPONSORED: 'sponsored',
        PROMOTED: 'promoted'
    };

    // ============================================================
    // ESTADOS DE ANUNCIOS
    // ============================================================
    const AD_STATUS = {
        PENDING: 'pending',
        ACTIVE: 'active',
        REJECTED: 'rejected',
        EXPIRED: 'expired',
        PAUSED: 'paused'
    };

    // ============================================================
    // CREAR ANUNCIO (SOLO CUENTAS DE EMPRESA - SIN VERIFICACIÓN REQUERIDA)
    // ============================================================
    router.post('/create', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const { 
                title, 
                description, 
                imageUrl, 
                linkUrl, 
                targetAudience,
                budget,
                durationDays,
                adType,
                mediaType,
                mediaUrl
            } = req.body;

            // Validar campos requeridos
            if (!title || !description) {
                return res.status(400).json({ error: 'Título y descripción son requeridos' });
            }

            if (title.length > 100) {
                return res.status(400).json({ error: 'El título no puede tener más de 100 caracteres' });
            }

            if (description.length > 500) {
                return res.status(400).json({ error: 'La descripción no puede tener más de 500 caracteres' });
            }

            const users = read('users.json');
            const user = users.find(u => u.id === userId);

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // ✅ SOLO VERIFICAR QUE SEA CUENTA DE EMPRESA
            if (user.accountType !== 'business' && user.accountType !== 'business_verified') {
                return res.status(403).json({ 
                    error: 'Solo las cuentas de empresa pueden crear anuncios',
                    accountType: user.accountType
                });
            }

            // Verificar límite de anuncios activos
            const ads = read('ads.json');
            const activeAds = ads.filter(a => a.userId === userId && a.status === AD_STATUS.ACTIVE);
            if (activeAds.length >= 5) {
                return res.status(400).json({ 
                    error: 'Has alcanzado el límite de 5 anuncios activos simultáneamente',
                    activeCount: activeAds.length,
                    maxAllowed: 5
                });
            }

            // Crear el anuncio
            const ad = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                userId: userId,
                businessName: user.businessInfo?.name || user.fullName || 'Empresa',
                businessInfo: user.businessInfo || null,
                title: title.trim(),
                description: description.trim(),
                imageUrl: imageUrl || null,
                mediaType: mediaType || 'image',
                mediaUrl: mediaUrl || imageUrl || null,
                linkUrl: linkUrl || null,
                targetAudience: targetAudience || 'all',
                budget: budget || 0,
                durationDays: durationDays || 7,
                adType: adType || AD_TYPES.TRENDING,
                status: AD_STATUS.PENDING,
                views: 0,
                clicks: 0,
                engagement: 0,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
                approvedAt: null,
                approvedBy: null,
                rejectedAt: null,
                rejectedReason: null,
                isActive: false,
                stats: {
                    dailyViews: [],
                    dailyClicks: [],
                    dailyEngagement: []
                }
            };

            // Guardar anuncio
            let allAds = read('ads.json');
            allAds.push(ad);
            write('ads.json', allAds);

            // Notificar a los admins
            const admins = users.filter(u => u.role === 'admin');
            admins.forEach(admin => {
                io.to(`user_${admin.id}`).emit('new_ad_pending', {
                    adId: ad.id,
                    businessName: ad.businessName,
                    title: ad.title,
                    createdAt: ad.createdAt,
                    user: {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullName
                    }
                });
            });

            logger.info(`📢 Nuevo anuncio creado por ${user.username}: ${title}`);

            res.status(201).json({
                success: true,
                message: 'Anuncio creado correctamente. Esperando aprobación del equipo de moderación.',
                ad: ad
            });

        } catch (error) {
            logger.error('Error creando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // OBTENER ANUNCIOS DEL USUARIO (CUENTA DE EMPRESA)
    // ============================================================
    router.get('/my-ads', auth, (req, res) => {
        try {
            const userId = req.userId;
            const ads = read('ads.json');
            
            const userAds = ads
                .filter(a => a.userId === userId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json({
                success: true,
                ads: userAds,
                count: userAds.length
            });

        } catch (error) {
            logger.error('Error obteniendo anuncios del usuario:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER ANUNCIOS ACTIVOS (PARA EL FEED)
    // ============================================================
    router.get('/active', auth, (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 10;
            const ads = read('ads.json');
            const now = new Date();

            // Obtener anuncios activos
            const activeAds = ads
                .filter(a => {
                    if (a.status !== AD_STATUS.ACTIVE) return false;
                    if (!a.isActive) return false;
                    if (new Date(a.expiresAt) < now) return false;
                    return true;
                })
                .sort((a, b) => {
                    // Priorizar anuncios con mayor presupuesto
                    return (b.budget || 0) - (a.budget || 0);
                })
                .slice(0, limit)
                .map(a => {
                    // Ocultar información sensible
                    const { budget, ...ad } = a;
                    return ad;
                });

            res.json({
                success: true,
                ads: activeAds,
                count: activeAds.length
            });

        } catch (error) {
            logger.error('Error obteniendo anuncios activos:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // REGISTRAR VISTA DE ANUNCIO
    // ============================================================
    router.post('/:adId/view', auth, (req, res) => {
        try {
            const adId = req.params.adId;
            const userId = req.userId;

            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];
            ad.views = (ad.views || 0) + 1;

            // Registrar vista diaria
            const today = new Date().toISOString().split('T')[0];
            const dailyView = ad.stats.dailyViews.find(d => d.date === today);
            if (dailyView) {
                dailyView.count = (dailyView.count || 0) + 1;
            } else {
                ad.stats.dailyViews.push({ date: today, count: 1 });
            }

            write('ads.json', ads);

            res.json({
                success: true,
                views: ad.views
            });

        } catch (error) {
            logger.error('Error registrando vista:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // REGISTRAR CLICK EN ANUNCIO
    // ============================================================
    router.post('/:adId/click', auth, (req, res) => {
        try {
            const adId = req.params.adId;
            const userId = req.userId;

            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];
            ad.clicks = (ad.clicks || 0) + 1;

            // Registrar click diario
            const today = new Date().toISOString().split('T')[0];
            const dailyClick = ad.stats.dailyClicks.find(d => d.date === today);
            if (dailyClick) {
                dailyClick.count = (dailyClick.count || 0) + 1;
            } else {
                ad.stats.dailyClicks.push({ date: today, count: 1 });
            }

            write('ads.json', ads);

            res.json({
                success: true,
                clicks: ad.clicks,
                linkUrl: ad.linkUrl
            });

        } catch (error) {
            logger.error('Error registrando click:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // PAUSAR ANUNCIO
    // ============================================================
    router.post('/pause/:adId', auth, (req, res) => {
        try {
            const userId = req.userId;
            const adId = req.params.adId;

            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];

            if (ad.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso para pausar este anuncio' });
            }

            if (ad.status !== AD_STATUS.ACTIVE) {
                return res.status(400).json({ error: 'Solo puedes pausar anuncios activos' });
            }

            ad.status = AD_STATUS.PAUSED;
            ad.isActive = false;

            write('ads.json', ads);

            logger.info(`⏸️ Anuncio ${ad.title} pausado por ${userId}`);

            res.json({
                success: true,
                message: 'Anuncio pausado correctamente',
                ad: ad
            });

        } catch (error) {
            logger.error('Error pausando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // REANUDAR ANUNCIO
    // ============================================================
    router.post('/resume/:adId', auth, (req, res) => {
        try {
            const userId = req.userId;
            const adId = req.params.adId;

            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];

            if (ad.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso para reanudar este anuncio' });
            }

            if (ad.status !== AD_STATUS.PAUSED) {
                return res.status(400).json({ error: 'Solo puedes reanudar anuncios pausados' });
            }

            const now = new Date();
            if (new Date(ad.expiresAt) < now) {
                return res.status(400).json({ error: 'Este anuncio ya expiró' });
            }

            ad.status = AD_STATUS.ACTIVE;
            ad.isActive = true;

            write('ads.json', ads);

            logger.info(`▶️ Anuncio ${ad.title} reanudado por ${userId}`);

            res.json({
                success: true,
                message: 'Anuncio reanudado correctamente',
                ad: ad
            });

        } catch (error) {
            logger.error('Error reanudando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR ANUNCIO
    // ============================================================
    router.delete('/:adId', auth, (req, res) => {
        try {
            const userId = req.userId;
            const adId = req.params.adId;

            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];

            if (ad.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso para eliminar este anuncio' });
            }

            ads.splice(adIndex, 1);
            write('ads.json', ads);

            logger.info(`🗑️ Anuncio ${ad.title} eliminado por ${userId}`);

            res.json({
                success: true,
                message: 'Anuncio eliminado correctamente'
            });

        } catch (error) {
            logger.error('Error eliminando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER ESTADÍSTICAS DE ANUNCIO
    // ============================================================
    router.get('/stats/:adId', auth, (req, res) => {
        try {
            const userId = req.userId;
            const adId = req.params.adId;

            const ads = read('ads.json');
            const ad = ads.find(a => a.id === adId);

            if (!ad) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            if (ad.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso para ver las estadísticas de este anuncio' });
            }

            const now = new Date();
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Calcular estadísticas de los últimos 7 días
            const dailyViews = ad.stats.dailyViews
                .filter(d => new Date(d.date) >= sevenDaysAgo)
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const dailyClicks = ad.stats.dailyClicks
                .filter(d => new Date(d.date) >= sevenDaysAgo)
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const totalViews = ad.views || 0;
            const totalClicks = ad.clicks || 0;
            const clickThroughRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

            res.json({
                success: true,
                stats: {
                    totalViews,
                    totalClicks,
                    clickThroughRate: Math.round(clickThroughRate * 100) / 100,
                    dailyViews,
                    dailyClicks,
                    engagement: ad.engagement || 0,
                    status: ad.status,
                    isActive: ad.isActive,
                    createdAt: ad.createdAt,
                    expiresAt: ad.expiresAt,
                    durationDays: ad.durationDays || 7,
                    budget: ad.budget || 0
                }
            });

        } catch (error) {
            logger.error('Error obteniendo estadísticas:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER TODOS LOS ANUNCIOS PENDIENTES (ADMIN)
    // ============================================================
    router.get('/pending', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);

            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const ads = read('ads.json');
            const pendingAds = ads
                .filter(a => a.status === AD_STATUS.PENDING)
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                .map(a => {
                    const user = users.find(u => u.id === a.userId);
                    return {
                        ...a,
                        user: user ? {
                            id: user.id,
                            username: user.username,
                            fullName: user.fullName,
                            avatar: user.avatar
                        } : null
                    };
                });

            res.json({
                success: true,
                ads: pendingAds,
                count: pendingAds.length
            });

        } catch (error) {
            logger.error('Error obteniendo anuncios pendientes:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // APROBAR ANUNCIO (ADMIN)
    // ============================================================
    router.post('/approve/:adId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);

            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden aprobar anuncios.' });
            }

            const adId = req.params.adId;
            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];

            if (ad.status !== AD_STATUS.PENDING) {
                return res.status(400).json({ error: 'Este anuncio ya ha sido procesado' });
            }

            // Aprobar anuncio
            ad.status = AD_STATUS.ACTIVE;
            ad.isActive = true;
            ad.approvedAt = new Date().toISOString();
            ad.approvedBy = req.userId;

            // Calcular fecha de expiración
            const durationMs = (ad.durationDays || 7) * 24 * 60 * 60 * 1000;
            ad.expiresAt = new Date(Date.now() + durationMs).toISOString();

            write('ads.json', ads);

            // Notificar al creador
            io.to(`user_${ad.userId}`).emit('ad_approved', {
                adId: ad.id,
                title: ad.title,
                expiresAt: ad.expiresAt,
                message: 'Tu anuncio ha sido aprobado y ya está visible en la sección de tendencias.'
            });

            logger.info(`✅ Anuncio ${ad.title} aprobado por ${currentUser.username}`);

            res.json({
                success: true,
                message: 'Anuncio aprobado correctamente',
                ad: ad
            });

        } catch (error) {
            logger.error('Error aprobando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RECHAZAR ANUNCIO (ADMIN)
    // ============================================================
    router.post('/reject/:adId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);

            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden rechazar anuncios.' });
            }

            const { reason } = req.body;
            const adId = req.params.adId;
            let ads = read('ads.json');
            const adIndex = ads.findIndex(a => a.id === adId);

            if (adIndex === -1) {
                return res.status(404).json({ error: 'Anuncio no encontrado' });
            }

            const ad = ads[adIndex];

            if (ad.status !== AD_STATUS.PENDING) {
                return res.status(400).json({ error: 'Este anuncio ya ha sido procesado' });
            }

            // Rechazar anuncio
            ad.status = AD_STATUS.REJECTED;
            ad.isActive = false;
            ad.rejectedAt = new Date().toISOString();
            ad.rejectedReason = reason || 'No cumple con las políticas de la plataforma';

            write('ads.json', ads);

            // Notificar al creador
            io.to(`user_${ad.userId}`).emit('ad_rejected', {
                adId: ad.id,
                title: ad.title,
                reason: ad.rejectedReason,
                message: 'Tu anuncio ha sido rechazado. Motivo: ' + ad.rejectedReason
            });

            logger.info(`❌ Anuncio ${ad.title} rechazado por ${currentUser.username}: ${ad.rejectedReason}`);

            res.json({
                success: true,
                message: 'Anuncio rechazado correctamente',
                ad: ad
            });

        } catch (error) {
            logger.error('Error rechazando anuncio:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // LIMPIAR ANUNCIOS EXPIRADOS (TAREA PROGRAMADA)
    // ============================================================
    function cleanupExpiredAds() {
        try {
            let ads = read('ads.json');
            const now = new Date();
            let updated = false;

            ads = ads.map(ad => {
                if (ad.status === AD_STATUS.ACTIVE && new Date(ad.expiresAt) < now) {
                    ad.status = AD_STATUS.EXPIRED;
                    ad.isActive = false;
                    updated = true;
                    
                    // Notificar al creador
                    io.to(`user_${ad.userId}`).emit('ad_expired', {
                        adId: ad.id,
                        title: ad.title,
                        message: 'Tu anuncio ha expirado'
                    });
                }
                return ad;
            });

            if (updated) {
                write('ads.json', ads);
                logger.info('🧹 Anuncios expirados limpiados');
            }

            return ads;
        } catch (error) {
            logger.error('Error limpiando anuncios expirados:', { error: error.message });
            return [];
        }
    }

    // Ejecutar limpieza cada hora
    setInterval(() => {
        cleanupExpiredAds();
    }, 60 * 60 * 1000);

    // ============================================================
    // EXPORTAR
    // ============================================================
    return {
        router,
        cleanupExpiredAds,
        AD_TYPES,
        AD_STATUS
    };
};