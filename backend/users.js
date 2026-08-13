// backend/users.js - VERSIÓN COMPLETA CON isFollowing, VERIFICACIÓN, BLOQUEOS E INTERESES

const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_super_secreto_123';

module.exports = (read, write, isProfileVisible, areStoriesVisible, userIndex, logger) => {
    const router = require('express').Router();

    // ============================================================
    // 🔥 FUNCIÓN PARA FILTRAR BLOQUEADOS
    // ============================================================

    function filterBlockedUsers(users, currentUserId) {
        if (!currentUserId) return users;
        
        const currentUser = users.find(u => u.id === currentUserId);
        if (!currentUser) return users;
        
        const blockedIds = currentUser.blocked || [];
        const blockedByIds = currentUser.blockedBy || [];
        
        // El usuario no ve a los que bloqueó ni a los que lo bloquearon
        return users.filter(u => {
            if (u.id === currentUserId) return true;
            if (blockedIds.includes(u.id)) return false;
            if (blockedByIds.includes(u.id)) return false;
            return true;
        });
    }

    // ============================================================
    // 🔥 FUNCIÓN PARA CALCULAR PORCENTAJE DE INTERESES
    // ============================================================
    function calculateInterestPercentage(interestsCount) {
        if (!interestsCount || interestsCount === 0) return 0;
        if (interestsCount >= 6) return 20;
        if (interestsCount >= 4) return 15;
        if (interestsCount >= 2) return 10;
        return 5; // 1 interés = 5%
    }

    // ============================================================
    // MAPA DE REGIONES CERCANAS PARA FALLBACK
    // ============================================================
    const REGION_NEARBY_MAP = {
        'south_america': ['central_america', 'north_america'],
        'central_america': ['south_america', 'north_america'],
        'north_america': ['central_america', 'south_america'],
        'europe': ['north_america', 'asia', 'africa'],
        'asia': ['europe', 'oceania', 'africa'],
        'africa': ['europe', 'asia', 'south_america'],
        'oceania': ['asia', 'south_america', 'north_america'],
        'antarctica': ['south_america', 'africa', 'oceania'],
        'other': ['north_america', 'europe', 'asia']
    };

    function getNearbyRegions(region) {
        return REGION_NEARBY_MAP[region] || REGION_NEARBY_MAP['other'];
    }

    // ============================================================
    // 🔥 RUTAS
    // ============================================================

    // 🔥 POPULAR - CON FILTRO DE BLOQUEOS
    router.get('/popular', async (req, res) => {
        try {
            let users = read('users.json');
            const currentUserId = req.query.userId || null;
            
            // 🔥 FILTRAR BLOQUEADOS
            if (currentUserId) {
                users = filterBlockedUsers(users, currentUserId);
            }
            
            let currentUser = null;
            if (currentUserId) {
                currentUser = users.find(u => u.id === currentUserId);
            }
            
            const usersWithFollowers = users.map(user => {
                let isFollowing = false;
                if (currentUser && currentUser.following) {
                    isFollowing = currentUser.following.includes(user.id);
                }
                
                // 🔥 AÑADIR BADGE DE VERIFICACIÓN
                let badge = null;
                let badgeIcon = null;
                if (user.isVerified) {
                    badge = 'verified';
                    badgeIcon = '✅';
                }
                if (user.accountType === 'business' || user.accountType === 'business_verified') {
                    badge = 'business';
                    badgeIcon = '🏢';
                    if (user.isVerified) {
                        badge = 'business_verified';
                        badgeIcon = '🏢✅';
                    }
                }
                
                return {
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    bio: user.bio,
                    followersCount: user.followers?.length || 0,
                    privacy: user.privacy,
                    country: user.country,
                    countryName: user.countryName,
                    region: user.region,
                    role: user.role || 'user',
                    isFollowing: isFollowing,
                    isVerified: user.isVerified || false,
                    accountType: user.accountType || 'personal',
                    badge: badge,
                    badgeIcon: badgeIcon
                };
            });
            
            const publicUsersWithFollowers = usersWithFollowers.filter(u => 
                u.privacy === 'public' && u.followersCount > 0
            );
            
            const filteredUsers = publicUsersWithFollowers.filter(u => u.id !== currentUserId);
            
            const popular = filteredUsers
                .sort((a, b) => b.followersCount - a.followersCount)
                .slice(0, 10);
            
            logger.info(`📊 Usuarios populares: ${popular.length} usuarios con seguidores`);
            res.json(popular);
        } catch (error) {
            logger.error('Error en /popular:', { error: error.message });
            res.status(500).json({ error: 'Error al cargar usuarios populares' });
        }
    });

    // 🔥 SEARCH - CON FILTRO DE BLOQUEOS
    router.get('/search', auth.optional, (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.length < 2) {
                return res.json([]);
            }
            
            let users = read('users.json');
            const query = q.toLowerCase();
            const currentUserId = req.userId || null;
            
            // 🔥 FILTRAR BLOQUEADOS
            if (currentUserId) {
                users = filterBlockedUsers(users, currentUserId);
            }
            
            let currentUser = null;
            if (currentUserId) {
                currentUser = users.find(u => u.id === currentUserId);
            }
            
            let results = users
                .filter(u => {
                    if (!currentUserId) {
                        return u.privacy === 'public';
                    }
                    return isProfileVisible(u, currentUserId);
                })
                .filter(u => 
                    u.username.toLowerCase().includes(query) || 
                    u.fullName.toLowerCase().includes(query)
                )
                .map(({ password, ...user }) => {
                    let isFollowing = false;
                    if (currentUser && currentUser.following) {
                        isFollowing = currentUser.following.includes(user.id);
                    }
                    
                    // 🔥 BADGE DE VERIFICACIÓN
                    let badge = null;
                    let badgeIcon = null;
                    if (user.isVerified) {
                        badge = 'verified';
                        badgeIcon = '✅';
                    }
                    if (user.accountType === 'business' || user.accountType === 'business_verified') {
                        badge = 'business';
                        badgeIcon = '🏢';
                        if (user.isVerified) {
                            badge = 'business_verified';
                            badgeIcon = '🏢✅';
                        }
                    }
                    
                    return {
                        ...user,
                        isFollowing: isFollowing,
                        followersCount: user.followers?.length || 0,
                        followingCount: user.following?.length || 0,
                        isVerified: user.isVerified || false,
                        accountType: user.accountType || 'personal',
                        badge: badge,
                        badgeIcon: badgeIcon
                    };
                })
                .slice(0, 15);
            
            res.json(results);
        } catch (error) {
            logger.error('Error en búsqueda:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });
    
    // ============================================================
    // ✅ PERFIL - CON BADGE DE VERIFICACIÓN Y VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    router.get('/profile/:userId?', auth, (req, res) => {
        try {
            const users = read('users.json');
            
            const userId = req.params.userId || req.query.userId || req.userId;
            
            if (!userId) {
                return res.status(400).json({ 
                    error: 'ID de usuario requerido',
                    message: 'Se necesita un ID de usuario para ver el perfil'
                });
            }
            
            const userIdStr = String(userId).trim();
            
            logger.info(`📝 Buscando perfil para userId: ${userIdStr}`);
            
            const user = users.find(u => u.id === userIdStr);
            
            if (!user) {
                logger.warn(`❌ Usuario no encontrado: ${userIdStr}`);
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario que buscas no existe'
                });
            }
            
            const isOwnProfile = req.userId === userIdStr;
            
            // 🔥 VERIFICAR BLOQUEOS
            const currentUser = users.find(u => u.id === req.userId);
            if (!isOwnProfile && currentUser) {
                // Si el usuario actual bloqueó al target
                if (currentUser.blocked && currentUser.blocked.includes(userIdStr)) {
                    return res.status(404).json({
                        error: 'Usuario no encontrado',
                        message: 'El usuario que buscas no existe'
                    });
                }
                // Si el target bloqueó al usuario actual
                if (user.blockedBy && user.blockedBy.includes(req.userId)) {
                    return res.status(404).json({
                        error: 'Usuario no encontrado',
                        message: 'El usuario que buscas no existe'
                    });
                }
            }
            
            if (!isOwnProfile && !isProfileVisible(user, req.userId)) {
                logger.info(`🔒 Perfil privado: ${user.username}`);
                return res.status(403).json({ 
                    error: 'private_profile',
                    message: 'Este perfil es privado'
                });
            }
            
            const { password, ...userWithoutPassword } = user;
            
            userWithoutPassword.followersCount = user.followers?.length || 0;
            userWithoutPassword.followingCount = user.following?.length || 0;
            userWithoutPassword.role = user.role || 'user';
            
            if (!isOwnProfile && req.userId) {
                if (currentUser) {
                    userWithoutPassword.isFollowing = currentUser.following?.includes(userIdStr) || false;
                    userWithoutPassword.hasPendingRequest = currentUser.pendingSent?.includes(userIdStr) || false;
                    userWithoutPassword.hasPendingRequestFrom = currentUser.pendingRequests?.includes(userIdStr) || false;
                }
            }
            
            if (isOwnProfile) {
                userWithoutPassword.isOwnProfile = true;
            }
            
            userWithoutPassword.canViewStories = areStoriesVisible(user, req.userId);
            
            // 🔥 BADGE DE VERIFICACIÓN
            let badge = null;
            let badgeIcon = null;
            if (user.isVerified) {
                badge = 'verified';
                badgeIcon = '✅';
            }
            if (user.accountType === 'business' || user.accountType === 'business_verified') {
                badge = 'business';
                badgeIcon = '🏢';
                if (user.isVerified) {
                    badge = 'business_verified';
                    badgeIcon = '🏢✅';
                }
            }
            userWithoutPassword.badge = badge;
            userWithoutPassword.badgeIcon = badgeIcon;
            userWithoutPassword.isVerified = user.isVerified || false;
            userWithoutPassword.accountType = user.accountType || 'personal';
            
            logger.info(`✅ Perfil cargado: ${user.username} (${userIdStr})`);
            res.json(userWithoutPassword);
            
        } catch (error) {
            logger.error('Error en profile:', { 
                error: error.message,
                stack: error.stack 
            });
            res.status(500).json({ 
                error: 'Error interno del servidor',
                message: 'Ocurrió un error al cargar el perfil'
            });
        }
    });

    // ============================================================
    // ACTUALIZAR PERFIL
    // ============================================================
    router.put('/profile', auth, (req, res) => {
        try {
            const users = read('users.json');
            const idx = users.findIndex(u => u.id === req.userId);
            
            if (idx === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const allowedFields = [
                'fullName', 'bio', 'avatar', 'privacy', 'language', 
                'birthDate', 'region', 'country', 'countryName',
                'feedPreferences'
            ];
            
            allowedFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    users[idx][field] = req.body[field];
                }
            });
            
            write('users.json', users);
            
            const { password, ...rest } = users[idx];
            logger.info(`✅ Perfil actualizado: ${rest.username}`);
            res.json(rest);
        } catch (error) {
            logger.error('Error actualizando perfil:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ✅ SUGERENCIAS DE USUARIOS - CON FILTRO DE BLOQUEOS
    // ============================================================
    router.get('/suggestions', auth, (req, res) => {
        try {
            let users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser) {
                return res.json([]);
            }
            
            // 🔥 FILTRAR BLOQUEADOS
            users = filterBlockedUsers(users, req.userId);
            
            const followingList = currentUser.following || [];
            const userCountry = currentUser.country;
            const userRegion = currentUser.region || 'other';
            
            let visibleUsers = users
                .filter(u => u.id !== req.userId)
                .filter(u => isProfileVisible(u, req.userId))
                .filter(u => (u.followers?.length || 0) > 0)
                .filter(u => !followingList.includes(u.id));
            
            let filteredUsers = [];
            
            if (userCountry) {
                const sameCountry = visibleUsers.filter(u => u.country === userCountry);
                
                if (sameCountry.length >= 3) {
                    filteredUsers = sameCountry;
                } else {
                    const sameRegion = visibleUsers.filter(u => 
                        u.region === userRegion && u.country !== userCountry
                    );
                    
                    const combined = [...sameCountry, ...sameRegion];
                    if (combined.length >= 3) {
                        filteredUsers = combined;
                    } else {
                        const nearbyRegions = getNearbyRegions(userRegion);
                        const nearbyUsers = visibleUsers.filter(u => 
                            nearbyRegions.includes(u.region) && 
                            u.country !== userCountry && 
                            u.region !== userRegion
                        );
                        
                        const combined2 = [...combined, ...nearbyUsers];
                        if (combined2.length >= 3) {
                            filteredUsers = combined2;
                        } else {
                            filteredUsers = combined2.length > 0 ? combined2 : visibleUsers.slice(0, 10);
                        }
                    }
                }
            } else {
                const sameRegion = visibleUsers.filter(u => u.region === userRegion);
                if (sameRegion.length >= 3) {
                    filteredUsers = sameRegion;
                } else {
                    const nearbyRegions = getNearbyRegions(userRegion);
                    const nearbyUsers = visibleUsers.filter(u => nearbyRegions.includes(u.region));
                    filteredUsers = [...sameRegion, ...nearbyUsers];
                    if (filteredUsers.length < 3) {
                        filteredUsers = visibleUsers.slice(0, 10);
                    }
                }
            }
            
            const seen = new Set();
            filteredUsers = filteredUsers.filter(u => {
                if (seen.has(u.id)) return false;
                seen.add(u.id);
                return true;
            });
            
            const usersWithFollowers = filteredUsers
                .map(u => ({
                    id: u.id,
                    username: u.username,
                    fullName: u.fullName,
                    avatar: u.avatar,
                    followersCount: u.followers?.length || 0,
                    country: u.country,
                    countryName: u.countryName,
                    region: u.region,
                    role: u.role || 'user',
                    isVerified: u.isVerified || false,
                    accountType: u.accountType || 'personal'
                }))
                .sort((a, b) => b.followersCount - a.followersCount)
                .slice(0, 10);
            
            res.json(usersWithFollowers);
        } catch (error) {
            logger.error('Error obteniendo sugerencias:', { error: error.message });
            res.json([]);
        }
    });

    // ============================================================
    // 🔥 GUARDAR INTERESES DEL USUARIO (PRIMER LOGIN)
    // ============================================================
    router.post('/:userId/interests', auth, async (req, res) => {
        try {
            const userId = req.params.userId;
            const currentUserId = req.userId;
            const { interests } = req.body;
            
            // Verificar que el usuario está actualizando sus propios intereses
            if (userId !== currentUserId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!interests || !Array.isArray(interests)) {
                return res.status(400).json({ error: 'Intereses inválidos' });
            }
            
            // Limitar a máximo 6 intereses
            if (interests.length > 6) {
                return res.status(400).json({ error: 'Máximo 6 intereses' });
            }
            
            // Verificar que los intereses sean válidos (existan en el clasificador)
            let validInterests = [];
            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                const allCategories = await classifier.getCategories('es');
                const validCategoryNames = allCategories.map(c => c.name);
                
                validInterests = interests.filter(i => validCategoryNames.includes(i));
                
                if (validInterests.length !== interests.length) {
                    const invalid = interests.filter(i => !validCategoryNames.includes(i));
                    logger.warn(`⚠️ Intereses inválidos ignorados: ${invalid.join(', ')}`);
                }
            } catch (error) {
                logger.warn('⚠️ Error verificando categorías, guardando tal cual:', error.message);
                validInterests = interests;
            }
            
            const users = read('users.json');
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // Guardar intereses
            users[userIndex].interests = validInterests;
            
            // Calcular porcentaje según cantidad
            const percentage = calculateInterestPercentage(validInterests.length);
            users[userIndex].interestPercentage = percentage;
            
            // Marcar que ya no es primer login
            users[userIndex].firstLogin = false;
            
            write('users.json', users);
            
            if (logger) logger.info(`✅ Usuario ${userId} seleccionó ${validInterests.length} intereses (${percentage}% del feed)`);
            
            // Obtener categorías traducidas para la respuesta
            let categoriesInfo = [];
            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                const userLang = users[userIndex].language || 'es';
                const allCategories = await classifier.getCategories(userLang);
                
                categoriesInfo = allCategories
                    .filter(c => validInterests.includes(c.name))
                    .map(c => ({
                        name: c.name,
                        displayName: c.displayName,
                        emoji: c.emoji,
                        description: c.description || ''
                    }));
            } catch (error) {
                logger.warn('⚠️ Error obteniendo info de categorías:', error.message);
            }
            
            res.json({
                success: true,
                interests: validInterests,
                percentage: percentage,
                categories: categoriesInfo,
                message: `✅ Intereses guardados. ${percentage}% de tu feed será de estos temas.`,
                firstLogin: false
            });
            
        } catch (error) {
            console.error('❌ Error guardando intereses:', error);
            if (logger) logger.error('Error guardando intereses:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 OBTENER INTERESES DEL USUARIO
    // ============================================================
    router.get('/:userId/interests', auth, async (req, res) => {
        try {
            const userId = req.params.userId;
            const currentUserId = req.userId;
            
            // Solo el propio usuario puede ver sus intereses
            if (userId !== currentUserId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            const users = read('users.json');
            const user = users.find(u => u.id === userId);
            
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // Obtener info de categorías
            let categoriesInfo = [];
            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                const userLang = user.language || 'es';
                const allCategories = await classifier.getCategories(userLang);
                
                categoriesInfo = allCategories
                    .filter(c => (user.interests || []).includes(c.name))
                    .map(c => ({
                        name: c.name,
                        displayName: c.displayName,
                        emoji: c.emoji,
                        description: c.description || ''
                    }));
            } catch (error) {
                logger.warn('⚠️ Error obteniendo info de categorías:', error.message);
            }
            
            res.json({
                success: true,
                interests: user.interests || [],
                percentage: user.interestPercentage || 0,
                firstLogin: user.firstLogin || false,
                categories: categoriesInfo
            });
            
        } catch (error) {
            console.error('❌ Error obteniendo intereses:', error);
            if (logger) logger.error('Error obteniendo intereses:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 ACTUALIZAR INTERESES (DESPUÉS DEL PRIMER LOGIN)
    // ============================================================
    router.put('/:userId/interests', auth, async (req, res) => {
        try {
            const userId = req.params.userId;
            const currentUserId = req.userId;
            const { interests } = req.body;
            
            if (userId !== currentUserId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!interests || !Array.isArray(interests)) {
                return res.status(400).json({ error: 'Intereses inválidos' });
            }
            
            if (interests.length > 6) {
                return res.status(400).json({ error: 'Máximo 6 intereses' });
            }
            
            const users = read('users.json');
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // Validar intereses
            let validInterests = interests;
            try {
                const { getContentClassifier } = require('./classifiers');
                const classifier = getContentClassifier();
                const allCategories = await classifier.getCategories('es');
                const validCategoryNames = allCategories.map(c => c.name);
                validInterests = interests.filter(i => validCategoryNames.includes(i));
            } catch (error) {
                logger.warn('⚠️ Error verificando categorías:', error.message);
            }
            
            users[userIndex].interests = validInterests;
            const percentage = calculateInterestPercentage(validInterests.length);
            users[userIndex].interestPercentage = percentage;
            
            write('users.json', users);
            
            if (logger) logger.info(`✅ Usuario ${userId} actualizó intereses: ${validInterests.length} (${percentage}%)`);
            
            res.json({
                success: true,
                interests: validInterests,
                percentage: percentage,
                message: `✅ Intereses actualizados. ${percentage}% de tu feed será de estos temas.`
            });
            
        } catch (error) {
            console.error('❌ Error actualizando intereses:', error);
            if (logger) logger.error('Error actualizando intereses:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // 🔥 OBTENER CATEGORÍAS DISPONIBLES PARA INTERESES
    // ============================================================
    router.get('/categories', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const users = read('users.json');
            const user = users.find(u => u.id === userId);
            const language = user?.language || 'es';
            
            const { getContentClassifier } = require('./classifiers');
            const classifier = getContentClassifier();
            const categories = await classifier.getCategories(language);
            
            // Formatear para selección
            const formatted = categories.map(c => ({
                id: c.name,
                name: c.displayName,
                emoji: c.emoji,
                description: c.description || '',
                keywordCount: c.keywordCount || 0,
                selected: (user?.interests || []).includes(c.name)
            }));
            
            // Ordenar: primero las seleccionadas, luego alfabéticamente
            formatted.sort((a, b) => {
                if (a.selected && !b.selected) return -1;
                if (!a.selected && b.selected) return 1;
                return a.name.localeCompare(b.name);
            });
            
            res.json({
                success: true,
                categories: formatted,
                total: formatted.length,
                maxSelection: 6,
                language: language,
                userInterests: user?.interests || [],
                userPercentage: user?.interestPercentage || 0,
                firstLogin: user?.firstLogin || false
            });
            
        } catch (error) {
            console.error('❌ Error obteniendo categorías:', error);
            if (logger) logger.error('Error obteniendo categorías:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // ESTADO DE USUARIO (online/offline)
    // ============================================================
    router.get('/status/:userId', auth, (req, res) => {
        try {
            const user = userIndex.get(req.params.userId);
            
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const connectedUsers = req.app.get('userConnections') || new Map();
            const isOnline = connectedUsers.has(req.params.userId);
            const lastSeen = user.lastSeen || user.createdAt;
            
            res.json({
                userId: user.id,
                status: isOnline ? 'online' : 'offline',
                lastSeen: lastSeen
            });
        } catch (error) {
            logger.error('Error obteniendo estado:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ESTADO BATCH (múltiples usuarios)
    // ============================================================
    router.post('/status/batch', auth, (req, res) => {
        try {
            const { userIds } = req.body;
            
            if (!userIds || !Array.isArray(userIds)) {
                return res.status(400).json({ error: 'Se requiere un array de userIds' });
            }
            
            const connectedUsers = req.app.get('userConnections') || new Map();
            const results = [];
            
            userIds.forEach(userId => {
                const user = userIndex.get(userId);
                if (user) {
                    const isOnline = connectedUsers.has(userId);
                    results.push({
                        userId: user.id,
                        status: isOnline ? 'online' : 'offline',
                        lastSeen: user.lastSeen || user.createdAt
                    });
                }
            });
            
            res.json(results);
        } catch (error) {
            logger.error('Error obteniendo estados batch:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER USUARIOS POR IDS (para chat y menciones) - CON FILTRO DE BLOQUEOS
    // ============================================================
    router.post('/batch', auth, (req, res) => {
        try {
            const { userIds } = req.body;
            
            if (!userIds || !Array.isArray(userIds)) {
                return res.status(400).json({ error: 'Se requiere un array de userIds' });
            }
            
            let users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            // 🔥 FILTRAR BLOQUEADOS
            if (currentUser) {
                const blockedIds = currentUser.blocked || [];
                const blockedByIds = currentUser.blockedBy || [];
                
                users = users.filter(u => {
                    if (u.id === req.userId) return true;
                    if (blockedIds.includes(u.id)) return false;
                    if (blockedByIds.includes(u.id)) return false;
                    return true;
                });
            }
            
            const userMap = {};
            users.forEach(u => {
                userMap[u.id] = u;
            });
            
            const results = userIds.map(id => {
                const user = userMap[id];
                if (user) {
                    const { password, ...userWithoutPassword } = user;
                    return {
                        ...userWithoutPassword,
                        followersCount: user.followers?.length || 0,
                        followingCount: user.following?.length || 0,
                        role: user.role || 'user',
                        isVerified: user.isVerified || false,
                        accountType: user.accountType || 'personal'
                    };
                }
                return null;
            }).filter(u => u !== null);
            
            res.json(results);
        } catch (error) {
            logger.error('Error en batch de usuarios:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // VERIFICAR DISPONIBILIDAD DE NOMBRE DE USUARIO
    // ============================================================
    router.get('/check-username/:username', (req, res) => {
        try {
            const { username } = req.params;
            const users = read('users.json');
            const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
            res.json({ available: !exists });
        } catch (error) {
            logger.error('Error verificando username:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // VERIFICAR DISPONIBILIDAD DE EMAIL
    // ============================================================
    router.get('/check-email/:email', (req, res) => {
        try {
            const { email } = req.params;
            const users = read('users.json');
            const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
            res.json({ available: !exists });
        } catch (error) {
            logger.error('Error verificando email:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🚨 REGISTRAR ADMIN - SOLO ACCESIBLE POR ADMIN EXISTENTE
    // ============================================================
    router.post('/register-admin', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ 
                    error: 'Acceso denegado. Solo administradores pueden registrar nuevos admins.' 
                });
            }

            const { 
                username, email, password, fullName, 
                birthDate, age, language, region, country, countryName 
            } = req.body;

            if (!username || !email || !password || !fullName) {
                return res.status(400).json({ error: 'Todos los campos son requeridos' });
            }

            if (users.find(u => u.email === email)) {
                return res.status(400).json({ error: 'El email ya está registrado' });
            }
            if (users.find(u => u.username === username)) {
                return res.status(400).json({ error: 'El nombre de usuario ya existe' });
            }

            if (password.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            
            let timezone = null;
            try {
                timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch(e) {}

            const newAdmin = {
                id: Date.now().toString(),
                username,
                email,
                password: hashedPassword,
                fullName,
                bio: '👑 Administrador de Vyn Social',
                privacy: 'public',
                followers: [],
                following: [],
                pendingRequests: [],
                pendingSent: [],
                blocked: [],
                blockedBy: [],
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=7c3aed&color=fff`,
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                birthDate: birthDate || null,
                age: age || null,
                language: language || 'es',
                region: region || 'other',
                country: country || null,
                countryName: countryName || null,
                timezone: timezone || null,
                role: 'admin',
                isVerified: true,
                verifiedAt: new Date().toISOString(),
                verifiedBadge: 'verified',
                accountType: 'verified',
                // 🔥 INTERESES DEL ADMIN
                interests: [],
                firstLogin: false,
                interestPercentage: 0,
                feedPreferences: {
                    countryWeight: 34,
                    regionWeight: 27,
                    nearbyRegionsWeight: 23,
                    farRegionsWeight: 5,
                    followingWeight: 11,
                    interestWeight: 15
                }
            };

            users.push(newAdmin);
            write('users.json', users);

            users.forEach(u => {
                if (u.role === 'admin' && u.id !== req.userId) {
                    io?.to(`user_${u.id}`).emit('new_admin_registered', {
                        adminId: newAdmin.id,
                        adminName: newAdmin.fullName,
                        adminUsername: newAdmin.username
                    });
                }
            });

            logger.info(`👑 Nuevo administrador registrado: ${username} por ${currentUser.username}`);
            
            const { password: _, ...adminWithoutPassword } = newAdmin;
            
            res.status(201).json({
                success: true,
                message: 'Administrador registrado correctamente',
                admin: adminWithoutPassword
            });

        } catch (error) {
            logger.error('Error registrando admin:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // OBTENER TODOS LOS ADMINISTRADORES (SOLO ADMIN)
    // ============================================================
    router.get('/admins', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const admins = users
                .filter(u => u.role === 'admin')
                .map(({ password, ...admin }) => admin);

            res.json(admins);
        } catch (error) {
            logger.error('Error obteniendo admins:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR ADMIN (SOLO ADMIN)
    // ============================================================
    router.delete('/admin/:adminId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const { adminId } = req.params;
            
            if (adminId === req.userId) {
                return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
            }

            const adminIndex = users.findIndex(u => u.id === adminId);
            if (adminIndex === -1) {
                return res.status(404).json({ error: 'Administrador no encontrado' });
            }

            if (users[adminIndex].role !== 'admin') {
                return res.status(400).json({ error: 'El usuario no es administrador' });
            }

            const removedAdmin = users[adminIndex];
            users.splice(adminIndex, 1);
            write('users.json', users);

            logger.info(`👑 Administrador eliminado: ${removedAdmin.username} por ${currentUser.username}`);

            io?.to(`user_${adminId}`).emit('admin_removed', {
                message: 'Has sido removido como administrador'
            });

            res.json({
                success: true,
                message: `Administrador ${removedAdmin.fullName} eliminado correctamente`
            });

        } catch (error) {
            logger.error('Error eliminando admin:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};