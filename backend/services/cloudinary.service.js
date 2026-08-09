// backend/services/cloudinary.service.js

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// 🔥 TUS CREDENCIALES EXISTENTES
cloudinary.config({
    cloud_name: 'anonimatix',
    api_key: '834122285252736',
    api_secret: 'PMpBvWpxz49UiHjixemVpO6LL40'
});

/**
 * Subir archivo a Cloudinary
 */
const uploadFile = async (filePath, options = {}) => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'vyn_stories',
            resource_type: 'auto',
            ...options
        });

        // Eliminar archivo local después de subir
        try { fs.unlinkSync(filePath); } catch (e) {}

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
        console.error('❌ Error subiendo a Cloudinary:', error);
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
    deleteFile,      // ✅ EXPORTADO
    testConnection   // ✅ EXPORTADO
};