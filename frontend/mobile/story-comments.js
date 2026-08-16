// ============================================================
// story-comments.js - Sistema de comentarios para historias
// 🔥 VERSIÓN REFACTORIZADA CON ACTUALIZACIÓN PARCIAL DEL DOM
// 🔥 NUEVO: Modal de vista previa para archivos (PDF, imágenes, etc.)
// 🔥 CORREGIDO: Apertura de PDFs y documentos con URL completa
// 🔥 NUEVO: Caché unificado para persistencia entre sesiones
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

// 🔥 IMPORTAR CACHÉ UNIFICADO
import { getCache } from './services/cache.service.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO DE COMENTARIOS - PERSISTE ENTRE APERTURAS
// ============================================================

let commentsCache = new Map();
let commentLikes = new Map();
let repliesVisibility = new Map();

// 🔥 INSTANCIA DEL CACHÉ UNIFICADO
const unifiedCache = getCache();

// ============================================================
// 🔥 FUNCIONES AUXILIARES PARA ARCHIVOS
// ============================================================

function getFileIcon(mimetype) {
    if (!mimetype) return '<i class="fas fa-file"></i>';
    if (mimetype.startsWith('image/')) return '<i class="fas fa-image" style="color:#34d399;"></i>';
    if (mimetype.startsWith('video/')) return '<i class="fas fa-video" style="color:#f472b6;"></i>';
    if (mimetype.startsWith('audio/')) return '<i class="fas fa-music" style="color:#60a5fa;"></i>';
    if (mimetype === 'application/pdf') return '<i class="fas fa-file-pdf" style="color:#ff6b6b;"></i>';
    if (mimetype.includes('word')) return '<i class="fas fa-file-word" style="color:#60a5fa;"></i>';
    if (mimetype === 'text/plain') return '<i class="fas fa-file-alt" style="color:#fbbf24;"></i>';
    return '<i class="fas fa-file"></i>';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 🔥 Determina si un archivo es un documento (PDF, Word, etc.)
 */
function isDocumentFile(mimetype) {
    if (!mimetype) return false;
    const docTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/rtf',
        'application/vnd.oasis.opendocument.text'
    ];
    return docTypes.includes(mimetype);
}

/**
 * 🔥 Determina si un archivo es una imagen
 */
function isImageFile(mimetype) {
    if (!mimetype) return false;
    return mimetype.startsWith('image/');
}

/**
 * 🔥 Determina si un archivo es un video
 */
function isVideoFile(mimetype) {
    if (!mimetype) return false;
    return mimetype.startsWith('video/');
}

/**
 * 🔥 Determina si un archivo es audio
 */
function isAudioFile(mimetype) {
    if (!mimetype) return false;
    return mimetype.startsWith('audio/');
}

// ============================================================
// 🔥 MODAL DE VISTA PREVIA PARA ARCHIVOS (VERSIÓN MEJORADA)
// ============================================================

/**
 * Abre un modal de vista previa para archivos
 * Soporta: PDF, imágenes, videos, documentos
 * 🔥 CORREGIDO: Usa URL completa para archivos
 */
function openFilePreview(fileUrl, filename = 'Archivo', mimetype = null) {
    // Verificar si ya existe un modal abierto
    const existingModal = document.getElementById('filePreviewModal');
    if (existingModal) {
        existingModal.remove();
    }

    const isImage = isImageFile(mimetype);
    const isPdf = mimetype === 'application/pdf';
    const isVideo = isVideoFile(mimetype);
    const isAudio = isAudioFile(mimetype);
    const isDoc = isDocumentFile(mimetype);

    // 🔥 CONSTRUIR URL COMPLETA SI ES RELATIVA
    let fullUrl = fileUrl;
    if (fileUrl.startsWith('/')) {
        fullUrl = window.location.origin + fileUrl;
    }

    // Crear el overlay del modal
    const overlay = document.createElement('div');
    overlay.id = 'filePreviewModal';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.92);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
        padding: 20px;
    `;

    // Contenido del modal
    let contentHtml = '';

    if (isImage) {
        // Vista previa de imagen
        contentHtml = `
            <div style="position:relative;max-width:95%;max-height:95%;">
                <img src="${fullUrl}" alt="${escapeHtml(filename)}" 
                     style="max-width:100%;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);" />
                <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:20px;color:#fff;font-size:12px;backdrop-filter:blur(10px);">
                    <i class="fas fa-image"></i> ${escapeHtml(filename)}
                </div>
            </div>
        `;
    } else if (isPdf) {
        // 🔥 PDF - Usar embed con opción de abrir en nueva ventana
        contentHtml = `
            <div style="position:relative;width:95%;height:90vh;max-width:1200px;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.6);border-radius:8px 8px 0 0;backdrop-filter:blur(10px);flex-shrink:0;">
                    <span style="color:rgba(255,255,255,0.8);font-size:13px;">
                        <i class="fas fa-file-pdf" style="color:#ff6b6b;"></i> ${escapeHtml(filename)}
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button onclick="window.open('${fullUrl}', '_blank')" 
                                style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;"
                                onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                                onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                            <i class="fas fa-external-link-alt"></i> Nueva pestaña
                        </button>
                        <a href="${fullUrl}" download 
                           style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;text-decoration:none;transition:all 0.2s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                            <i class="fas fa-download"></i> Descargar
                        </a>
                    </div>
                </div>
                <div style="flex:1;background:#fff;border-radius:0 0 8px 8px;overflow:hidden;position:relative;min-height:400px;">
                    <object data="${fullUrl}#toolbar=1&navpanes=1&scrollbar=1" 
                            type="application/pdf"
                            style="width:100%;height:100%;border:none;min-height:500px;">
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                            <i class="fas fa-file-pdf" style="font-size:48px;color:#ff6b6b;margin-bottom:16px;"></i>
                            <p style="color:#333;font-size:14px;">No se pudo cargar la vista previa del PDF</p>
                            <a href="${fullUrl}" target="_blank" 
                               style="margin-top:12px;background:#ff6b6b;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;">
                                <i class="fas fa-external-link-alt"></i> Abrir PDF
                            </a>
                        </div>
                    </object>
                    <div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.6);color:rgba(255,255,255,0.4);padding:4px 10px;border-radius:12px;font-size:10px;backdrop-filter:blur(5px);">
                        <i class="fas fa-info-circle"></i> PDF
                    </div>
                </div>
            </div>
        `;
    } else if (isVideo) {
        // Vista previa de video
        contentHtml = `
            <div style="position:relative;max-width:95%;max-height:95%;">
                <video controls autoplay style="max-width:100%;max-height:90vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                    <source src="${fullUrl}" type="${mimetype || 'video/mp4'}">
                    Tu navegador no soporta reproducción de video.
                </video>
                <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:20px;color:#fff;font-size:12px;backdrop-filter:blur(10px);">
                    <i class="fas fa-video"></i> ${escapeHtml(filename)}
                </div>
            </div>
        `;
    } else if (isAudio) {
        // Vista previa de audio
        contentHtml = `
            <div style="position:relative;max-width:500px;width:90%;padding:40px;background:rgba(255,255,255,0.05);border-radius:16px;text-align:center;">
                <div style="font-size:64px;color:#c084fc;margin-bottom:20px;">
                    <i class="fas fa-music"></i>
                </div>
                <div style="color:#fff;font-size:18px;margin-bottom:10px;">${escapeHtml(filename)}</div>
                <audio controls autoplay style="width:100%;margin-top:16px;">
                    <source src="${fullUrl}" type="${mimetype || 'audio/mpeg'}">
                    Tu navegador no soporta reproducción de audio.
                </audio>
                <div style="margin-top:12px;color:rgba(255,255,255,0.3);font-size:12px;">
                    <i class="fas fa-headphones"></i> Audio
                </div>
            </div>
        `;
    } else if (isDoc) {
        // Documentos - mostrar con embed + opción de descarga
        contentHtml = `
            <div style="position:relative;width:95%;height:90vh;max-width:1200px;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.6);border-radius:8px 8px 0 0;backdrop-filter:blur(10px);flex-shrink:0;">
                    <span style="color:rgba(255,255,255,0.8);font-size:13px;">
                        <i class="fas fa-file-alt" style="color:#60a5fa;"></i> ${escapeHtml(filename)}
                    </span>
                    <div style="display:flex;gap:8px;">
                        <button onclick="window.open('${fullUrl}', '_blank')" 
                                style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;"
                                onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                                onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                            <i class="fas fa-external-link-alt"></i> Nueva pestaña
                        </button>
                        <a href="${fullUrl}" download 
                           style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;text-decoration:none;transition:all 0.2s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                            <i class="fas fa-download"></i> Descargar
                        </a>
                    </div>
                </div>
                <div style="flex:1;background:#fff;border-radius:0 0 8px 8px;overflow:hidden;position:relative;min-height:400px;">
                    <object data="${fullUrl}" 
                            style="width:100%;height:100%;border:none;min-height:500px;">
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                            <i class="fas fa-file-alt" style="font-size:48px;color:#60a5fa;margin-bottom:16px;"></i>
                            <p style="color:#333;font-size:14px;">No se pudo cargar la vista previa del documento</p>
                            <a href="${fullUrl}" target="_blank" 
                               style="margin-top:12px;background:#60a5fa;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;">
                                <i class="fas fa-external-link-alt"></i> Abrir documento
                            </a>
                        </div>
                    </object>
                    <div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.6);color:rgba(255,255,255,0.4);padding:4px 10px;border-radius:12px;font-size:10px;backdrop-filter:blur(5px);">
                        <i class="fas fa-info-circle"></i> Documento
                    </div>
                </div>
            </div>
        `;
    } else {
        // Fallback: mostrar información del archivo y botón de descarga
        contentHtml = `
            <div style="position:relative;max-width:400px;width:90%;padding:40px;background:rgba(255,255,255,0.05);border-radius:16px;text-align:center;">
                <div style="font-size:64px;color:#c084fc;margin-bottom:20px;">
                    <i class="fas fa-file"></i>
                </div>
                <div style="color:#fff;font-size:18px;margin-bottom:8px;">${escapeHtml(filename)}</div>
                <div style="color:rgba(255,255,255,0.3);font-size:12px;margin-bottom:20px;">
                    Tipo: ${mimetype || 'Desconocido'}
                </div>
                <a href="${fullUrl}" download 
                   style="display:inline-block;background:rgba(192,132,252,0.2);color:#c084fc;padding:10px 24px;border-radius:8px;text-decoration:none;border:1px solid rgba(192,132,252,0.3);">
                    <i class="fas fa-download"></i> Descargar archivo
                </a>
                <button onclick="window.open('${fullUrl}', '_blank')" 
                        style="display:inline-block;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);padding:10px 24px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;margin-left:8px;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                        onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    <i class="fas fa-external-link-alt"></i> Abrir
                </button>
            </div>
        `;
    }

    // Botón de cerrar
    const closeBtn = `
        <button onclick="window.closeFilePreview()" style="
            position:fixed;
            top:20px;
            right:20px;
            background:rgba(255,255,255,0.1);
            border:none;
            color:#fff;
            font-size:28px;
            cursor:pointer;
            width:50px;
            height:50px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            backdrop-filter:blur(10px);
            transition:all 0.2s;
            z-index:100001;
            border:1px solid rgba(255,255,255,0.1);
        " onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
         onmouseout="this.style.background='rgba(255,255,255,0.1)'">
            <i class="fas fa-times"></i>
        </button>
    `;

    overlay.innerHTML = contentHtml + closeBtn;
    document.body.appendChild(overlay);

    // Cerrar al hacer clic en el fondo
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            window.closeFilePreview();
        }
    });

    // Cerrar con Escape
    document.addEventListener('keydown', window._handleFilePreviewKeydown);

    // Agregar estilos si no existen
    if (!document.getElementById('file-preview-styles')) {
        const style = document.createElement('style');
        style.id = 'file-preview-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #filePreviewModal {
                animation: fadeIn 0.25s ease;
            }
            #filePreviewModal object,
            #filePreviewModal iframe {
                animation: slideUp 0.3s ease;
            }
            #filePreviewModal img,
            #filePreviewModal video {
                animation: slideUp 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * 🔥 Cierra el modal de vista previa de archivos
 */
function closeFilePreview() {
    const modal = document.getElementById('filePreviewModal');
    if (modal) {
        modal.remove();
        document.removeEventListener('keydown', window._handleFilePreviewKeydown);
    }
}

/**
 * 🔥 Maneja el evento keydown para el modal de archivos
 */
function handleFilePreviewKeydown(e) {
    if (e.key === 'Escape') {
        closeFilePreview();
    }
}

// Exponer funciones globalmente
window.openFilePreview = openFilePreview;
window.closeFilePreview = closeFilePreview;
window._handleFilePreviewKeydown = handleFilePreviewKeydown;

// ============================================================
// FUNCIÓN PARA RENDERIZAR ARCHIVO EN COMENTARIO (MODIFICADA)
// ============================================================

function renderCommentFile(comment) {
    if (!comment.hasFile || !comment.fileUrl) return '';
    
    const icon = getFileIcon(comment.mimetype);
    const size = comment.fileSizeFormatted || formatFileSize(comment.fileSize || 0);
    const isImage = isImageFile(comment.mimetype);
    const isPdf = comment.mimetype === 'application/pdf';
    const filename = comment.originalName || comment.filename || 'Archivo';
    const fileUrl = comment.fileUrl;
    
    // 🔥 ESCAPAR URL PARA EVITAR PROBLEMAS CON CARACTERES ESPECIALES
    const escapedUrl = fileUrl.replace(/'/g, "\\'");
    const escapedFilename = escapeHtml(filename);
    
    // Determinar la acción al hacer clic
    let clickAction = `window.openFilePreview('${escapedUrl}', '${escapedFilename}', '${comment.mimetype || ''}')`;
    
    // Si es imagen, también permitir vista previa con clic
    if (isImage) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <img src="${fileUrl}" alt="Adjunto" 
                     style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.05);transition:all 0.2s;"
                     onclick="event.stopPropagation(); ${clickAction}"
                     onmouseover="this.style.borderColor='rgba(192,132,252,0.3)'" 
                     onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'" />
                <div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:4px;">${escapedFilename}</div>
            </div>
        `;
    }
    
    // Para PDF y documentos - mostrar con botón de vista previa
    if (isPdf || isDocumentFile(comment.mimetype)) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;max-width:300px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#ff6b6b;">${icon}</span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:12px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,0.8);">${escapedFilename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <div style="display:flex;gap:4px;">
                        <button onclick="event.stopPropagation(); ${clickAction}" 
                                style="background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.2);border-radius:6px;color:#c084fc;padding:4px 8px;font-size:11px;cursor:pointer;transition:all 0.2s;"
                                onmouseover="this.style.background='rgba(192,132,252,0.25)'" 
                                onmouseout="this.style.background='rgba(192,132,252,0.15)'">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <a href="${fileUrl}" download target="_blank" 
                           style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.05);border-radius:6px;color:rgba(255,255,255,0.4);padding:4px 8px;font-size:11px;cursor:pointer;text-decoration:none;transition:all 0.2s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Para otros archivos (audio, video, etc.)
    return `
        <div class="comment-file" style="margin-top:6px;">
            <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;max-width:280px;transition:all 0.2s;">
                <span class="file-icon" style="font-size:22px;color:#c084fc;">${icon}</span>
                <span class="file-info" style="flex:1;min-width:0;">
                    <span class="file-name" style="font-size:12px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,0.8);">${escapedFilename}</span>
                    <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                </span>
                <button onclick="event.stopPropagation(); ${clickAction}" 
                        style="background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.2);border-radius:6px;color:#c084fc;padding:4px 8px;font-size:11px;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(192,132,252,0.25)'" 
                        onmouseout="this.style.background='rgba(192,132,252,0.15)'">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </div>
        </div>
    `;
}

// ============================================================
// FUNCIÓN PARA BUSCAR COMENTARIO POR ID (RECURSIVA)
// ============================================================

function findCommentById(comments, commentId) {
    if (!comments) return null;
    for (const comment of comments) {
        if (comment.id === commentId) return comment;
        if (comment.replies && comment.replies.length > 0) {
            const found = findCommentById(comment.replies, commentId);
            if (found) return found;
        }
    }
    return null;
}

function countAllReplies(comment) {
    if (!comment) return 0;
    if (!comment.replies || comment.replies.length === 0) return 0;
    let count = comment.replies.length;
    for (const reply of comment.replies) {
        count += countAllReplies(reply);
    }
    return count;
}

function findParentComment(comments, commentId, parent = null) {
    if (!comments) return null;
    for (const comment of comments) {
        if (comment.id === commentId) return parent;
        if (comment.replies && comment.replies.length > 0) {
            const result = findParentComment(comment.replies, commentId, comment);
            if (result !== null) return result;
        }
    }
    return null;
}

function getParentChain(comments, commentId, chain = []) {
    if (!comments) return null;
    for (const comment of comments) {
        if (comment.id === commentId) return chain;
        if (comment.replies && comment.replies.length > 0) {
            const newChain = [...chain, comment.id];
            const result = getParentChain(comment.replies, commentId, newChain);
            if (result) return result;
        }
    }
    return null;
}

// ============================================================
// 🔥 FUNCIONES DE CACHÉ - PERSISTENTES
// ============================================================

function addCommentToCache(storyId, comment) {
    if (!storyId || !comment) return;
    if (!commentsCache.has(storyId)) commentsCache.set(storyId, []);
    const comments = commentsCache.get(storyId);
    const exists = comments.some(c => c.id === comment.id);
    if (exists) return;
    comments.unshift(comment);
    commentsCache.set(storyId, comments);
    if (comment.replies && comment.replies.length > 0) {
        repliesVisibility.set(comment.id, false);
    }
    if (comment.likes) {
        commentLikes.set(comment.id, new Set(comment.likes));
    }
    console.log(`📦 [CACHE] Comentario ${comment.id} agregado al caché de ${storyId}`);
}

function addReplyToCache(storyId, parentCommentId, reply) {
    if (!storyId || !parentCommentId || !reply) return;
    if (!commentsCache.has(storyId)) commentsCache.set(storyId, []);
    const comments = commentsCache.get(storyId);
    const parentComment = findCommentById(comments, parentCommentId);
    if (!parentComment) return;
    if (!parentComment.replies) parentComment.replies = [];
    const exists = parentComment.replies.some(r => r.id === reply.id);
    if (exists) return;
    parentComment.replies.push(reply);
    parentComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    commentsCache.set(storyId, comments);
    if (reply.replies && reply.replies.length > 0) {
        repliesVisibility.set(reply.id, false);
    }
    if (reply.likes) {
        commentLikes.set(reply.id, new Set(reply.likes));
    }
    repliesVisibility.set(parentCommentId, true);
    console.log(`📦 [CACHE] Respuesta ${reply.id} agregada al caché de ${storyId}`);
}

function updateCommentLikes(storyId, commentId, liked) {
    if (!storyId || !commentId) return;
    if (!commentsCache.has(storyId)) return;
    const comments = commentsCache.get(storyId);
    const comment = findCommentById(comments, commentId);
    if (!comment) return;
    const currentUser = getCurrentUser();
    const userId = currentUser?.id;
    if (!comment.likes) comment.likes = [];
    if (liked) {
        if (!comment.likes.includes(userId)) comment.likes.push(userId);
    } else {
        comment.likes = comment.likes.filter(id => id !== userId);
    }
    if (commentLikes.has(commentId)) {
        const likesSet = commentLikes.get(commentId);
        liked ? likesSet.add(userId) : likesSet.delete(userId);
    } else {
        commentLikes.set(commentId, new Set(comment.likes));
    }
    commentsCache.set(storyId, comments);
    console.log(`📦 [CACHE] Like actualizado para ${commentId}: ${liked ? '❤️' : '💔'}`);
}

// ============================================================
// 🔥 SUBIR ARCHIVO PARA COMENTARIO
// ============================================================

async function uploadCommentFile(storyId, file) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para subir archivos', true);
        return null;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/upload-comment-file`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Archivo subido correctamente');
            return data;
        } else {
            showToast(data.error || 'Error al subir archivo', true);
            return null;
        }
    } catch (error) {
        console.error('Error subiendo archivo:', error);
        showToast('Error al subir archivo', true);
        return null;
    }
}

// ============================================================
// CARGAR COMENTARIOS - CON CACHÉ UNIFICADO
// ============================================================

async function loadComments(storyId, forceReload = false) {
    if (!storyId) return [];
    const token = getToken();
    if (!token) return [];
    
    // 🔥 VERIFICAR CACHÉ UNIFICADO PRIMERO
    if (!forceReload) {
        const cachedData = unifiedCache.getComments(storyId);
        if (cachedData && cachedData.comments) {
            // Guardar en caché en memoria para acceso rápido
            commentsCache.set(storyId, cachedData.comments);
            console.log(`📦 [CACHE UNIFICADO] Comentarios de ${storyId} cargados (${cachedData.comments.length} comentarios)`);
            return cachedData.comments;
        }
    }
    
    // 🔥 CACHÉ EN MEMORIA (legacy)
    if (!forceReload && commentsCache.has(storyId)) {
        const cached = commentsCache.get(storyId);
        console.log(`📦 [CACHE MEMORIA] Comentarios de ${storyId} cargados (${cached.length} comentarios)`);
        return cached;
    }
    
    if (forceReload) {
        commentsCache.delete(storyId);
        unifiedCache.invalidateComments(storyId);
        console.log(`🔄 [CACHE] Forzando recarga de comentarios para ${storyId}`);
    }
    
    try {
        console.log(`📡 [API] Cargando comentarios desde servidor para ${storyId}`);
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error loading comments');
        const comments = await res.json();
        comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const sortReplies = (items) => {
            if (!items) return;
            items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            items.forEach(item => {
                if (item.replies && item.replies.length > 0) sortReplies(item.replies);
            });
        };
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) sortReplies(comment.replies);
        });
        
        // 🔥 GUARDAR EN CACHÉ UNIFICADO
        const storyTimestamp = Date.now();
        unifiedCache.setComments(storyId, comments, storyTimestamp);
        
        commentsCache.set(storyId, comments);
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(comment.id, false);
            }
        });
        comments.forEach(comment => {
            if (comment.likes) commentLikes.set(comment.id, new Set(comment.likes));
            if (comment.replies) {
                comment.replies.forEach(reply => {
                    if (reply.likes) commentLikes.set(reply.id, new Set(reply.likes));
                    if (reply.replies && reply.replies.length > 0) {
                        repliesVisibility.set(reply.id, false);
                    }
                });
            }
        });
        console.log(`📦 [CACHE] ${comments.length} comentarios guardados en caché para ${storyId}`);
        return comments;
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

// ============================================================
// AGREGAR COMENTARIO - ACTUALIZA CACHÉ UNIFICADO
// ============================================================

async function addComment(storyId, content, parentCommentId = null, fileData = null) {
    if (!storyId) return null;
    if ((!content || content.trim().length === 0) && !fileData) {
        showToast('Escribe un comentario o adjunta un archivo', true);
        return null;
    }
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para comentar', true);
        return null;
    }
    if (content && content.length > 500) {
        showToast('Máximo 500 caracteres', true);
        return null;
    }
    try {
        let url = `${API_URL}/api/stories/${storyId}/comments`;
        let body = {
            content: content?.trim() || '',
            fileUrl: fileData?.fileUrl || null,
            filename: fileData?.filename || null,
            originalName: fileData?.originalName || null,
            fileSize: fileData?.size || null,
            mimetype: fileData?.mimetype || null
        };
        if (parentCommentId) {
            url = `${API_URL}/api/stories/${storyId}/comments/${parentCommentId}/replies`;
            body = { content: content.trim() };
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Error al comentar');
        const newComment = await res.json();
        
        // 🔥 ACTUALIZAR CACHÉ EN MEMORIA
        if (parentCommentId) {
            addReplyToCache(storyId, parentCommentId, newComment);
        } else {
            addCommentToCache(storyId, newComment);
        }
        
        // 🔥 ACTUALIZAR CACHÉ UNIFICADO
        const existingCache = unifiedCache.getComments(storyId);
        if (existingCache && existingCache.comments) {
            const updatedComments = [newComment, ...existingCache.comments];
            unifiedCache.setComments(storyId, updatedComments, Date.now());
        }
        
        const socket = window.socket;
        if (socket) {
            socket.emit('new_comment', {
                storyId: storyId,
                comment: newComment,
                parentCommentId: parentCommentId
            });
        }
        showToast(fileData ? '📎 Comentario con archivo adjunto' : '💬 Comentario agregado');
        return newComment;
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Error al comentar', true);
        return null;
    }
}

// ============================================================
// ELIMINAR COMENTARIO - ACTUALIZA CACHÉ UNIFICADO
// ============================================================

async function deleteComment(storyId, commentId, parentCommentId = null) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para eliminar', true);
        return false;
    }
    try {
        let url;
        if (parentCommentId) {
            url = `${API_URL}/api/stories/${storyId}/comments/${parentCommentId}/replies/${commentId}`;
        } else {
            url = `${API_URL}/api/stories/${storyId}/comments/${commentId}`;
        }
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al eliminar');
        
        // 🔥 ACTUALIZAR CACHÉ EN MEMORIA
        if (commentsCache.has(storyId)) {
            const comments = commentsCache.get(storyId);
            if (parentCommentId) {
                const parentComment = findCommentById(comments, parentCommentId);
                if (parentComment && parentComment.replies) {
                    parentComment.replies = parentComment.replies.filter(r => r.id !== commentId);
                }
            } else {
                const filtered = comments.filter(c => c.id !== commentId);
                commentsCache.set(storyId, filtered);
            }
        }
        
        // 🔥 ACTUALIZAR CACHÉ UNIFICADO
        const existingCache = unifiedCache.getComments(storyId);
        if (existingCache && existingCache.comments) {
            const updatedComments = existingCache.comments.filter(c => c.id !== commentId);
            if (parentCommentId) {
                const parentComment = findCommentById(updatedComments, parentCommentId);
                if (parentComment && parentComment.replies) {
                    parentComment.replies = parentComment.replies.filter(r => r.id !== commentId);
                }
            }
            unifiedCache.setComments(storyId, updatedComments, Date.now());
        }
        
        console.log(`📦 [CACHE] Comentario ${commentId} eliminado del caché de ${storyId}`);
        showToast('🗑️ Eliminado');
        return true;
    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Error al eliminar', true);
        return false;
    }
}

// ============================================================
// DAR LIKE A COMENTARIO - ACTUALIZA CACHÉ UNIFICADO
// ============================================================

async function likeComment(storyId, commentId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return false;
    }
    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) throw new Error('Error al dar like');
        const data = await res.json();
        
        // 🔥 ACTUALIZAR CACHÉ
        updateCommentLikes(storyId, commentId, data.liked);
        
        return data.liked;
    } catch (error) {
        console.error('Error liking comment:', error);
        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// 🔥 FUNCIONES DE ACTUALIZACIÓN PARCIAL DEL DOM
// ============================================================

function createCommentHTML(comment, storyId, currentUserId, storyOwnerId, isReply = false, isExpanded = true) {
    const isOwn = comment.userId === currentUserId;
    const isStoryOwner = storyOwnerId === currentUserId;
    const canDelete = isOwn || isStoryOwner;
    
    const cachedLikes = commentLikes.get(comment.id);
    const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (comment.likes?.includes(currentUserId) || false);
    const likesCount = cachedLikes ? cachedLikes.size : (comment.likes?.length || 0);
    
    const fileHtml = renderCommentFile(comment);
    
    if (isReply) {
        return `
            <div class="comment-item reply-item" data-reply-id="${comment.id}">
                <img class="avatar" src="${comment.avatar || getAvatar(comment.fullName)}" 
                     alt="${comment.fullName}" 
                     style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
                     onclick="window.goToProfileUser('${comment.userId}')" />
                <div class="comment-body" style="flex:1;min-width:0;">
                    <div class="comment-user" onclick="window.goToProfileUser('${comment.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                        <span style="font-weight:600;color:#fff;">${escapeHtml(comment.fullName)}</span>
                        <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(comment.username)}</span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(comment.createdAt)}</span>
                        ${isOwn ? '<span style="font-size:9px;color:rgba(52,211,153,0.5);margin-left:4px;">Tuyo</span>' : ''}
                        ${!isOwn && isStoryOwner ? '<span style="font-size:9px;color:rgba(192,132,252,0.5);margin-left:4px;">Tu historia</span>' : ''}
                        ${comment.hasFile ? '<span style="font-size:9px;color:rgba(34,197,94,0.5);margin-left:4px;">📎</span>' : ''}
                    </div>
                    ${comment.content ? `<div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(comment.content)}</div>` : ''}
                    ${fileHtml}
                    <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                data-comment-id="${comment.id}"
                                onclick="window.handleCommentLike('${storyId}', '${comment.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                            <i class="fas fa-heart" style="font-size:10px;color:${isLiked ? '#ff6b6b' : 'inherit'};"></i> <span>${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${comment.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${canDelete ? `
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${comment.id}')"
                                    style="background:transparent;border:none;color:rgba(255,107,107,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                                <i class="fas fa-trash" style="font-size:9px;"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;margin-top:6px;">
                        <input type="text" class="reply-input" id="replyInput-${comment.id}" 
                               placeholder="Escribe una respuesta..." maxlength="500"
                               style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:6px 12px;font-size:13px;color:#fff;outline:none;" />
                        <button class="reply-send-btn" onclick="window.handleReplySubmit('${storyId}', '${comment.id}')"
                                style="background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.2);border-radius:12px;color:#c084fc;padding:6px 14px;font-size:12px;cursor:pointer;transition:all 0.2s;">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    const hasReplies = comment.replies && comment.replies.length > 0;
    const totalReplyCount = countAllReplies(comment);
    const isExpandedState = repliesVisibility.get(comment.id) || false;
    
    let repliesHtml = '';
    if (hasReplies && isExpandedState) {
        repliesHtml = renderFlatReplies(comment.replies, storyId, currentUserId, comment.id, commentsCache.get(storyId) || [], null, true, storyOwnerId);
    }
    
    return `
        <div class="comment-item" data-comment-id="${comment.id}">
            <img class="avatar" src="${comment.avatar || getAvatar(comment.fullName)}" 
                 alt="${comment.fullName}" 
                 onclick="window.goToProfileUser('${comment.userId}')" />
            <div class="comment-body">
                <div class="comment-user" onclick="window.goToProfileUser('${comment.userId}')">
                    ${escapeHtml(comment.fullName)}
                    <span class="handle">@${escapeHtml(comment.username)}</span>
                    <span class="time">${formatDate(comment.createdAt)}</span>
                    ${isOwn ? '<span class="badge-owner" style="font-size:9px;color:rgba(52,211,153,0.6);margin-left:6px;">Tuyo</span>' : ''}
                    ${!isOwn && isStoryOwner ? '<span class="badge-owner" style="font-size:9px;color:rgba(192,132,252,0.6);margin-left:6px;">Tu historia</span>' : ''}
                    ${comment.hasFile ? '<span class="badge-file" style="font-size:9px;color:rgba(34,197,94,0.5);margin-left:6px;">📎</span>' : ''}
                </div>
                ${comment.content ? `<div class="comment-text" style="font-size:16px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(comment.content)}</div>` : ''}
                ${fileHtml}
                <div class="comment-meta">
                    <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                            data-comment-id="${comment.id}"
                            onclick="window.handleCommentLike('${storyId}', '${comment.id}')">
                        <i class="fas fa-heart"></i> <span>${formatNumber(likesCount)}</span>
                    </button>
                    <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${comment.id}')">
                        <i class="fas fa-reply"></i> Responder
                    </button>
                    ${canDelete ? `
                        <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${comment.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;margin-top:8px;">
                    <input type="text" class="reply-input" id="replyInput-${comment.id}" 
                           placeholder="Escribe una respuesta..." maxlength="500" />
                    <button class="reply-send-btn" onclick="window.handleReplySubmit('${storyId}', '${comment.id}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
                ${repliesHtml}
                ${hasReplies ? `
                    <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
                        <i class="fas fa-chevron-${isExpandedState ? 'up' : 'down'}"></i> 
                        ${isExpandedState ? `Ocultar ${totalReplyCount} respuestas` : `Ver ${totalReplyCount} respuestas`}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function addCommentToUI(storyId, newComment) {
    const container = document.getElementById('commentsList');
    if (!container) {
        console.warn('⚠️ [addCommentToUI] Contenedor commentsList no encontrado');
        return;
    }

    const currentUser = getCurrentUser();
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;
    
    const commentHTML = createCommentHTML(newComment, storyId, currentUser?.id, storyOwnerId);
    
    const noComments = container.querySelector('.no-comments');
    if (noComments) {
        container.innerHTML = commentHTML;
    } else {
        container.insertAdjacentHTML('afterbegin', commentHTML);
    }
    
    updateCommentCounters(storyId, 1);
    
    console.log(`✅ [addCommentToUI] Comentario ${newComment.id} agregado al UI`);
}

function addReplyToUI(storyId, parentCommentId, newReply) {
    const container = document.getElementById('commentsList');
    if (!container) {
        console.warn('⚠️ [addReplyToUI] Contenedor commentsList no encontrado');
        return;
    }

    const parentCommentElement = container.querySelector(`.comment-item[data-comment-id="${parentCommentId}"]`);
    if (!parentCommentElement) {
        console.warn(`⚠️ [addReplyToUI] Comentario padre ${parentCommentId} no encontrado en el DOM`);
        return;
    }

    const currentUser = getCurrentUser();
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;

    const replyHTML = createCommentHTML(newReply, storyId, currentUser?.id, storyOwnerId, true);

    let repliesContainer = parentCommentElement.querySelector('.replies');
    const showRepliesBtn = parentCommentElement.querySelector('.show-replies-btn');

    if (!repliesContainer) {
        repliesContainer = document.createElement('div');
        repliesContainer.className = 'replies';
        repliesContainer.style.cssText = 'margin-left:40px;margin-top:8px;display:flex;flex-direction:column;gap:8px;border-left:2px solid rgba(192,132,252,0.08);padding-left:12px;';
        
        const replyInputContainer = parentCommentElement.querySelector('.reply-input-container');
        if (replyInputContainer) {
            replyInputContainer.parentNode.insertBefore(repliesContainer, replyInputContainer.nextSibling);
        } else {
            const commentBody = parentCommentElement.querySelector('.comment-body');
            if (commentBody) {
                commentBody.appendChild(repliesContainer);
            }
        }
        
        repliesContainer.style.display = 'flex';
    } else {
        repliesContainer.style.display = 'flex';
    }

    repliesContainer.insertAdjacentHTML('beforeend', replyHTML);

    const replyCount = repliesContainer.querySelectorAll('.comment-item').length;
    if (showRepliesBtn) {
        showRepliesBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver ${replyCount} respuestas`;
        showRepliesBtn.style.display = 'block';
        repliesVisibility.set(parentCommentId, true);
    }

    updateCommentCounters(storyId, 1);
    
    console.log(`✅ [addReplyToUI] Respuesta ${newReply.id} agregada al comentario ${parentCommentId}`);
}

function updateCommentLikeUI(commentId, liked, likesCount) {
    const commentElement = document.querySelector(
        `.comment-item[data-comment-id="${commentId}"], .comment-item[data-reply-id="${commentId}"]`
    );
    if (!commentElement) {
        console.warn(`⚠️ [updateCommentLikeUI] Comentario ${commentId} no encontrado en el DOM`);
        return;
    }

    const likeBtn = commentElement.querySelector('.btn-like-comment');
    if (!likeBtn) {
        console.warn(`⚠️ [updateCommentLikeUI] Botón de like no encontrado para ${commentId}`);
        return;
    }

    if (liked) {
        likeBtn.classList.add('liked');
    } else {
        likeBtn.classList.remove('liked');
    }

    const likesSpan = likeBtn.querySelector('span');
    if (likesSpan) {
        likesSpan.textContent = formatNumber(likesCount || 0);
    }

    const heartIcon = likeBtn.querySelector('i');
    if (heartIcon) {
        heartIcon.style.color = liked ? '#ff6b6b' : 'inherit';
    }
    
    console.log(`✅ [updateCommentLikeUI] Like actualizado para ${commentId}: ${liked ? '❤️' : '💔'} (${likesCount})`);
}

function removeCommentFromUI(commentId, parentCommentId = null) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    if (parentCommentId) {
        const parentElement = container.querySelector(`.comment-item[data-comment-id="${parentCommentId}"]`);
        if (parentElement) {
            const repliesContainer = parentElement.querySelector('.replies');
            if (repliesContainer) {
                const replyElement = repliesContainer.querySelector(`.comment-item[data-reply-id="${commentId}"]`);
                if (replyElement) {
                    replyElement.remove();
                    
                    const remainingReplies = repliesContainer.querySelectorAll('.comment-item').length;
                    const showRepliesBtn = parentElement.querySelector('.show-replies-btn');
                    if (showRepliesBtn) {
                        if (remainingReplies === 0) {
                            showRepliesBtn.style.display = 'none';
                            repliesContainer.style.display = 'none';
                        } else {
                            showRepliesBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver ${remainingReplies} respuestas`;
                        }
                    }
                    updateCommentCounters(null, -1);
                    console.log(`✅ [removeCommentFromUI] Respuesta ${commentId} eliminada del UI`);
                    return;
                }
            }
        }
    } else {
        const commentElement = container.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
        if (commentElement) {
            commentElement.remove();
            updateCommentCounters(null, -1);
            console.log(`✅ [removeCommentFromUI] Comentario ${commentId} eliminado del UI`);
            return;
        }
    }
    
    console.warn(`⚠️ [removeCommentFromUI] No se encontró el elemento ${commentId}, recargando...`);
    const storyId = container.dataset.storyId || window._currentStoryId;
    if (storyId) {
        updateCommentsUI(storyId);
    }
}

function updateCommentCounters(storyId, delta = 0) {
    const commentsEl = document.getElementById('modalComments');
    const commentsCountEl = document.getElementById('commentsCount');
    
    if (commentsEl) {
        const current = parseInt(commentsEl.textContent.replace(/[^0-9]/g, '')) || 0;
        const newCount = Math.max(0, current + delta);
        commentsEl.textContent = formatNumber(newCount);
    }
    
    if (commentsCountEl) {
        const current = parseInt(commentsCountEl.textContent.replace(/[^0-9]/g, '')) || 0;
        const newCount = Math.max(0, current + delta);
        commentsCountEl.textContent = formatNumber(newCount);
    }
}

// ============================================================
// RENDER COMPLETO
// ============================================================

function renderComments(comments, storyId, currentUserId, container, highlightCommentId = null) {
    if (!container) {
        console.warn('⚠️ [renderComments] Contenedor no encontrado');
        return;
    }
    
    if (!comments || comments.length === 0) {
        container.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-comment-slash"></i>
                <span>No hay comentarios aún</span>
            </div>
        `;
        return;
    }
    
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;
    let html = '';
    
    comments.forEach(comment => {
        html += createCommentHTML(comment, storyId, currentUserId, storyOwnerId);
    });
    
    container.innerHTML = html;
    
    console.log(`📋 [renderComments] ${comments.length} comentarios renderizados para ${storyId}`);
}

function updateCommentsUI(storyId) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    const currentUser = getCurrentUser();
    const comments = commentsCache.get(storyId) || [];
    const currentStoryId = container.dataset.storyId || window._currentStoryId || storyId;
    renderComments(comments, currentStoryId, currentUser?.id, container);
}

function updateCommentsUIWithoutReload(storyId) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    const currentUser = getCurrentUser();
    const comments = commentsCache.get(storyId) || [];
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;
    renderComments(comments, storyId, currentUser?.id, container);
}

// ============================================================
// FUNCIÓN PARA OBTENER CONTEXTO DE RESPUESTA
// ============================================================

function getReplyContext(reply, currentUserId, parentCommentId, allComments) {
    const parentComment = findCommentById(allComments, parentCommentId);
    const parentAuthorName = parentComment?.fullName || parentComment?.username || 'usuario';
    const parentAuthorId = parentComment?.userId || null;
    const replyToName = reply.replyToName || reply.replyToUsername || parentAuthorName;
    const replyToUserId = reply.replyToUserId || parentAuthorId;
    let contextText = '';
    let contextColor = 'rgba(255,255,255,0.25)';
    let isTarget = false;
    if (reply.userId === currentUserId) {
        if (replyToUserId && replyToUserId !== currentUserId) {
            contextText = `Respondiste a @${replyToName}`;
            contextColor = 'rgba(52,211,153,0.6)';
        } else if (replyToUserId && replyToUserId === currentUserId) {
            contextText = `Respondiste a tu comentario`;
            contextColor = 'rgba(52,211,153,0.6)';
        } else {
            contextText = 'Respondiste';
            contextColor = 'rgba(52,211,153,0.6)';
        }
    } else if (replyToUserId && replyToUserId === currentUserId) {
        contextText = 'Te respondió';
        contextColor = 'rgba(192,132,252,0.7)';
        isTarget = true;
    } else if (replyToUserId) {
        contextText = `Respondió a @${replyToName}`;
        contextColor = 'rgba(255,255,255,0.25)';
    } else if (parentAuthorId && parentAuthorId !== currentUserId) {
        contextText = `Respondió a @${parentAuthorName}`;
        contextColor = 'rgba(255,255,255,0.25)';
    } else {
        contextText = 'Respondió';
        contextColor = 'rgba(255,255,255,0.15)';
    }
    return { text: contextText, color: contextColor, isTarget, targetName: replyToName };
}

function flattenReplies(replies, allComments, parentId) {
    if (!replies || replies.length === 0) return [];
    let result = [];
    replies.forEach(reply => {
        result.push({ ...reply, _parentId: parentId });
        if (reply.replies && reply.replies.length > 0) {
            const nested = flattenReplies(reply.replies, allComments, reply.id);
            result = result.concat(nested);
        }
    });
    return result;
}

// ============================================================
// RENDER RESPUESTAS
// ============================================================

function renderFlatReplies(replies, storyId, currentUserId, parentCommentId, allComments, highlightCommentId = null, isExpanded = false, storyOwnerId = null) {
    if (!replies || replies.length === 0) return '';
    const flatReplies = flattenReplies(replies, allComments, parentCommentId);
    if (flatReplies.length === 0) return '';
    if (!isExpanded) return '';
    
    const isStoryOwner = storyOwnerId === currentUserId;
    let html = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;">`;
    
    flatReplies.forEach((reply) => {
        const cachedLikes = commentLikes.get(reply.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (reply.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (reply.likes?.length || 0);
        const isOwn = reply.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const isHighlighted = highlightCommentId && reply.id === highlightCommentId;
        const context = getReplyContext(reply, currentUserId, reply._parentId || parentCommentId, allComments);
        let contextHtml = '';
        if (context.text) {
            const color = context.isTarget ? 'rgba(192,132,252,0.7)' : context.color;
            contextHtml = `
                <div class="reply-context" style="font-size:11px; color:${color}; margin:2px 0 4px 0;">
                    <i class="fas fa-reply" style="font-size:8px; margin-right:4px;"></i>
                    <span style="${context.isTarget ? 'font-weight:500;' : ''}">${context.text}</span>
                </div>
            `;
        }
        const fileHtml = renderCommentFile(reply);
        html += `
            <div class="comment-item reply-item ${isHighlighted ? 'highlighted' : ''}" data-reply-id="${reply.id}" style="${isHighlighted ? 'background:rgba(192,132,252,0.08);border-left:3px solid #c084fc;padding-left:10px;' : ''}">
                <img class="avatar" src="${reply.avatar || getAvatar(reply.fullName)}" 
                     alt="${reply.fullName}" 
                     style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
                     onclick="window.goToProfileUser('${reply.userId}')" />
                <div class="comment-body" style="flex:1;min-width:0;">
                    <div class="comment-user" onclick="window.goToProfileUser('${reply.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                        <span style="font-weight:600;color:#fff;">${escapeHtml(reply.fullName)}</span>
                        <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(reply.username)}</span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(reply.createdAt)}</span>
                        ${isOwn ? '<span style="font-size:9px;color:rgba(52,211,153,0.5);margin-left:4px;">Tuyo</span>' : ''}
                        ${!isOwn && isStoryOwner ? '<span style="font-size:9px;color:rgba(192,132,252,0.5);margin-left:4px;">Tu historia</span>' : ''}
                        ${reply.hasFile ? '<span style="font-size:9px;color:rgba(34,197,94,0.5);margin-left:4px;">📎</span>' : ''}
                    </div>
                    ${contextHtml}
                    ${reply.content ? `<div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>` : ''}
                    ${fileHtml}
                    <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                data-comment-id="${reply.id}"
                                onclick="window.handleCommentLike('${storyId}', '${reply.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                            <i class="fas fa-heart" style="font-size:10px;color:${isLiked ? '#ff6b6b' : 'inherit'};"></i> <span>${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${canDelete ? `
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${reply.id}', '${reply._parentId || parentCommentId}')"
                                    style="background:transparent;border:none;color:rgba(255,107,107,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                                <i class="fas fa-trash" style="font-size:9px;"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="reply-input-container" id="reply-input-${reply.id}" style="display:none;margin-top:6px;">
                        <input type="text" class="reply-input" id="replyInput-${reply.id}" 
                               placeholder="Escribe una respuesta..." maxlength="500"
                               style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:6px 12px;font-size:13px;color:#fff;outline:none;" />
                        <button class="reply-send-btn" onclick="window.handleReplySubmit('${storyId}', '${reply.id}')"
                                style="background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.2);border-radius:12px;color:#c084fc;padding:6px 14px;font-size:12px;cursor:pointer;transition:all 0.2s;">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// ============================================================
// FUNCIONES GLOBALES PARA EL MODAL
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    const liked = await likeComment(storyId, commentId);
    if (liked !== false) {
        const comments = commentsCache.get(storyId);
        const comment = findCommentById(comments, commentId);
        if (comment) {
            const likesCount = comment.likes?.length || 0;
            updateCommentLikeUI(commentId, liked, likesCount);
        }
    }
};

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const success = await deleteComment(storyId, commentId, parentCommentId);
    if (success) {
        removeCommentFromUI(commentId, parentCommentId);
    }
};

window.toggleReplyInput = function(storyId, commentId) {
    document.querySelectorAll('.reply-input-container').forEach(el => {
        if (el.id !== `reply-input-${commentId}`) {
            el.style.display = 'none';
        }
    });
    const container = document.getElementById(`reply-input-${commentId}`);
    if (container) {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'flex';
        container.style.gap = '8px';
        container.style.alignItems = 'center';
        if (!isVisible) {
            const input = document.getElementById(`replyInput-${commentId}`);
            if (input) input.focus();
        }
    }
};

window.handleReplySubmit = async function(storyId, parentCommentId) {
    const input = document.getElementById(`replyInput-${parentCommentId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) {
        showToast('Escribe una respuesta', true);
        return;
    }
    const newReply = await addComment(storyId, content, parentCommentId);
    if (newReply) {
        input.value = '';
        const container = document.getElementById(`reply-input-${parentCommentId}`);
        if (container) container.style.display = 'none';
        addReplyToUI(storyId, parentCommentId, newReply);
    }
};

window.toggleRepliesVisibility = function(commentId) {
    const currentState = repliesVisibility.get(commentId) || false;
    const newState = !currentState;
    repliesVisibility.set(commentId, newState);
    const container = document.getElementById('commentsList');
    if (container) {
        const storyId = container.dataset.storyId || window._currentStoryId;
        if (storyId) {
            updateCommentsUI(storyId);
        }
    }
};

// ============================================================
// INICIALIZAR COMENTARIOS - CON CACHÉ UNIFICADO
// ============================================================

async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null, forceReload = false) {
    if (!storyId) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;
    
    let comments;
    
    // 🔥 VERIFICAR CACHÉ UNIFICADO PRIMERO
    if (!forceReload) {
        const cachedData = unifiedCache.getComments(storyId);
        if (cachedData && cachedData.comments) {
            comments = cachedData.comments;
            commentsCache.set(storyId, comments);
            console.log(`📦 [CACHE UNIFICADO] Comentarios de ${storyId} cargados (${comments.length} comentarios)`);
        } else if (commentsCache.has(storyId)) {
            comments = commentsCache.get(storyId);
            console.log(`📦 [CACHE MEMORIA] Comentarios de ${storyId} cargados (${comments.length} comentarios)`);
        } else {
            comments = await loadComments(storyId, forceReload);
        }
    } else {
        comments = await loadComments(storyId, true);
        console.log(`📡 [API] Comentarios de ${storyId} recargados (${comments.length} comentarios)`);
    }
    
    const currentUser = getCurrentUser();
    
    if (highlightCommentId) {
        const parentChain = getParentChain(comments, highlightCommentId);
        if (parentChain) {
            parentChain.forEach(parentId => {
                repliesVisibility.set(parentId, true);
            });
            const parentComment = findParentComment(comments, highlightCommentId);
            if (parentComment) {
                repliesVisibility.set(parentComment.id, true);
            }
            const highlightedComment = findCommentById(comments, highlightCommentId);
            if (highlightedComment && highlightedComment.replies && highlightedComment.replies.length > 0) {
                repliesVisibility.set(highlightCommentId, true);
            }
        } else {
            const comment = findCommentById(comments, highlightCommentId);
            if (comment && comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(highlightCommentId, true);
            }
        }
    }
    
    renderComments(comments, storyId, currentUser?.id, container, highlightCommentId);
    
    if (highlightCommentId) {
        setTimeout(() => {
            let highlighted = container.querySelector(`.comment-item[data-comment-id="${highlightCommentId}"]`);
            if (!highlighted) {
                highlighted = container.querySelector(`.comment-item[data-reply-id="${highlightCommentId}"]`);
            }
            if (highlighted) {
                highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlighted.style.background = 'rgba(192,132,252,0.1)';
                highlighted.style.borderLeft = '3px solid #c084fc';
                setTimeout(() => {
                    highlighted.style.background = '';
                    highlighted.style.borderLeft = '';
                }, 3000);
            }
        }, 600);
    }
}

// ============================================================
// EXPANDIR RESPUESTAS DESDE NOTIFICACIONES
// ============================================================

function expandRepliesForComment(commentId) {
    if (!commentId) return;
    let found = false;
    for (const [storyId, comments] of commentsCache) {
        const comment = findCommentById(comments, commentId);
        if (comment) {
            const parentChain = getParentChain(comments, commentId);
            if (parentChain) {
                parentChain.forEach(parentId => {
                    repliesVisibility.set(parentId, true);
                });
            }
            if (comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(commentId, true);
            }
            found = true;
            break;
        }
    }
    if (found) {
        const container = document.getElementById('commentsList');
        if (container) {
            const storyId = container.dataset.storyId || window._currentStoryId;
            if (storyId) {
                updateCommentsUI(storyId);
            }
        }
    }
}

// ============================================================
// 🔥 FUNCIÓN PARA ABRIR PREVISUALIZACIÓN DE IMAGEN (LEGACY)
// ============================================================

window.openImagePreview = function(imageUrl) {
    // Usar el nuevo modal de archivos
    openFilePreview(imageUrl, 'Imagen', 'image/*');
};

// ============================================================
// OBTENER ESTADÍSTICAS DEL CACHÉ
// ============================================================

function getCacheStats() {
    return {
        memory: {
            comments: commentsCache.size,
            likes: commentLikes.size,
            replies: repliesVisibility.size
        },
        unified: unifiedCache.getStats ? unifiedCache.getStats() : 'unavailable'
    };
}

// ============================================================
// 🔥 EXPORTACIONES
// ============================================================

export {
    commentsCache,
    commentLikes,
    repliesVisibility,
    findCommentById,
    getParentChain,
    loadComments,
    addComment,
    deleteComment,
    likeComment,
    uploadCommentFile,
    addCommentToCache,
    addReplyToCache,
    updateCommentLikes,
    updateCommentsUI,
    updateCommentsUIWithoutReload,
    initComments,
    expandRepliesForComment,
    renderComments,
    renderCommentFile,
    getFileIcon,
    formatFileSize,
    addCommentToUI,
    addReplyToUI,
    updateCommentLikeUI,
    removeCommentFromUI,
    createCommentHTML,
    updateCommentCounters,
    // 🔥 NUEVAS EXPORTACIONES PARA VISTA PREVIA
    openFilePreview,
    closeFilePreview,
    isImageFile,
    isDocumentFile,
    isVideoFile,
    isAudioFile,
    // 🔥 ESTADÍSTICAS
    getCacheStats
};