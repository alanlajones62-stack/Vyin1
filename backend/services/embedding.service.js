// backend/services/embedding.service.js - VERSIÓN CORREGIDA (SIN MODELO DE IA)

const fs = require('fs');
const path = require('path');

// ============================================================
// 🔥 CONFIGURACIÓN - DESACTIVAR EMBEDDINGS PARA PRODUCCIÓN
// ============================================================

const EMBEDDING_CACHE_FILE = path.join(__dirname, '../data/embeddings.json');
const EMBEDDINGS_ENABLED = false;  // ← 🔥 CAMBIAR A false para ahorrar memoria
const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBEDDING_DIMENSION = 384;
const SIMILARITY_THRESHOLD = 0.45;

console.log(`🔧 [Embeddings] ${EMBEDDINGS_ENABLED ? 'ACTIVADOS' : 'DESACTIVADOS (modo ahorro de memoria)'}`);

// ============================================================
// CLASE PRINCIPAL DEL SERVICIO DE EMBEDDINGS
// ============================================================

class EmbeddingService {
    constructor() {
        this.model = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.embeddingsCache = [];
        this.dimension = EMBEDDING_DIMENSION;
        this.modelName = MODEL_NAME;
        this._loadCache();
        
        // 🔥 SOLO CARGAR EL MODELO SI ESTÁ ACTIVADO
        if (EMBEDDINGS_ENABLED) {
            this._loadModel();
        } else {
            console.log('⏭️ [Embeddings] Modelo NO cargado (ahorrando memoria)');
            this.isLoaded = false;
        }
    }

    /**
     * Carga el modelo de embeddings (solo si está activado)
     */
    async _loadModel() {
        if (this.isLoading) return;
        if (!EMBEDDINGS_ENABLED) {
            this.isLoaded = false;
            return;
        }
        
        this.isLoading = true;
        
        try {
            console.log(`🔄 [Embeddings] Cargando modelo multilingüe: ${this.modelName}`);
            console.log('⏳ Esto puede tomar unos segundos la primera vez...');
            console.log('🌐 Soporte para 100+ idiomas (español, inglés, portugués, etc.)');
            
            // Usar @xenova/transformers
            const { pipeline } = await import('@xenova/transformers');
            
            // Crear pipeline de embeddings con configuración optimizada
            this.model = await pipeline('feature-extraction', this.modelName, {
                cache_dir: path.join(__dirname, '../models'),
                device: 'cpu',
                use_onnx: false,
                // Configuración para mejor rendimiento
                progress_callback: (progress) => {
                    if (progress.status === 'downloading') {
                        console.log(`   📥 Descargando: ${Math.round(progress.progress * 100)}%`);
                    }
                }
            });
            
            // Verificar que el modelo cargó correctamente
            try {
                const testTexts = [
                    'Hola mundo en español',
                    'Hello world in English',
                    'Olá mundo em português'
                ];
                
                for (const text of testTexts) {
                    const test = await this.model(text, { pooling: 'mean', normalize: true });
                    if (test && test.data) {
                        this.isLoaded = true;
                        console.log(`✅ [Embeddings] Modelo multilingüe cargado correctamente`);
                        console.log(`📊 Dimensión del embedding: ${this.dimension}`);
                        console.log(`🌐 Idiomas soportados: 100+`);
                        break;
                    }
                }
            } catch (testError) {
                console.warn('⚠️ El modelo cargó pero la prueba falló:', testError.message);
                this.isLoaded = true;
            }
            
        } catch (error) {
            console.error('❌ [Embeddings] Error cargando modelo multilingüe:', error.message);
            console.log('💡 Usando modo de respaldo (embeddings sintéticos)');
            this.isLoaded = false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Carga el caché de embeddings
     */
    _loadCache() {
        try {
            if (fs.existsSync(EMBEDDING_CACHE_FILE)) {
                const data = fs.readFileSync(EMBEDDING_CACHE_FILE, 'utf8');
                this.embeddingsCache = JSON.parse(data);
                console.log(`📦 [Embeddings] Cargados ${this.embeddingsCache.length} embeddings del caché`);
            } else {
                this.embeddingsCache = [];
                console.log('📦 [Embeddings] Archivo de embeddings no encontrado, creando nuevo');
            }
        } catch (error) {
            console.error('❌ Error cargando embeddings:', error);
            this.embeddingsCache = [];
        }
    }

    /**
     * Guarda el caché de embeddings
     */
    _saveCache() {
        try {
            fs.writeFileSync(EMBEDDING_CACHE_FILE, JSON.stringify(this.embeddingsCache, null, 2));
            console.log(`💾 [Embeddings] Guardados ${this.embeddingsCache.length} embeddings en caché`);
        } catch (error) {
            console.error('❌ Error guardando embeddings:', error);
        }
    }

    /**
     * Genera embedding para un texto usando el modelo multilingüe
     */
    async generateEmbedding(text) {
        if (!text || text.trim().length === 0) {
            return new Array(this.dimension).fill(0);
        }

        // Limpiar texto - preservar caracteres multilingües
        const cleaned = text.trim().substring(0, 1000);

        // 🔥 SI ESTÁ DESACTIVADO, USAR MODO SINTÉTICO
        if (!EMBEDDINGS_ENABLED || !this.isLoaded) {
            return this._generateSyntheticEmbedding(cleaned);
        }

        try {
            if (this.model) {
                // Usar modelo real con pooling mean y normalización
                const result = await this.model(cleaned, { 
                    pooling: 'mean',
                    normalize: true 
                });
                
                // Convertir a array y asegurar dimensión correcta
                let embedding = Array.from(result.data);
                
                // Si la dimensión es diferente, ajustar
                if (embedding.length !== this.dimension) {
                    console.warn(`⚠️ Dimensión inesperada: ${embedding.length}, ajustando a ${this.dimension}`);
                    if (embedding.length > this.dimension) {
                        embedding = embedding.slice(0, this.dimension);
                    } else {
                        while (embedding.length < this.dimension) {
                            embedding.push(0);
                        }
                    }
                }
                
                return embedding;
            } else {
                // Modo de respaldo: embedding sintético
                return this._generateSyntheticEmbedding(cleaned);
            }
        } catch (error) {
            console.error('❌ Error generando embedding:', error.message);
            return this._generateSyntheticEmbedding(cleaned);
        }
    }

    /**
     * Genera embedding sintético mejorado (respaldo)
     */
    _generateSyntheticEmbedding(text) {
        const vector = new Array(this.dimension).fill(0);
        const tokens = this._tokenize(text);
        
        if (tokens.length === 0) return vector;

        // Usar múltiples técnicas para mejor distribución
        for (const token of tokens) {
            const hash = this._hashString(token);
            for (let i = 0; i < 5; i++) {
                const pos = (hash + i * 137 + i * i * 7) % this.dimension;
                const weight = 1 / (1 + i * 0.3);
                vector[pos] += weight;
            }
        }

        // Normalizar
        const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] = vector[i] / norm;
            }
        }

        return vector;
    }

    /**
     * Tokeniza texto para embedding sintético (soporta multilingüe)
     */
    _tokenize(text) {
        if (!text) return [];
        // Preservar caracteres Unicode para mejor soporte multilingüe
        const cleaned = text.toLowerCase()
            .normalize('NFKC')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        return cleaned.split(' ').filter(t => t.length > 1);
    }

    /**
     * Hash simple para strings (soporta Unicode)
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Calcula la similitud coseno entre dos embeddings
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB) return 0;
        if (vecA.length !== vecB.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Genera embedding para una historia y la almacena
     */
    async embedStory(story) {
        if (!story || !story.id) return null;

        // 🔥 COMBINAR TODAS LAS FUENTES DE TEXTO
        const texts = [
            story.caption || '',
            story.subtitles || '',
            story.textContent || '',
            ...(story.caption ? story.caption.match(/#([\p{L}\p{N}_]+)/gu) || [] : [])
        ];
        
        const combinedText = texts.filter(t => t && t.trim()).join(' ');
        if (!combinedText.trim()) return null;

        const embedding = await this.generateEmbedding(combinedText);

        const entry = {
            storyId: story.id,
            userId: story.userId,
            text: combinedText.substring(0, 500),
            embedding: embedding,
            createdAt: story.createdAt || new Date().toISOString(),
            caption: (story.caption || '').substring(0, 200),
            subtitles: (story.subtitles || '').substring(0, 200),
            hashtags: story.hashtags || [],
            language: story.language || 'es',
            mediaType: story.mediaType || 'image'
        };

        const existingIndex = this.embeddingsCache.findIndex(e => e.storyId === story.id);
        if (existingIndex !== -1) {
            this.embeddingsCache[existingIndex] = entry;
        } else {
            this.embeddingsCache.push(entry);
        }

        this._saveCache();
        return entry;
    }

    /**
     * Elimina embedding de una historia
     */
    removeEmbedding(storyId) {
        this.embeddingsCache = this.embeddingsCache.filter(e => e.storyId !== storyId);
        this._saveCache();
    }

    /**
     * Busca historias similares usando embeddings multilingües
     */
    async searchSimilar(query, limit = 20, userId = null, filters = {}) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const queryEmbedding = await this.generateEmbedding(query);
        if (!queryEmbedding) return [];

        let results = this.embeddingsCache
            .filter(entry => {
                if (userId && entry.userId === userId) return false;
                if (filters.language && entry.language !== filters.language) return false;
                if (filters.mediaType && entry.mediaType !== filters.mediaType) return false;
                return entry.embedding && entry.embedding.length > 0;
            })
            .map(entry => {
                const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
                return {
                    storyId: entry.storyId,
                    similarity: similarity,
                    text: entry.text,
                    caption: entry.caption,
                    subtitles: entry.subtitles,
                    hashtags: entry.hashtags,
                    userId: entry.userId,
                    createdAt: entry.createdAt,
                    language: entry.language,
                    mediaType: entry.mediaType
                };
            })
            .filter(result => result.similarity > SIMILARITY_THRESHOLD)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return results;
    }

    /**
     * Busca historias similares a una historia dada
     */
    async findSimilarStories(storyId, limit = 10, userId = null) {
        const storyEmbedding = this.embeddingsCache.find(e => e.storyId === storyId);
        if (!storyEmbedding || !storyEmbedding.embedding) return [];

        let results = this.embeddingsCache
            .filter(entry => {
                if (entry.storyId === storyId) return false;
                if (userId && entry.userId === userId) return false;
                return entry.embedding && entry.embedding.length > 0;
            })
            .map(entry => {
                const similarity = this.cosineSimilarity(storyEmbedding.embedding, entry.embedding);
                return {
                    storyId: entry.storyId,
                    similarity: similarity,
                    text: entry.text,
                    caption: entry.caption,
                    subtitles: entry.subtitles,
                    userId: entry.userId,
                    createdAt: entry.createdAt,
                    language: entry.language
                };
            })
            .filter(result => result.similarity > SIMILARITY_THRESHOLD)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return results;
    }

    /**
     * Obtiene estadísticas del sistema de embeddings
     */
    getStats() {
        const languages = {};
        const mediaTypes = {};
        let totalSize = 0;
        
        this.embeddingsCache.forEach(e => {
            const lang = e.language || 'unknown';
            languages[lang] = (languages[lang] || 0) + 1;
            
            const type = e.mediaType || 'unknown';
            mediaTypes[type] = (mediaTypes[type] || 0) + 1;
            
            if (e.embedding) totalSize += e.embedding.length;
        });

        return {
            enabled: EMBEDDINGS_ENABLED,
            totalEmbeddings: this.embeddingsCache.length,
            dimension: this.dimension,
            threshold: SIMILARITY_THRESHOLD,
            modelName: this.modelName,
            isLoaded: this.isLoaded,
            languages: languages,
            mediaTypes: mediaTypes,
            averageSize: this.embeddingsCache.length > 0 ? Math.round(totalSize / this.embeddingsCache.length) : 0,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Reindexa todas las historias
     */
    async reindexAll(stories) {
        if (!stories || stories.length === 0) {
            console.log('📭 No hay historias para reindexar');
            return;
        }
        
        console.log(`🔄 Reindexando ${stories.length} historias con modelo multilingüe...`);
        console.log(`🌐 Modelo: ${this.modelName}`);
        this.embeddingsCache = [];
        
        let count = 0;
        let failed = 0;
        const batchSize = 5;
        
        for (let i = 0; i < stories.length; i += batchSize) {
            const batch = stories.slice(i, i + batchSize);
            
            for (const story of batch) {
                try {
                    const result = await this.embedStory(story);
                    if (result) {
                        count++;
                    } else {
                        failed++;
                    }
                } catch (error) {
                    failed++;
                    console.error(`❌ Error indexando historia ${story.id}:`, error.message);
                }
            }
            
            console.log(`   Procesados ${Math.min(i + batchSize, stories.length)}/${stories.length} (${count} exitosos, ${failed} fallidos)`);
        }
        
        this._saveCache();
        console.log(`✅ Reindexación completada: ${this.embeddingsCache.length} embeddings generados`);
        console.log(`📊 ${count} éxitos, ${failed} fallos`);
    }

    /**
     * Verifica si el modelo está listo
     */
    isReady() {
        return this.isLoaded && EMBEDDINGS_ENABLED;
    }

    /**
     * Espera a que el modelo cargue
     */
    async waitForModel(timeout = 30000) {
        const start = Date.now();
        while (!this.isLoaded && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return this.isLoaded;
    }
}

// ============================================================
// SINGLETON Y EXPORTACIÓN
// ============================================================

let instance = null;
let initializing = false;

async function getEmbeddingService() {
    if (!instance) {
        if (initializing) {
            // Esperar a que termine la inicialización
            await new Promise(resolve => {
                const check = () => {
                    if (instance) resolve();
                    else setTimeout(check, 100);
                };
                check();
            });
            return instance;
        }
        
        initializing = true;
        try {
            instance = new EmbeddingService();
            
            // Esperar a que el modelo cargue (máximo 30 segundos) - SOLO SI ESTÁ ACTIVADO
            if (EMBEDDINGS_ENABLED) {
                await instance.waitForModel(30000);
            }
            
            console.log(`✅ [EmbeddingService] ${instance.isLoaded ? 'cargado' : 'en modo fallback (sin IA)'}`);
        } catch (error) {
            console.error('❌ Error inicializando EmbeddingService:', error);
            instance = new EmbeddingService();
        } finally {
            initializing = false;
        }
    }
    return instance;
}

module.exports = {
    getEmbeddingService,
    EmbeddingService,
    EMBEDDINGS_ENABLED,
    SIMILARITY_THRESHOLD,
    EMBEDDING_DIMENSION,
    MODEL_NAME
};