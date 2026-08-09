// backend/classifiers/index.js
// SISTEMA DE CLASIFICACIÓN CON TRADUCCIÓN AUTOMÁTICA

const fs = require('fs');
const path = require('path');
const { getVyinService } = require('../services/vyin-ia.service');

class ContentClassifier {
    constructor() {
        this.categories = new Map();
        this.categoryWeights = {};
        this.vyinService = getVyinService();
        this.translationCache = new Map();
        this.cacheTTL = 3600000; // 1 hora
        this.supportedLanguages = ['es', 'en', 'pt', 'fr', 'de', 'it', 'nl', 'ru', 'ja', 'zh', 'ko', 'ar', 'hi', 'vi', 'th', 'id', 'tr', 'pl', 'uk', 'ro', 'el', 'hu', 'cs', 'sv', 'da', 'fi', 'he', 'fa', 'ur', 'bg', 'sk', 'sl', 'ms'];
        
        this._loadAllCategories();
        this._loadWeights();
        console.log(`📂 [Classifier] Cargadas ${this.categories.size} categorías`);
        console.log(`🌐 [Classifier] Traducción automática: ${this.vyinService.enabled ? '✅ Activada' : '❌ Desactivada'}`);
    }

    /**
     * CARGA DINÁMICAMENTE TODOS LOS ARCHIVOS DE LA CARPETA categories/
     */
    _loadAllCategories() {
        const categoriesDir = path.join(__dirname, 'categories');
        
        if (!fs.existsSync(categoriesDir)) {
            fs.mkdirSync(categoriesDir, { recursive: true });
            console.log('📁 [Classifier] Carpeta categories/ creada');
            return;
        }

        const files = fs.readdirSync(categoriesDir).filter(f => f.endsWith('.js'));
        
        if (files.length === 0) {
            console.log('📁 [Classifier] No hay categorías en categories/');
            return;
        }

        for (const file of files) {
            try {
                const categoryPath = path.join(categoriesDir, file);
                const categoryModule = require(categoryPath);
                const categoryName = path.basename(file, '.js');
                
                if (categoryModule && categoryModule.keywords && Array.isArray(categoryModule.keywords)) {
                    this.categories.set(categoryName, {
                        name: categoryModule.name || categoryName,
                        emoji: categoryModule.emoji || '📌',
                        weight: categoryModule.weight || 1.0,
                        description: categoryModule.description || '',
                        keywords: categoryModule.keywords || [], // SOLO EN ESPAÑOL
                        aliases: categoryModule.aliases || []
                    });
                    console.log(`   ✅ Cargada: ${categoryModule.emoji || '📌'} ${categoryModule.name || categoryName} (${categoryModule.keywords.length} palabras clave)`);
                } else {
                    console.warn(`   ⚠️ ${file} no tiene formato válido (requiere 'keywords' array)`);
                }
            } catch (error) {
                console.error(`   ❌ Error cargando ${file}:`, error.message);
            }
        }
    }

    /**
     * CARGA PESOS
     */
    _loadWeights() {
        const weightsPath = path.join(__dirname, 'models', 'category-weights.json');
        try {
            if (fs.existsSync(weightsPath)) {
                this.categoryWeights = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
            }
        } catch (error) {
            console.error('❌ Error cargando pesos:', error.message);
        }
    }

    /**
     * GUARDA PESOS
     */
    _saveWeights() {
        const weightsPath = path.join(__dirname, 'models', 'category-weights.json');
        try {
            const dir = path.dirname(weightsPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(weightsPath, JSON.stringify(this.categoryWeights, null, 2));
        } catch (error) {
            console.error('❌ Error guardando pesos:', error.message);
        }
    }

    /**
     * TRADUCE UNA PALABRA CLAVE AL IDIOMA DESTINO (CON CACHÉ)
     */
    async _translateKeyword(keyword, targetLanguage) {
        if (targetLanguage === 'es') return keyword;
        
        const cacheKey = `${keyword}_${targetLanguage}`;
        
        // Verificar caché
        if (this.translationCache.has(cacheKey)) {
            const cached = this.translationCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.translation;
            }
            this.translationCache.delete(cacheKey);
        }

        try {
            const translated = await this.vyinService.translateText(keyword, targetLanguage);
            
            // Guardar en caché
            this.translationCache.set(cacheKey, {
                translation: translated,
                timestamp: Date.now()
            });
            
            return translated;
        } catch (error) {
            console.error(`❌ Error traduciendo "${keyword}" al ${targetLanguage}:`, error.message);
            return keyword; // Fallback: devolver la palabra original
        }
    }

    /**
     * TRADUCE TODAS LAS PALABRAS CLAVE DE UNA CATEGORÍA AL IDIOMA DESTINO
     */
    async _translateKeywords(keywords, targetLanguage) {
        if (targetLanguage === 'es') return keywords;
        
        const translated = [];
        for (const keyword of keywords) {
            const translatedKeyword = await this._translateKeyword(keyword, targetLanguage);
            translated.push(translatedKeyword);
        }
        return translated;
    }

    /**
     * CLASIFICA UN TEXTO EN CATEGORÍAS (CON TRADUCCIÓN AUTOMÁTICA)
     */
    async classify(text, targetLanguage = 'es') {
        if (!text || text.trim().length === 0) {
            return [];
        }

        const lowerText = text.toLowerCase();
        const results = [];

        for (const [categoryName, category] of this.categories) {
            let matchCount = 0;
            const matchedKeywords = [];
            
            // Obtener keywords en el idioma objetivo (traducidas automáticamente)
            const keywords = await this._translateKeywords(category.keywords, targetLanguage);
            
            for (const keyword of keywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    matchCount++;
                    matchedKeywords.push(keyword);
                }
            }

            // También buscar en español (por si el texto está en español)
            if (targetLanguage !== 'es') {
                for (const keyword of category.keywords) {
                    if (lowerText.includes(keyword.toLowerCase())) {
                        if (!matchedKeywords.includes(keyword)) {
                            matchCount++;
                            matchedKeywords.push(keyword);
                        }
                    }
                }
            }

            if (matchCount > 0) {
                const weight = this.categoryWeights[categoryName] || category.weight || 1;
                const score = Math.min(1, (matchCount / 3) * weight);
                
                // Traducir nombre y descripción de la categoría
                const translatedName = await this._translateKeyword(category.name, targetLanguage);
                const translatedDesc = category.description ? await this._translateKeyword(category.description, targetLanguage) : '';
                
                results.push({
                    category: categoryName,
                    name: translatedName,
                    emoji: category.emoji,
                    score: Math.round(score * 100) / 100,
                    matchCount: matchCount,
                    matchedKeywords: matchedKeywords.slice(0, 5),
                    description: translatedDesc
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    }

    /**
     * CLASIFICA UNA HISTORIA COMPLETA
     */
    async classifyStory(story, targetLanguage = 'es') {
        const text = `${story.caption || ''} ${story.subtitles || ''} ${story.textContent || ''}`;
        const classifications = await this.classify(text, targetLanguage);
        
        const topCategories = classifications.slice(0, 3);
        
        return {
            storyId: story.id,
            categories: topCategories,
            primaryCategory: topCategories.length > 0 ? topCategories[0] : null,
            allCategories: classifications
        };
    }

    /**
     * CLASIFICA MÚLTIPLES HISTORIAS (EN PARALELO)
     */
    async classifyStories(stories, targetLanguage = 'es') {
        const results = [];
        for (const story of stories) {
            const result = await this.classifyStory(story, targetLanguage);
            results.push(result);
        }
        return results;
    }

    /**
     * OBTIENE LAS CATEGORÍAS PREFERIDAS DE UN USUARIO
     */
    async getUserPreferredCategories(userId, stories, targetLanguage = 'es') {
        const categoryCounts = {};
        
        for (const story of stories) {
            if (story.likes?.includes(userId)) {
                const classification = await this.classifyStory(story, targetLanguage);
                if (classification.primaryCategory) {
                    const cat = classification.primaryCategory.category;
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                }
            }
        }

        const result = [];
        for (const [category, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
            const info = this.categories.get(category);
            const translatedName = info ? await this._translateKeyword(info.name, targetLanguage) : category;
            result.push({
                category,
                count,
                name: translatedName,
                emoji: info?.emoji || '📌'
            });
        }
        
        return result;
    }

    /**
     * OBTIENE TODAS LAS CATEGORÍAS DISPONIBLES (TRADUCIDAS)
     */
    async getCategories(targetLanguage = 'es') {
        const result = [];
        for (const [name, category] of this.categories) {
            const translatedName = await this._translateKeyword(category.name, targetLanguage);
            const translatedDesc = category.description ? await this._translateKeyword(category.description, targetLanguage) : '';
            
            result.push({
                name: name,
                displayName: translatedName,
                emoji: category.emoji,
                description: translatedDesc,
                keywordCount: category.keywords.length,
                weight: this.categoryWeights[name] || category.weight || 1
            });
        }
        return result;
    }

    /**
     * ACTUALIZA EL PESO DE UNA CATEGORÍA
     */
    updateCategoryWeight(categoryName, weight) {
        if (!this.categories.has(categoryName)) {
            throw new Error(`Categoría ${categoryName} no encontrada`);
        }
        
        this.categoryWeights[categoryName] = Math.max(0, Math.min(2, weight));
        this._saveWeights();
        return this.categoryWeights[categoryName];
    }

    /**
     * OBTIENE ESTADÍSTICAS
     */
    getStats() {
        const totalKeywords = Array.from(this.categories.values())
            .reduce((sum, cat) => sum + cat.keywords.length, 0);

        return {
            totalCategories: this.categories.size,
            totalKeywords: totalKeywords,
            supportedLanguages: this.supportedLanguages,
            translationEnabled: this.vyinService.enabled,
            categories: Array.from(this.categories.keys()),
            weights: this.categoryWeights,
            cacheSize: this.translationCache.size
        };
    }

    /**
     * LIMPIA LA CACHÉ DE TRADUCCIONES
     */
    clearCache() {
        this.translationCache.clear();
        console.log('🧹 [Classifier] Caché de traducciones limpiado');
    }
}

// ============================================================
// SINGLETON
// ============================================================

let instance = null;

function getContentClassifier() {
    if (!instance) {
        instance = new ContentClassifier();
    }
    return instance;
}

module.exports = {
    getContentClassifier,
    ContentClassifier
};