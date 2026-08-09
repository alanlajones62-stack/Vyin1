// backend/scripts/init-embeddings.js
// Script para inicializar embeddings con el modelo de Hugging Face

const { getEmbeddingService } = require('../services/embedding.service');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function readStories() {
    try {
        const filePath = path.join(DATA_DIR, 'stories.json');
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error leyendo stories:', error);
        return [];
    }
}

async function initEmbeddings() {
    console.log('🚀 Inicializando sistema de embeddings con Hugging Face...');
    console.log('📦 Modelo: paraphrase-multilingual-MiniLM-L12-v2');
    
    const stories = readStories();
    const activeStories = stories.filter(s => {
        if (s.hidden) return false;
        if (!s.expiresAt) return false;
        return new Date(s.expiresAt).getTime() > Date.now();
    });

    console.log(`📚 Encontradas ${activeStories.length} historias activas`);

    const embeddingService = await getEmbeddingService();
    await embeddingService.reindexAll(activeStories);

    console.log('✅ Embeddings inicializados correctamente');
    console.log('📊 Estadísticas:', embeddingService.getStats());
}

// Ejecutar
initEmbeddings()
    .then(() => {
        console.log('✅ Proceso completado');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });

module.exports = { initEmbeddings };