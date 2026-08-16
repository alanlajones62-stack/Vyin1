// backend/stories.js - VERSIÓN COMPLETA CON SQLITE PARA HISTORIAS
// Cloudinary, Sistema de bloqueos, Recomendaciones, Clasificador,
// Detección de idioma mejorada y Encuestas
// ============================================================

const auth = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const iaClassifier = require('./ia_classifier');
const videoService = require('./services/video.service');
const transcriptionService = require('./services/transcription.service');

// ============================================================
// 🔥 IMPORTAR BASE DE DATOS SQLITE PARA HISTORIAS
// ============================================================

const storyDB = require('./db/stories.db');

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
    
    console.log('✅ [STORIES] Módulo cargado con SQLite para historias');

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
    // 🔥 FUNCIÓN AUXILIAR PARA ENRIQUECER HISTORIAS CON DATOS DE USUARIO
    // ============================================================
    async function enrichStoriesWithUsers(stories, userId) {
        const users = read('users.json');
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const currentUser = users.find(u => u.id === userId);
        const blockedIds = currentUser?.blocked || [];
        const blockedByIds = currentUser?.blockedBy || [];

        const result = [];
        for (const story of stories) {
            const owner = userMap[story.userId];
            if (!owner) continue;
            
            // 🔥 VERIFICAR BLOQUEOS
            if (blockedIds.includes(owner.id)) continue;
            if (blockedByIds.includes(owner.id)) continue;
            
            // 🔥 VERIFICAR VISIBILIDAD
            if (owner.id !== userId && typeof areStoriesVisible === 'function') {
                if (!areStoriesVisible(owner, userId)) continue;
            }

            // Convertir campos que vienen como string desde SQLite
            const enrichedStory = {
                ...story,
                views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                iaClassification: typeof story.iaClassification === 'string' ? JSON.parse(story.iaClassification || 'null') : (story.iaClassification || null),
                surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                flagged: story.flagged === 1 || story.flagged === true,
                hidden: story.hidden === 1 || story.hidden === true,
                hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                embedded: story.embedded === 1 || story.embedded === true,
                hiddenByIA: story.hiddenByIA === 1 || story.hiddenByIA === true,
                isSurvey: story.isSurvey === 1 || story.isSurvey === true,
                userData: {
                    id: owner.id,
                    username: owner.username,
                    fullName: owner.fullName,
                    avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                    isVerified: owner.isVerified || false,
                    accountType: owner.accountType || 'personal'
                }
            };
            
            result.push(enrichedStory);
        }
        return result;
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
    // 🔥 RUTA: FEED CON SORT (LEGACY) - CON SQLITE
    // ============================================================
    
    router.get('/feed', auth, async (req, res) => {
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            const stories = await storyDB.getActiveStories();
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            let visibleStories = [];
            for (const story of stories) {
                const storyOwner = userMap[story.userId];
                if (!storyOwner) continue;
                
                // 🔥 VERIFICAR BLOQUEOS
                if (blockedIds.includes(storyOwner.id)) continue;
                if (blockedByIds.includes(storyOwner.id)) continue;
                
                if (storyOwner.id === userId) {
                    const enriched = {
                        ...story,
                        views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                        likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                        comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                        surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                        segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                        flagged: story.flagged === 1 || story.flagged === true,
                        hidden: story.hidden === 1 || story.hidden === true,
                        hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                        userData: {
                            id: storyOwner.id,
                            username: storyOwner.username,
                            fullName: storyOwner.fullName,
                            avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                            isVerified: storyOwner.isVerified || false,
                            accountType: storyOwner.accountType || 'personal'
                        }
                    };
                    visibleStories.push(enriched);
                    continue;
                }

                if (typeof areStoriesVisible === 'function') {
                    if (!areStoriesVisible(storyOwner, userId)) continue;
                }

                const enriched = {
                    ...story,
                    views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                    likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                    comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                    surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                    segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                    flagged: story.flagged === 1 || story.flagged === true,
                    hidden: story.hidden === 1 || story.hidden === true,
                    hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                    userData: {
                        id: storyOwner.id,
                        username: storyOwner.username,
                        fullName: storyOwner.fullName,
                        avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                        isVerified: storyOwner.isVerified || false,
                        accountType: storyOwner.accountType || 'personal'
                    }
                };
                visibleStories.push(enriched);
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
                    userId: userId,
                    source: 'sqlite'
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /feed:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥🔥🔥 RUTA: FEED POR CURSOR - CON SQLITE Y RECOMENDACIONES
    // ============================================================

    router.get('/feed/cursor', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 20;
            const cursor = req.query.cursor || null;
            const filter = req.query.filter || 'ranked';

            console.log(`📡 Feed por cursor: usuario=${userId}, filter=${filter}, cursor=${cursor}`);

            const users = read('users.json');
            const now = Date.now();

            const user = users.find(u => u.id === userId);
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // 🔥 OBTENER BLOQUEADOS
            const blockedIds = user.blocked || [];
            const blockedByIds = user.blockedBy || [];

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            // Convertir campos de string a objetos
            allStories = allStories.map(s => ({
                ...s,
                views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                flagged: s.flagged === 1 || s.flagged === true,
                hidden: s.hidden === 1 || s.hidden === true,
                hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                embedded: s.embedded === 1 || s.embedded === true,
                hiddenByIA: s.hiddenByIA === 1 || s.hiddenByIA === true,
                isSurvey: s.isSurvey === 1 || s.isSurvey === true
            }));

            // ============================================================
            // 🔥 OBTENER RECOMENDACIONES DEL SERVICIO UNIFICADO
            // ============================================================
            let recommendedStories = [];
            
            if (filter === 'ranked' || filter === 'recommended') {
                try {
                    const getRecommendationService = require('./services/recommendation');
                    const recommendationService = getRecommendationService();
                    
                    // Obtener hasta 200 historias recomendadas
                    recommendedStories = await recommendationService.recommendStories(userId, 200);
                    console.log(`✅ [RECOMMENDATIONS] ${recommendedStories.length} historias recomendadas obtenidas`);
                } catch (error) {
                    console.warn('⚠️ Error obteniendo recomendaciones:', error.message);
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

                let activeStories = allStories.filter(s => {
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
                        source: 'sqlite',
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
                    hasSubtitles: story.hasSubtitles || false,
                    subtitles: story.subtitles || null,
                    language: story.language || 'es',
                    country: story.country || null,
                    region: story.region || 'other',
                    recommendationScore: story.recommendationScore || 0,
                    topics: story.topics || [],
                    semanticMatch: story.semanticMatch || false,
                    interestMatch: story.interestMatch || false,
                    interestMatchCount: story.interestMatchCount || 0,
                    source: 'sqlite'
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
                    source: 'sqlite',
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
    // RUTA: FEED PÚBLICO - CON SQLITE
    // ============================================================
    
    router.get('/public', auth, async (req, res) => {
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let stories = await storyDB.getActiveStories();
            
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const publicStories = stories
                .filter(s => {
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
                        views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                        likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                        comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                        surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                        segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                        flagged: s.flagged === 1 || s.flagged === true,
                        hidden: s.hidden === 1 || s.hidden === true,
                        hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                        userData: {
                            id: storyOwner.id,
                            username: storyOwner.username,
                            fullName: storyOwner.fullName,
                            avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                            isVerified: storyOwner.isVerified || false,
                            accountType: storyOwner.accountType || 'personal'
                        }
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
                },
                source: 'sqlite'
            });

        } catch (error) {
            if (logger) logger.error('Error en /public:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: HISTORIAS POR USUARIO - CON SQLITE
    // ============================================================
    
    router.get('/user/:userId', auth, async (req, res) => {
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let userStories = await storyDB.getStoriesByUser(targetUserId);
            
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

            const filteredStories = userStories
                .filter(s => {
                    if (!s.expiresAt) return false;
                    if (s.hidden) return false;
                    return new Date(s.expiresAt).getTime() > now;
                })
                .map(s => ({
                    ...s,
                    views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                    likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                    comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                    surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                    segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                    flagged: s.flagged === 1 || s.flagged === true,
                    hidden: s.hidden === 1 || s.hidden === true,
                    hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                    userData: {
                        id: targetUser.id,
                        username: targetUser.username,
                        fullName: targetUser.fullName,
                        avatar: targetUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUser.fullName)}&background=a855f7&color=fff`,
                        isVerified: targetUser.isVerified || false,
                        accountType: targetUser.accountType || 'personal'
                    }
                }))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json(filteredStories);

        } catch (error) {
            if (logger) logger.error('Error en /user/:userId:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: DETALLES DE HISTORIA - CON SQLITE
    // ============================================================
    
    router.get('/:storyId/details', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            if (logger) logger.info(`📖 Obteniendo detalles de historia: ${storyId}`);

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            // Convertir campos
            const enrichedStory = {
                ...story,
                views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                iaClassification: typeof story.iaClassification === 'string' ? JSON.parse(story.iaClassification || 'null') : (story.iaClassification || null),
                surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                flagged: story.flagged === 1 || story.flagged === true,
                hidden: story.hidden === 1 || story.hidden === true,
                hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                embedded: story.embedded === 1 || story.embedded === true,
                hiddenByIA: story.hiddenByIA === 1 || story.hiddenByIA === true,
                isSurvey: story.isSurvey === 1 || story.isSurvey === true
            };

            const storyOwner = users.find(u => u.id === enrichedStory.userId);

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

            // 🔥 OBTENER COMENTARIOS DESDE SQLITE
            let comments = await storyDB.getCommentsByStory(storyId);
            
            // Construir árbol de comentarios (anidados)
            const commentMap = {};
            const rootComments = [];
            
            comments.forEach(c => {
                commentMap[c.id] = {
                    ...c,
                    likes: typeof c.likes === 'string' ? JSON.parse(c.likes || '[]') : (c.likes || []),
                    hasFile: c.hasFile === 1 || c.hasFile === true,
                    replies: [],
                    userData: null
                };
            });
            
            // Enriquecer con datos de usuario
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            Object.values(commentMap).forEach(c => {
                const user = userMap[c.userId];
                if (user) {
                    c.username = user.username;
                    c.fullName = user.fullName;
                    c.avatar = user.avatar;
                    c.userData = {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullName,
                        avatar: user.avatar
                    };
                }
            });
            
            // Construir árbol
            Object.values(commentMap).forEach(c => {
                if (c.parentCommentId && commentMap[c.parentCommentId]) {
                    commentMap[c.parentCommentId].replies.push(c);
                } else {
                    rootComments.push(c);
                }
            });
            
            // Ordenar
            rootComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            rootComments.forEach(c => {
                c.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            });

            enrichedStory.comments = rootComments;
            enrichedStory.userData = {
                id: storyOwner.id,
                username: storyOwner.username,
                fullName: storyOwner.fullName,
                avatar: storyOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(storyOwner.fullName)}&background=a855f7&color=fff`,
                isVerified: storyOwner.isVerified || false,
                accountType: storyOwner.accountType || 'personal'
            };
            enrichedStory.language = story.language || 'es';

            res.json(enrichedStory);

        } catch (error) {
            if (logger) logger.error('Error en /:storyId/details:', { error: error.message });
            console.error('Error en /:storyId/details:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: OBTENER UNA HISTORIA - CON SQLITE
    // ============================================================
    
    router.get('/:storyId', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

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
                views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                flagged: story.flagged === 1 || story.flagged === true,
                hidden: story.hidden === 1 || story.hidden === true,
                hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
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
    // RUTA: HISTORIAS POR HASHTAG - CON SQLITE
    // ============================================================
    
    router.get('/hashtag/:tag', auth, async (req, res) => {
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            const now = Date.now();
            const MAX_AGE_HOURS = 24;
            const cutoffTime = now - (MAX_AGE_HOURS * 60 * 60 * 1000);
            
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            const hashtagStories = allStories.filter(story => {
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
                    views: typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []),
                    likes: typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []),
                    comments: typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []),
                    surveyData: typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null),
                    segments: typeof story.segments === 'string' ? JSON.parse(story.segments || 'null') : (story.segments || null),
                    flagged: story.flagged === 1 || story.flagged === true,
                    hidden: story.hidden === 1 || story.hidden === true,
                    hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                    userData: {
                        id: owner.id,
                        username: owner.username,
                        fullName: owner.fullName,
                        avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                        isVerified: owner.isVerified || false,
                        accountType: owner.accountType || 'personal'
                    }
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
    // 🔥 RUTA: CREAR HISTORIA - CON SQLITE
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
                language,
                surveyData
            } = req.body;

            console.log('📸 Datos recibidos:', { 
                mediaType, 
                mediaUrl: mediaUrl || 'null', 
                caption: caption?.substring(0, 50) || '', 
                textContent: textContent?.substring(0, 50) || '',
                hasSubtitles: hasSubtitles || false,
                language: language || 'es',
                isSurvey: !!surveyData,
                userId 
            });

            if (!mediaType) {
                return res.status(400).json({ error: 'mediaType es requerido' });
            }

            const validMediaTypes = ['image', 'video', 'audio', 'text', 'survey'];
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
            } else if (mediaType === 'survey') {
                if (!surveyData) {
                    console.error('❌ surveyData no recibido en el body');
                    return res.status(400).json({ error: 'surveyData es requerido' });
                }
                
                const { surveyType, question, options, statsData, calculation, allowMultiple, anonymous, expiresIn, showResults } = surveyData;
                
                console.log('📊 Validando encuesta:', { surveyType, question, optionsLength: options?.length, statsLength: statsData?.length });
                
                if (!surveyType || !question) {
                    return res.status(400).json({ error: 'Tipo de encuesta y pregunta son requeridos' });
                }
                
                if (surveyType === 'poll') {
                    if (!options || options.length < 2) {
                        return res.status(400).json({ error: 'La encuesta necesita al menos 2 opciones' });
                    }
                    if (options.length > 10) {
                        return res.status(400).json({ error: 'Máximo 10 opciones por encuesta' });
                    }
                    const validOptions = options.filter(o => o.label && o.label.trim());
                    if (validOptions.length < 2) {
                        return res.status(400).json({ error: 'Las opciones deben tener un texto' });
                    }
                    surveyData.options = validOptions.map(o => ({
                        id: o.id || Date.now().toString() + Math.random().toString(36).substr(2, 4),
                        label: o.label.trim(),
                        votes: 0
                    }));
                } else if (surveyType === 'stats') {
                    if (!statsData || statsData.length < 2) {
                        return res.status(400).json({ error: 'Las estadísticas necesitan al menos 2 datos' });
                    }
                    const validStats = statsData.filter(d => d.label && d.label.trim() && d.value > 0);
                    if (validStats.length < 2) {
                        return res.status(400).json({ error: 'Los datos deben tener etiqueta y valor positivo' });
                    }
                    surveyData.statsData = validStats.map(d => ({
                        label: d.label.trim(),
                        value: parseInt(d.value) || 0,
                        color: d.color || '#c084fc'
                    }));
                } else if (surveyType === 'calculation') {
                    if (!calculation || !calculation.result) {
                        return res.status(400).json({ error: 'El cálculo necesita un resultado' });
                    }
                    surveyData.calculation = {
                        operation: calculation.operation || '',
                        formula: calculation.formula || '',
                        result: calculation.result || ''
                    };
                } else {
                    return res.status(400).json({ error: 'Tipo de encuesta inválido' });
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

            // 🔥 DETECCIÓN DE IDIOMA
            let detectedLanguage = language || 'es';
            
            if (!language || language === 'es') {
                try {
                    const { getVyinService } = require('./services/vyin-ia.service');
                    const vyinService = getVyinService();
                    
                    let textToDetect = '';
                    if (mediaType === 'text' && textContent) {
                        textToDetect = textContent;
                    } else if (caption && caption.trim().length > 0) {
                        textToDetect = caption;
                    } else if (subtitles && subtitles.trim().length > 0) {
                        textToDetect = subtitles;
                    } else if (mediaType === 'survey' && surveyData?.question) {
                        textToDetect = surveyData.question;
                    }
                    
                    if (textToDetect && textToDetect.trim().length > 0) {
                        detectedLanguage = await vyinService.detectLanguage(textToDetect);
                        console.log(`🔍 [DETECCIÓN] Idioma detectado: ${detectedLanguage}`);
                    }
                } catch (error) {
                    console.warn('⚠️ Error detectando idioma:', error.message);
                    detectedLanguage = 'es';
                }
            }

            // ============================================================
            // 🔥 CREAR HISTORIA
            // ============================================================
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
                countryName: user.countryName || null,
                publicId: null,
                cloudinaryUrl: null,
                isSurvey: mediaType === 'survey' ? 1 : 0,
                surveyType: null,
                surveyData: null
            };

            // ============================================================
            // 🔥 AGREGAR DATOS DE ENCUESTA
            // ============================================================
            if (mediaType === 'survey' && surveyData) {
                console.log('📊 Guardando encuesta en la historia...');
                story.surveyType = surveyData.surveyType;
                story.surveyData = {
                    question: surveyData.question || '',
                    options: surveyData.options || [],
                    statsData: surveyData.statsData || [],
                    calculation: surveyData.calculation || null,
                    allowMultiple: surveyData.allowMultiple || false,
                    anonymous: surveyData.anonymous || false,
                    showResults: surveyData.showResults || false,
                    totalVotes: 0,
                    voters: [],
                    createdAt: new Date().toISOString(),
                    expiresIn: surveyData.expiresIn || 24,
                    isExpired: false
                };
                story.caption = surveyData.question || caption || '📊 Encuesta';
                console.log('✅ Encuesta guardada');
            }

            console.log(`📍 Historia guardada con: país=${story.country}, región=${story.region}, idioma=${story.language}, tipo=${mediaType}`);

            // ============================================================
            // 🔥 CLASIFICAR IMAGEN
            // ============================================================
            if (mediaType === 'image' && mediaUrl && mediaUrl.startsWith('/uploads/')) {
                try {
                    const imagePath = path.join(__dirname, '../frontend', mediaUrl);
                    
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
                    }
                } catch (error) {
                    console.error('❌ [IA] Error clasificando imagen:', error.message);
                }
            }

            // ============================================================
            // 🔥 PROCESAR HASHTAGS
            // ============================================================
            if (story.caption) {
                try {
                    console.log('🏷️ Procesando hashtags para historia:', story.id);
                    processHashtags(story.id, story.caption, userId);
                } catch (e) {
                    console.warn('⚠️ Error procesando hashtags:', e.message);
                }
            }

            // ============================================================
            // 🔥 GUARDAR EN SQLITE
            // ============================================================
            await storyDB.createStory(story);

            // ============================================================
            // 🔥 GENERAR EMBEDDING
            // ============================================================
            try {
                console.log('🧠 Generando embedding multilingüe para historia:', story.id);
                const { getEmbeddingService } = require('./services/embedding.service');
                const embeddingService = await getEmbeddingService();
                const result = await embeddingService.embedStory(story);
                
                if (result) {
                    story.embedded = true;
                    story.embeddingVersion = 'paraphrase-multilingual-MiniLM-L12-v2';
                    // Actualizar en DB
                    await storyDB.updateStory(story.id, { embedded: true });
                    console.log('✅ Embedding generado correctamente');
                }
            } catch (embedError) {
                console.warn('⚠️ Error generando embedding:', embedError.message);
            }

            // ============================================================
            // 🔥 INVALIDAR CACHÉ
            // ============================================================
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

            // ============================================================
            // 🔥 EMITIR EVENTO
            // ============================================================
            const storyWithUser = {
                ...story,
                views: [],
                likes: [],
                comments: [],
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
                
                if (mediaType === 'survey') {
                    io.to(`story_${story.id}`).emit('survey_created', {
                        storyId: story.id,
                        surveyData: story.surveyData,
                        userId: userId
                    });
                }
            } else {
                io.to(`user_${userId}`).emit('story_hidden', {
                    storyId: story.id,
                    reason: story.hiddenReason || 'Contenido inapropiado',
                    byIA: story.hiddenByIA
                });
            }

            if (logger) logger.info(`✅ Historia creada: ${story.id} País: ${story.country}, Región: ${story.region}, Idioma: ${story.language}, Tipo: ${mediaType}`);
            console.log(`✅ Historia creada: ${story.id} por usuario ${user.username}`);
            
            res.status(201).json(storyWithUser);

        } catch (error) {
            console.error('❌ Error creando historia:', error);
            if (logger) logger.error('Error creando historia:', { error: error.message, stack: error.stack });
            res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
        }
    });

    // ============================================================
    // 🔥🔥🔥 RUTA: VOTAR EN ENCUESTA (CON SQLITE)
    // ============================================================

    router.post('/:storyId/survey/vote', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            const { optionId } = req.body;

            console.log(`📊 [SURVEY] Voto recibido: storyId=${storyId}, userId=${userId}, optionId=${optionId}`);

            if (!optionId) {
                return res.status(400).json({ error: 'optionId es requerido' });
            }

            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            // Verificar que sea una encuesta
            if (story.mediaType !== 'survey' || !story.surveyData) {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }

            // Parsear surveyData si viene como string
            let surveyData = typeof story.surveyData === 'string' ? JSON.parse(story.surveyData) : story.surveyData;

            // Verificar si la encuesta ha expirado
            if (surveyData.isExpired) {
                return res.status(400).json({ error: 'Esta encuesta ya ha expirado' });
            }

            const now = Date.now();
            const createdAt = new Date(surveyData.createdAt).getTime();
            const expiresIn = (surveyData.expiresIn || 24) * 60 * 60 * 1000;
            if (now - createdAt > expiresIn) {
                surveyData.isExpired = true;
                await storyDB.updateStory(storyId, { surveyData: surveyData });
                return res.status(400).json({ error: 'Esta encuesta ya ha expirado' });
            }

            // Verificar si el usuario ya votó
            if (!surveyData.voters) {
                surveyData.voters = [];
            }

            if (surveyData.voters.includes(userId)) {
                return res.status(400).json({ error: 'Ya votaste en esta encuesta' });
            }

            // Buscar la opción seleccionada
            let optionFound = false;
            let totalVotes = 0;

            if (surveyData.options && Array.isArray(surveyData.options)) {
                surveyData.options = surveyData.options.map(opt => {
                    if (opt.id === optionId) {
                        optionFound = true;
                        opt.votes = (opt.votes || 0) + 1;
                    }
                    return opt;
                });

                totalVotes = surveyData.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
            }

            if (!optionFound) {
                return res.status(400).json({ error: 'Opción no encontrada' });
            }

            // Registrar el voto del usuario
            surveyData.voters.push(userId);
            surveyData.totalVotes = totalVotes;

            // Guardar en SQLite
            await storyDB.updateStory(storyId, { surveyData: surveyData });

            // Guardar voto en tabla separada
            await storyDB.createSurveyVote({
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                storyId: storyId,
                userId: userId,
                optionId: optionId,
                votedAt: new Date().toISOString()
            });

            console.log(`✅ [SURVEY] Voto registrado para usuario ${userId} en historia ${storyId}`);

            io.emit('survey_vote_updated', {
                storyId: storyId,
                surveyData: surveyData,
                userId: userId
            });

            res.json({
                success: true,
                message: 'Voto registrado correctamente',
                surveyData: surveyData
            });

        } catch (error) {
            console.error('❌ Error votando en encuesta:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 RUTA: OBTENER RESULTADOS DE ENCUESTA (CON SQLITE)
    // ============================================================

    router.get('/:storyId/survey/results', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const story = await storyDB.getStoryById(storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            if (story.mediaType !== 'survey' || !story.surveyData) {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }

            let surveyData = typeof story.surveyData === 'string' ? JSON.parse(story.surveyData) : story.surveyData;
            const hasVoted = surveyData.voters?.includes(userId) || false;

            res.json({
                success: true,
                surveyData: surveyData,
                hasVoted: hasVoted
            });

        } catch (error) {
            console.error('❌ Error obteniendo resultados:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // RUTA: ELIMINAR HISTORIA (CON SQLITE)
    // ============================================================
    
    router.delete('/:storyId', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const story = await storyDB.getStoryById(storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            if (story.userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }

            // Eliminar embedding
            try {
                const { getEmbeddingService } = require('./services/embedding.service');
                const embeddingService = getEmbeddingService();
                embeddingService.removeEmbedding(storyId);
                console.log(`🗑️ Embedding eliminado para historia ${storyId}`);
            } catch (e) {
                console.warn('⚠️ Error eliminando embedding:', e.message);
            }

            // Eliminar archivos locales
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

            // Eliminar de Cloudinary
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

            // 🔥 ELIMINAR DE SQLITE
            await storyDB.deleteStory(storyId);

            // Invalidar caché
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
    // RUTA: DAR/QUITAR LIKE (CON SQLITE)
    // ============================================================
    
    router.post('/:storyId/like', auth, likeLimiter, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

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

            let likes = typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []);
            let liked = false;

            if (likes.includes(userId)) {
                likes = likes.filter(id => id !== userId);
                liked = false;
            } else {
                likes.push(userId);
                liked = true;
            }

            // 🔥 ACTUALIZAR EN SQLITE
            await storyDB.updateStory(storyId, { likes: likes });
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_${storyId}`);
                cache.invalidatePattern('feed_');
            } catch(e) {}

            io.emit('story_liked', {
                storyId,
                userId,
                likes: likes,
                liked: liked,
                likesCount: likes.length
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
                likes: likes,
                likesCount: likes.length
            });

        } catch (error) {
            if (logger) logger.error('Error en like:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: QUITAR LIKE (CON SQLITE)
    // ============================================================
    
    router.delete('/:storyId/like', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            let likes = typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []);
            likes = likes.filter(id => id !== userId);
            
            // 🔥 ACTUALIZAR EN SQLITE
            await storyDB.updateStory(storyId, { likes: likes });

            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_${storyId}`);
                cache.invalidatePattern('feed_');
            } catch(e) {}

            io.emit('story_liked', {
                storyId,
                userId,
                likes: likes,
                liked: false,
                likesCount: likes.length
            });

            res.json({
                success: true,
                liked: false,
                likes: likes,
                likesCount: likes.length
            });

        } catch (error) {
            if (logger) logger.error('Error quitando like:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: REGISTRAR VISTA (CON SQLITE)
    // ============================================================
    
    router.post('/:storyId/view', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

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

            let views = typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []);

            if (!views.includes(userId)) {
                views.push(userId);
                // 🔥 ACTUALIZAR EN SQLITE
                await storyDB.updateStory(storyId, { views: views });
                
                try {
                    const cache = require('./cache');
                    cache.invalidatePattern(`story_detail_${storyId}`);
                    cache.invalidatePattern('feed_');
                } catch(e) {}
            }

            res.json({
                success: true,
                viewsCount: views.length
            });

        } catch (error) {
            if (logger) logger.error('Error registrando vista:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: ESTADÍSTICAS DE HISTORIA (CON SQLITE)
    // ============================================================
    
    router.get('/:storyId/stats', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            const users = read('users.json');
            const currentUser = users.find(u => u.id === userId);
            
            // 🔥 OBTENER HISTORIA DESDE SQLITE
            const story = await storyDB.getStoryById(storyId);

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

            const views = typeof story.views === 'string' ? JSON.parse(story.views || '[]') : (story.views || []);
            const likes = typeof story.likes === 'string' ? JSON.parse(story.likes || '[]') : (story.likes || []);
            const comments = typeof story.comments === 'string' ? JSON.parse(story.comments || '[]') : (story.comments || []);
            const iaClassification = typeof story.iaClassification === 'string' ? JSON.parse(story.iaClassification || 'null') : (story.iaClassification || null);
            let surveyData = typeof story.surveyData === 'string' ? JSON.parse(story.surveyData || 'null') : (story.surveyData || null);

            const response = {
                storyId: story.id,
                views: views.length,
                likes: likes.length,
                comments: comments.length,
                score: story.score || 0,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt,
                iaClassification: iaClassification,
                flagged: story.flagged === 1 || story.flagged === true,
                flagReason: story.flagReason || null,
                hasSubtitles: story.hasSubtitles === 1 || story.hasSubtitles === true,
                subtitles: story.subtitles || null,
                language: story.language || 'es',
                embedded: story.embedded === 1 || story.embedded === true,
                country: story.country || null,
                region: story.region || 'other',
                countryName: story.countryName || null,
                source: 'sqlite'
            };

            // 🔥 SI ES ENCUESTA, AGREGAR DATOS DE ENCUESTA
            if (story.mediaType === 'survey' && surveyData) {
                response.surveyType = story.surveyType;
                response.surveyData = {
                    question: surveyData.question,
                    options: surveyData.options,
                    statsData: surveyData.statsData || [],
                    calculation: surveyData.calculation || null,
                    allowMultiple: surveyData.allowMultiple || false,
                    anonymous: surveyData.anonymous || false,
                    showResults: surveyData.showResults || false,
                    totalVotes: surveyData.totalVotes || 0,
                    voters: surveyData.voters || [],
                    createdAt: surveyData.createdAt,
                    expiresIn: surveyData.expiresIn || 24,
                    isExpired: surveyData.isExpired || false
                };
            }

            res.json(response);

        } catch (error) {
            if (logger) logger.error('Error en stats:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: TOP STORIES (CON SQLITE)
    // ============================================================
    
    router.get('/top', auth, async (req, res) => {
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let stories = await storyDB.getActiveStories();
            
            const now = Date.now();
            const cutoff = now - (days * 24 * 60 * 60 * 1000);
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const candidateStories = stories.filter(s => {
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
                const likes = typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []);
                const comments = typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []);
                const views = typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []);
                const score = likes.length * 3 + comments.length * 2 + views.length * 0.5;
                return {
                    ...s,
                    views: views,
                    likes: likes,
                    comments: comments,
                    score: score,
                    userData: {
                        id: owner.id,
                        username: owner.username,
                        fullName: owner.fullName,
                        avatar: owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.fullName)}&background=a855f7&color=fff`,
                        isVerified: owner.isVerified || false,
                        accountType: owner.accountType || 'personal'
                    }
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
                    source: 'sqlite',
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            if (logger) logger.error('Error en /top:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA: LIMPIAR HISTORIAS EXPIRADAS (CON SQLITE)
    // ============================================================
    
    router.post('/cleanup', auth, async (req, res) => {
        try {
            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            const stories = await storyDB.getAllStories();
            const now = Date.now();
            
            const activeStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                return new Date(s.expiresAt).getTime() > now;
            });

            const removedCount = stories.length - activeStories.length;
            
            if (removedCount > 0) {
                // Eliminar embeddings de historias expiradas
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
                
                // Eliminar de SQLite
                for (const story of stories) {
                    if (!activeStories.some(as => as.id === story.id)) {
                        await storyDB.deleteStory(story.id);
                    }
                }
                
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
                remaining: activeStories.length,
                source: 'sqlite'
            });

        } catch (error) {
            if (logger) logger.error('Error en cleanup:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 RUTA: BÚSQUEDA SEMÁNTICA (CON SQLITE)
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            // Convertir campos
            allStories = allStories.map(s => ({
                ...s,
                views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                flagged: s.flagged === 1 || s.flagged === true,
                hidden: s.hidden === 1 || s.hidden === true,
                hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                embedded: s.embedded === 1 || s.embedded === true,
                hiddenByIA: s.hiddenByIA === 1 || s.hiddenByIA === true,
                isSurvey: s.isSurvey === 1 || s.isSurvey === true
            }));

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
                        message: 'No se encontraron resultados semánticos',
                        source: 'sqlite'
                    }
                });
            }

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const resultIds = new Set(results.map(r => r.storyId));
            
            const matchedStories = allStories
                .filter(s => resultIds.has(s.id) && !s.hidden)
                .filter(s => {
                    const owner = userMap[s.userId];
                    if (!owner) return false;
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
                        }
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
                    source: 'sqlite',
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
    // 🔥 RUTA: BÚSQUEDA HÍBRIDA (CON SQLITE)
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

            const userLanguage = currentUser.language || 'es';

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            allStories = allStories.map(s => ({
                ...s,
                views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                flagged: s.flagged === 1 || s.flagged === true,
                hidden: s.hidden === 1 || s.hidden === true,
                hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                embedded: s.embedded === 1 || s.embedded === true,
                hiddenByIA: s.hiddenByIA === 1 || s.hiddenByIA === true,
                isSurvey: s.isSurvey === 1 || s.isSurvey === true
            }));

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const keywordLower = query.toLowerCase();
            const keywords = keywordLower.split(' ').filter(w => w.length > 1);

            // ============================================================
            // 🔥 CLASIFICAR LA BÚSQUEDA
            // ============================================================
            let detectedCategory = null;
            let detectedCategoryName = null;
            let detectedCategoryEmoji = null;
            let detectedCategoryScore = 0;

            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                
                const classificationResults = await classifier.classify(query, userLanguage);
                
                if (classificationResults && classificationResults.length > 0) {
                    const topCategory = classificationResults[0];
                    detectedCategory = topCategory.category;
                    detectedCategoryName = topCategory.name || topCategory.category;
                    detectedCategoryEmoji = topCategory.emoji || '📌';
                    detectedCategoryScore = topCategory.score || 0;
                    console.log(`📂 Categoría detectada: ${detectedCategoryName} (${detectedCategory}) con ${Math.round(detectedCategoryScore * 100)}%`);
                }
            } catch (error) {
                console.warn('⚠️ Error clasificando búsqueda:', error.message);
            }

            // ============================================================
            // 🔥 BÚSQUEDA LITERAL
            // ============================================================
            
            let literalResults = [];
            let literalIds = new Set();

            for (const s of allStories) {
                if (s.hidden) continue;
                if (s.userId === userId) continue;

                const storyOwner = userMap[s.userId];
                if (!storyOwner) continue;
                
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

            console.log(`📝 Resultados literales: ${literalResults.length}`);

            // ============================================================
            // 🔥 COMBINAR Y FILTRAR
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

            // 🔥 FILTRAR POR CATEGORÍA DETECTADA
            let combinedStories = Array.from(combinedMap.values());

            combinedStories = combinedStories.filter(s => {
                if (s.searchType === 'literal') {
                    return s.relevanceScore >= 15;
                }
                return false;
            });

            console.log(`📊 Resultados después de relevancia: ${combinedStories.length}`);

            if (detectedCategory && combinedStories.length > 0) {
                console.log(`🔍 Aplicando filtro de categoría: ${detectedCategoryName}`);
                
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                
                const classifiedResults = [];
                for (const story of combinedStories) {
                    try {
                        const classification = await classifier.classifyStory(story, userLanguage);
                        const categories = classification.categories || [];
                        const hasCategory = categories.some(c => c.category === detectedCategory);
                        
                        if (hasCategory) {
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
            // 🔥 ENRIQUECER CON DATOS DE USUARIO
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
                    source: 'sqlite',
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
    // 🔥 RUTA: RECOMENDACIONES BASADAS EN EMBEDDINGS (CON SQLITE)
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            allStories = allStories.map(s => ({
                ...s,
                views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                flagged: s.flagged === 1 || s.flagged === true,
                hidden: s.hidden === 1 || s.hidden === true,
                hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                embedded: s.embedded === 1 || s.embedded === true,
                hiddenByIA: s.hiddenByIA === 1 || s.hiddenByIA === true,
                isSurvey: s.isSurvey === 1 || s.isSurvey === true
            }));

            const { getEmbeddingService } = require('./services/embedding.service');
            const embeddingService = await getEmbeddingService();

            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            const userStories = allStories.filter(s => s.userId === userId && !s.hidden);
            
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

                        const recommendations = allStories
                            .filter(s => resultIds.has(s.id) && !s.hidden && s.userId !== userId)
                            .filter(s => {
                                const owner = userMap[s.userId];
                                if (!owner) return false;
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
                                    }
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
                                source: 'sqlite',
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                }
            }

            // Fallback: historias populares
            const popularStories = allStories
                .filter(s => !s.hidden && s.userId !== userId)
                .filter(s => {
                    const owner = userMap[s.userId];
                    if (!owner) return false;
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
                        }
                    };
                });

            res.json({
                data: popularStories,
                meta: {
                    algorithm: 'popular_fallback',
                    count: popularStories.length,
                    source: 'sqlite',
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

            // 🔥 OBTENER HISTORIAS DESDE SQLITE
            let allStories = await storyDB.getActiveStories();
            
            allStories = allStories.map(s => ({
                ...s,
                views: typeof s.views === 'string' ? JSON.parse(s.views || '[]') : (s.views || []),
                likes: typeof s.likes === 'string' ? JSON.parse(s.likes || '[]') : (s.likes || []),
                comments: typeof s.comments === 'string' ? JSON.parse(s.comments || '[]') : (s.comments || []),
                surveyData: typeof s.surveyData === 'string' ? JSON.parse(s.surveyData || 'null') : (s.surveyData || null),
                segments: typeof s.segments === 'string' ? JSON.parse(s.segments || 'null') : (s.segments || null),
                flagged: s.flagged === 1 || s.flagged === true,
                hidden: s.hidden === 1 || s.hidden === true,
                hasSubtitles: s.hasSubtitles === 1 || s.hasSubtitles === true,
                embedded: s.embedded === 1 || s.embedded === true,
                hiddenByIA: s.hiddenByIA === 1 || s.hiddenByIA === true,
                isSurvey: s.isSurvey === 1 || s.isSurvey === true
            }));

            await embeddingService.reindexAll(allStories);

            res.json({
                success: true,
                message: `Reindexados ${allStories.length} embeddings multilingües`,
                stats: embeddingService.getStats(),
                source: 'sqlite'
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
                stats: embeddingService.getStats(),
                source: 'sqlite'
            });

        } catch (error) {
            console.error('❌ Error obteniendo stats:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};