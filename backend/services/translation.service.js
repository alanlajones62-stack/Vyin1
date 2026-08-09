// backend/services/translation.service.js
// SERVICIO DE TRADUCCIÓN CON M2M100 - CORREGIDO

const axios = require('axios');

class TranslationService {
    constructor() {
        this.apiUrl = 'http://localhost:5002';
        this.timeout = 60000;
        this.enabled = true;
        
        this.available = false;
        this.healthChecked = false;
        this._lastAvailable = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        
        this.cache = new Map();
        this.cacheTTL = 3600000;
        
        this.stats = {
            totalTranslations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            failures: 0,
            reconnections: 0
        };
        
        this.languageMap = {
            'es': 'es', 'en': 'en', 'pt': 'pt',
            'fr': 'fr', 'de': 'de', 'it': 'it',
            'ru': 'ru', 'ja': 'ja', 'zh': 'zh',
            'ar': 'ar'
        };
        
        this.languageNames = {
            'es': 'Español', 'en': 'Inglés', 'pt': 'Portugués',
            'fr': 'Francés', 'de': 'Alemán', 'it': 'Italiano',
            'ru': 'Ruso', 'ja': 'Japonés', 'zh': 'Chino',
            'ar': 'Árabe'
        };
        
        this.languageFlags = {
            'es': '🇪🇸', 'en': '🇬🇧', 'pt': '🇧🇷',
            'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹',
            'ru': '🇷🇺', 'ja': '🇯🇵', 'zh': '🇨🇳',
            'ar': '🇸🇦'
        };

        console.log(`🌐 [Translation] Servicio M2M100 inicializado (Licencia MIT)`);
        console.log(`   📚 Idiomas: ${Object.keys(this.languageMap).length}`);
        console.log(`   🌐 URL: ${this.apiUrl}`);
        
        this.checkHealth();
    }

    async checkHealth() {
        try {
            const response = await axios.get(`${this.apiUrl}/health`, { timeout: 10000 });
            const wasAvailable = this.available;
            this.available = response.status === 200;
            this.healthChecked = true;
            
            if (this.available) {
                this._reconnectAttempts = 0;
                if (!wasAvailable && !this._lastAvailable) {
                    console.log(`✅ [M2M100] Servidor disponible en ${this.apiUrl}`);
                    console.log(`   📄 Licencia: ${response.data?.license || 'MIT'}`);
                    this._lastAvailable = true;
                } else {
                    this._lastAvailable = true;
                }
            } else if (!this.available && wasAvailable) {
                console.warn(`⚠️ [M2M100] Servidor desconectado en ${this.apiUrl}`);
                this._lastAvailable = false;
                this._attemptReconnect();
            }
            
            return this.available;
        } catch (error) {
            const wasAvailable = this.available;
            this.available = false;
            this.healthChecked = true;
            
            if (wasAvailable && this._lastAvailable) {
                console.warn(`⚠️ [M2M100] No disponible: ${error.message}`);
                this._lastAvailable = false;
                this._attemptReconnect();
            }
            return false;
        }
    }

    async _attemptReconnect() {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.warn(`⚠️ [M2M100] Máximos intentos de reconexión alcanzados (${this._maxReconnectAttempts})`);
            return;
        }
        
        this._reconnectAttempts++;
        console.log(`🔄 [M2M100] Intentando reconectar (${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);
        
        setTimeout(async () => {
            await this.checkHealth();
            if (this.available) {
                this.stats.reconnections++;
                console.log(`✅ [M2M100] Reconexión exitosa (${this.stats.reconnections})`);
            }
        }, 5000 * this._reconnectAttempts);
    }

    // ============================================================
    // 🔥 MÉTODO CORREGIDO - PERMITE TRADUCCIONES A CUALQUIER IDIOMA
    // ============================================================
    
    async translateText(text, targetLanguage, sourceLanguage = null) {
        if (!this.enabled || !this.available) return text;
        if (!text || text.trim().length === 0) return text;
        
        // 🔥 ELIMINAR LA RESTRICCIÓN QUE BLOQUEABA TRADUCCIONES
        // NO DEVOLVER text si targetLanguage es 'es' o cualquier otro
        // EL USUARIO DECIDE SI QUIERE TRADUCIR
        
        const targetCode = this.languageMap[targetLanguage];
        if (!targetCode) {
            console.warn(`⚠️ Idioma objetivo no soportado: ${targetLanguage}`);
            return text;
        }
        
        const cacheKey = `${text}_${targetCode}_${sourceLanguage || 'auto'}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                this.stats.cacheHits++;
                console.log(`📦 [CACHÉ] Traducción encontrada para: "${text.substring(0, 30)}..."`);
                return cached.translation;
            }
            this.cache.delete(cacheKey);
        }
        this.stats.cacheMisses++;
        this.stats.totalTranslations++;
        
        try {
            const payload = {
                text: text,
                target_lang: targetCode
            };
            
            // 🔥 PASAR sourceLanguage SI VIENE
            if (sourceLanguage && this.languageMap[sourceLanguage]) {
                payload.source_lang = this.languageMap[sourceLanguage];
                console.log(`📝 Fuente forzada: ${sourceLanguage} → ${targetLanguage}`);
            } else {
                console.log(`🔍 Sin fuente especificada, usando auto-detección → ${targetLanguage}`);
            }
            
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/translate`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: payload,
                timeout: this.timeout
            });
            
            if (response.data && response.data.translation) {
                const translation = response.data.translation;
                const detectedSource = response.data.detected_source || 'auto';
                const isTranslated = response.data.isTranslated || false;
                
                // Guardar en caché
                this.cache.set(cacheKey, {
                    translation: translation,
                    timestamp: Date.now(),
                    detectedSource: detectedSource,
                    isTranslated: isTranslated
                });
                
                console.log(`✅ Traducción ${isTranslated ? 'EXITOSA' : 'FALLIDA (mismo texto)'}`);
                console.log(`   Original: "${text.substring(0, 30)}..."`);
                console.log(`   Traducido: "${translation.substring(0, 30)}..."`);
                
                return translation;
            }
            return text;
        } catch (error) {
            this.stats.failures++;
            console.error(`❌ Error traduciendo:`, error.message);
            return text;
        }
    }

    async translateBatch(texts, targetLanguage) {
        if (!this.enabled || !this.available) return texts;
        if (!texts || texts.length === 0) return texts;
        
        const results = [];
        for (const text of texts) {
            const translated = await this.translateText(text, targetLanguage);
            results.push(translated);
        }
        return results;
    }

    async detectLanguage(text) {
        if (!this.enabled || !this.available) return null;
        if (!text || text.trim().length === 0) return null;
        
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/detect`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: { text: text },
                timeout: 10000
            });
            return response.data?.language || null;
        } catch (error) {
            console.warn(`⚠️ [M2M100] Error detectando idioma:`, error.message);
            return null;
        }
    }

    getLanguageInfo(langCode) {
        return {
            code: langCode,
            name: this.languageNames[langCode] || 'Desconocido',
            flag: this.languageFlags[langCode] || '🌐'
        };
    }

    getSupportedLanguages() {
        return Object.keys(this.languageMap).map(code => ({
            code: code,
            name: this.languageNames[code] || code,
            flag: this.languageFlags[code] || '🌐'
        }));
    }

    countryToLanguage(country) {
        const map = {
            'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'PE': 'es',
            'CL': 'es', 'EC': 'es', 'VE': 'es', 'BO': 'es', 'PY': 'es',
            'UY': 'es', 'CR': 'es', 'PA': 'es', 'GT': 'es', 'HN': 'es',
            'SV': 'es', 'NI': 'es', 'DO': 'es', 'CU': 'es',
            'US': 'en', 'UK': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en',
            'IE': 'en', 'ZA': 'en',
            'BR': 'pt', 'PT': 'pt', 'AO': 'pt', 'MZ': 'pt',
            'FR': 'fr', 'BE': 'fr', 'CH': 'fr',
            'DE': 'de', 'AT': 'de',
            'IT': 'it',
            'RU': 'ru', 'BY': 'ru', 'KZ': 'ru',
            'JP': 'ja',
            'CN': 'zh', 'TW': 'zh', 'HK': 'zh', 'SG': 'zh',
            'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'JO': 'ar', 'KW': 'ar',
            'QA': 'ar'
        };
        return map[country] || null;
    }

    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheTTL: this.cacheTTL / 1000 + 's',
            available: this.available,
            enabled: this.enabled,
            totalLanguages: Object.keys(this.languageMap).length,
            license: 'MIT',
            reconnectionAttempts: this._reconnectAttempts,
            maxReconnectAttempts: this._maxReconnectAttempts
        };
    }

    clearCache() {
        this.cache.clear();
        console.log('🧹 [M2M100] Caché limpiado');
    }

    isEnabled() {
        return this.enabled === true && this.available === true;
    }
}

let instance = null;

function getTranslationService() {
    if (!instance) {
        instance = new TranslationService();
    }
    return instance;
}

module.exports = {
    getTranslationService,
    TranslationService
};