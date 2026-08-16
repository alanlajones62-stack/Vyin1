// backend/services/translation.service.js
// SERVICIO DE TRADUCCIÓN CON M2M100 - CORREGIDO CON DETECCIÓN MEJORADA PARA TEXTOS CORTOS

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

    /**
     * 🔥 DETECTA IDIOMA PARA TEXTOS CORTOS BASADO EN CARACTERES
     */
    _detectLanguageShortText(text) {
        if (!text || text.trim().length === 0) return 'es';
        
        const trimmed = text.trim();
        
        // 🔥 DETECTAR JAPONÉS (caracteres japoneses: Hiragana, Katakana, Kanji)
        if (/[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(trimmed)) {
            return 'ja';
        }
        
        // 🔥 DETECTAR COREANO (Hangul)
        if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(trimmed)) {
            return 'ko';
        }
        
        // 🔥 DETECTAR CHINO (caracteres chinos - sin Hiragana/Katakana)
        if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(trimmed) && !/[\u3040-\u30FF]/.test(trimmed)) {
            return 'zh';
        }
        
        // 🔥 DETECTAR ÁRABE
        if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed)) {
            return 'ar';
        }
        
        // 🔥 DETECTAR RUSO (cirílico)
        if (/[\u0400-\u04FF\u0500-\u052F]/.test(trimmed)) {
            return 'ru';
        }
        
        // 🔥 DETECTAR IDIOMAS LATINOS POR PALABRAS CLAVE
        const lowerText = trimmed.toLowerCase();
        const words = lowerText.split(/\s+/);
        
        // Palabras comunes en inglés
        const englishWords = ['i', 'am', 'you', 'are', 'the', 'of', 'and', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'in', 'that', 'this', 'these', 'those', 'a', 'an', 'is', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must'];
        let englishScore = 0;
        for (const word of words) {
            if (englishWords.includes(word)) englishScore++;
            // Palabras que son claramente inglesas
            if (['i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re', 'don\'t', 'can\'t', 'won\'t', 'should\'ve', 'could\'ve'].some(w => lowerText.includes(w))) {
                englishScore += 3;
            }
        }
        
        // Palabras comunes en español
        const spanishWords = ['yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos', 'ellas', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'por', 'para', 'con', 'sin', 'de', 'en', 'a', 'lo', 'que', 'como', 'me', 'te', 'se', 'nos', 'os', 'le', 'les', 'mi', 'tu', 'su', 'nuestro', 'vuestro', 'este', 'ese', 'aquel', 'esta', 'esa', 'aquella', 'esto', 'eso', 'aquel'];
        let spanishScore = 0;
        for (const word of words) {
            if (spanishWords.includes(word)) spanishScore++;
            if (['qué', 'cómo', 'cuándo', 'dónde', 'quién', 'por qué'].some(w => lowerText.includes(w))) {
                spanishScore += 2;
            }
        }
        
        // Palabras comunes en portugués
        const portugueseWords = ['é', 'ão', 'ões', 'ães', 'ç', 'ou', 'que', 'com', 'para', 'por', 'em', 'de', 'do', 'da', 'dos', 'das', 'um', 'uma', 'uns', 'umas', 'ele', 'ela', 'nós', 'vocês', 'eles', 'elas'];
        let portugueseScore = 0;
        for (const word of words) {
            if (portugueseWords.includes(word)) portugueseScore++;
            if (['porque', 'porque', 'então', 'assim', 'depois', 'antes'].some(w => lowerText.includes(w))) {
                portugueseScore += 2;
            }
        }
        
        // Palabras comunes en francés
        const frenchWords = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'le', 'la', 'les', 'un', 'une', 'et', 'pour', 'avec', 'sur', 'sous', 'à', 'en', 'dans', 'par', 'chez', 'entre', 'sans', 'contre'];
        let frenchScore = 0;
        for (const word of words) {
            if (frenchWords.includes(word)) frenchScore++;
            if (['est', 'sont', 'étais', 'était', 'étions', 'étiez', 'étaient'].some(w => lowerText.includes(w))) {
                frenchScore += 2;
            }
        }
        
        // Palabras comunes en alemán
        const germanWords = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'der', 'die', 'das', 'ein', 'eine', 'und', 'für', 'mit', 'auf', 'bei', 'von', 'zu', 'aus', 'nach', 'seit', 'durch', 'ohne', 'gegen'];
        let germanScore = 0;
        for (const word of words) {
            if (germanWords.includes(word)) germanScore++;
            if (['ist', 'sind', 'war', 'waren', 'habe', 'hast', 'hat', 'haben', 'hattet', 'hatten'].some(w => lowerText.includes(w))) {
                germanScore += 2;
            }
        }
        
        // Palabras comunes en italiano
        const italianWords = ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'il', 'la', 'lo', 'le', 'un', 'uno', 'una', 'e', 'con', 'per', 'su', 'in', 'a', 'da', 'di', 'del', 'della', 'dei', 'delle'];
        let italianScore = 0;
        for (const word of words) {
            if (italianWords.includes(word)) italianScore++;
            if (['è', 'sono', 'sei', 'siamo', 'siete', 'erano', 'era'].some(w => lowerText.includes(w))) {
                italianScore += 2;
            }
        }
        
        // 🔥 DECIDIR EL IDIOMA BASADO EN PUNTUACIÓN
        const scores = [
            { lang: 'en', score: englishScore },
            { lang: 'es', score: spanishScore },
            { lang: 'pt', score: portugueseScore },
            { lang: 'fr', score: frenchScore },
            { lang: 'de', score: germanScore },
            { lang: 'it', score: italianScore }
        ];
        
        // Ordenar por puntuación (mayor primero)
        scores.sort((a, b) => b.score - a.score);
        
        // Si hay una diferencia clara (más de 3 puntos), usar el que tiene más
        if (scores[0].score - scores[1].score >= 3 && scores[0].score > 0) {
            return scores[0].lang;
        }
        
        // Si todos tienen 0 y es texto latino, asumir español
        if (scores.every(s => s.score === 0) && /^[a-zA-Z\s.,!?']+$/.test(trimmed)) {
            // Verificar si parece inglés
            const commonEnglish = ['the', 'of', 'and', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'in', 'that', 'this', 'a', 'an'];
            if (commonEnglish.some(w => lowerText.includes(w))) {
                return 'en';
            }
            return 'es';
        }
        
        // Fallback: español
        return 'es';
    }

    /**
     * 🔥 DETECTA IDIOMA MEJORADO (con soporte para textos cortos)
     */
    async detectLanguage(text) {
        if (!this.enabled || !this.available) return null;
        if (!text || text.trim().length === 0) return null;
        
        const trimmed = text.trim();
        
        // 🔥 SI EL TEXTO ES CORTO (< 15 caracteres), USAR DETECCIÓN POR CARACTERES
        if (trimmed.length < 15) {
            const detected = this._detectLanguageShortText(trimmed);
            console.log(`🔍 [DETECCIÓN CORTA] Texto: "${trimmed}" → ${detected}`);
            return detected;
        }
        
        // 🔥 PARA TEXTOS MÁS LARGOS, USAR EL SERVIDOR M2M100
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.apiUrl}/detect`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: { text: trimmed },
                timeout: 10000
            });
            
            const detected = response.data?.language;
            
            if (detected && this.languageMap[detected]) {
                console.log(`🔍 [DETECCIÓN SERVIDOR] Texto: "${trimmed.substring(0, 30)}..." → ${detected}`);
                return detected;
            }
            
            // Si el servidor devuelve un idioma no soportado, usar detección por caracteres
            const fallback = this._detectLanguageShortText(trimmed);
            console.log(`🔍 [DETECCIÓN FALLBACK] Texto: "${trimmed.substring(0, 30)}..." → ${fallback}`);
            return fallback;
            
        } catch (error) {
            console.warn(`⚠️ [M2M100] Error detectando idioma:`, error.message);
            // Fallback: detectar por caracteres
            const fallback = this._detectLanguageShortText(trimmed);
            console.log(`🔍 [DETECCIÓN FALLBACK (ERROR)] Texto: "${trimmed.substring(0, 30)}..." → ${fallback}`);
            return fallback;
        }
    }

    // ============================================================
    // 🔥 MÉTODO CORREGIDO - PERMITE TRADUCCIONES A CUALQUIER IDIOMA
    // ============================================================
    
    async translateText(text, targetLanguage, sourceLanguage = null) {
        if (!this.enabled || !this.available) return text;
        if (!text || text.trim().length === 0) return text;
        
        // 🔥 ELIMINAR LA RESTRICCIÓN QUE BLOQUEABA TRADUCCIONES
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