// backend/ia_classifier.js - VERSIÓN CORREGIDA
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const IA_API_URL = process.env.IA_API_URL || 'http://localhost:5001';
const IA_API_KEY = process.env.IA_API_KEY || 'sk_vyin_2026_xyz123';

class IAClassifier {
    constructor() {
        this.apiUrl = IA_API_URL;
        this.apiKey = IA_API_KEY;
        this.timeout = 15000;
        this.cache = new Map();
        this.cacheTTL = 300000;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    /**
     * Mapea las etiquetas de la API a las 3 clases esperadas
     * ✅ CORRECCIÓN: questionable → unknown
     */
    mapLabel(label) {
        if (!label) return 'unknown';
        
        // Mapeo de 4 clases a 3 clases
        const mapping = {
            'safe': 'safe',
            'nsfw': 'nsfw',
            'questionable': 'unknown',  // 🔑 CLAVE: questionable → unknown
            'unknown': 'unknown',
            'body_parts': 'safe'        // body_parts → safe
        };
        
        return mapping[label.toLowerCase()] || 'unknown';
    }

    /**
     * Procesa la respuesta de la API y la normaliza
     */
    normalizeResponse(data) {
        // Extraer label de la respuesta (puede estar en data o en data.data)
        let rawLabel = data.label || data.data?.label || 'unknown';
        let confidence = data.confidence || data.data?.confidence || 0;
        let percentage = data.percentage || data.data?.percentage || Math.round(confidence * 100);
        let message = data.message || data.data?.message || null;
        let display = data.display || data.data?.display || null;
        let emoji = data.emoji || data.data?.emoji || null;
        
        // 🔑 MAPEAR LA ETIQUETA A LAS 3 CLASES ESPERADAS
        const mappedLabel = this.mapLabel(rawLabel);
        
        // Si la etiqueta mapeada es diferente, ajustar la confianza
        let adjustedConfidence = confidence;
        if (rawLabel === 'questionable' && mappedLabel === 'unknown') {
            // Mantener la confianza original para unknown
            adjustedConfidence = confidence;
        }
        
        // Si rawLabel era 'body_parts' y ahora es 'safe', ajustar
        if (rawLabel === 'body_parts' && mappedLabel === 'safe') {
            // body_parts con alta confianza es safe
            adjustedConfidence = Math.max(confidence, 0.75);
        }
        
        const result = {
            success: true,
            // 🔑 USAR LA ETIQUETA MAPEADA
            label: mappedLabel,
            confidence: adjustedConfidence,
            percentage: Math.round(adjustedConfidence * 100),
            // Propiedades booleanas basadas en la etiqueta mapeada
            is_safe: mappedLabel === 'safe',
            is_nsfw: mappedLabel === 'nsfw',
            is_unknown: mappedLabel === 'unknown',
            // Información original para debugging
            raw_label: rawLabel,
            raw_confidence: confidence,
            timestamp: data.timestamp || data.data?.timestamp || new Date().toISOString(),
            message: message,
            display: display,
            emoji: emoji,
            probabilities: data.probabilities || data.data?.probabilities || null,
            raw: data
        };

        return result;
    }

    /**
     * Clasificar una imagen desde un archivo local
     */
    async classifyImageFile(imagePath) {
        // Verificar caché
        const cacheKey = `file_${imagePath}_${fs.statSync(imagePath).mtimeMs}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                console.log(`📦 [IA] Usando caché para: ${path.basename(imagePath)}`);
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }

        let lastError = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🤖 [IA] Clasificando imagen: ${path.basename(imagePath)} (intento ${attempt}/${this.maxRetries})`);

                if (!fs.existsSync(imagePath)) {
                    throw new Error(`El archivo no existe: ${imagePath}`);
                }

                const formData = new FormData();
                formData.append('image', fs.createReadStream(imagePath));

                const response = await axios.post(`${this.apiUrl}/classify`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'X-API-Key': this.apiKey
                    },
                    timeout: this.timeout
                });

                // 🔑 NORMALIZAR LA RESPUESTA
                const result = this.normalizeResponse(response.data);

                // Debug: mostrar el mapeo realizado
                if (result.raw_label !== result.label) {
                    console.log(`🔄 [IA] Mapeo: ${result.raw_label} → ${result.label} (confianza: ${result.percentage}%)`);
                } else {
                    console.log(`✅ [IA] Resultado: ${result.label} (${result.percentage}%)`);
                }

                // Guardar en caché
                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return result;

            } catch (error) {
                lastError = error;
                console.error(`❌ [IA] Error en intento ${attempt}/${this.maxRetries}: ${error.message}`);
                
                if (error.code === 'ECONNREFUSED' && attempt < this.maxRetries) {
                    console.log(`🔄 [IA] Reintentando en ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                    continue;
                }
                break;
            }
        }

        console.error(`❌ [IA] Error clasificando imagen: ${lastError?.message}`);
        
        const isAvailable = await this.healthCheck();
        if (!isAvailable) {
            console.error(`❌ [IA] API no disponible en ${this.apiUrl}`);
            console.log(`💡 [IA] Asegúrate de que la API esté corriendo: python api.py`);
        }
        
        return {
            success: false,
            error: lastError?.message || 'Error desconocido',
            label: 'unknown',
            confidence: 0,
            percentage: 0,
            is_safe: false,
            is_nsfw: false,
            is_unknown: true,
            fallback: true,
            timestamp: new Date().toISOString(),
            api_url: this.apiUrl
        };
    }

    /**
     * Clasificar una imagen desde un buffer
     */
    async classifyImageBuffer(imageBuffer, filename = 'image.jpg') {
        const tempDir = path.join(__dirname, 'temp');
        const tempPath = path.join(tempDir, `${Date.now()}_${filename}`);
        
        try {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            fs.writeFileSync(tempPath, imageBuffer);
            
            const result = await this.classifyImageFile(tempPath);
            
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch (e) {}

            return result;
        } catch (error) {
            console.error('❌ [IA] Error clasificando buffer:', error.message);
            
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch (e) {}
            
            return {
                success: false,
                error: error.message,
                label: 'unknown',
                confidence: 0,
                percentage: 0,
                is_safe: false,
                is_nsfw: false,
                is_unknown: true,
                fallback: true,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Clasificar una imagen desde una URL
     */
    async classifyImageUrl(imageUrl) {
        try {
            console.log(`🌐 [IA] Clasificando imagen desde URL: ${imageUrl.substring(0, 50)}...`);
            
            const response = await axios.post(`${this.apiUrl}/classify/url`, {
                url: imageUrl
            }, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout
            });

            const result = this.normalizeResponse(response.data);
            result.image_url = imageUrl;

            console.log(`✅ [IA] Resultado URL: ${result.label} (${result.percentage}%)`);
            return result;

        } catch (error) {
            console.error('❌ [IA] Error clasificando desde URL:', error.message);
            return {
                success: false,
                error: error.message,
                label: 'unknown',
                confidence: 0,
                percentage: 0,
                is_safe: false,
                is_nsfw: false,
                is_unknown: true,
                fallback: true,
                timestamp: new Date().toISOString(),
                image_url: imageUrl
            };
        }
    }

    /**
     * Clasificar una imagen desde base64
     */
    async classifyImageBase64(base64String, filename = 'image.jpg') {
        try {
            console.log(`📸 [IA] Clasificando imagen desde base64...`);
            
            let cleanBase64 = base64String;
            if (base64String.includes(',')) {
                cleanBase64 = base64String.split(',')[1];
            }

            const response = await axios.post(`${this.apiUrl}/classify/base64`, {
                image_base64: cleanBase64
            }, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout
            });

            const result = this.normalizeResponse(response.data);

            console.log(`✅ [IA] Resultado base64: ${result.label} (${result.percentage}%)`);
            return result;

        } catch (error) {
            console.error('❌ [IA] Error clasificando desde base64:', error.message);
            return {
                success: false,
                error: error.message,
                label: 'unknown',
                confidence: 0,
                percentage: 0,
                is_safe: false,
                is_nsfw: false,
                is_unknown: true,
                fallback: true,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Clasificación detallada con probabilidades
     */
    async classifyImageDetailed(imagePath) {
        try {
            console.log(`🔬 [IA] Clasificación detallada: ${path.basename(imagePath)}`);

            if (!fs.existsSync(imagePath)) {
                throw new Error(`El archivo no existe: ${imagePath}`);
            }

            const formData = new FormData();
            formData.append('image', fs.createReadStream(imagePath));

            const response = await axios.post(`${this.apiUrl}/classify/detailed`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'X-API-Key': this.apiKey
                },
                timeout: this.timeout
            });

            const data = response.data;
            
            // Mapear también en la versión detallada
            const mappedLabel = this.mapLabel(data.label);
            
            return {
                success: true,
                label: mappedLabel,
                confidence: data.confidence || 0,
                percentage: data.percentage || Math.round((data.confidence || 0) * 100),
                is_unknown: mappedLabel === 'unknown',
                is_safe: mappedLabel === 'safe',
                is_nsfw: mappedLabel === 'nsfw',
                raw_label: data.label,
                probabilities: data.probabilities || null,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ [IA] Error en clasificación detallada:', error.message);
            return {
                success: false,
                error: error.message,
                label: 'unknown',
                confidence: 0,
                percentage: 0,
                is_unknown: true,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Clasificar múltiples imágenes en lote
     */
    async classifyBatch(images) {
        try {
            console.log(`📦 [IA] Clasificando lote de ${images.length} imágenes...`);
            
            const base64Images = [];
            
            for (let i = 0; i < images.length; i++) {
                let imageBuffer;
                if (typeof images[i] === 'string') {
                    if (fs.existsSync(images[i])) {
                        imageBuffer = fs.readFileSync(images[i]);
                    } else {
                        throw new Error(`Archivo no encontrado: ${images[i]}`);
                    }
                } else if (Buffer.isBuffer(images[i])) {
                    imageBuffer = images[i];
                } else {
                    throw new Error(`Tipo de imagen no soportado en índice ${i}`);
                }
                
                const base64 = imageBuffer.toString('base64');
                base64Images.push(base64);
            }

            const response = await axios.post(`${this.apiUrl}/batch`, {
                images: base64Images
            }, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout * 2
            });

            // Mapear los resultados del lote
            const results = response.data.results?.map(r => {
                if (r.error) return r;
                return {
                    ...r,
                    label: this.mapLabel(r.label),
                    is_safe: this.mapLabel(r.label) === 'safe',
                    is_nsfw: this.mapLabel(r.label) === 'nsfw',
                    is_unknown: this.mapLabel(r.label) === 'unknown',
                    raw_label: r.label
                };
            }) || [];

            return {
                success: true,
                total: response.data.total || images.length,
                results: results,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ [IA] Error en clasificación por lotes:', error.message);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }

    /**
     * Verificar si la API de IA está disponible
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.apiUrl}/health`, {
                timeout: 5000
            });
            return response.status === 200 && response.data?.status === 'healthy';
        } catch (error) {
            console.warn(`⚠️ [IA] API no disponible en ${this.apiUrl}:`, error.message);
            return false;
        }
    }

    /**
     * Obtener el estado actual de la API
     */
    async getStatus() {
        try {
            const response = await axios.get(`${this.apiUrl}/health`, {
                timeout: 5000
            });
            return {
                available: true,
                ...response.data,
                url: this.apiUrl,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                available: false,
                error: error.message,
                url: this.apiUrl,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Obtener estadísticas del modelo
     */
    async getModelStats() {
        try {
            const response = await axios.get(`${this.apiUrl}/stats`, {
                timeout: 5000
            });
            return {
                success: true,
                ...response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ [IA] Error obteniendo estadísticas:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Limpiar caché
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 [IA] Caché limpiado');
    }

    /**
     * Obtener estadísticas de la caché
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()).slice(0, 10),
            ttl: this.cacheTTL / 1000 + 's'
        };
    }

    /**
     * Probar la conexión con la API
     */
    async testConnection() {
        console.log(`🔍 [IA] Probando conexión a: ${this.apiUrl}`);
        const status = await this.getStatus();
        if (status.available) {
            console.log(`✅ [IA] API disponible en ${this.apiUrl}`);
            console.log(`   📊 Modelo: ${status.model || 'best_model.pth'}`);
            console.log(`   📁 Clases: ${status.classes?.join(', ') || 'nsfw, safe, unknown'}`);
            console.log(`   🎯 Precisión: ${status.precision || '~95%'}`);
            return true;
        } else {
            console.error(`❌ [IA] No se pudo conectar a ${this.apiUrl}`);
            console.log(`💡 [IA] Asegúrate de que la API esté corriendo:`);
            console.log(`   cd backend && python api.py`);
            return false;
        }
    }
}

// ============================================================
// SINGLETON
// ============================================================

const iaClassifier = new IAClassifier();
module.exports = iaClassifier;