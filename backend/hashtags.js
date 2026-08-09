// backend/hashtags.js - CORREGIDO
module.exports = (read, write) => {
    const router = require('express').Router();
    const auth = require('./middleware/auth');

    // ============================================================
    // CONFIGURACIÓN - 🔥 10 HORAS EN VEZ DE 24
    // ============================================================
    const CONFIG = {
        TRENDING_LIMIT: 15,
        TIME_WINDOW_HOURS: 10,
        MIN_USES_TO_TREND: 1,
        REGIONAL_THRESHOLD: 1000,
        GLOBAL_THRESHOLD: 10000,
        CLEANUP_INTERVAL: 600000
    };

    // ============================================================
    // MAPA DE REGIONES CERCANAS
    // ============================================================
    const REGION_NEARBY_MAP = {
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

    const ALL_REGIONS = ['north_america', 'central_america', 'south_america', 'europe', 'asia', 'africa', 'oceania', 'antarctica', 'other'];

    function getNearbyRegions(region) {
        return REGION_NEARBY_MAP[region] || REGION_NEARBY_MAP['other'];
    }

    function getFarRegions(region) {
        const nearby = getNearbyRegions(region);
        return ALL_REGIONS.filter(r => r !== region && !nearby.includes(r));
    }

    // ============================================================
    // EXTRACCIÓN DE HASHTAGS
    // ============================================================
    const extractHashtags = (text) => {
        if (!text) return [];
        const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
        const matches = text.match(hashtagRegex) || [];
        const uniqueTags = [...new Set(matches.map(tag => tag.toLowerCase().substring(1)))];
        return uniqueTags;
    };

    // ============================================================
    // 🔥 OBTENER HISTORIAS ACTIVAS (MENOS DE 10 HORAS)
    // ============================================================
    const getActiveStories = () => {
        const stories = read('stories.json');
        const now = Date.now();
        const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
        
        return stories.filter(story => {
            if (!story || !story.createdAt) return false;
            const storyDate = new Date(story.createdAt).getTime();
            return storyDate > cutoffTime;
        });
    };

    // ============================================================
    // OBTENER UBICACIÓN DEL USUARIO
    // ============================================================
    const getUserLocation = (userId) => {
        const users = read('users.json');
        const user = users.find(u => u.id === userId);
        if (!user) return { region: 'other', country: null };
        return {
            region: user.region || 'other',
            country: user.country || null
        };
    };

    // ============================================================
    // INICIALIZAR HASHTAGS
    // ============================================================
    const ensureHashtagsFile = () => {
        let hashtagsData = read('hashtags.json');
        if (!hashtagsData || !Array.isArray(hashtagsData) || hashtagsData.length === 0) {
            const exampleHashtags = [
                { tag: 'vynsocial', count: 5 },
                { tag: 'historias', count: 3 },
                { tag: 'comunidad', count: 2 },
                { tag: 'creadores', count: 2 },
                { tag: 'inspiracion', count: 1 }
            ];
            
            const now = new Date().toISOString();
            const exampleData = exampleHashtags.map((h, i) => ({
                tag: h.tag,
                recentUses: Array.from({ length: h.count }, (_, j) => ({
                    storyId: 'example_' + Date.now() + '_' + i + '_' + j,
                    userId: 'demo',
                    country: 'EC',
                    region: 'south_america',
                    timestamp: new Date(Date.now() - j * 3600000).toISOString()
                })),
                count24h: h.count,
                countries: ['EC'],
                regions: ['south_america'],
                scope: 'country',
                createdAt: now,
                lastUsed: now,
                totalUses: h.count,
                firstSeen: now
            }));
            write('hashtags.json', exampleData);
            console.log('📄 Archivo hashtags.json creado con datos de ejemplo');
            return exampleData;
        }
        return hashtagsData;
    };

    // ============================================================
    // CALCULAR ALCANCE
    // ============================================================
    const calculateScope = (hashtag) => {
        if (!hashtag) return 'country';
        const count24h = hashtag.count24h || 0;
        const countries = hashtag.countries || [];
        const regions = hashtag.regions || [];
        
        if (count24h >= CONFIG.GLOBAL_THRESHOLD && regions.length >= 3) return 'global';
        if (count24h >= CONFIG.REGIONAL_THRESHOLD && countries.length >= 3) return 'region';
        if (count24h >= CONFIG.REGIONAL_THRESHOLD && regions.length >= 1) return 'region';
        return 'country';
    };

    // ============================================================
    // 🔥 ACTUALIZAR HASHTAGS - CON 10 HORAS
    // ============================================================
    const updateHashtags = (hashtags, storyId, userId) => {
        if (!hashtags || hashtags.length === 0) return;
        
        console.log(`🏷️ Procesando ${hashtags.length} hashtags para historia ${storyId}`);
        
        let hashtagsData = ensureHashtagsFile();
        const userLocation = getUserLocation(userId);
        const userRegion = userLocation.region || 'other';
        const userCountry = userLocation.country;
        const now = Date.now();
        const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
        const nowISO = new Date(now).toISOString();
        
        const activeStories = getActiveStories();
        const activeStoryIds = new Set(activeStories.map(s => s.id));
        
        let updated = false;
        
        hashtagsData = hashtagsData.map(h => {
            if (!h.recentUses) h.recentUses = [];
            
            h.recentUses = h.recentUses.filter(u => {
                if (!u.storyId) return false;
                if (!activeStoryIds.has(u.storyId)) return false;
                const useDate = new Date(u.timestamp).getTime();
                return useDate > cutoffTime;
            });
            
            h.count24h = h.recentUses.length;
            
            const countries = new Set();
            const regions = new Set();
            h.recentUses.forEach(u => {
                if (u.country) countries.add(u.country);
                if (u.region) regions.add(u.region);
            });
            h.countries = Array.from(countries);
            h.regions = Array.from(regions);
            h.scope = calculateScope(h);
            
            if (h.recentUses.length > 0) {
                h.lastUsed = h.recentUses[h.recentUses.length - 1].timestamp;
            }
            
            return h;
        });
        
        hashtags.forEach(tag => {
            const existing = hashtagsData.find(h => h.tag === tag);
            
            if (existing) {
                existing.recentUses.push({
                    storyId: storyId,
                    userId: userId,
                    country: userCountry,
                    region: userRegion,
                    timestamp: nowISO
                });
                
                existing.recentUses = existing.recentUses.filter(u => {
                    const useDate = new Date(u.timestamp).getTime();
                    return useDate > cutoffTime;
                });
                
                existing.count24h = existing.recentUses.length;
                existing.lastUsed = nowISO;
                
                const countries = new Set();
                const regions = new Set();
                existing.recentUses.forEach(u => {
                    if (u.country) countries.add(u.country);
                    if (u.region) regions.add(u.region);
                });
                existing.countries = Array.from(countries);
                existing.regions = Array.from(regions);
                existing.scope = calculateScope(existing);
                
                updated = true;
            } else {
                const newHashtag = {
                    tag: tag,
                    recentUses: [{
                        storyId: storyId,
                        userId: userId,
                        country: userCountry,
                        region: userRegion,
                        timestamp: nowISO
                    }],
                    count24h: 1,
                    lastUsed: nowISO,
                    createdAt: nowISO,
                    countries: userCountry ? [userCountry] : [],
                    regions: userRegion ? [userRegion] : [],
                    scope: 'country',
                    totalUses: 1,
                    firstSeen: nowISO
                };
                hashtagsData.push(newHashtag);
                updated = true;
                console.log(`🆕 Nuevo hashtag creado: #${tag}`);
            }
        });
        
        if (updated) {
            hashtagsData = hashtagsData.filter(h => h.count24h > 0);
            hashtagsData.sort((a, b) => (b.count24h || 0) - (a.count24h || 0));
            write('hashtags.json', hashtagsData);
            console.log(`📊 Hashtags actualizados: ${hashtags.join(', ')}`);
            console.log(`📊 Total hashtags en DB: ${hashtagsData.length}`);
        }
        
        return hashtagsData;
    };

    // ============================================================
    // 🔥 OBTENER TRENDING - CON 10 HORAS
    // ============================================================
    const getTrendingForUser = (userId) => {
        const userLocation = getUserLocation(userId);
        const userRegion = userLocation.region || 'other';
        const userCountry = userLocation.country;
        
        let hashtagsData = ensureHashtagsFile();
        const now = Date.now();
        const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
        
        const activeStories = getActiveStories();
        const activeStoryIds = new Set(activeStories.map(s => s.id));
        
        console.log(`📊 Buscando trending para usuario ${userId} (${userCountry}, ${userRegion})`);
        console.log(`📊 Total hashtags en DB: ${hashtagsData.length}`);
        console.log(`📊 Historias activas (< ${CONFIG.TIME_WINDOW_HOURS}h): ${activeStories.length}`);
        
        hashtagsData = hashtagsData.map(h => {
            if (!h.recentUses) h.recentUses = [];
            
            const validUses = h.recentUses.filter(u => {
                if (!u.storyId) return false;
                if (!activeStoryIds.has(u.storyId)) return false;
                const useDate = new Date(u.timestamp).getTime();
                return useDate > cutoffTime;
            });
            
            h.recentUses = validUses;
            h.count24h = validUses.length;
            
            const countries = new Set();
            const regions = new Set();
            validUses.forEach(u => {
                if (u.country) countries.add(u.country);
                if (u.region) regions.add(u.region);
            });
            h.countries = Array.from(countries);
            h.regions = Array.from(regions);
            h.scope = calculateScope(h);
            
            return h;
        });
        
        hashtagsData = hashtagsData.filter(h => h.count24h > 0);
        write('hashtags.json', hashtagsData);
        
        let activeHashtags = hashtagsData.filter(h => h.count24h >= CONFIG.MIN_USES_TO_TREND);
        
        console.log(`📊 Hashtags activos: ${activeHashtags.length}`);
        
        let filteredHashtags = [];
        
        if (userCountry) {
            const countryHashtags = activeHashtags.filter(h => 
                h.countries && h.countries.includes(userCountry)
            );
            console.log(`   Mismo país (${userCountry}): ${countryHashtags.length}`);
            filteredHashtags = [...countryHashtags];
        }
        
        const regionHashtags = activeHashtags.filter(h => 
            h.regions && h.regions.includes(userRegion) && 
            !(h.countries && h.countries.includes(userCountry))
        );
        console.log(`   Misma región (${userRegion}): ${regionHashtags.length}`);
        filteredHashtags = [...filteredHashtags, ...regionHashtags];
        
        if (filteredHashtags.length < 5) {
            const nearbyRegions = getNearbyRegions(userRegion);
            const nearbyHashtags = activeHashtags.filter(h => 
                h.regions && h.regions.some(r => nearbyRegions.includes(r)) &&
                !(h.countries && h.countries.includes(userCountry)) &&
                !(h.regions && h.regions.includes(userRegion))
            );
            console.log(`   Regiones cercanas: ${nearbyHashtags.length}`);
            filteredHashtags = [...filteredHashtags, ...nearbyHashtags];
        }
        
        if (filteredHashtags.length < 5) {
            const farRegions = getFarRegions(userRegion);
            const farHashtags = activeHashtags.filter(h => 
                h.regions && h.regions.some(r => farRegions.includes(r)) &&
                !(h.countries && h.countries.includes(userCountry)) &&
                !(h.regions && h.regions.includes(userRegion)) &&
                !(h.regions && h.regions.some(r => getNearbyRegions(userRegion).includes(r)))
            );
            console.log(`   Regiones lejanas: ${farHashtags.length}`);
            filteredHashtags = [...filteredHashtags, ...farHashtags];
        }
        
        if (filteredHashtags.length < 5) {
            const remaining = activeHashtags.filter(h => !filteredHashtags.includes(h));
            filteredHashtags = [...filteredHashtags, ...remaining];
        }
        
        const seen = new Set();
        filteredHashtags = filteredHashtags.filter(h => {
            if (seen.has(h.tag)) return false;
            seen.add(h.tag);
            return true;
        });
        
        const scoredHashtags = filteredHashtags.map(h => {
            let score = h.count24h || 0;
            
            if (userCountry && h.countries && h.countries.includes(userCountry)) {
                score += Math.min(h.count24h * 1.0, 10);
            }
            if (userRegion && h.regions && h.regions.includes(userRegion)) {
                score += Math.min(h.count24h * 0.6, 6);
            }
            const nearbyRegions = getNearbyRegions(userRegion);
            if (h.regions && h.regions.some(r => nearbyRegions.includes(r))) {
                score += Math.min(h.count24h * 0.3, 3);
            }
            if (h.scope === 'global') {
                score += Math.min(h.count24h * 0.2, 2);
            }
            
            return {
                ...h,
                score: Math.round(score)
            };
        });
        
        scoredHashtags.sort((a, b) => b.score - a.score);
        
        const result = scoredHashtags
            .slice(0, CONFIG.TRENDING_LIMIT)
            .map(({ tag, count24h, score, scope }) => ({
                tag: tag,
                count: count24h || 0,
                score: score || 0,
                scope: scope || 'country'
            }));
        
        console.log(`📈 Trending: ${result.length} hashtags encontrados`);
        return result;
    };

    // ============================================================
    // LIMPIEZA DE HASHTAGS INACTIVOS
    // ============================================================
    const cleanInactiveHashtags = () => {
        let hashtagsData = ensureHashtagsFile();
        const now = Date.now();
        const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
        
        const activeStories = getActiveStories();
        const activeStoryIds = new Set(activeStories.map(s => s.id));
        let cleaned = 0;
        
        const filtered = hashtagsData.filter(h => {
            if (!h.recentUses || h.recentUses.length === 0) {
                cleaned++;
                return false;
            }
            
            h.recentUses = h.recentUses.filter(u => {
                if (!u.storyId) return false;
                if (!activeStoryIds.has(u.storyId)) return false;
                const useDate = new Date(u.timestamp).getTime();
                return useDate > cutoffTime;
            });
            
            if (h.recentUses.length === 0) {
                cleaned++;
                return false;
            }
            
            h.count24h = h.recentUses.length;
            return true;
        });
        
        if (cleaned > 0) {
            write('hashtags.json', filtered);
            console.log(`🧹 Hashtags inactivos eliminados: ${cleaned}`);
        }
        
        return filtered;
    };

    // ============================================================
    // REINDEXAR HASHTAGS
    // ============================================================
    const reindexHashtags = () => {
        console.log('🔄 Reindexando hashtags con 10 horas...');
        
        const stories = read('stories.json');
        const users = read('users.json');
        const now = Date.now();
        const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
        const nowISO = new Date(now).toISOString();
        
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const tagMap = {};
        
        stories.forEach(story => {
            if (!story.caption) return;
            if (!story.createdAt) return;
            
            const storyDate = new Date(story.createdAt).getTime();
            if (storyDate <= cutoffTime) return;
            
            const user = userMap[story.userId];
            const userRegion = user?.region || 'other';
            const userCountry = user?.country || null;
            
            const hashtags = extractHashtags(story.caption);
            hashtags.forEach(tag => {
                if (!tagMap[tag]) {
                    tagMap[tag] = {
                        tag: tag,
                        recentUses: [],
                        count24h: 0,
                        countries: [],
                        regions: [],
                        scope: 'country',
                        createdAt: nowISO,
                        lastUsed: nowISO,
                        totalUses: 0,
                        firstSeen: nowISO
                    };
                }
                tagMap[tag].recentUses.push({
                    storyId: story.id,
                    userId: story.userId,
                    country: userCountry,
                    region: userRegion,
                    timestamp: story.createdAt || nowISO
                });
                tagMap[tag].totalUses = (tagMap[tag].totalUses || 0) + 1;
            });
        });
        
        let hashtagsData = Object.values(tagMap);
        
        hashtagsData.forEach(h => {
            h.recentUses = h.recentUses.filter(u => {
                const useDate = new Date(u.timestamp).getTime();
                return useDate > cutoffTime;
            });
            h.count24h = h.recentUses.length;
            
            const countries = new Set();
            const regions = new Set();
            h.recentUses.forEach(u => {
                if (u.country) countries.add(u.country);
                if (u.region) regions.add(u.region);
            });
            h.countries = Array.from(countries);
            h.regions = Array.from(regions);
            h.scope = calculateScope(h);
            h.lastUsed = h.recentUses.length > 0 ? h.recentUses[h.recentUses.length - 1].timestamp : h.createdAt;
        });
        
        hashtagsData = hashtagsData.filter(h => h.count24h > 0);
        hashtagsData.sort((a, b) => (b.count24h || 0) - (a.count24h || 0));
        
        write('hashtags.json', hashtagsData);
        console.log(`✅ Hashtags reindexados: ${hashtagsData.length} hashtags activos`);
        
        return hashtagsData;
    };

    // ============================================================
    // 🔥 FUNCIÓN processHashtags - CORREGIDA (orden de parámetros)
    // ============================================================
    const processHashtags = (storyId, caption, userId) => {
        console.log(`🏷️ processHashtags llamado: storyId=${storyId}, userId=${userId}, caption=${caption?.substring(0, 50)}`);
        
        if (!caption) {
            console.log('⚠️ Caption vacío, no se procesan hashtags');
            return [];
        }
        
        const hashtags = extractHashtags(caption);
        if (hashtags.length > 0) {
            console.log(`🏷️ Hashtags encontrados: ${hashtags.join(', ')}`);
            updateHashtags(hashtags, storyId, userId);
        } else {
            console.log('📝 No se encontraron hashtags en el caption');
        }
        
        return hashtags;
    };

    // ============================================================
    // RUTAS
    // ============================================================

    router.get('/trending', auth, async (req, res) => {
        try {
            const userId = req.userId;
            console.log(`📊 Solicitando trending para usuario ${userId}`);
            const trending = getTrendingForUser(userId);
            res.json(trending);
        } catch (error) {
            console.error('Error en trending:', error);
            res.status(500).json({ error: 'Error al cargar tendencias' });
        }
    });

    router.get('/trending/public', async (req, res) => {
        try {
            let hashtagsData = ensureHashtagsFile();
            const now = Date.now();
            const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
            
            const activeStories = getActiveStories();
            const activeStoryIds = new Set(activeStories.map(s => s.id));
            
            hashtagsData = hashtagsData.map(h => {
                if (!h.recentUses) h.recentUses = [];
                h.recentUses = h.recentUses.filter(u => {
                    if (!u.storyId) return false;
                    if (!activeStoryIds.has(u.storyId)) return false;
                    const useDate = new Date(u.timestamp).getTime();
                    return useDate > cutoffTime;
                });
                h.count24h = h.recentUses.length;
                return h;
            });
            
            hashtagsData = hashtagsData.filter(h => h.count24h > 0);
            
            const trending = hashtagsData
                .sort((a, b) => (b.count24h || 0) - (a.count24h || 0))
                .slice(0, CONFIG.TRENDING_LIMIT)
                .map(({ tag, count24h, scope }) => ({ 
                    tag: tag.toLowerCase(), 
                    count: count24h || 0,
                    scope: scope || 'country'
                }));
            
            console.log(`📈 Trending public: ${trending.length} hashtags encontrados`);
            res.json(trending);
        } catch (error) {
            console.error('Error en trending public:', error);
            res.status(500).json({ error: 'Error al cargar tendencias' });
        }
    });

    router.get('/search/:prefix', async (req, res) => {
        try {
            const prefix = req.params.prefix.toLowerCase().trim();
            if (!prefix) return res.json([]);
            
            let hashtagsData = ensureHashtagsFile();
            const now = Date.now();
            const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
            
            const activeStories = getActiveStories();
            const activeStoryIds = new Set(activeStories.map(s => s.id));
            
            const matches = hashtagsData
                .filter(h => {
                    if (!h.tag || !h.tag.startsWith(prefix)) return false;
                    if (!h.recentUses || h.recentUses.length === 0) return false;
                    
                    h.recentUses = h.recentUses.filter(u => {
                        if (!u.storyId) return false;
                        if (!activeStoryIds.has(u.storyId)) return false;
                        const useDate = new Date(u.timestamp).getTime();
                        return useDate > cutoffTime;
                    });
                    
                    if (h.recentUses.length === 0) return false;
                    h.count24h = h.recentUses.length;
                    return true;
                })
                .sort((a, b) => (b.count24h || 0) - (a.count24h || 0))
                .slice(0, 10)
                .map(({ tag, count24h, scope }) => ({ 
                    tag: tag.toLowerCase(), 
                    count: count24h || 0,
                    scope: scope || 'country'
                }));
            
            res.json(matches);
        } catch (error) {
            console.error('Error en search:', error);
            res.status(500).json({ error: 'Error en la búsqueda' });
        }
    });

    router.get('/all', auth, (req, res) => {
        try {
            let hashtagsData = ensureHashtagsFile();
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const now = Date.now();
            const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
            
            const activeStories = getActiveStories();
            const activeStoryIds = new Set(activeStories.map(s => s.id));
            
            const filtered = hashtagsData
                .filter(h => {
                    if (!h.recentUses || h.recentUses.length === 0) return false;
                    
                    h.recentUses = h.recentUses.filter(u => {
                        if (!u.storyId) return false;
                        if (!activeStoryIds.has(u.storyId)) return false;
                        const useDate = new Date(u.timestamp).getTime();
                        return useDate > cutoffTime;
                    });
                    
                    if (h.recentUses.length === 0) return false;
                    h.count24h = h.recentUses.length;
                    return true;
                })
                .sort((a, b) => (b.count24h || 0) - (a.count24h || 0));
            
            const total = filtered.length;
            const paginated = filtered.slice(offset, offset + limit);
            
            res.json({
                total: total,
                offset: offset,
                limit: limit,
                hashtags: paginated.map(({ tag, count24h, scope }) => ({ 
                    tag: tag.toLowerCase(), 
                    count: count24h || 0,
                    scope: scope || 'country'
                }))
            });
        } catch (error) {
            console.error('Error en all hashtags:', error);
            res.status(500).json({ error: 'Error al cargar hashtags' });
        }
    });

    router.get('/stats/:tag', auth, (req, res) => {
        try {
            const tag = req.params.tag.toLowerCase().trim();
            let hashtagsData = ensureHashtagsFile();
            const hashtag = hashtagsData.find(h => h.tag === tag);
            
            if (!hashtag) {
                return res.status(404).json({ error: 'Hashtag no encontrado' });
            }
            
            const now = Date.now();
            const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
            
            const activeStories = getActiveStories();
            const activeStoryIds = new Set(activeStories.map(s => s.id));
            
            const validUses = hashtag.recentUses?.filter(u => {
                if (!u.storyId) return false;
                if (!activeStoryIds.has(u.storyId)) return false;
                const useDate = new Date(u.timestamp).getTime();
                return useDate > cutoffTime;
            }) || [];
            
            const countries = new Set();
            const regions = new Set();
            validUses.forEach(u => {
                if (u.country) countries.add(u.country);
                if (u.region) regions.add(u.region);
            });
            
            res.json({
                tag: hashtag.tag,
                count24h: validUses.length || 0,
                scope: hashtag.scope || 'country',
                lastUsed: hashtag.lastUsed,
                createdAt: hashtag.createdAt,
                totalCountries: countries.size || 0,
                totalRegions: regions.size || 0,
                recentUses: validUses.length,
                topCountries: Array.from(countries),
                topRegions: Array.from(regions),
                totalUsesAllTime: hashtag.totalUses || hashtag.recentUses?.length || 0
            });
        } catch (error) {
            console.error('Error en stats:', error);
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    });

    router.post('/clean', auth, (req, res) => {
        try {
            const result = cleanInactiveHashtags();
            res.json({ 
                message: 'Hashtags inactivos eliminados correctamente',
                remaining: result.length
            });
        } catch (error) {
            console.error('Error en clean:', error);
            res.status(500).json({ error: 'Error al limpiar hashtags' });
        }
    });

    router.post('/reindex', auth, (req, res) => {
        try {
            const result = reindexHashtags();
            res.json({ 
                message: 'Hashtags reindexados correctamente',
                total: result.length
            });
        } catch (error) {
            console.error('Error en reindex:', error);
            res.status(500).json({ error: 'Error al reindexar hashtags' });
        }
    });

    router.get('/debug', (req, res) => {
        try {
            const hashtags = ensureHashtagsFile();
            const now = Date.now();
            const cutoffTime = now - (CONFIG.TIME_WINDOW_HOURS * 60 * 60 * 1000);
            
            const activeStories = getActiveStories();
            
            res.json({
                timeWindowHours: CONFIG.TIME_WINDOW_HOURS,
                activeStories: activeStories.length,
                totalHashtags: hashtags.length,
                activeHashtags: hashtags.filter(h => h.count24h > 0).length,
                sample: hashtags.slice(0, 10).map(h => ({
                    tag: h.tag,
                    count24h: h.count24h || 0,
                    recentUses: h.recentUses?.length || 0,
                    scope: h.scope || 'country'
                }))
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // LIMPIEZA AUTOMÁTICA CADA 10 MINUTOS
    // ============================================================
    setInterval(() => {
        try {
            cleanInactiveHashtags();
        } catch (error) {
            console.error('Error en limpieza automática:', error);
        }
    }, CONFIG.CLEANUP_INTERVAL);

    return { router, processHashtags, reindexHashtags };
};