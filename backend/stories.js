// backend/stories.js - VERSIÓN COMPLETA CON CLOUDINARY, SISTEMA DE BLOQUEOS, RECOMENDACIONES Y CLASIFICADOR

const auth = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const iaClassifier = require('./ia_classifier');
const videoService = require('./services/video.service');
const transcriptionService = require('./services/transcription.service');

// ============================================================
// 🔥 IMPORTAR CLOUDINARY
// ============================================================

const { uploadFile, deleteFile, testConnection } = require('./services/cloudinary.service');

// ============================================================
// CONFIGURACIÓN DE MULTER PARA SUBIDA DE IMÁGENES Y VIDEOS
// ============================================================

const UPLOAD_DIR = path.join(__dirname, '../frontend/uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('📁 Directorio de uploads creado:', UPLOAD_DIR);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
        cb(null, uniqueName);
    }
});

// Configuración para imágenes
const imageUpload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de imagen no soportado'));
        }
    }
});

// Configuración para videos (con mayor límite)
const videoUpload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de video no soportado'));
        }
    }
});

module.exports = function(read, write, io, processHashtags, isProfileVisible, areStoriesVisible, logger, storyLimiter, likeLimiter) {
    const router = require('express').Router();
    
    console.log('✅ [STORIES] Módulo cargado correctamente');

    // ============================================================
    // 🔥 FUNCIÓN AUXILIAR PARA VERIFICAR BLOQUEOS
    // ============================================================
    function isBlocked(users, blockerId, blockedId) {
        const blocker = users.find(u => u.id === blockerId);
        const blocked = users.find(u => u.id === blockedId);
        
        if (!blocker || !blocked) return false;
        
        if (blocker.blocked && blocker.blocked.includes(blockedId)) return true;
        if (blocked.blockedBy && blocked.blockedBy.includes(blockerId)) return true;
        
        return false;
    }

    // ============================================================
    // 🔥 RUTA: VERIFICAR CONEXIÓN A CLOUDINARY
    // ============================================================
    
    router.get('/cloudinary/test', auth, async (req, res) => {
        try {
            const result = await testConnection();
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: '✅ Cloudinary conectado correctamente',
                    result: result.result
                });
            } else {
                res.json({ 
                    success: false, 
                    message: '⚠️ No se pudo conectar a Cloudinary',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('❌ Error conectando a Cloudinary:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 RUTA: SUBIR IMAGEN (CON IA + CLOUDINARY)
    // ============================================================
    
    router.post('/upload-image', auth, imageUpload.single('image'), async (req, res) => {
        try {
            console.log('📸 [STORIES] Subiendo imagen...');
            
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ninguna imagen' });
            }

            const imageUrl = `/uploads/${req.file.filename}`;
            let cloudinaryResult = null;
            let classification = null;
            
            // 🔥 CLASIFICAR CON IA
            try {
                console.log('🤖 [IA] Clasificando imagen subida...');
                const iaResult = await iaClassifier.classifyImageFile(req.file.path);
                
                if (iaResult.success) {
                    classification = {
                        label: iaResult.label,
                        confidence: iaResult.confidence,
                        percentage: iaResult.percentage,
                        is_safe: iaResult.is_safe,
                        is_nsfw: iaResult.is_nsfw,
                        is_unknown: iaResult.is_unknown,
                        timestamp: iaResult.timestamp || new Date().toISOString()
                    };
                    
                    console.log(`✅ [IA] Imagen clasificada: ${iaResult.label} (${iaResult.percentage}%)`);
                    
                    if (iaResult.is_nsfw && iaResult.percentage > 80) {
                        console.log(`⚠️ [IA] Imagen NSFW detectada con ${iaResult.percentage}% de confianza`);
                    }
                }
            } catch (error) {
                console.error('❌ [IA] Error clasificando imagen:', error.message);
            }

            // 🔥 SUBIR A CLOUDINARY
            try {
                console.log('☁️ [Cloudinary] Subiendo imagen...');
                cloudinaryResult = await uploadFile(req.file.path);
                
                if (cloudinaryResult.success) {
                    console.log(`✅ [Cloudinary] Imagen subida: ${cloudinaryResult.url}`);
                } else {
                    console.warn('⚠️ [Cloudinary] Falló la subida:', cloudinaryResult.error);
                }
            } catch (error) {
                console.error('❌ [Cloudinary] Error:', error.message);
                cloudinaryResult = { success: false, error: error.message };
            }

            // 🔥 RESPUESTA
            res.json({
                success: true,
                imageUrl: cloudinaryResult.success ? cloudinaryResult.url : imageUrl,
                publicId: cloudinaryResult.success ? cloudinaryResult.publicId : null,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                classification: classification,
                iaAvailable: classification !== null,
                cloudinary: cloudinaryResult.success,
                cloudinaryUrl: cloudinaryResult.success ? cloudinaryResult.url : null,
                message: classification?.is_nsfw && classification?.percentage > 80 
                    ? '⚠️ Contenido NSFW detectado'
                    : cloudinaryResult.success 
                        ? '✅ Imagen subida a Cloudinary'
                        : '📁 Imagen guardada localmente'
            });

        } catch (error) {
            console.error('❌ Error subiendo imagen:', error);
            res.status(500).json({ error: 'Error subiendo imagen: ' + error.message });
        }
    });

    // ============================================================
    // 🔥 RUTA: SUBIR VIDEO (CON CLOUDINARY)
    // ============================================================
    
    router.post('/upload-video', auth, videoUpload.single('video'), async (req, res) => {
        try {
            console.log('🎬 [STORIES] Subiendo video...');
            
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ningún video' });
            }

            const videoUrl = `/uploads/${req.file.filename}`;
            const shouldAddSubtitles = req.body.addSubtitles !== 'false';
            
            let subtitles = null;
            let segments = null;
            let processedVideoUrl = videoUrl;
            let hasSubtitles = false;
            let language = 'es';
            let cloudinaryResult = null;

            // 🔥 PROCESAR SUBTÍTULOS (si es necesario)
            if (shouldAddSubtitles) {
                console.log('🎙️ Procesando audio y generando subtítulos...');
                
                try {
                    const result = await videoService.processVideoWithSubtitles(
                        req.file.path,
                        transcriptionService,
                        {
                            fontSize: 28,
                            fontColor: '#FFFFFF',
                            fontOutline: '#000000'
                        }
                    );

                    if (result.success && result.videoPath) {
                        const outputFilename = `subtitled_${Date.now()}_${req.file.filename}`;
                        const outputPath = path.join(UPLOAD_DIR, outputFilename);
                        await fs.promises.rename(result.videoPath, outputPath);
                        
                        processedVideoUrl = `/uploads/${outputFilename}`;
                        subtitles = result.subtitles;
                        segments = result.segments;
                        hasSubtitles = true;
                        language = result.language || 'es';
                        
                        console.log('✅ Video procesado con subtítulos');
                        console.log(`🌐 Idioma detectado: ${language}`);
                    } else {
                        console.warn('⚠️ Error procesando subtítulos:', result.error);
                    }
                } catch (error) {
                    console.error('❌ Error en procesamiento de subtítulos:', error);
                }
            }

            // 🔥 SUBIR A CLOUDINARY
            try {
                console.log('☁️ [Cloudinary] Subiendo video...');
                const uploadPath = hasSubtitles ? path.join(UPLOAD_DIR, path.basename(processedVideoUrl)) : req.file.path;
                cloudinaryResult = await uploadFile(uploadPath, { resource_type: 'video' });
                
                if (cloudinaryResult.success) {
                    console.log(`✅ [Cloudinary] Video subido: ${cloudinaryResult.url}`);
                } else {
                    console.warn('⚠️ [Cloudinary] Falló la subida:', cloudinaryResult.error);
                }
            } catch (error) {
                console.error('❌ [Cloudinary] Error:', error.message);
                cloudinaryResult = { success: false, error: error.message };
            }

            res.json({
                success: true,
                videoUrl: cloudinaryResult.success ? cloudinaryResult.url : processedVideoUrl,
                originalUrl: videoUrl,
                publicId: cloudinaryResult.success ? cloudinaryResult.publicId : null,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                subtitles: subtitles,
                segments: segments,
                hasSubtitles: hasSubtitles,
                language: language,
                cloudinary: cloudinaryResult.success,
                cloudinaryUrl: cloudinaryResult.success ? cloudinaryResult.url : null,
                message: cloudinaryResult.success 
                    ? '✅ Video subido a Cloudinary' 
                    : '📁 Video guardado localmente'
            });

        } catch (error) {
            console.error('❌ Error subiendo video:', error);
            res.status(500).json({ error: 'Error subiendo video: ' + error.message });
        }
    });

    // ============================================================
    // 🔥 RUTA: ELIMINAR DE CLOUDINARY
    // ============================================================
    
    router.delete('/cloudinary/:publicId', auth, async (req, res) => {
        try {
            const { publicId } = req.params;
            const result = await deleteFile(publicId);
            
            if (result.success) {
                res.json({ success: true, message: 'Archivo eliminado de Cloudinary' });
            } else {
                res.status(500).json({ error: 'Error eliminando de Cloudinary: ' + (result.error || '') });
            }
        } catch (error) {
            console.error('❌ Error eliminando de Cloudinary:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR IMAGEN LOCAL
    // ============================================================
    
    router.delete('/image/:filename', auth, (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(UPLOAD_DIR, filename);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }
            
            fs.unlinkSync(filePath);
            console.log(`🗑️ Imagen eliminada: ${filename}`);
            
            res.json({ success: true, message: 'Imagen eliminada' });
        } catch (error) {
            console.error('❌ Error eliminando imagen:', error);
            res.status(500).json({ error: 'Error eliminando imagen' });
        }
    });

    // ============================================================
    // OBTENER IMAGEN (pública)
    // ============================================================
    
    router.get('/image/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(UPLOAD_DIR, filename);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }
            
            res.sendFile(filePath);
        } catch (error) {
            console.error('❌ Error sirviendo imagen:', error);
            res.status(500).json({ error: 'Error sirviendo imagen' });
        }
    });

    // ============================================================
    // OBTENER VIDEO (público)
    // ============================================================
    
    router.get('/video/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(UPLOAD_DIR, filename);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Video no encontrado' });
            }
            
            res.sendFile(filePath);
        } catch (error) {
            console.error('❌ Error sirviendo video:', error);
            res.status(500).json({ error: 'Error sirviendo video' });
        }
    });

    // ============================================================
    // 🔥 RUTA: FEED CON SORT (LEGACY) - CON FILTRO DE BLOQUEOS
    // ============================================================
    
    router.get('/feed', auth, (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 50;
            const sort = req.query.sort || 'recent';
            const page = parseInt(req.query.page) || 1;
            const skip = (page - 1) * limit;

            if (logger) logger.info(`📡 Feed para usuario ${userId}, página ${page}, sort: ${sort}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const stories = read('stories.json');
            const now = Date.now();

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            let activeStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                if (new Date(s.expiresAt).getTime() <= now) return false;
                if (s.hidden) return false;
                return true;
            });

            const visibleStories = [];
            for (const story of activeStories) {
                const storyOwner = userMap[story.userId];
                if (!storyOwner) continue;
                
                // 🔥 VERIFICAR BLOQUEOS
                if (blockedIds.includes(storyOwner.id)) continue;
                if (blockedByIds.includes(storyOwner.id)) continue;
                
                if (storyOwner.id === userId) {
                    visibleStories.push({
                        ...story,
                        userData: {
                            id: storyOwner.id,
                            username: storyOwner.username,
                            fullName: storyOwner.fullName,
                            avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                            isVerified: storyOwner.isVerified || false,
                            accountType: storyOwner.accountType || 'personal'
                        },
                        hasSubtitles: story.hasSubtitles || false,
                        subtitles: story.subtitles || null,
                        language: story.language || 'es'
                    });
                    continue;
                }

                if (typeof areStoriesVisible === 'function') {
                    if (!areStoriesVisible(storyOwner, userId)) continue;
                }

                visibleStories.push({
                    ...story,
                    userData: {
                        id: storyOwner.id,
                        username: storyOwner.username,
                        fullName: storyOwner.fullName,
                        avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                        isVerified: storyOwner.isVerified || false,
                        accountType: storyOwner.accountType || 'personal'
                    },
                    hasSubtitles: story.hasSubtitles || false,
                    subtitles: story.subtitles || null,
                    language: story.language || 'es'
                });
            }

            if (sort === 'recent') {
                visibleStories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            } else if (sort === 'oldest') {
                visibleStories.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            } else if (sort === 'score') {
                visibleStories.sort((a, b) => (b.score || 0) - (a.score || 0));
            }

            const total = visibleStories.length;
            const paginated = visibleStories.slice(skip, skip + limit);
            const hasMore = skip + limit < total;

            res.json({
                data: paginated,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore,
                    nextPage: hasMore ? page + 1 : null
                },
                meta: {
                    sort: sort,
                    userId: userId
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /feed:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥🔥🔥 RUTA: FEED POR CURSOR - CON FILTRO DE BLOQUEOS Y RECOMENDACIONES
    // ============================================================

    router.get('/feed/cursor', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 20;
            const cursor = req.query.cursor || null;
            const filter = req.query.filter || 'ranked';

            console.log(`📡 Feed por cursor: usuario=${userId}, filter=${filter}, cursor=${cursor}`);

            const users = read('users.json');
            const stories = read('stories.json');
            const now = Date.now();

            const user = users.find(u => u.id === userId);
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = user.blocked || [];
            const blockedByIds = user.blockedBy || [];

            // ============================================================
            // 🔥 OBTENER RECOMENDACIONES DEL SERVICIO UNIFICADO
            // ============================================================
            let recommendedStories = [];
            
            if (filter === 'ranked' || filter === 'recommended') {
                try {
                    const getRecommendationService = require('./services/recommendation');
                    const recommendationService = getRecommendationService();
                    
                    // Obtener hasta 200 historias recomendadas (para tener suficiente para paginar)
                    recommendedStories = await recommendationService.recommendStories(userId, 200);
                    console.log(`✅ [RECOMMENDATIONS] ${recommendedStories.length} historias recomendadas obtenidas`);
                } catch (error) {
                    console.warn('⚠️ Error obteniendo recomendaciones:', error.message);
                    // Fallback: usar el método tradicional
                    recommendedStories = [];
                }
            }

            // ============================================================
            // 🔥 SI NO HAY RECOMENDACIONES O FILTRO ES 'recent', USAR MÉTODO TRADICIONAL
            // ============================================================
            if (filter === 'recent' || recommendedStories.length === 0) {
                console.log(`📡 Usando método tradicional para filter=${filter}`);
                
                const userCountry = user.country || null;
                const userRegion = user.region || 'other';
                const userFollowing = user.following || [];

                let activeStories = stories.filter(s => {
                    if (!s.expiresAt) return false;
                    if (new Date(s.expiresAt).getTime() <= now) return false;
                    if (s.hidden) return false;
                    if (s.userId === userId) return false;
                    
                    // 🔥 FILTRAR BLOQUEADOS
                    if (blockedIds.includes(s.userId)) return false;
                    if (blockedByIds.includes(s.userId)) return false;
                    
                    return true;
                });

                if (filter === 'recent') {
                    activeStories = activeStories.filter(s => {
                        const storyCountry = s.country || null;
                        const storyRegion = s.region || 'other';
                        
                        if (!userCountry && userRegion === 'other') return true;
                        if (userCountry && storyCountry === userCountry) return true;
                        if (storyRegion === userRegion && !userCountry) return true;
                        if (storyRegion === userRegion && storyCountry === userCountry) return true;
                        return false;
                    });

                    activeStories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                } else {
                    const getGeoScore = (story) => {
                        const storyCountry = story.country || null;
                        const storyRegion = story.region || 'other';
                        let geoScore = 0;
                        
                        if (userCountry && storyCountry === userCountry) geoScore += 100;
                        if (storyRegion === userRegion) geoScore += 50;
                        if (isNearbyRegion(storyRegion, userRegion)) geoScore += 20;
                        if (userFollowing.includes(story.userId)) geoScore += 30;
                        
                        return geoScore;
                    };

                    activeStories.sort((a, b) => {
                        const aScore = (a.score || 0) + getGeoScore(a);
                        const bScore = (b.score || 0) + getGeoScore(b);
                        return bScore - aScore;
                    });
                }

                // Filtrar historias ya vistas
                activeStories = activeStories.filter(s => {
                    if (s.views && s.views.includes(userId)) {
                        return false;
                    }
                    return true;
                });

                // Aplicar cursor
                let startIndex = 0;
                if (cursor && cursor !== 'null') {
                    const cursorIndex = activeStories.findIndex(s => s.id === cursor);
                    if (cursorIndex !== -1) {
                        startIndex = cursorIndex + 1;
                    }
                }

                const paginated = activeStories.slice(startIndex, startIndex + limit);
                const hasMore = startIndex + limit < activeStories.length;
                const remaining = activeStories.length - startIndex - limit;

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
                        hasSubtitles: story.hasSubtitles || false,
                        subtitles: story.subtitles || null,
                        language: story.language || 'es',
                        country: story.country || null,
                        region: story.region || 'other'
                    };
                });

                const nextCursor = enriched.length > 0 ? enriched[enriched.length - 1].id : null;

                return res.json({
                    success: true,
                    data: enriched,
                    pagination: {
                        limit: limit,
                        hasMore: hasMore,
                        nextCursor: nextCursor,
                        totalRemaining: Math.max(0, remaining),
                        totalAvailable: activeStories.length
                    },
                    meta: {
                        filter: filter,
                        userId: userId,
                        cursor: cursor,
                        algorithm: filter === 'recent' ? 'recent_traditional' : 'geo_score',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // ============================================================
            // 🔥 FILTRAR RECOMENDACIONES POR BLOQUEOS
            // ============================================================
            const filteredRecommendations = recommendedStories.filter(story => {
                if (blockedIds.includes(story.userId)) return false;
                if (blockedByIds.includes(story.userId)) return false;
                return true;
            });

            console.log(`🔍 Recomendaciones después de filtrar bloqueos: ${filteredRecommendations.length} (de ${recommendedStories.length})`);

            // ============================================================
            // 🔥 PROCESAR RECOMENDACIONES CON CURSOR
            // ============================================================
            let startIndex = 0;
            if (cursor && cursor !== 'null') {
                const cursorIndex = filteredRecommendations.findIndex(s => s.id === cursor);
                if (cursorIndex !== -1) {
                    startIndex = cursorIndex + 1;
                    console.log(`📍 Cursor encontrado en posición ${cursorIndex}, continuando desde ${startIndex}`);
                } else {
                    console.log(`⚠️ Cursor ${cursor} no encontrado, empezando desde el principio`);
                }
            }

            const paginated = filteredRecommendations.slice(startIndex, startIndex + limit);
            const hasMore = startIndex + limit < filteredRecommendations.length;
            const remaining = filteredRecommendations.length - startIndex - limit;

            // ============================================================
            // 🔥 ENRIQUECER CON DATOS DE USUARIO
            // ============================================================
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
                    // Asegurar que estos campos existan
                    hasSubtitles: story.hasSubtitles || false,
                    subtitles: story.subtitles || null,
                    language: story.language || 'es',
                    country: story.country || null,
                    region: story.region || 'other',
                    // Información de recomendación
                    recommendationScore: story.recommendationScore || 0,
                    topics: story.topics || [],
                    semanticMatch: story.semanticMatch || false,
                    interestMatch: story.interestMatch || false,
                    interestMatchCount: story.interestMatchCount || 0
                };
            });

            const nextCursor = enriched.length > 0 ? enriched[enriched.length - 1].id : null;

            console.log(`📊 Resultados recomendados: ${enriched.length} historias, más: ${hasMore}, restantes: ${remaining}`);

            res.json({
                success: true,
                data: enriched,
                pagination: {
                    limit: limit,
                    hasMore: hasMore,
                    nextCursor: nextCursor,
                    totalRemaining: Math.max(0, remaining),
                    totalAvailable: filteredRecommendations.length
                },
                meta: {
                    filter: filter,
                    userId: userId,
                    cursor: cursor,
                    algorithm: 'recommendation_v3_unified',
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('❌ Error en feed/cursor:', error);
            if (logger) logger.error('Error en feed/cursor:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 FUNCIÓN AUXILIAR: REGIONES CERCANAS
    // ============================================================

    function isNearbyRegion(region1, region2) {
        if (!region1 || !region2) return false;
        if (region1 === region2) return true;
        
        const nearbyMap = {
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

        return nearbyMap[region1]?.includes(region2) || nearbyMap[region2]?.includes(region1);
    }

    // ============================================================
    // RUTA: FEED PÚBLICO - CON FILTRO DE BLOQUEOS
    // ============================================================
    
    router.get('/public', auth, (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 20;
            const page = parseInt(req.query.page) || 1;
            const skip = (page - 1) * limit;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const stories = read('stories.json');
            const now = Date.now();

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const publicStories = stories
                .filter(s => {
                    if (!s.expiresAt) return false;
                    if (new Date(s.expiresAt).getTime() <= now) return false;
                    if (s.hidden) return false;
                    
                    const storyOwner = userMap[s.userId];
                    if (!storyOwner) return false;
                    
                    // 🔥 FILTRAR BLOQUEADOS
                    if (blockedIds.includes(storyOwner.id)) return false;
                    if (blockedByIds.includes(storyOwner.id)) return false;
                    
                    return storyOwner.privacy === 'public';
                })
                .map(s => {
                    const storyOwner = userMap[s.userId];
                    return {
                        ...s,
                        userData: {
                            id: storyOwner.id,
                            username: storyOwner.username,
                            fullName: storyOwner.fullName,
                            avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                            isVerified: storyOwner.isVerified || false,
                            accountType: storyOwner.accountType || 'personal'
                        },
                        hasSubtitles: s.hasSubtitles || false,
                        subtitles: s.subtitles || null,
                        language: s.language || 'es'
                    };
                })
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(skip, skip + limit);

            res.json({
                data: publicStories,
                pagination: {
                    page,
                    limit,
                    total: publicStories.length,
                    hasMore: skip + limit < publicStories.length
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /public:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: HISTORIAS POR USUARIO - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.get('/user/:userId', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const currentUserId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === currentUserId);
            
            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, currentUserId, targetUserId)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }

            const stories = read('stories.json');
            const now = Date.now();

            const targetUser = users.find(u => u.id === targetUserId);
            if (!targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            if (targetUser.id !== currentUserId && typeof areStoriesVisible === 'function') {
                if (!areStoriesVisible(targetUser, currentUserId)) {
                    return res.status(403).json({ error: 'No tienes permiso' });
                }
            }

            const userStories = stories
                .filter(s => {
                    if (s.userId !== targetUserId) return false;
                    if (!s.expiresAt) return false;
                    if (s.hidden) return false;
                    return new Date(s.expiresAt).getTime() > now;
                })
                .map(s => ({
                    ...s,
                    userData: {
                        id: targetUser.id,
                        username: targetUser.username,
                        fullName: targetUser.fullName,
                        avatar: targetUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUser.fullName)}&background=a855f7&color=fff`,
                        isVerified: targetUser.isVerified || false,
                        accountType: targetUser.accountType || 'personal'
                    },
                    hasSubtitles: s.hasSubtitles || false,
                    subtitles: s.subtitles || null,
                    language: s.language || 'es'
                }))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json(userStories);

        } catch (error) {
            if (logger) logger.error('Error en /user/:userId:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: DETALLES DE HISTORIA - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.get('/:storyId/details', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            if (logger) logger.info(`📖 Obteniendo detalles de historia: ${storyId}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const storyOwner = users.find(u => u.id === story.userId);

            if (!storyOwner) {
                return res.status(404).json({ error: 'Dueño no encontrado' });
            }

            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, userId, storyOwner.id)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }

            if (storyOwner.id !== userId && !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const enrichComments = (comments) => {
                if (!comments) return [];
                comments.forEach(comment => {
                    const user = userMap[comment.userId];
                    if (user) {
                        comment.username = user.username;
                        comment.fullName = user.fullName;
                        comment.avatar = user.avatar;
                    }
                    if (comment.replies && comment.replies.length) {
                        enrichComments(comment.replies);
                    }
                });
                return comments;
            };

            const storyCopy = JSON.parse(JSON.stringify(story));
            if (!storyCopy.comments) storyCopy.comments = [];
            
            enrichComments(storyCopy.comments);
            storyCopy.comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            storyCopy.userData = {
                id: storyOwner.id,
                username: storyOwner.username,
                fullName: storyOwner.fullName,
                avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                isVerified: storyOwner.isVerified || false,
                accountType: storyOwner.accountType || 'personal'
            };

            storyCopy.language = story.language || 'es';

            res.json(storyCopy);

        } catch (error) {
            if (logger) logger.error('Error en /:storyId/details:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: OBTENER UNA HISTORIA - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.get('/:storyId', auth, (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const storyOwner = users.find(u => u.id === story.userId);

            if (!storyOwner) {
                return res.status(404).json({ error: 'Dueño no encontrado' });
            }

            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, userId, storyOwner.id)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }

            if (storyOwner.id !== userId && typeof areStoriesVisible === 'function') {
                if (!areStoriesVisible(storyOwner, userId)) {
                    return res.status(403).json({ error: 'No tienes permiso' });
                }
            }

            const storyWithUser = {
                ...story,
                userData: {
                    id: storyOwner.id,
                    username: storyOwner.username,
                    fullName: storyOwner.fullName,
                    avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                    isVerified: storyOwner.isVerified || false,
                    accountType: storyOwner.accountType || 'personal'
                },
                hasSubtitles: story.hasSubtitles || false,
                subtitles: story.subtitles || null,
                language: story.language || 'es'
            };

            res.json(storyWithUser);

        } catch (error) {
            console.error('❌ Error en /:storyId:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: HISTORIAS POR HASHTAG - CON FILTRO DE BLOQUEOS
    // ============================================================
    
    router.get('/hashtag/:tag', auth, (req, res) => {
        try {
            const tag = req.params.tag.toLowerCase();
            const userId = req.userId;
            
            console.log(`🏷️ Buscando historias con hashtag: #${tag}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const stories = read('stories.json');
            const now = Date.now();
            
            const MAX_AGE_HOURS = 24;
            const cutoffTime = now - (MAX_AGE_HOURS * 60 * 60 * 1000);
            
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            const hashtagStories = stories.filter(story => {
                if (!story.expiresAt) return false;
                if (new Date(story.expiresAt).getTime() <= now) return false;
                if (story.hidden) return false;
                
                const storyTime = new Date(story.createdAt).getTime();
                if (storyTime < cutoffTime) return false;
                
                if (!story.caption) return false;
                const regex = new RegExp(`#${tag}\\b`, 'i');
                if (!regex.test(story.caption)) return false;
                
                const storyOwner = userMap[story.userId];
                if (!storyOwner) return false;
                
                // 🔥 FILTRAR BLOQUEADOS
                if (blockedIds.includes(storyOwner.id)) return false;
                if (blockedByIds.includes(storyOwner.id)) return false;
                
                if (storyOwner.id !== userId) {
                    return areStoriesVisible(storyOwner, userId);
                }
                
                return true;
            });
            
            console.log(`🏷️ Encontradas ${hashtagStories.length} historias con #${tag}`);
            
            const groups = {};
            hashtagStories.forEach(story => {
                const owner = userMap[story.userId];
                if (!owner) return;
                
                if (!groups[story.userId]) {
                    groups[story.userId] = {
                        user: {
                            id: owner.id,
                            username: owner.username,
                            fullName: owner.fullName,
                            avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                            isVerified: owner.isVerified || false,
                            accountType: owner.accountType || 'personal'
                        },
                        stories: []
                    };
                }
                
                groups[story.userId].stories.push({
                    ...story,
                    userData: {
                        id: owner.id,
                        username: owner.username,
                        fullName: owner.fullName,
                        avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                        isVerified: owner.isVerified || false,
                        accountType: owner.accountType || 'personal'
                    },
                    hasSubtitles: story.hasSubtitles || false,
                    subtitles: story.subtitles || null,
                    language: story.language || 'es'
                });
            });
            
            Object.values(groups).forEach(group => {
                group.stories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            });
            
            const filteredGroups = Object.values(groups).filter(group => group.stories.length > 0);
            
            res.json(filteredGroups);
            
        } catch (error) {
            console.error('❌ Error en /hashtag/:tag:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: CREAR HISTORIA
    // ============================================================
    
    router.post('/', auth, storyLimiter, async (req, res) => {
        console.log('📸 [STORIES] Creando historia con IA y embeddings');
        
        try {
            const userId = req.userId;
            const { 
                mediaType, 
                mediaUrl, 
                caption, 
                textContent, 
                textBgColor,
                hasSubtitles,
                subtitles,
                segments,
                language
            } = req.body;

            console.log('📸 Datos recibidos:', { 
                mediaType, 
                mediaUrl: mediaUrl || 'null', 
                caption: caption?.substring(0, 50) || '', 
                textContent: textContent?.substring(0, 50) || '',
                hasSubtitles: hasSubtitles || false,
                language: language || 'es',
                userId 
            });

            if (!mediaType) {
                return res.status(400).json({ error: 'mediaType es requerido' });
            }

            const validMediaTypes = ['image', 'video', 'audio', 'text'];
            if (!validMediaTypes.includes(mediaType)) {
                return res.status(400).json({ error: 'mediaType inválido' });
            }

            if (mediaType === 'text') {
                if (!textContent || textContent.trim().length === 0) {
                    return res.status(400).json({ error: 'textContent es requerido' });
                }
                if (textContent.length > 1000) {
                    return res.status(400).json({ error: 'Máximo 1000 caracteres' });
                }
            } else {
                if (!mediaUrl) {
                    return res.status(400).json({ error: 'mediaUrl es requerido' });
                }
            }

            const users = read('users.json');
            const user = users.find(u => u.id === userId);
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            let detectedLanguage = language || 'es';
            
            if (!language || language === 'es') {
                try {
                    const { getVyinService } = require('./services/vyin-ia.service');
                    const vyinService = getVyinService();
                    
                    let textToDetect = '';
                    if (mediaType === 'text' && textContent) {
                        textToDetect = textContent;
                    } else if (caption && caption.trim().length > 5) {
                        textToDetect = caption;
                    } else if (subtitles && subtitles.trim().length > 5) {
                        textToDetect = subtitles;
                    } else if (textContent) {
                        textToDetect = textContent;
                    }
                    
                    if (textToDetect && textToDetect.trim().length > 3) {
                        detectedLanguage = await vyinService.detectLanguage(textToDetect);
                        console.log(`🔍 Idioma detectado automáticamente: ${detectedLanguage}`);
                    } else {
                        console.log(`📝 Texto insuficiente para detectar idioma, usando: ${detectedLanguage}`);
                    }
                } catch (error) {
                    console.warn('⚠️ Error detectando idioma:', error.message);
                    detectedLanguage = 'es';
                }
            }

            const story = {
                id: Date.now().toString(),
                userId: userId,
                mediaType: mediaType,
                mediaUrl: mediaUrl || null,
                caption: caption || '',
                textContent: textContent || null,
                textBgColor: textBgColor || '#1a1a2e',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                views: [],
                likes: [],
                comments: [],
                score: 0,
                iaClassification: null,
                flagged: false,
                flagReason: null,
                flagConfidence: 0,
                hidden: false,
                hiddenAt: null,
                hiddenReason: null,
                hiddenByIA: false,
                hasSubtitles: hasSubtitles || false,
                subtitles: subtitles || null,
                segments: segments || null,
                language: detectedLanguage,
                embedded: false,
                embeddingVersion: null,
                country: user.country || null,
                region: user.region || 'other',
                countryName: user.countryName || null
            };

            console.log(`📍 Historia guardada con: país=${story.country}, región=${story.region}, idioma=${story.language}`);

            if (mediaType === 'image' && mediaUrl && mediaUrl.startsWith('/uploads/')) {
                try {
                    const imagePath = path.join(__dirname, '../frontend', mediaUrl);
                    console.log(`🔍 Buscando imagen en: ${imagePath}`);
                    
                    if (fs.existsSync(imagePath)) {
                        console.log('🤖 [IA] Clasificando imagen de la historia...');
                        const iaResult = await iaClassifier.classifyImageFile(imagePath);
                        
                        if (iaResult.success) {
                            story.iaClassification = {
                                label: iaResult.label,
                                confidence: iaResult.confidence,
                                percentage: iaResult.percentage,
                                is_safe: iaResult.is_safe,
                                is_nsfw: iaResult.is_nsfw,
                                is_unknown: iaResult.is_unknown,
                                timestamp: iaResult.timestamp || new Date().toISOString()
                            };
                            
                            console.log(`✅ [IA] Historia clasificada: ${iaResult.label} (${iaResult.percentage}%)`);
                            
                            if (iaResult.is_nsfw && iaResult.percentage > 80) {
                                story.flagged = true;
                                story.flagReason = 'Contenido NSFW detectado automáticamente';
                                story.flagConfidence = iaResult.percentage;
                                console.log(`⚠️ [IA] Historia marcada como NSFW (${iaResult.percentage}%)`);
                            }
                            
                            if (iaResult.is_nsfw && iaResult.percentage > 95) {
                                story.hidden = true;
                                story.hiddenAt = new Date().toISOString();
                                story.hiddenReason = 'Contenido NSFW explícito detectado automáticamente';
                                story.hiddenByIA = true;
                                console.log(`🚫 [IA] Historia oculta automáticamente por NSFW explícito`);
                            }
                        }
                    } else {
                        console.warn(`⚠️ [IA] Imagen no encontrada: ${imagePath}`);
                    }
                } catch (error) {
                    console.error('❌ [IA] Error clasificando imagen:', error.message);
                }
            }

            if (story.caption) {
                try {
                    console.log('🏷️ Procesando hashtags para historia:', story.id);
                    const hashtags = processHashtags(story.id, story.caption, userId);
                    console.log(`🏷️ Hashtags encontrados: ${hashtags.length}`);
                } catch (e) {
                    console.warn('⚠️ Error procesando hashtags:', e.message);
                }
            }

            const stories = read('stories.json');
            stories.push(story);
            write('stories.json', stories);

            try {
                console.log('🧠 Generando embedding multilingüe para historia:', story.id);
                const { getEmbeddingService } = require('./services/embedding.service');
                const embeddingService = await getEmbeddingService();
                const result = await embeddingService.embedStory(story);
                
                if (result) {
                    story.embedded = true;
                    story.embeddingVersion = 'paraphrase-multilingual-MiniLM-L12-v2';
                    console.log('✅ Embedding generado correctamente');
                } else {
                    console.warn('⚠️ No se pudo generar embedding para la historia');
                }
            } catch (embedError) {
                console.warn('⚠️ Error generando embedding:', embedError.message);
            }

            try {
                const cache = require('./cache');
                cache.invalidatePattern('feed_');
                cache.invalidatePattern('stories_user_');
                cache.invalidatePattern('stories_');
                cache.invalidatePattern('hashtags');
                cache.invalidatePattern('trending');
            } catch(e) {
                console.warn('⚠️ Error invalidando caché:', e.message);
            }

            const storyWithUser = {
                ...story,
                score: 0,
                userData: {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    avatar: user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=a855f7&color=fff`,
                    isVerified: user.isVerified || false,
                    accountType: user.accountType || 'personal'
                }
            };

            if (!story.hidden) {
                io.emit('new_story', storyWithUser);
            } else {
                io.to(`user_${userId}`).emit('story_hidden', {
                    storyId: story.id,
                    reason: story.hiddenReason || 'Contenido inapropiado',
                    byIA: story.hiddenByIA
                });
            }

            if (logger) logger.info(`✅ Historia creada: ${story.id} País: ${story.country}, Región: ${story.region}, Idioma: ${story.language}`);
            console.log(`✅ Historia creada: ${story.id} por usuario ${user.username} País: ${story.country}, Región: ${story.region}, Idioma: ${story.language}`);
            
            res.status(201).json(storyWithUser);

        } catch (error) {
            console.error('❌ Error creando historia:', error);
            if (logger) logger.error('Error creando historia:', { error: error.message, stack: error.stack });
            res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
        }
    });

    // ============================================================
    // RUTA: ELIMINAR HISTORIA
    // ============================================================
    
    router.delete('/:storyId', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);

            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const story = stories[storyIndex];
            
            if (story.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }

            try {
                const { getEmbeddingService } = require('./services/embedding.service');
                const embeddingService = getEmbeddingService();
                embeddingService.removeEmbedding(storyId);
                console.log(`🗑️ Embedding eliminado para historia ${storyId}`);
            } catch (e) {
                console.warn('⚠️ Error eliminando embedding:', e.message);
            }

            if (story.mediaType === 'image' && story.mediaUrl && story.mediaUrl.startsWith('/uploads/')) {
                try {
                    const filename = path.basename(story.mediaUrl);
                    const filePath = path.join(UPLOAD_DIR, filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Imagen eliminada: ${filename}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando imagen:', e.message);
                }
            }

            if (story.mediaType === 'video' && story.mediaUrl && story.mediaUrl.startsWith('/uploads/')) {
                try {
                    const filename = path.basename(story.mediaUrl);
                    const filePath = path.join(UPLOAD_DIR, filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Video eliminado: ${filename}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando video:', e.message);
                }
            }

            if (story.publicId) {
                try {
                    const result = await deleteFile(story.publicId);
                    if (result.success) {
                        console.log(`🗑️ Eliminado de Cloudinary: ${story.publicId}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando de Cloudinary:', e.message);
                }
            }

            stories.splice(storyIndex, 1);
            write('stories.json', stories);

            try {
                const cache = require('./cache');
                cache.invalidatePattern('feed_');
                cache.invalidatePattern('stories_user_');
                cache.invalidatePattern('stories_');
                cache.invalidatePattern('hashtags');
                cache.invalidatePattern('trending');
            } catch(e) {}

            io.emit('story_deleted', { storyId });
            res.json({ success: true });

        } catch (error) {
            if (logger) logger.error('Error eliminando historia:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: DAR/QUITAR LIKE - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.post('/:storyId/like', auth, likeLimiter, (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);

            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const story = stories[storyIndex];
            const storyOwner = users.find(u => u.id === story.userId);
            
            if (!storyOwner) {
                return res.status(404).json({ error: 'Dueño no encontrado' });
            }
            
            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, userId, storyOwner.id)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }
            
            if (storyOwner.id !== userId && !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }

            if (!story.likes) story.likes = [];

            let liked = false;

            if (story.likes.includes(userId)) {
                story.likes = story.likes.filter(id => id !== userId);
                liked = false;
            } else {
                story.likes.push(userId);
                liked = true;
            }

            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_${storyId}`);
                cache.invalidatePattern('feed_');
            } catch(e) {}

            io.emit('story_liked', {
                storyId,
                userId,
                likes: story.likes,
                liked: liked,
                likesCount: story.likes.length
            });

            if (liked && storyOwner.id !== userId) {
                try {
                    const notifications = read('notifications.json');
                    const fromUser = users.find(u => u.id === userId);
                    const newNotification = {
                        id: Date.now().toString(),
                        userId: storyOwner.id,
                        type: 'like',
                        fromUserId: userId,
                        fromName: fromUser?.fullName || fromUser?.username || 'Usuario',
                        storyId: storyId,
                        read: false,
                        createdAt: new Date().toISOString()
                    };
                    notifications.push(newNotification);
                    write('notifications.json', notifications);
                    io.to(`user_${storyOwner.id}`).emit('new_notification', newNotification);
                } catch (e) {
                    if (logger) logger.warn('Error creando notificación:', { error: e.message });
                }
            }

            res.json({
                success: true,
                liked: liked,
                likes: story.likes,
                likesCount: story.likes.length
            });

        } catch (error) {
            if (logger) logger.error('Error en like:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: QUITAR LIKE
    // ============================================================
    
    router.delete('/:storyId/like', auth, (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);

            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const story = stories[storyIndex];
            
            if (!story.likes) story.likes = [];

            story.likes = story.likes.filter(id => id !== userId);
            
            write('stories.json', stories);

            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_${storyId}`);
                cache.invalidatePattern('feed_');
            } catch(e) {}

            io.emit('story_liked', {
                storyId,
                userId,
                likes: story.likes,
                liked: false,
                likesCount: story.likes.length
            });

            res.json({
                success: true,
                liked: false,
                likes: story.likes,
                likesCount: story.likes.length
            });

        } catch (error) {
            if (logger) logger.error('Error quitando like:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: REGISTRAR VISTA - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.post('/:storyId/view', auth, (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);

            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const story = stories[storyIndex];
            const storyOwner = users.find(u => u.id === story.userId);
            
            if (!storyOwner) {
                return res.status(404).json({ error: 'Dueño no encontrado' });
            }
            
            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, userId, storyOwner.id)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }
            
            if (!story.views) story.views = [];

            if (!story.views.includes(userId)) {
                story.views.push(userId);
                write('stories.json', stories);
                
                try {
                    const cache = require('./cache');
                    cache.invalidatePattern(`story_detail_${storyId}`);
                    cache.invalidatePattern('feed_');
                } catch(e) {}
            }

            res.json({
                success: true,
                viewsCount: story.views.length
            });

        } catch (error) {
            if (logger) logger.error('Error registrando vista:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: ESTADÍSTICAS DE HISTORIA - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    
    router.get('/:storyId/stats', auth, (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const storyOwner = users.find(u => u.id === story.userId);
            
            if (!storyOwner) {
                return res.status(404).json({ error: 'Dueño no encontrado' });
            }
            
            // 🔥 VERIFICAR BLOQUEOS
            if (currentUser && isBlocked(users, userId, storyOwner.id)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }
            
            if (storyOwner.id !== userId && !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }

            res.json({
                storyId: story.id,
                views: story.views?.length || 0,
                likes: story.likes?.length || 0,
                comments: story.comments?.length || 0,
                score: story.score || 0,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt,
                iaClassification: story.iaClassification || null,
                flagged: story.flagged || false,
                flagReason: story.flagReason || null,
                hasSubtitles: story.hasSubtitles || false,
                subtitles: story.subtitles || null,
                language: story.language || 'es',
                embedded: story.embedded || false,
                country: story.country || null,
                region: story.region || 'other',
                countryName: story.countryName || null
            });

        } catch (error) {
            if (logger) logger.error('Error en stats:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: TOP STORIES - CON FILTRO DE BLOQUEOS
    // ============================================================
    
    router.get('/top', auth, (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 10;
            const days = parseInt(req.query.days) || 1;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const stories = read('stories.json');
            const now = Date.now();

            const cutoff = now - (days * 24 * 60 * 60 * 1000);
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const candidateStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                if (new Date(s.expiresAt).getTime() <= now) return false;
                if (s.hidden) return false;
                const createdAt = new Date(s.createdAt).getTime();
                if (createdAt < cutoff) return false;
                
                const storyOwner = userMap[s.userId];
                if (!storyOwner) return false;
                if (storyOwner.id === userId) return false;
                
                // 🔥 FILTRAR BLOQUEADOS
                if (blockedIds.includes(storyOwner.id)) return false;
                if (blockedByIds.includes(storyOwner.id)) return false;
                
                return areStoriesVisible(storyOwner, userId);
            });

            const scoredStories = candidateStories.map(s => {
                const owner = userMap[s.userId];
                const score = (s.likes?.length || 0) * 3 + (s.comments?.length || 0) * 2 + (s.views?.length || 0) * 0.5;
                return {
                    ...s,
                    score: score,
                    userData: {
                        id: owner.id,
                        username: owner.username,
                        fullName: owner.fullName,
                        avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                        isVerified: owner.isVerified || false,
                        accountType: owner.accountType || 'personal'
                    },
                    hasSubtitles: s.hasSubtitles || false,
                    subtitles: s.subtitles || null,
                    language: s.language || 'es',
                    country: s.country || null,
                    region: s.region || 'other'
                };
            });

            const topStories = scoredStories
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, limit);

            res.json({
                data: topStories,
                meta: {
                    days: days,
                    totalConsidered: scoredStories.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /top:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: LIMPIAR HISTORIAS EXPIRADAS
    // ============================================================
    
    router.post('/cleanup', auth, (req, res) => {
        try {
            const stories = read('stories.json');
            const now = Date.now();
            
            const activeStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                return new Date(s.expiresAt).getTime() > now;
            });

            const removedCount = stories.length - activeStories.length;
            
            if (removedCount > 0) {
                try {
                    const { getEmbeddingService } = require('./services/embedding.service');
                    const embeddingService = getEmbeddingService();
                    const removedIds = stories
                        .filter(s => !activeStories.some(as => as.id === s.id))
                        .map(s => s.id);
                    for (const id of removedIds) {
                        embeddingService.removeEmbedding(id);
                    }
                    console.log(`🗑️ Eliminados ${removedIds.length} embeddings de historias expiradas`);
                } catch (e) {
                    console.warn('⚠️ Error eliminando embeddings:', e.message);
                }
                
                write('stories.json', activeStories);
                
                try {
                    const cache = require('./cache');
                    cache.invalidatePattern('feed_');
                    cache.invalidatePattern('stories_user_');
                    cache.invalidatePattern('stories_');
                    cache.invalidatePattern('hashtags');
                    cache.invalidatePattern('trending');
                } catch(e) {}
                
                io.emit('stories_updated');
            }

            res.json({
                success: true,
                removed: removedCount,
                remaining: activeStories.length
            });

        } catch (error) {
            if (logger) logger.error('Error en cleanup:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥🔥🔥 RUTA: BÚSQUEDA SEMÁNTICA MULTILINGÜE - CON FILTRO DE BLOQUEOS
    // ============================================================

    router.get('/search/semantic', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const query = req.query.q || '';
            const limit = parseInt(req.query.limit) || 30;
            const language = req.query.lang || null;
            const mediaType = req.query.type || null;

            if (!query || query.length < 2) {
                return res.status(400).json({ 
                    error: 'La búsqueda debe tener al menos 2 caracteres' 
                });
            }

            console.log(`🧠 Búsqueda semántica: "${query}" para usuario ${userId}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const { getEmbeddingService } = require('./services/embedding.service');
            const embeddingService = await getEmbeddingService();

            const filters = {};
            if (language) filters.language = language;
            if (mediaType) filters.mediaType = mediaType;

            const results = await embeddingService.searchSimilar(query, limit, userId, filters);

            if (results.length === 0) {
                return res.json({
                    success: true,
                    data: [],
                    meta: {
                        query: query,
                        algorithm: 'semantic_embedding',
                        model: 'paraphrase-multilingual-MiniLM-L12-v2',
                        languages: '100+ idiomas soportados',
                        matches: 0,
                        message: 'No se encontraron resultados semánticos'
                    }
                });
            }

            const stories = read('stories.json');
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const resultIds = new Set(results.map(r => r.storyId));
            
            const matchedStories = stories
                .filter(s => resultIds.has(s.id) && !s.hidden)
                .filter(s => {
                    const owner = userMap[s.userId];
                    if (!owner) return false;
                    // 🔥 FILTRAR BLOQUEADOS
                    if (blockedIds.includes(owner.id)) return false;
                    if (blockedByIds.includes(owner.id)) return false;
                    return true;
                })
                .map(s => {
                    const result = results.find(r => r.storyId === s.id);
                    const owner = userMap[s.userId];
                    let relevanceScore = Math.round((result?.similarity || 0) * 100);
                    
                    if (s.hasSubtitles) relevanceScore += 5;
                    relevanceScore += Math.min(10, (s.likes?.length || 0) * 0.5);
                    
                    return {
                        ...s,
                        similarity: result?.similarity || 0,
                        relevanceScore: Math.min(100, relevanceScore),
                        searchMatch: {
                            method: 'semantic',
                            similarity: result?.similarity || 0,
                            matchedText: result?.text?.substring(0, 100) || '',
                            type: 'embedding',
                            model: 'paraphrase-multilingual-MiniLM-L12-v2'
                        },
                        userData: {
                            id: owner?.id,
                            username: owner?.username,
                            fullName: owner?.fullName,
                            avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                            isVerified: owner?.isVerified || false,
                            accountType: owner?.accountType || 'personal'
                        },
                        hasSubtitles: s.hasSubtitles || false,
                        subtitles: s.subtitles || null,
                        language: s.language || 'es',
                        country: s.country || null,
                        region: s.region || 'other'
                    };
                })
                .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
                .slice(0, limit);

            res.json({
                success: true,
                data: matchedStories,
                meta: {
                    query: query,
                    algorithm: 'semantic_embedding',
                    model: 'paraphrase-multilingual-MiniLM-L12-v2',
                    languages: '100+ idiomas (español, inglés, portugués, francés, alemán, chino, árabe, ruso, etc.)',
                    matches: matchedStories.length,
                    totalFound: results.length,
                    threshold: 0.55,
                    language: language || 'all',
                    timestamp: new Date().toISOString(),
                    embeddingStats: embeddingService.getStats()
                }
            });

        } catch (error) {
            console.error('❌ Error en búsqueda semántica:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥🔥🔥 RUTA: BÚSQUEDA HÍBRIDA COMPLETA - CON FILTRO DE BLOQUEOS Y CONTENTCLASSIFIER
    // ============================================================

    router.get('/search/hybrid', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const query = req.query.q || '';
            const limit = parseInt(req.query.limit) || 50;
            const page = parseInt(req.query.page) || 1;
            const skip = (page - 1) * limit;

            if (!query || query.length < 2) {
                return res.status(400).json({ 
                    error: 'La búsqueda debe tener al menos 2 caracteres' 
                });
            }

            console.log(`🔍 Búsqueda híbrida: "${query}" para usuario ${userId}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            // 🔥🔥🔥 OBTENER IDIOMA DEL USUARIO
            const userLanguage = currentUser.language || 'es';

            // 🔥🔥🔥 CLASIFICAR LA BÚSQUEDA CON ContentClassifier (NUEVO SISTEMA)
            let detectedCategory = null;
            let detectedCategoryName = null;
            let detectedCategoryEmoji = null;
            let detectedCategoryScore = 0;

            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                
                // Clasificar el texto de búsqueda con el sistema nuevo
                const classificationResults = await classifier.classify(query, userLanguage);
                
                if (classificationResults && classificationResults.length > 0) {
                    const topCategory = classificationResults[0];
                    detectedCategory = topCategory.category;
                    detectedCategoryName = topCategory.name || topCategory.category;
                    detectedCategoryEmoji = topCategory.emoji || '📌';
                    detectedCategoryScore = topCategory.score || 0;
                    console.log(`📂 Categoría detectada (NUEVO sistema ContentClassifier): ${detectedCategoryName} (${detectedCategory}) con ${Math.round(detectedCategoryScore * 100)}%`);
                }
            } catch (error) {
                console.warn('⚠️ Error clasificando búsqueda con ContentClassifier:', error.message);
            }

            const stories = read('stories.json');
            const now = Date.now();

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const keywordLower = query.toLowerCase();
            const keywords = keywordLower.split(' ').filter(w => w.length > 1);

            // ============================================================
            // 🔥 1. BÚSQUEDA LITERAL CON FILTRO DE BLOQUEOS
            // ============================================================
            
            let literalResults = [];
            let literalIds = new Set();
            let maxScore = 0;

            for (const s of stories) {
                if (!s.expiresAt) continue;
                if (new Date(s.expiresAt).getTime() <= now) continue;
                if (s.hidden) continue;
                if (s.userId === userId) continue;

                const storyOwner = userMap[s.userId];
                if (!storyOwner) continue;
                
                // 🔥 FILTRAR BLOQUEADOS
                if (blockedIds.includes(storyOwner.id)) continue;
                if (blockedByIds.includes(storyOwner.id)) continue;
                
                if (typeof areStoriesVisible === 'function') {
                    if (!areStoriesVisible(storyOwner, userId)) continue;
                }

                const subtitles = (s.subtitles || '').toLowerCase();
                const caption = (s.caption || '').toLowerCase();
                const textContent = (s.textContent || '').toLowerCase();
                const hashtags = (s.caption || '').match(/#([a-zA-Z0-9_]+)/g) || [];
                const hashtagsText = hashtags.map(h => h.toLowerCase()).join(' ');

                const combined = `${subtitles} ${caption} ${textContent} ${hashtagsText}`;
                let relevanceScore = 0;
                let matchSources = [];

                if (combined.includes(keywordLower)) {
                    relevanceScore += 40;
                    matchSources.push('frase exacta');
                }

                for (const word of keywords) {
                    if (combined.includes(word)) {
                        relevanceScore += 15;
                        if (!matchSources.includes(word)) matchSources.push(word);
                    }
                }

                if (subtitles.includes(keywordLower) || keywords.some(w => subtitles.includes(w))) {
                    relevanceScore += 20;
                    matchSources.push('subtítulos');
                }

                if (hashtagsText.includes(keywordLower) || keywords.some(w => hashtagsText.includes(w))) {
                    relevanceScore += 18;
                    matchSources.push('hashtags');
                }

                if (caption.includes(keywordLower) || keywords.some(w => caption.includes(w))) {
                    relevanceScore += 12;
                    matchSources.push('descripción');
                }

                if (textContent.includes(keywordLower) || keywords.some(w => textContent.includes(w))) {
                    relevanceScore += 10;
                    matchSources.push('texto');
                }

                if (s.hasSubtitles) relevanceScore += 3;
                relevanceScore += (s.likes?.length || 0) * 0.2;
                relevanceScore += (s.comments?.length || 0) * 0.1;

                if (relevanceScore > 0 && matchSources.length > 0) {
                    if (relevanceScore > maxScore) maxScore = relevanceScore;
                    
                    literalIds.add(s.id);
                    literalResults.push({
                        ...s,
                        relevanceScore: Math.round(relevanceScore),
                        searchMethod: 'literal',
                        matchSources: matchSources,
                        sources: {
                            subtitles: subtitles.includes(keywordLower) || keywords.some(w => subtitles.includes(w)),
                            caption: caption.includes(keywordLower) || keywords.some(w => caption.includes(w)),
                            text: textContent.includes(keywordLower) || keywords.some(w => textContent.includes(w)),
                            hashtags: hashtagsText.includes(keywordLower) || keywords.some(w => hashtagsText.includes(w))
                        }
                    });
                }
            }

            console.log(`📝 Resultados literales: ${literalResults.length} (max score: ${maxScore})`);

            // ============================================================
            // 🔥 2. BÚSQUEDA SEMÁNTICA CON FILTRO DE BLOQUEOS
            // ============================================================
            
            let semanticResults = [];
            let semanticIds = new Set();

            if (literalResults.length < 10 && query.length > 3) {
                try {
                    const { getEmbeddingService } = require('./services/embedding.service');
                    const embeddingService = await getEmbeddingService();

                    const results = await embeddingService.searchSimilar(query, 20, userId);

                    if (results.length > 0) {
                        const filteredSemantic = results.filter(r => r.similarity > 0.6);
                        
                        if (filteredSemantic.length > 0) {
                            const resultIds = new Set(filteredSemantic.map(r => r.storyId));
                            semanticIds = resultIds;

                            const semanticStories = stories
                                .filter(s => resultIds.has(s.id) && !s.hidden && s.userId !== userId)
                                .filter(s => {
                                    const owner = userMap[s.userId];
                                    if (!owner) return false;
                                    // 🔥 FILTRAR BLOQUEADOS
                                    if (blockedIds.includes(owner.id)) return false;
                                    if (blockedByIds.includes(owner.id)) return false;
                                    return true;
                                })
                                .map(s => {
                                    const result = filteredSemantic.find(r => r.storyId === s.id);
                                    const owner = userMap[s.userId];
                                    let relevanceScore = Math.round((result?.similarity || 0) * 100);
                                    
                                    if (s.hasSubtitles) relevanceScore += 5;
                                    relevanceScore += Math.min(10, (s.likes?.length || 0) * 0.5);
                                    
                                    return {
                                        ...s,
                                        similarity: result?.similarity || 0,
                                        relevanceScore: Math.min(100, relevanceScore),
                                        searchMethod: 'semantic',
                                        matchSources: ['semántico'],
                                        sources: {
                                            semantic: true,
                                            similarity: result?.similarity || 0
                                        }
                                    };
                                });

                            semanticResults = semanticStories;
                            console.log(`🧠 Resultados semánticos: ${semanticResults.length} (similaridad > 0.6)`);
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Error en búsqueda semántica:', error.message);
                }
            }

            // ============================================================
            // 🔥 3. COMBINAR Y FILTRAR
            // ============================================================
            
            const combinedMap = new Map();

            for (const s of literalResults) {
                combinedMap.set(s.id, {
                    ...s,
                    searchType: 'literal',
                    relevanceScore: s.relevanceScore || 0,
                    matchSources: s.matchSources || [],
                    sources: s.sources || {}
                });
            }

            for (const s of semanticResults) {
                if (!combinedMap.has(s.id)) {
                    combinedMap.set(s.id, {
                        ...s,
                        searchType: 'semantic',
                        relevanceScore: s.relevanceScore || 0,
                        matchSources: s.matchSources || ['semántico'],
                        sources: s.sources || { semantic: true }
                    });
                } else {
                    const existing = combinedMap.get(s.id);
                    existing.semanticScore = s.similarity || 0;
                    existing.relevanceScore = Math.max(existing.relevanceScore || 0, s.relevanceScore || 0);
                    existing.sources = { ...existing.sources, semantic: true };
                    if (!existing.matchSources.includes('semántico')) {
                        existing.matchSources.push('semántico');
                    }
                    combinedMap.set(s.id, existing);
                }
            }

            // 🔥🔥🔥 FILTRAR POR CATEGORÍA DETECTADA (USANDO ContentClassifier)
            let combinedStories = Array.from(combinedMap.values());

            // Aplicar filtro de relevancia
            combinedStories = combinedStories.filter(s => {
                if (s.searchType === 'literal') {
                    return s.relevanceScore >= 15;
                }
                if (s.searchType === 'semantic') {
                    return s.relevanceScore >= 35;
                }
                return false;
            });

            console.log(`📊 Resultados después de relevancia: ${combinedStories.length} (de ${combinedMap.size} totales)`);

            if (detectedCategory && combinedStories.length > 0) {
                console.log(`🔍 Aplicando filtro de categoría (ContentClassifier): ${detectedCategoryName}`);
                
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                
                const classifiedResults = [];
                for (const story of combinedStories) {
                    try {
                        const classification = await classifier.classifyStory(story, userLanguage);
                        const categories = classification.categories || [];
                        const hasCategory = categories.some(c => c.category === detectedCategory);
                        
                        if (hasCategory) {
                            // 🔥 BONUS POR COINCIDENCIA DE CATEGORÍA
                            story.categoryMatch = true;
                            story.categoryName = detectedCategoryName;
                            story.categoryEmoji = detectedCategoryEmoji;
                            story.relevanceScore = (story.relevanceScore || 0) + 40;
                            classifiedResults.push(story);
                            console.log(`✅ Historia ${story.id} coincide con categoría ${detectedCategoryName}`);
                        } else {
                            story.categoryMatch = false;
                            classifiedResults.push(story);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Error clasificando historia ${story.id}:`, error.message);
                        story.categoryMatch = false;
                        classifiedResults.push(story);
                    }
                }
                
                // Ordenar: primero las que coinciden con categoría
                classifiedResults.sort((a, b) => {
                    if (a.categoryMatch && !b.categoryMatch) return -1;
                    if (!a.categoryMatch && b.categoryMatch) return 1;
                    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
                });
                
                combinedStories = classifiedResults;
                console.log(`📸 Historias en categoría "${detectedCategoryName}": ${combinedStories.filter(s => s.categoryMatch).length}`);
            }

            console.log(`📊 Resultados finales: ${combinedStories.length} historias`);

            // ============================================================
            // 🔥 4. ENRIQUECER CON DATOS DE USUARIO
            // ============================================================
            
            const enrichedStories = combinedStories.map(s => {
                const owner = userMap[s.userId];
                const sources = s.sources || {};
                const sourceLabels = [];
                if (sources.subtitles) sourceLabels.push('🎤 Subtítulos');
                if (sources.caption) sourceLabels.push('📝 Descripción');
                if (sources.hashtags) sourceLabels.push('# Hashtag');
                if (sources.text) sourceLabels.push('📄 Texto');
                if (sources.semantic) sourceLabels.push('🔍 Semántico');
                if (s.categoryMatch) sourceLabels.push(`📂 ${detectedCategoryName || 'Categoría'}`);

                return {
                    ...s,
                    userData: {
                        id: owner?.id,
                        username: owner?.username,
                        fullName: owner?.fullName,
                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                        isVerified: owner?.isVerified || false,
                        accountType: owner?.accountType || 'personal'
                    },
                    searchType: s.searchType || 'literal',
                    relevanceScore: s.relevanceScore || 0,
                    matchSources: s.matchSources || [],
                    sources: sourceLabels,
                    categoryMatch: s.categoryMatch || false,
                    categoryName: s.categoryName || null,
                    categoryEmoji: s.categoryEmoji || null,
                    hasSubtitles: s.hasSubtitles || false,
                    subtitles: s.subtitles || null,
                    language: s.language || 'es',
                    country: s.country || null,
                    region: s.region || 'other'
                };
            });

            const total = enrichedStories.length;
            const paginated = enrichedStories.slice(skip, skip + limit);
            const hasMore = skip + limit < total;

            const stats = {
                totalFound: total,
                literalCount: literalResults.length,
                semanticCount: semanticResults.length,
                uniqueCount: combinedMap.size,
                filteredCount: combinedStories.length,
                categoryMatchCount: enrichedStories.filter(s => s.categoryMatch).length,
                detectedCategory: detectedCategory,
                detectedCategoryName: detectedCategoryName,
                detectedCategoryScore: Math.round(detectedCategoryScore * 100),
                sources: {
                    subtitles: paginated.filter(s => s.sources?.includes('🎤 Subtítulos')).length,
                    caption: paginated.filter(s => s.sources?.includes('📝 Descripción')).length,
                    hashtags: paginated.filter(s => s.sources?.includes('# Hashtag')).length,
                    text: paginated.filter(s => s.sources?.includes('📄 Texto')).length,
                    semantic: paginated.filter(s => s.sources?.includes('🔍 Semántico')).length,
                    category: paginated.filter(s => s.sources?.includes(`📂 ${detectedCategoryName || 'Categoría'}`)).length
                }
            };

            res.json({
                success: true,
                data: paginated,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore,
                    nextPage: hasMore ? page + 1 : null
                },
                meta: {
                    query: query,
                    userId: userId,
                    algorithm: 'hybrid_with_contentclassifier',
                    detectedCategory: detectedCategory,
                    detectedCategoryName: detectedCategoryName,
                    detectedCategoryEmoji: detectedCategoryEmoji,
                    detectedCategoryScore: Math.round(detectedCategoryScore * 100),
                    timestamp: new Date().toISOString(),
                    stats: stats,
                    relevanceThreshold: 15,
                    classifierVersion: 'ContentClassifier_v2',
                    language: userLanguage
                }
            });

        } catch (error) {
            console.error('❌ Error en búsqueda híbrida:', error);
            res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
        }
    });

    // ============================================================
    // 🔥 RUTA: RECOMENDACIONES BASADAS EN EMBEDDINGS - CON FILTRO DE BLOQUEOS
    // ============================================================

    router.get('/recommendations/semantic', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 20;

            console.log(`🎯 Generando recomendaciones semánticas para usuario ${userId}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];

            const { getEmbeddingService } = require('./services/embedding.service');
            const embeddingService = await getEmbeddingService();

            const stories = read('stories.json');
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            const userStories = stories.filter(s => s.userId === userId && !s.hidden);
            
            if (userStories.length > 0) {
                const recentUserStories = userStories
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);

                const userProfile = recentUserStories
                    .map(s => s.caption || s.textContent || '')
                    .filter(t => t)
                    .join(' ');

                if (userProfile.trim()) {
                    const results = await embeddingService.searchSimilar(userProfile, limit * 2, userId);

                    if (results.length > 0) {
                        const resultIds = new Set(results.map(r => r.storyId));

                        const recommendations = stories
                            .filter(s => resultIds.has(s.id) && !s.hidden)
                            .filter(s => {
                                const owner = userMap[s.userId];
                                if (!owner) return false;
                                // 🔥 FILTRAR BLOQUEADOS
                                if (blockedIds.includes(owner.id)) return false;
                                if (blockedByIds.includes(owner.id)) return false;
                                return true;
                            })
                            .map(s => {
                                const result = results.find(r => r.storyId === s.id);
                                const owner = userMap[s.userId];
                                const score = (result?.similarity || 0) * 100 + (s.likes?.length || 0) * 0.5;
                                return {
                                    ...s,
                                    similarity: result?.similarity || 0,
                                    recommendationScore: Math.round(score),
                                    userData: {
                                        id: owner?.id,
                                        username: owner?.username,
                                        fullName: owner?.fullName,
                                        avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                                        isVerified: owner?.isVerified || false,
                                        accountType: owner?.accountType || 'personal'
                                    },
                                    hasSubtitles: s.hasSubtitles || false,
                                    subtitles: s.subtitles || null,
                                    language: s.language || 'es',
                                    country: s.country || null,
                                    region: s.region || 'other'
                                };
                            })
                            .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
                            .slice(0, limit);

                        return res.json({
                            data: recommendations,
                            meta: {
                                algorithm: 'semantic_recommendation',
                                model: 'paraphrase-multilingual-MiniLM-L12-v2',
                                basedOn: 'user_stories',
                                languages: '100+ idiomas soportados',
                                count: recommendations.length,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                }
            }

            // Fallback: historias populares con filtro de bloqueos
            const popularStories = stories
                .filter(s => !s.hidden && s.userId !== userId)
                .filter(s => {
                    const owner = userMap[s.userId];
                    if (!owner) return false;
                    // 🔥 FILTRAR BLOQUEADOS
                    if (blockedIds.includes(owner.id)) return false;
                    if (blockedByIds.includes(owner.id)) return false;
                    return true;
                })
                .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
                .slice(0, limit)
                .map(s => {
                    const owner = users.find(u => u.id === s.userId);
                    return {
                        ...s,
                        recommendationScore: (s.likes?.length || 0) * 2,
                        userData: {
                            id: owner?.id,
                            username: owner?.username,
                            fullName: owner?.fullName,
                            avatar: owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.fullName || 'U')}&background=a855f7&color=fff`,
                            isVerified: owner?.isVerified || false,
                            accountType: owner?.accountType || 'personal'
                        },
                        hasSubtitles: s.hasSubtitles || false,
                        subtitles: s.subtitles || null,
                        language: s.language || 'es',
                        country: s.country || null,
                        region: s.region || 'other'
                    };
                });

            res.json({
                data: popularStories,
                meta: {
                    algorithm: 'popular_fallback',
                    count: popularStories.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('❌ Error en recomendaciones semánticas:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: REINDEXAR EMBEDDINGS (ADMIN)
    // ============================================================

    router.post('/embeddings/reindex', auth, async (req, res) => {
        try {
            const userId = req.userId;
            
            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const { getEmbeddingService } = require('./services/embedding.service');
            const embeddingService = await getEmbeddingService();

            const stories = read('stories.json');
            const activeStories = stories.filter(s => {
                if (s.hidden) return false;
                if (!s.expiresAt) return false;
                return new Date(s.expiresAt).getTime() > Date.now();
            });

            await embeddingService.reindexAll(activeStories);

            res.json({
                success: true,
                message: `Reindexados ${activeStories.length} embeddings multilingües`,
                stats: embeddingService.getStats()
            });

        } catch (error) {
            console.error('❌ Error reindexando:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 RUTA: ESTADÍSTICAS DE EMBEDDINGS (ADMIN)
    // ============================================================

    router.get('/embeddings/stats', auth, async (req, res) => {
        try {
            const userId = req.userId;
            
            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const { getEmbeddingService } = require('./services/embedding.service');
            const embeddingService = await getEmbeddingService();

            res.json({
                success: true,
                stats: embeddingService.getStats()
            });

        } catch (error) {
            console.error('❌ Error obteniendo stats:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};