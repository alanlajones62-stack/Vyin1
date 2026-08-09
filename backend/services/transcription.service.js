// backend/services/translation.service.js
// SERVICIO DE TRADUCCIÓN CON NLLB-200 - SIN .env

const axios = require('axios');

class TranslationService {
    constructor() {
        // 🔥 CONFIGURACIÓN DIRECTA (sin .env)
        this.apiUrl = 'http://localhost:5002';  // Puerto fijo
        this.timeout = 30000;  // 30 segundos
        this.enabled = true;   // Siempre activado
        
        // Estado
        this.available = false;
        this.healthChecked = false;
        
        // Caché local
        this.cache = new Map();
        this.cacheTTL = 3600000; // 1 hora
        
        // Estadísticas
        this.stats = {
            totalTranslations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            failures: 0
        };
        
        // 🔥 MAPEO DE IDIOMAS (código corto → NLLB)
        this.languageMap = {
            'es': 'spa_Latn',
            'en': 'eng_Latn',
            'pt': 'por_Latn',
            'fr': 'fra_Latn',
            'de': 'deu_Latn',
            'it': 'ita_Latn',
            'nl': 'nld_Latn',
            'ru': 'rus_Cyrl',
            'ja': 'jpn_Jpan',
            'zh': 'zho_Hans',
            'ko': 'kor_Hang',
            'ar': 'ara_Arab',
            'hi': 'hin_Deva',
            'vi': 'vie_Latn',
            'th': 'tha_Thai',
            'id': 'ind_Latn',
            'tr': 'tur_Latn',
            'pl': 'pol_Latn',
            'uk': 'ukr_Cyrl',
            'ro': 'ron_Latn',
            'el': 'ell_Grek',
            'hu': 'hun_Latn',
            'cs': 'ces_Latn',
            'sv': 'swe_Latn',
            'da': 'dan_Latn',
            'fi': 'fin_Latn',
            'he': 'heb_Hebr',
            'fa': 'fas_Arab',
            'ur': 'urd_Arab',
            'bg': 'bul_Cyrl',
            'sk': 'slk_Latn',
            'sl': 'slv_Latn',
            'ms': 'msa_Latn'
        };
        
        // Nombres de idiomas
        this.languageNames = {
            'es': 'Español', 'en': 'Inglés', 'pt': 'Portugués',
            'fr': 'Francés', 'de': 'Alemán', 'it': 'Italiano',
            'nl': 'Neerlandés', 'ru': 'Ruso', 'ja': 'Japonés',
            'zh': 'Chino', 'ko': 'Coreano', 'ar': 'Árabe',
            'hi': 'Hindi', 'vi': 'Vietnamita', 'th': 'Tailandés',
            'id': 'Indonesio', 'tr': 'Turco', 'pl': 'Polaco',
            'uk': 'Ucraniano', 'ro': 'Rumano', 'el': 'Griego',
            'hu': 'Húngaro', 'cs': 'Checo', 'sv': 'Sueco',
            'da': 'Danés', 'fi': 'Finés', 'he': 'Hebreo',
            'fa': 'Persa', 'ur': 'Urdu', 'bg': 'Búlgaro',
            'sk': 'Eslovaco', 'sl': 'Esloveno', 'ms': 'Malayo'
        };
        
        // Banderas
        this.languageFlags = {
            'es': '🇪🇸', 'en': '🇬🇧', 'pt': '🇧🇷',
            'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹',
            'nl': '🇳🇱', 'ru': '🇷🇺', 'ja': '🇯🇵',
            'zh': '🇨🇳', 'ko': '🇰🇷', 'ar': '🇸🇦',
            'hi': '🇮🇳', 'vi': '🇻🇳', 'th': '🇹🇭',
            'id': '🇮🇩', 'tr': '🇹🇷', 'pl': '🇵🇱',
            'uk': '🇺🇦', 'ro': '🇷🇴', 'el': '🇬🇷',
            'hu': '🇭🇺', 'cs': '🇨🇿', 'sv': '🇸🇪',
            'da': '🇩🇰', 'fi': '🇫🇮', 'he': '🇮🇱',
            'fa': '🇮🇷', 'ur': '🇵🇰', 'bg': '🇧🇬',
            'sk': '🇸🇰', 'sl': '🇸🇮', 'ms': '🇲🇾'
        };

        console.log(`🌐 [Translation] Servicio NLLB-200 inicializado`);
        console.log(`   📚 Idiomas: ${Object.keys(this.languageMap).length}`);
        console.log(`   🌐 URL: ${this.apiUrl}`);
        
        // Verificar disponibilidad
        this.checkHealth();
    }

    /**
     * Verifica si NLLB-200 está disponible
     */
    async checkHealth() {
        try {
            const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
            this.available = response.status === 200;
            this.healthChecked = true;
            if (this.available) {
                console.log(`✅ [NLLB] Servidor disponible en ${this.apiUrl}`);
            } else {
                console.warn(`⚠️ [NLLB] Servidor no disponible en ${this.apiUrl}`);
            }
        } catch (error) {
            this.available = false;
            this.healthChecked = true;
            console.warn(`⚠️ [NLLB] No disponible: ${error.message}`);
            console.warn(`   💡 Ejecuta: python backend/nllb_server.py`);
        }
        return this.available;
    }

    /**
     * Traduce texto usando NLLB-200
     */
    async translateText(text, targetLanguage, sourceLanguage = null) {
        if (!this.enabled || !this.available) {
            return text;
        }
        
        if (!text || text.trim().length === 0) return text;
        if (targetLanguage === 'es') return text;
        
        // Obtener código NLLB
        const targetCode = this.languageMap[targetLanguage];
        if (!targetCode) {
            console.warn(`⚠️ [NLLB] Idioma no soportado: ${targetLanguage}`);
            return text;
        }
        
        // Verificar caché local
        const cacheKey = `${text}_${targetCode}_${sourceLanguage || 'auto'}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                this.stats.cacheHits++;
                return cached.translation;
            }
            this.cache.delete(cacheKey);
        }
        this.stats.cacheMisses++;
        this.stats.totalTranslations++;
        
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/translate`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: {
                    text: text,
                    target_lang: targetCode,
                    source_lang: sourceLanguage ? this.languageMap[sourceLanguage] : null
                },
                timeout: this.timeout
            });
            
            if (response.data && response.data.translation) {
                const translation = response.data.translation;
                this.cache.set(cacheKey, {
                    translation: translation,
                    timestamp: Date.now()
                });
                return translation;
            }
            
            return text;
            
        } catch (error) {
            this.stats.failures++;
            console.error(`❌ [NLLB] Error traduciendo:`, error.message);
            return text;
        }
    }

    /**
     * Traduce múltiples textos
     */
    async translateBatch(texts, targetLanguage) {
        if (!this.enabled || !this.available) return texts;
        if (!texts || texts.length === 0) return texts;
        if (targetLanguage === 'es') return texts;
        
        try {
            const targetCode = this.languageMap[targetLanguage];
            if (!targetCode) return texts;
            
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/translate-batch`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: {
                    texts: texts,
                    target_lang: targetCode
                },
                timeout: this.timeout * 2
            });
            
            if (response.data && response.data.translations) {
                return response.data.translations;
            }
            
            return texts;
            
        } catch (error) {
            console.error(`❌ [NLLB] Error traduciendo batch:`, error.message);
            return texts;
        }
    }

    /**
     * Detecta el idioma de un texto
     */
    async detectLanguage(text) {
        if (!this.enabled || !this.available) return 'es';
        if (!text || text.trim().length === 0) return 'es';
        
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/detect`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: { text: text },
                timeout: 5000
            });
            
            if (response.data && response.data.short) {
                return response.data.short;
            }
            return 'es';
            
        } catch (error) {
            console.error(`❌ [NLLB] Error detectando:`, error.message);
            return 'es';
        }
    }

    /**
     * Obtiene información de un idioma
     */
    getLanguageInfo(langCode) {
        return {
            code: langCode,
            name: this.languageNames[langCode] || 'Desconocido',
            flag: this.languageFlags[langCode] || '🌐',
            nllbCode: this.languageMap[langCode] || null
        };
    }

    /**
     * Obtiene todos los idiomas soportados
     */
    getSupportedLanguages() {
        return Object.keys(this.languageMap).map(code => ({
            code: code,
            name: this.languageNames[code] || code,
            flag: this.languageFlags[code] || '🌐'
        }));
    }

    /**
     * Mapeo país → idioma
     */
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
            'NL': 'nl',
            'RU': 'ru', 'BY': 'ru', 'KZ': 'ru',
            'PL': 'pl',
            'UA': 'uk',
            'RO': 'ro',
            'GR': 'el',
            'HU': 'hu',
            'CZ': 'cs',
            'BG': 'bg',
            'SK': 'sk',
            'SI': 'sl',
            'SE': 'sv', 'DK': 'da', 'FI': 'fi', 'NO': 'no',
            'JP': 'ja',
            'CN': 'zh', 'TW': 'zh', 'HK': 'zh', 'SG': 'zh',
            'KR': 'ko',
            'IN': 'hi',
            'VN': 'vi',
            'TH': 'th',
            'ID': 'id',
            'MY': 'ms',
            'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'JO': 'ar', 'KW': 'ar',
            'QA': 'ar', 'IL': 'he', 'IR': 'fa', 'TR': 'tr',
            'PK': 'ur'
        };
        return map[country] || null;
    }

    /**
     * Obtiene estadísticas
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheTTL: this.cacheTTL / 1000 + 's',
            available: this.available,
            enabled: this.enabled,
            totalLanguages: Object.keys(this.languageMap).length
        };
    }

    /**
     * Limpia la caché
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 [NLLB] Caché limpiado');
    }

    /**
     * Verifica si el servicio está disponible
     */
    isEnabled() {
        return this.enabled && this.available;
    }
}

// Singleton
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