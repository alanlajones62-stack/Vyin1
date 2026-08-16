// frontend/services/cache.service.js - VERSIÓN COMPLETA CON LIMPIEZA AUTOMÁTICA
// ============================================================

const CACHE_CONFIG = {
    // Perfiles
    PROFILE_MEMORY_TTL: 5 * 60 * 1000,
    PROFILE_STORAGE_TTL: 60 * 60 * 1000,
    
    // Historias
    STORIES_MEMORY_TTL: 2 * 60 * 1000,
    STORIES_STORAGE_TTL: 30 * 60 * 1000,
    
    // Comentarios
    COMMENTS_MEMORY_TTL: 5 * 60 * 1000,
    COMMENTS_STORAGE_TTL: 30 * 60 * 1000,
    
    // Vistas
    VIEWED_STORIES_TTL: 24 * 60 * 60 * 1000,
    
    // Traducciones
    TRANSLATION_TTL: 24 * 60 * 60 * 1000,
    
    MAX_CACHE_ITEMS: 50,
    CACHE_VERSION: 'v2'
};

// ============================================================
// CLASE DE CACHÉ UNIFICADA
// ============================================================

class UnifiedCache {
    constructor() {
        this.memory = new Map();
        this.stats = {
            hits: 0,
            misses: 0
        };
        this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
        
        // Cargar datos persistentes al iniciar
        this._loadPersistentData();
    }

    // ============================================================
    // MÉTODOS PRIVADOS
    // ============================================================

    _getKey(type, id) {
        return `${CACHE_CONFIG.CACHE_VERSION}_${type}_${id}`;
    }

    _getExpiry(ttl) {
        return Date.now() + ttl;
    }

    _isExpired(expiry) {
        return Date.now() > expiry;
    }

    _saveToStorage(key, data, ttl) {
        try {
            const item = {
                value: data,
                expiry: this._getExpiry(ttl),
                version: CACHE_CONFIG.CACHE_VERSION
            };
            localStorage.setItem(key, JSON.stringify(item));
        } catch (e) {
            // Si localStorage está lleno, limpiar
            this._cleanupStorage();
            try {
                localStorage.setItem(key, JSON.stringify(item));
            } catch (e2) {
                console.warn('⚠️ No se pudo guardar en localStorage:', e2.message);
            }
        }
    }

    _loadFromStorage(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (this._isExpired(item.expiry)) {
                localStorage.removeItem(key);
                return null;
            }
            return item.value;
        } catch (e) {
            return null;
        }
    }

    _cleanupStorage() {
        const now = Date.now();
        let cleaned = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_CONFIG.CACHE_VERSION)) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    if (item && item.expiry && now > item.expiry) {
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                    cleaned++;
                }
            }
        }
        return cleaned;
    }

    _cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, item] of this.memory) {
            if (now > item.expiry) {
                this.memory.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`🧹 [Cache] ${cleaned} items expirados en memoria`);
        }
        
        // Limpiar storage cada 10 minutos
        if (Math.random() < 0.1) {
            const storageCleaned = this._cleanupStorage();
            if (storageCleaned > 0) {
                console.log(`🧹 [Cache] ${storageCleaned} items expirados en localStorage`);
            }
        }
    }

    _loadPersistentData() {
        // Cargar historias vistas
        this._viewedStories = this._loadFromStorage(this._getKey('viewed', 'stories')) || [];
        console.log(`👁️ [Cache] ${this._viewedStories.length} historias vistas cargadas`);
    }

    // ============================================================
    // PERFILES
    // ============================================================

    getProfile(userId) {
        const key = this._getKey('profile', userId);
        
        // 1. Memoria
        if (this.memory.has(key)) {
            const item = this.memory.get(key);
            if (!this._isExpired(item.expiry)) {
                this.stats.hits++;
                console.log(`📦 [Cache] Perfil ${userId} en memoria`);
                return item.value;
            }
            this.memory.delete(key);
        }
        
        // 2. localStorage
        const data = this._loadFromStorage(key);
        if (data) {
            this.stats.hits++;
            this.memory.set(key, {
                value: data,
                expiry: this._getExpiry(CACHE_CONFIG.PROFILE_MEMORY_TTL)
            });
            console.log(`💾 [Cache] Perfil ${userId} en localStorage`);
            return data;
        }
        
        this.stats.misses++;
        return null;
    }

    setProfile(userId, data) {
        const key = this._getKey('profile', userId);
        this.memory.set(key, {
            value: data,
            expiry: this._getExpiry(CACHE_CONFIG.PROFILE_MEMORY_TTL)
        });
        this._saveToStorage(key, data, CACHE_CONFIG.PROFILE_STORAGE_TTL);
    }

    // ============================================================
    // HISTORIAS
    // ============================================================

    getStories(userId) {
        const key = this._getKey('stories', userId);
        
        if (this.memory.has(key)) {
            const item = this.memory.get(key);
            if (!this._isExpired(item.expiry)) {
                this.stats.hits++;
                return item.value;
            }
            this.memory.delete(key);
        }
        
        const data = this._loadFromStorage(key);
        if (data) {
            // Verificar que las historias no tengan más de 24 horas
            if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                this.stats.hits++;
                this.memory.set(key, {
                    value: data,
                    expiry: this._getExpiry(CACHE_CONFIG.STORIES_MEMORY_TTL)
                });
                return data;
            } else {
                localStorage.removeItem(key);
            }
        }
        
        this.stats.misses++;
        return null;
    }

    setStories(userId, stories) {
        const key = this._getKey('stories', userId);
        const data = {
            stories: stories,
            timestamp: Date.now(),
            count: stories.length
        };
        this.memory.set(key, {
            value: data,
            expiry: this._getExpiry(CACHE_CONFIG.STORIES_MEMORY_TTL)
        });
        this._saveToStorage(key, data, CACHE_CONFIG.STORIES_STORAGE_TTL);
    }

    // ============================================================
    // COMENTARIOS
    // ============================================================

    getComments(storyId) {
        const key = this._getKey('comments', storyId);
        
        if (this.memory.has(key)) {
            const item = this.memory.get(key);
            if (!this._isExpired(item.expiry)) {
                this.stats.hits++;
                return item.value;
            }
            this.memory.delete(key);
        }
        
        const data = this._loadFromStorage(key);
        if (data) {
            // Verificar que la historia no tenga más de 24 horas
            if (data.storyTimestamp && Date.now() - data.storyTimestamp < 24 * 60 * 60 * 1000) {
                this.stats.hits++;
                this.memory.set(key, {
                    value: data,
                    expiry: this._getExpiry(CACHE_CONFIG.COMMENTS_MEMORY_TTL)
                });
                return data;
            } else {
                localStorage.removeItem(key);
            }
        }
        
        this.stats.misses++;
        return null;
    }

    setComments(storyId, comments, storyTimestamp) {
        const key = this._getKey('comments', storyId);
        const data = {
            comments: comments,
            storyTimestamp: storyTimestamp || Date.now(),
            timestamp: Date.now(),
            count: comments.length
        };
        this.memory.set(key, {
            value: data,
            expiry: this._getExpiry(CACHE_CONFIG.COMMENTS_MEMORY_TTL)
        });
        this._saveToStorage(key, data, CACHE_CONFIG.COMMENTS_STORAGE_TTL);
    }

    // ============================================================
    // HISTORIAS VISTAS
    // ============================================================

    getViewedStories() {
        return this._viewedStories || [];
    }

    addViewedStory(storyId) {
        if (!this._viewedStories.includes(storyId)) {
            this._viewedStories.push(storyId);
            // Mantener solo las últimas 500
            if (this._viewedStories.length > 500) {
                this._viewedStories = this._viewedStories.slice(-500);
            }
            this._saveToStorage(
                this._getKey('viewed', 'stories'),
                this._viewedStories,
                CACHE_CONFIG.VIEWED_STORIES_TTL
            );
        }
    }

    clearViewedStories() {
        this._viewedStories = [];
        localStorage.removeItem(this._getKey('viewed', 'stories'));
    }

    isStoryViewed(storyId) {
        return this._viewedStories.includes(storyId);
    }

    // ============================================================
    // TRADUCCIONES
    // ============================================================

    getTranslation(storyId, language) {
        const key = this._getKey('translation', `${storyId}_${language}`);
        return this._loadFromStorage(key);
    }

    setTranslation(storyId, language, data) {
        const key = this._getKey('translation', `${storyId}_${language}`);
        this._saveToStorage(key, data, CACHE_CONFIG.TRANSLATION_TTL);
    }

    // ============================================================
    // UTILIDADES
    // ============================================================

    invalidateProfile(userId) {
        const key = this._getKey('profile', userId);
        this.memory.delete(key);
        localStorage.removeItem(key);
        this.invalidateStories(userId);
    }

    invalidateStories(userId) {
        const key = this._getKey('stories', userId);
        this.memory.delete(key);
        localStorage.removeItem(key);
    }

    invalidateComments(storyId) {
        const key = this._getKey('comments', storyId);
        this.memory.delete(key);
        localStorage.removeItem(key);
    }

    invalidatePattern(pattern) {
        const toDelete = [];
        for (const [key] of this.memory) {
            if (key.includes(pattern)) {
                toDelete.push(key);
            }
        }
        toDelete.forEach(key => this.memory.delete(key));
        
        // Limpiar localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes(pattern)) {
                localStorage.removeItem(key);
            }
        }
    }

    invalidateAll() {
        this.memory.clear();
        // Limpiar solo las claves de caché
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_CONFIG.CACHE_VERSION)) {
                localStorage.removeItem(key);
            }
        }
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
            memorySize: this.memory.size,
            viewedStories: this._viewedStories.length,
            totalViewed: this._viewedStories.length
        };
    }

    cleanupExpired() {
        const memoryCleaned = this._cleanup();
        const storageCleaned = this._cleanupStorage();
        return { memory: memoryCleaned, storage: storageCleaned };
    }

    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }
}

// ============================================================
// SINGLETON
// ============================================================

let cacheInstance = null;

export function getCache() {
    if (!cacheInstance) {
        cacheInstance = new UnifiedCache();
        console.log('📦 [Cache] Sistema de caché unificado inicializado');
        // Mostrar estadísticas
        const stats = cacheInstance.getStats();
        console.log(`   📊 Hit rate: ${stats.hitRate}, ${stats.viewedStories} historias vistas`);
    }
    return cacheInstance;
}

export default getCache;