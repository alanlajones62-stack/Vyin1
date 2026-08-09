// backend/services/vyin-ia.service.js
// VYIN IA - CON M2M100 (10 IDIOMAS) - COMPLETO

const { getTranslationService } = require('./translation.service');

class VyinIAService {
    constructor() {
        this.translator = getTranslationService();
        
        this.enabled = false;
        this._lastState = false;
        this._checkInterval = null;
        
        this.prohibitedWords = [
            'puta', 'mierda', 'coño', 'pendejo', 'gilipollas', 
            'cabron', 'fuck', 'shit', 'asshole', 'bitch',
            'coger', 'verga', 'chucha', 'weon', 'wea',
            'maricon', 'marica', 'joto', 'puto'
        ];
        
        this.supportedLanguages = this.translator ? Object.keys(this.translator.languageMap) : ['es'];
        
        console.log(`🤖 [Vyin IA] Servicio inicializado (M2M100 - 10 idiomas)`);
        console.log(`🌐 Traducción: ❌ Desactivada (esperando conexión...)`);
        console.log(`📚 Idiomas: ${this.supportedLanguages.length}`);
        console.log(`📄 Licencia: MIT (Uso comercial permitido)`);
        
        this._checkAndUpdateStatus();
    }

    async _checkAndUpdateStatus() {
        try {
            if (this.translator) {
                await this.translator.checkHealth();
                const isAvailable = this.translator.isEnabled();
                
                if (isAvailable !== this._lastState) {
                    this._lastState = isAvailable;
                    this.enabled = isAvailable;
                    
                    if (isAvailable) {
                        console.log('✅ [Vyin IA] Traducción ACTIVADA (M2M100 conectado)');
                    } else {
                        console.log('⚠️ [Vyin IA] Traducción DESACTIVADA (M2M100 desconectado)');
                    }
                } else {
                    this.enabled = isAvailable;
                }
            }
        } catch (error) {
            if (this._lastState !== false) {
                this._lastState = false;
                this.enabled = false;
                console.log('⚠️ [Vyin IA] Traducción DESACTIVADA (M2M100 desconectado)');
            }
        }
        
        if (this._checkInterval) {
            clearTimeout(this._checkInterval);
        }
        this._checkInterval = setTimeout(() => this._checkAndUpdateStatus(), 30000);
    }

    async translateText(text, targetLanguage, sourceLanguage = null) {
        if (!this.enabled && this.translator) {
            await this.translator.checkHealth();
            const isAvailable = this.translator.isEnabled();
            if (isAvailable !== this._lastState) {
                this._lastState = isAvailable;
                this.enabled = isAvailable;
                if (isAvailable) {
                    console.log('✅ [Vyin IA] Traducción ACTIVADA (M2M100 conectado)');
                }
            } else {
                this.enabled = isAvailable;
            }
        }
        
        if (!this.enabled || !this.translator) return text;
        return await this.translator.translateText(text, targetLanguage, sourceLanguage);
    }

    async translateBatch(texts, targetLanguage) {
        if (!this.enabled || !this.translator) return texts;
        return await this.translator.translateBatch(texts, targetLanguage);
    }

    async detectLanguage(text) {
        if (!this.enabled || !this.translator) return 'es';
        
        try {
            const result = await this.translator.detectLanguage(text);
            if (result && result !== 'unknown') {
                return result;
            }
            return 'es';
        } catch (error) {
            console.warn('⚠️ Error detectando idioma:', error.message);
            return 'es';
        }
    }

    getUserLanguage(user) {
        if (!user) return 'es';
        if (user.language && this.supportedLanguages.includes(user.language)) {
            return user.language;
        }
        if (user.country) {
            const lang = this.translator ? this.translator.countryToLanguage(user.country) : null;
            if (lang && this.supportedLanguages.includes(lang)) {
                return lang;
            }
        }
        return 'es';
    }

    getLanguageInfo(langCode) {
        if (!this.translator) {
            return { code: langCode, name: 'Desconocido', flag: '🌐' };
        }
        return this.translator.getLanguageInfo(langCode);
    }

    getSupportedLanguages() {
        if (!this.translator) {
            return [{ code: 'es', name: 'Español', flag: '🇪🇸' }];
        }
        return this.translator.getSupportedLanguages();
    }

    async translateStory(story, targetLanguage) {
        if (!story) return story;
        if (targetLanguage === 'es') return story;
        if (!this.enabled || !this.translator) return story;

        const translated = { ...story };
        
        try {
            if (story.caption) {
                translated.caption = await this.translateText(story.caption, targetLanguage);
            }
            if (story.subtitles) {
                translated.subtitles = await this.translateText(story.subtitles, targetLanguage);
            }
            if (story.textContent) {
                translated.textContent = await this.translateText(story.textContent, targetLanguage);
            }
            translated.translated = true;
            translated.originalLanguage = story.language || 'es';
            translated.language = targetLanguage;
            translated.translationMethod = 'm2m100';
            translated.license = 'MIT';
        } catch (error) {
            console.error('❌ Error traduciendo historia:', error.message);
        }
        
        return translated;
    }

    async translateStories(stories, targetLanguage) {
        if (!stories || stories.length === 0) return stories;
        if (targetLanguage === 'es') return stories;
        if (!this.enabled || !this.translator) return stories;

        try {
            const results = [];
            for (const story of stories) {
                const translated = await this.translateStory(story, targetLanguage);
                results.push(translated);
            }
            return results;
        } catch (error) {
            console.error('❌ Error traduciendo historias:', error.message);
            return stories;
        }
    }

    moderateContent(text) {
        if (!text) return { safe: true, issues: [] };
        
        const issues = [];
        const lowerText = text.toLowerCase();
        
        for (const word of this.prohibitedWords) {
            if (lowerText.includes(word)) {
                issues.push({ word, severity: 'medium' });
            }
        }
        
        const upperCount = (text.match(/[A-ZÁÉÍÓÚÜÑ]{4,}/g) || []).length;
        if (upperCount > 3) {
            issues.push({ type: 'excessive_uppercase', count: upperCount, severity: 'low' });
        }
        
        const repeatCount = (text.match(/(.)\1{5,}/g) || []).length;
        if (repeatCount > 0) {
            issues.push({ type: 'excessive_repetition', count: repeatCount, severity: 'low' });
        }
        
        return {
            safe: issues.length === 0,
            issues: issues,
            flagged: issues.length > 0,
            details: issues.map(i => i.word || i.type).join(', ')
        };
    }

    getStats() {
        const translationStats = this.translator ? this.translator.getStats() : {};
        return {
            name: 'Vyin IA',
            version: '4.0.0',
            engine: 'M2M100 (Meta)',
            license: 'MIT',
            translationEnabled: this.enabled,
            translationStats: translationStats,
            languages: this.supportedLanguages,
            totalLanguages: this.supportedLanguages.length,
            moderationEnabled: true,
            prohibitedWordsCount: this.prohibitedWords.length
        };
    }

    clearCache() {
        if (this.translator) {
            this.translator.clearCache();
        }
    }

    isEnabled() {
        return this.enabled;
    }
}

let instance = null;

function getVyinService() {
    if (!instance) {
        try {
            instance = new VyinIAService();
        } catch (error) {
            console.error('❌ Error creando VyinIAService:', error);
            instance = {
                enabled: false,
                translateText: async (text) => text,
                translateBatch: async (texts) => texts,
                detectLanguage: async () => 'es',
                getUserLanguage: () => 'es',
                getLanguageInfo: () => ({ code: 'es', name: 'Español', flag: '🇪🇸' }),
                getSupportedLanguages: () => [{ code: 'es', name: 'Español', flag: '🇪🇸' }],
                translateStory: async (story) => story,
                translateStories: async (stories) => stories,
                moderateContent: () => ({ safe: true, issues: [] }),
                translateCommonMessage: async (key) => key,
                getStats: () => ({ name: 'Vyin IA (Fallback)', enabled: false }),
                clearCache: () => {},
                isEnabled: () => false,
                _lastState: false,
                _checkAndUpdateStatus: async () => {},
                _checkInterval: null
            };
        }
    }
    return instance;
}

module.exports = {
    getVyinService,
    VyinIAService
};