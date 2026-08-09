// backend/services/recommendation.js - VERSIÓN UNIFICADA CON EMBEDDINGS

const { getContentClassifier } = require('../classifiers');
const { getEmbeddingService } = require('./embedding.service');

class RecommendationService {
    constructor() {
        this.classifier = getContentClassifier();
        this.embeddingService = null;
        this.isEmbeddingReady = false;
        
        // PESOS PARA EL RANKING
        this.weights = {
            sameCountry: 40,
            sameRegion: 30,
            nearbyRegion: 15,
            farRegion: 2,
            following: 35,
            userTopicMatch: 25,
            storyTopicMatch: 15,
            likes: 3,
            comments: 2,
            views: 0.5,
            recency: 2,
            hasSubtitles: 10,
            hasCaption: 5,
            hasMedia: 8,
            hasText: 4,
            sameLanguage: 8,
            alreadyViewed: -50,
            lowEngagement: -5
        };

        this.cache = new Map();
        this.cacheTTL = 300000;

        // Inicializar embeddings async
        this._initEmbeddings();
        
        console.log('🎯 [Recommendation] Servicio unificado inicializado');
    }

    async _initEmbeddings() {
        try {
            const service = await getEmbeddingService();
            this.embeddingService = service;
            this.isEmbeddingReady = service.isLoaded;
            console.log(`✅ [Recommendation] Embeddings: ${this.isEmbeddingReady ? 'ACTIVOS' : 'MODO FALLBACK'}`);
        } catch (error) {
            console.warn('⚠️ [Recommendation] Embeddings no disponibles:', error.message);
            this.isEmbeddingReady = false;
        }
    }

    /**
     * 🔥 RECOMENDACIÓN HÍBRIDA: LITERAL + SEMÁNTICA + CLASIFICACIÓN
     */
    async recommendStories(userId, limit = 50) {
        const cacheKey = `recommendations_${userId}_${limit}`;
        
        // Verificar caché
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                console.log(`📦 [Recommendation] Usando caché para usuario ${userId}`);
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }

        try {
            const users = require('../data/users.json');
            const stories = require('../data/stories.json');
            
            const user = users.find(u => u.id === userId);
            if (!user) {
                console.warn(`⚠️ [Recommendation] Usuario ${userId} no encontrado`);
                return [];
            }

            const userLanguage = user.language || 'es';
            const userRegion = user.region || 'other';
            const userCountry = user.country || null;
            const userFollowing = user.following || [];

            // Filtrar historias activas
            const now = Date.now();
            const activeStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                if (new Date(s.expiresAt).getTime() <= now) return false;
                if (s.hidden) return false;
                if (s.userId === userId) return false;
                return true;
            });

            console.log(`📊 [Recommendation] ${activeStories.length} historias activas`);

            // 🔥 1. OBTENER PREFERENCIAS DEL USUARIO
            const userPreferredCategories = await this.classifier.getUserPreferredCategories(
                userId, 
                stories, 
                userLanguage
            );
            const preferredCategories = userPreferredCategories.map(c => c.category);

            // 🔥 2. BUSQUEDA SEMÁNTICA (si está disponible)
            let semanticResults = [];
            let semanticIds = new Set();

            if (this.isEmbeddingReady && this.embeddingService) {
                try {
                    // Construir perfil del usuario a partir de sus historias
                    const userStories = stories.filter(s => s.userId === userId && !s.hidden);
                    const userProfile = userStories
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .slice(0, 10)
                        .map(s => s.caption || s.subtitles || s.textContent || '')
                        .filter(t => t)
                        .join(' ');

                    if (userProfile.trim()) {
                        const semantic = await this.embeddingService.searchSimilar(
                            userProfile, 
                            limit * 2, 
                            userId
                        );
                        
                        if (semantic.length > 0) {
                            semanticResults = semantic;
                            semanticIds = new Set(semantic.map(r => r.storyId));
                            console.log(`🧠 [Recommendation] ${semanticResults.length} resultados semánticos`);
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ [Recommendation] Error en búsqueda semántica:', error.message);
                }
            }

            // 🔥 3. PUNTUAR CADA HISTORIA
            const scoredStories = [];

            for (const story of activeStories) {
                const owner = users.find(u => u.id === story.userId);
                if (!owner) continue;

                // Clasificar historia
                const classification = await this.classifier.classifyStory(story, userLanguage);
                
                // Calcular score
                let score = this._calculateScore(
                    story, 
                    owner, 
                    user, 
                    preferredCategories, 
                    classification
                );

                // 🔥 BONUS SEMÁNTICO
                if (semanticIds.has(story.id)) {
                    const semanticMatch = semanticResults.find(r => r.storyId === story.id);
                    if (semanticMatch) {
                        score += Math.round(semanticMatch.similarity * 30);
                    }
                }

                // 🔥 BONUS POR FOLLOWING
                if (userFollowing.includes(story.userId)) {
                    score += 30;
                }

                scoredStories.push({
                    ...story,
                    owner: owner,
                    classification: classification,
                    recommendationScore: Math.max(0, score),
                    semanticMatch: semanticIds.has(story.id)
                });
            }

            // 🔥 4. ORDENAR Y SELECCIONAR
            const sorted = scoredStories.sort((a, b) => {
                // Prioridad: Following > Score
                const aFollowing = userFollowing.includes(a.userId) ? 1 : 0;
                const bFollowing = userFollowing.includes(b.userId) ? 1 : 0;
                if (aFollowing !== bFollowing) return bFollowing - aFollowing;
                return (b.recommendationScore || 0) - (a.recommendationScore || 0);
            });

            // 🔥 5. DIVERSIFICAR RESULTADOS
            const result = this._diversifyResults(sorted, limit);

            // Guardar en caché
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            console.log(`✅ [Recommendation] ${result.length} recomendaciones generadas`);
            return result;

        } catch (error) {
            console.error('❌ [Recommendation] Error:', error);
            return [];
        }
    }

    /**
     * 🔥 CALCULAR SCORE DE UNA HISTORIA
     */
    _calculateScore(story, owner, user, preferredCategories, classification) {
        let score = 0;
        const userFollowing = user.following || [];

        // 1. GEOGRAFÍA
        if (owner) {
            if (owner.country === user.country) {
                score += this.weights.sameCountry;
            } else if (owner.region === user.region) {
                score += this.weights.sameRegion;
            } else if (this._isNearbyRegion(owner.region, user.region)) {
                score += this.weights.nearbyRegion;
            } else {
                score += this.weights.farRegion;
            }
        }

        // 2. FOLLOWERS DE FOLLOWING
        if (owner && owner.followers) {
            const followersOfFollowing = owner.followers.filter(id => userFollowing.includes(id));
            if (followersOfFollowing.length > 0) {
                score += Math.min(15, followersOfFollowing.length * 2);
            }
        }

        // 3. CATEGORÍAS
        if (classification && classification.categories) {
            for (const cat of classification.categories) {
                if (preferredCategories.includes(cat.category)) {
                    score += this.weights.userTopicMatch * cat.score;
                }
            }
        }

        // 4. ENGAGEMENT
        const likes = story.likes?.length || 0;
        const comments = story.comments?.length || 0;
        const views = story.views?.length || 0;

        score += likes * this.weights.likes;
        score += comments * this.weights.comments;
        score += views * this.weights.views;

        // 5. RECENCIA
        const ageHours = (Date.now() - new Date(story.createdAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) {
            score += Math.max(0, this.weights.recency * (24 - ageHours) / 24);
        }

        // 6. CALIDAD DEL CONTENIDO
        if (story.hasSubtitles) score += this.weights.hasSubtitles;
        if (story.caption && story.caption.length > 10) score += this.weights.hasCaption;
        if (story.mediaType && story.mediaType !== 'text') score += this.weights.hasMedia;
        if (story.textContent && story.textContent.length > 20) score += this.weights.hasText;

        // 7. IDIOMA
        if (story.language === user.language) score += this.weights.sameLanguage;

        // 8. PENALIZACIONES
        if (story.views?.includes(user.id)) score += this.weights.alreadyViewed;
        if (ageHours > 10) score -= 10;
        if (likes < 2 && comments < 1 && views < 10) score -= 5;

        return Math.max(0, Math.round(score));
    }

    /**
     * 🔥 DIVERSIFICAR RESULTADOS (evitar muchos del mismo usuario)
     */
    _diversifyResults(results, limit) {
        const seenUsers = new Set();
        const diversified = [];
        const others = [];

        for (const item of results) {
            if (seenUsers.size >= Math.min(limit, 10)) break;
            if (!seenUsers.has(item.userId)) {
                seenUsers.add(item.userId);
                diversified.push(item);
            } else {
                others.push(item);
            }
        }

        // Completar con otros
        const remaining = limit - diversified.length;
        if (remaining > 0) {
            const sortedOthers = others
                .filter(item => !diversified.includes(item))
                .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
                .slice(0, remaining);
            diversified.push(...sortedOthers);
        }

        return diversified;
    }

    /**
     * 🔥 VERIFICAR REGIONES CERCANAS
     */
    _isNearbyRegion(region1, region2) {
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

    /**
     * 🔥 OBTENER ESTADÍSTICAS
     */
    getStats() {
        return {
            weights: this.weights,
            cacheSize: this.cache.size,
            cacheTTL: this.cacheTTL / 1000 + 's',
            embeddingReady: this.isEmbeddingReady,
            embeddingStats: this.embeddingService ? this.embeddingService.getStats() : null,
            classifierStats: this.classifier.getStats()
        };
    }

    /**
     * 🔥 LIMPIAR CACHÉ
     */
    clearCache() {
        this.cache.clear();
        this.classifier.clearCache();
        console.log('🧹 [Recommendation] Caché limpiado');
    }
}

// ============================================================
// SINGLETON
// ============================================================

let instance = null;

function getRecommendationService() {
    if (!instance) {
        instance = new RecommendationService();
    }
    return instance;
}

module.exports = getRecommendationService;