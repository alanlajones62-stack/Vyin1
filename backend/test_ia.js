// test_ia.js
const iaClassifier = require('./ia_classifier');

async function test() {
    console.log('🔍 Probando conexión con IA API...');
    
    // Verificar salud de la API
    const isHealthy = await iaClassifier.healthCheck();
    console.log(`📊 API saludable: ${isHealthy}`);
    
    if (isHealthy) {
        console.log('✅ La API está funcionando correctamente');
    } else {
        console.log('⚠️ La API no está disponible.');
        console.log('💡 Asegúrate de ejecutar: python api.py en el proyecto de IA');
    }
}

test();