// backend/services/cloudinary.service.js

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// 🔥 CREDENCIALES CORREGIDAS
cloudinary.config({
    cloud_name: 'ddgnjxeka',  // ← CORREGIDO: este es tu cloud_name real
    api_key: '252662336671461',
    api_secret: 'PMpBvWpxz49UiHjixemVpO6LL40'
});

/**
 * Subir archivo a Cloudinary
 */
const uploadFile = async (filePath, options = {}) => {
    try {
        console.log(`☁️ Subiendo a Cloudinary: ${filePath}`);
        
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'vyn_stories',
            resource_type: 'auto',
            ...options
        });

        // Eliminar archivo local después de subir (opcional)
        try { 
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); 
                console.log(`🗑️ Archivo local eliminado: ${filePath}`);
            }
        } catch (e) {
            console.warn('⚠️ No se pudo eliminar archivo local:', e.message);
        }

        console.log(`✅ Subido a Cloudinary: ${result.secure_url}`);
        
        return {
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height
        };
    } catch (error) {
        console.error('❌ Error subiendo a Cloudinary:', error.message);
        console.error('   Detalles:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Eliminar archivo de Cloudinary
 */
const deleteFile = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log(`🗑️ Eliminado de Cloudinary: ${publicId}`);
        return { success: true, result };
    } catch (error) {
        console.error('❌ Error eliminando de Cloudinary:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Verificar conexión a Cloudinary
 */
const testConnection = async () => {
    try {
        const result = await cloudinary.api.ping();
        console.log('✅ Cloudinary conectado correctamente');
        return { success: true, result };
    } catch (error) {
        console.error('❌ Error conectando a Cloudinary:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = { 
    uploadFile,
    deleteFile,
    testConnection
};