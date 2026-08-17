// ============================================================
// file-viewer.js - Visor de archivos universal
// 🔥 Soporte para PDF, imágenes, videos, audio, documentos
// 🔥 Usa el visor nativo del navegador cuando es posible
// 🔥 CORREGIDO: importación de auth.js con ruta correcta
// ============================================================

// 🔥 CORREGIDO: importación desde auth.js (misma carpeta)
import { showToast } from './auth.js';

/**
 * Abre un archivo en el visor adecuado según su tipo
 * @param {string} fileUrl - URL del archivo
 * @param {string} mimetype - Tipo MIME del archivo (opcional)
 * @param {string} filename - Nombre del archivo (opcional)
 */
export function openFileViewer(fileUrl, mimetype = null, filename = 'Archivo') {
    if (!fileUrl) {
        showToast('URL del archivo no válida', true);
        return;
    }

    // Detectar tipo MIME si no se proporcionó
    if (!mimetype) {
        mimetype = detectMimeType(fileUrl);
    }

    console.log(`📂 Abriendo visor para: ${filename} (${mimetype})`);

    // ============================================================
    // PDF - Usar visor nativo del navegador
    // ============================================================
    if (mimetype === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
        openPDFViewer(fileUrl, filename);
        return;
    }

    // ============================================================
    // IMÁGENES - Abrir en overlay con zoom
    // ============================================================
    if (mimetype.startsWith('image/') || isImageExtension(fileUrl)) {
        openImageViewer(fileUrl, filename);
        return;
    }

    // ============================================================
    // VIDEOS - Abrir en overlay con reproductor
    // ============================================================
    if (mimetype.startsWith('video/') || isVideoExtension(fileUrl)) {
        openVideoViewer(fileUrl, filename);
        return;
    }

    // ============================================================
    // AUDIO - Abrir en overlay con reproductor de audio
    // ============================================================
    if (mimetype.startsWith('audio/') || isAudioExtension(fileUrl)) {
        openAudioViewer(fileUrl, filename);
        return;
    }

    // ============================================================
    // DOCUMENTOS DE TEXTO - Mostrar en overlay
    // ============================================================
    if (mimetype === 'text/plain' || fileUrl.toLowerCase().endsWith('.txt')) {
        openTextViewer(fileUrl, filename);
        return;
    }

    // ============================================================
    // DOCUMENTOS DE WORD, EXCEL, ETC - Descargar (no hay visor nativo)
    // ============================================================
    if (mimetype.includes('word') || mimetype.includes('excel') || 
        mimetype.includes('spreadsheet') || mimetype.includes('presentation') ||
        mimetype.includes('officedocument')) {
        downloadFile(fileUrl, filename);
        return;
    }

    // ============================================================
    // FALLBACK: Descargar archivo
    // ============================================================
    showToast('📥 Descargando archivo...');
    downloadFile(fileUrl, filename);
}

// ============================================================
// FUNCIONES DE DETECCIÓN DE TIPO MIME
// ============================================================

function detectMimeType(fileUrl) {
    const url = fileUrl.toLowerCase();
    
    // Imágenes
    if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|avif)$/)) return 'image/jpeg';
    // Videos
    if (url.match(/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v)$/)) return 'video/mp4';
    // Audio
    if (url.match(/\.(mp3|wav|ogg|aac|flac|m4a|wma)$/)) return 'audio/mpeg';
    // PDF
    if (url.match(/\.pdf$/)) return 'application/pdf';
    // Texto
    if (url.match(/\.(txt|log|md)$/)) return 'text/plain';
    // Word
    if (url.match(/\.(doc|docx)$/)) return 'application/msword';
    // Excel
    if (url.match(/\.(xls|xlsx|csv)$/)) return 'application/vnd.ms-excel';
    // PowerPoint
    if (url.match(/\.(ppt|pptx)$/)) return 'application/vnd.ms-powerpoint';
    
    return 'application/octet-stream';
}

function isImageExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|avif)$/);
}

function isVideoExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v)$/);
}

function isAudioExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(mp3|wav|ogg|aac|flac|m4a|wma)$/);
}

// ============================================================
// PDF VIEWER
// ============================================================

function openPDFViewer(fileUrl, filename) {
    // Usar el visor nativo del navegador con un overlay
    const overlay = createOverlay(filename);
    const content = overlay.querySelector('.viewer-content');
    
    // Si el navegador soporta el visor PDF integrado
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile) {
        // En móvil, abrir en nueva pestaña (el navegador maneja PDFs)
        window.open(fileUrl, '_blank');
        overlay.remove();
        return;
    }
    
    // Escritorio: usar iframe con el visor PDF del navegador
    content.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;background:#1a1a2e;border-radius:12px;overflow:hidden;">
            <div style="padding:12px 20px;background:#2d2d44;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <span style="color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-file-pdf" style="color:#ff6b6b;"></i>
                    ${escapeHtml(filename)}
                </span>
                <div style="display:flex;gap:8px;">
                    <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                            style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                    <button onclick="this.closest('.file-viewer-overlay').remove()" 
                            style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <iframe src="${fileUrl}" 
                    style="flex:1;width:100%;border:none;background:#fff;"
                    sandbox="allow-scripts allow-same-origin allow-modals">
            </iframe>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// ============================================================
// IMAGE VIEWER
// ============================================================

function openImageViewer(fileUrl, filename) {
    const overlay = createOverlay(filename);
    const content = overlay.querySelector('.viewer-content');
    
    content.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;background:#000;border-radius:12px;overflow:hidden;position:relative;">
            <div style="position:absolute;top:0;left:0;right:0;z-index:10;padding:12px 20px;background:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <span style="color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;text-shadow:0 2px 4px rgba(0,0,0,0.5);">
                    <i class="fas fa-image" style="color:#34d399;"></i>
                    ${escapeHtml(filename)}
                </span>
                <div style="display:flex;gap:8px;">
                    <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                            style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;backdrop-filter:blur(10px);">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="this.closest('.file-viewer-overlay').remove()" 
                            style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;backdrop-filter:blur(10px);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">
                <img src="${fileUrl}" 
                     alt="${escapeHtml(filename)}" 
                     style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;cursor:zoom-in;"
                     onclick="this.style.transform = this.style.transform === 'scale(1.5)' ? 'scale(1)' : 'scale(1.5)'; this.style.transition = 'transform 0.3s ease';" />
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// ============================================================
// VIDEO VIEWER
// ============================================================

function openVideoViewer(fileUrl, filename) {
    const overlay = createOverlay(filename);
    const content = overlay.querySelector('.viewer-content');
    
    content.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;background:#000;border-radius:12px;overflow:hidden;">
            <div style="padding:12px 20px;background:#2d2d44;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <span style="color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-video" style="color:#f472b6;"></i>
                    ${escapeHtml(filename)}
                </span>
                <div style="display:flex;gap:8px;">
                    <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                            style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="this.closest('.file-viewer-overlay').remove()" 
                            style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <video controls autoplay style="flex:1;width:100%;max-height:calc(100vh - 120px);background:#000;">
                <source src="${fileUrl}" />
                Tu navegador no soporta este formato de video.
            </video>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// ============================================================
// AUDIO VIEWER
// ============================================================

function openAudioViewer(fileUrl, filename) {
    const overlay = createOverlay(filename);
    const content = overlay.querySelector('.viewer-content');
    
    content.innerHTML = `
        <div style="width:100%;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#2d2d44);border-radius:12px;padding:40px;">
            <div style="font-size:64px;color:#60a5fa;margin-bottom:20px;">
                <i class="fas fa-music"></i>
            </div>
            <span style="color:#fff;font-size:18px;font-weight:500;margin-bottom:8px;">${escapeHtml(filename)}</span>
            <span style="color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:30px;">Audio</span>
            <audio controls autoplay style="width:100%;max-width:400px;">
                <source src="${fileUrl}" />
                Tu navegador no soporta este formato de audio.
            </audio>
            <div style="margin-top:20px;display:flex;gap:8px;">
                <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                        style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">
                    <i class="fas fa-download"></i> Descargar
                </button>
                <button onclick="this.closest('.file-viewer-overlay').remove()" 
                        style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">
                    <i class="fas fa-times"></i> Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// ============================================================
// TEXT VIEWER
// ============================================================

async function openTextViewer(fileUrl, filename) {
    const overlay = createOverlay(filename);
    const content = overlay.querySelector('.viewer-content');
    
    try {
        const response = await fetch(fileUrl);
        const text = await response.text();
        
        content.innerHTML = `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;background:#1a1a2e;border-radius:12px;overflow:hidden;">
                <div style="padding:12px 20px;background:#2d2d44;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <span style="color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-file-alt" style="color:#fbbf24;"></i>
                        ${escapeHtml(filename)}
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                                style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                            <i class="fas fa-download"></i>
                        </button>
                        <button onclick="this.closest('.file-viewer-overlay').remove()" 
                                style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <pre style="flex:1;padding:20px;margin:0;color:rgba(255,255,255,0.8);font-size:14px;font-family:monospace;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#1a1a2e;">${escapeHtml(text)}</pre>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:#fff;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#ff6b6b;margin-bottom:16px;"></i>
                <p>No se pudo cargar el contenido del archivo</p>
                <button onclick="window.downloadFile('${fileUrl}', '${escapeHtml(filename)}')" 
                        style="margin-top:16px;background:#c084fc;border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;">
                    <i class="fas fa-download"></i> Descargar
                </button>
            </div>
        `;
    }
    
    document.body.appendChild(overlay);
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadFile(fileUrl, filename) {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = filename || 'archivo';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥 Descargando...');
}

function createOverlay(title) {
    // Remover overlay existente
    const existing = document.querySelector('.file-viewer-overlay');
    if (existing) existing.remove();
    
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'file-viewer-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fileViewerFadeIn 0.3s ease;
    `;
    
    // Crear contenido
    const content = document.createElement('div');
    content.className = 'viewer-content';
    content.style.cssText = `
        width: 100%;
        max-width: 1200px;
        height: 90vh;
        max-height: 90vh;
        position: relative;
    `;
    
    overlay.appendChild(content);
    
    // Cerrar al hacer clic fuera
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
    
    // Cerrar con Escape
    const closeHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', closeHandler);
        }
    };
    document.addEventListener('keydown', closeHandler);
    
    // Agregar estilos de animación si no existen
    if (!document.getElementById('file-viewer-styles')) {
        const style = document.createElement('style');
        style.id = 'file-viewer-styles';
        style.textContent = `
            @keyframes fileViewerFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .file-viewer-overlay {
                animation: fileViewerFadeIn 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }
    
    return overlay;
}

// ============================================================
// EXPORTAR FUNCIONES GLOBALES PARA USO EN ONCLICK
// ============================================================

window.openFileViewer = openFileViewer;
window.downloadFile = downloadFile;

// ============================================================
// EXPORTACIONES
// ============================================================

export {
    openFileViewer,
    openPDFViewer,
    openImageViewer,
    openVideoViewer,
    openAudioViewer,
    openTextViewer,
    downloadFile,
    detectMimeType
};