// ============================================================
// story-comments.js - Sistema de comentarios para historias
// CON ESTADO CORRECTO DE OCULTAR/MOSTRAR RESPUESTAS
// Y FUNCIONES DE CACHÉ PARA EVITAR DUPLICADOS
// 🔥 VERSIÓN CORREGIDA - SIN PARPADEOS AL MOSTRAR RESPUESTAS
// 🔥 SOPORTE PARA SUBIR ARCHIVOS (SOLO DUEÑO DE HISTORIA)
// 🔥 VISOR DE ARCHIVOS INTEGRADO (PDF, imágenes, videos, audio, texto)
// 🔥 SUBIDA CON BARRA DE PROGRESO
// 🔥 RESPUESTAS ESTILO TIKTOK - USANDO INPUT PRINCIPAL (story-modal.js)
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO DE COMENTARIOS
// ============================================================

let commentsCache = new Map();
let commentLikes = new Map();
let repliesVisibility = new Map();

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

function isVideoExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v)$/);
}

function isAudioExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(mp3|wav|ogg|aac|flac|m4a|wma)$/);
}

function isImageExtension(fileUrl) {
    return fileUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|avif)$/);
}

// ============================================================
// 🔥 RENDER ARCHIVO ADJUNTO - CON VISOR INTEGRADO
// ============================================================

function renderCommentFile(comment) {
    if (!comment.hasFile || !comment.fileUrl) return '';
    
    const icon = getFileIcon(comment.mimetype);
    const size = comment.fileSizeFormatted || formatFileSize(comment.fileSize || 0);
    const isImage = comment.mimetype?.startsWith('image/') || isImageExtension(comment.fileUrl);
    const isPDF = comment.mimetype === 'application/pdf' || comment.fileUrl.toLowerCase().endsWith('.pdf');
    const isVideo = comment.mimetype?.startsWith('video/') || isVideoExtension(comment.fileUrl);
    const isAudio = comment.mimetype?.startsWith('audio/') || isAudioExtension(comment.fileUrl);
    const isText = comment.mimetype === 'text/plain' || comment.fileUrl.toLowerCase().endsWith('.txt');
    const fileUrl = comment.fileUrl;
    const filename = escapeHtml(comment.originalName || comment.filename || 'Archivo');
    const mimetype = comment.mimetype || '';
    
    // Para imágenes: usar el visor de imágenes
    if (isImage) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <img src="${fileUrl}" alt="Adjunto" 
                     style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.05);transition:transform 0.2s;"
                     onmouseover="this.style.transform='scale(1.02)'" 
                     onmouseout="this.style.transform='scale(1)'"
                     onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'image/jpeg'}', '${filename}')" />
            </div>
        `;
    }
    
    // Para PDF: botón para abrir en el visor
    if (isPDF) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'application/pdf'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#ff6b6b;">
                        <i class="fas fa-file-pdf"></i>
                    </span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-eye"></i></span>
                </div>
            </div>
        `;
    }
    
    // Para videos: botón para abrir en el visor de videos
    if (isVideo) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'video/mp4'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#f472b6;">
                        <i class="fas fa-video"></i>
                    </span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-play"></i></span>
                </div>
            </div>
        `;
    }
    
    // Para audio: botón para abrir en el visor de audio
    if (isAudio) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'audio/mpeg'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#60a5fa;">
                        <i class="fas fa-music"></i>
                    </span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-play"></i></span>
                </div>
            </div>
        `;
    }
    
    // Para texto: botón para abrir en el visor de texto
    if (isText) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'text/plain'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#fbbf24;">
                        <i class="fas fa-file-alt"></i>
                    </span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-eye"></i></span>
                </div>
            </div>
        `;
    }
    
    // Para archivos de Word, Excel, PowerPoint - mostrar con icono y opción de descarga
    if (comment.mimetype?.includes('word') || comment.mimetype?.includes('document') || 
        comment.mimetype?.includes('excel') || comment.mimetype?.includes('spreadsheet') ||
        comment.mimetype?.includes('presentation') || comment.mimetype?.includes('officedocument')) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.downloadFile('${fileUrl}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#60a5fa;">${icon}</span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-download" style="color:rgba(255,255,255,0.15);"><i class="fas fa-download"></i></span>
                </div>
            </div>
        `;
    }
    
    // Fallback: cualquier otro archivo (descarga)
    return `
        <div class="comment-file" style="margin-top:6px;">
            <a href="${fileUrl}" target="_blank" class="message-file" download
               style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;text-decoration:none;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                <span class="file-icon" style="font-size:22px;color:#c084fc;">${icon}</span>
                <span class="file-info" style="flex:1;min-width:0;">
                    <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                    <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                </span>
                <span class="file-download" style="color:rgba(255,255,255,0.15);"><i class="fas fa-download"></i></span>
            </a>
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
// 🔥 FUNCIONES DE CACHÉ
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
}

// ============================================================
// 🔥 SUBIR ARCHIVO PARA COMENTARIO (CON PROGRESO)
// ============================================================

async function uploadCommentFile(storyId, file) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para subir archivos', true);
        return null;
    }
    
    // Validar tamaño
    if (file.size > 20 * 1024 * 1024) {
        showToast('El archivo no puede superar los 20MB', true);
        return null;
    }
    
    // Crear indicador de progreso
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.9);
        backdrop-filter: blur(10px);
        padding: 12px 24px;
        border-radius: 16px;
        border: 1px solid rgba(192,132,252,0.2);
        color: #fff;
        z-index: 99999;
        min-width: 280px;
        text-align: center;
        font-size: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    progressContainer.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <i class="fas fa-spinner fa-pulse" style="color:#c084fc;"></i>
            <span>Subiendo archivo...</span>
            <span id="uploadPercentage" style="color:#c084fc;font-weight:600;">0%</span>
        </div>
        <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
            <div id="uploadProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg,#c084fc,#8b5cf6);border-radius:4px;transition:width 0.3s ease;"></div>
        </div>
        <div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,0.3);">
            ${formatFileSize(file.size)} · ${escapeHtml(file.name)}
        </div>
    `;
    document.body.appendChild(progressContainer);
    
    const updateProgress = (percent) => {
        const bar = document.getElementById('uploadProgressBar');
        const text = document.getElementById('uploadPercentage');
        if (bar) bar.style.width = Math.min(100, percent) + '%';
        if (text) text.textContent = Math.min(100, Math.round(percent)) + '%';
    };
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        // Usar XMLHttpRequest para tener control del progreso
        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    updateProgress(percent);
                }
            });
            
            xhr.addEventListener('load', () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(data.error || 'Error al subir archivo'));
                    }
                } catch (e) {
                    reject(new Error('Error al procesar respuesta'));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Error de red al subir archivo'));
            });
            
            xhr.addEventListener('abort', () => {
                reject(new Error('Subida cancelada'));
            });
            
            xhr.open('POST', `${API_URL}/api/stories/${storyId}/upload-comment-file`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
        });
        
        updateProgress(100);
        await new Promise(resolve => setTimeout(resolve, 300));
        progressContainer.remove();
        
        if (result && result.success) {
            showToast('✅ Archivo subido correctamente');
            return result;
        } else {
            showToast(result?.error || 'Error al subir archivo', true);
            return null;
        }
        
    } catch (error) {
        progressContainer.remove();
        showToast('❌ ' + (error.message || 'Error al subir archivo'), true);
        console.error('Error subiendo archivo:', error);
        return null;
    }
}

// ============================================================
// CARGAR COMENTARIOS
// ============================================================

async function loadComments(storyId, forceReload = false) {
    if (!storyId) return [];
    const token = getToken();
    if (!token) return [];
    if (forceReload) commentsCache.delete(storyId);
    if (!forceReload && commentsCache.has(storyId)) {
        return commentsCache.get(storyId);
    }
    try {
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
        return comments;
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

// ============================================================
// AGREGAR COMENTARIO
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
        if (parentCommentId) {
            addReplyToCache(storyId, parentCommentId, newComment);
        } else {
            addCommentToCache(storyId, newComment);
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
// ELIMINAR COMENTARIO
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
        showToast('🗑️ Eliminado');
        return true;
    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Error al eliminar', true);
        return false;
    }
}

// ============================================================
// DAR LIKE A COMENTARIO
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
        updateCommentLikes(storyId, commentId, data.liked);
        showToast(data.liked ? '❤️ Like al comentario' : '💔 Like eliminado');
        return data.liked;
    } catch (error) {
        console.error('Error liking comment:', error);
        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// ACTUALIZAR UI DE COMENTARIOS (VERSIÓN CORREGIDA - SIN PARPADEOS)
// ============================================================

function updateCommentsUI(storyId) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    const currentUser = getCurrentUser();
    const comments = commentsCache.get(storyId) || [];
    const currentStoryId = container.dataset.storyId || window._currentStoryId || storyId;
    renderComments(comments, currentStoryId, currentUser?.id, container);
}

// ============================================================
// 🔥 ACTUALIZAR UI SIN RECARGAR TODO (PRESERVANDO ESTADO)
// ============================================================

function updateCommentsUIWithoutReload(storyId) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    const currentUser = getCurrentUser();
    const comments = commentsCache.get(storyId) || [];
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;
    
    // 🔥 PRESERVAR EL ESTADO DE RESPUESTAS ABIERTAS
    const openReplies = new Map();
    document.querySelectorAll('.replies').forEach(el => {
        const commentId = el.id.replace('replies-', '');
        if (el.style.display !== 'none') {
            openReplies.set(commentId, true);
        }
    });
    
    renderComments(comments, storyId, currentUser?.id, container);
    
    // 🔥 RESTAURAR EL ESTADO DE RESPUESTAS ABIERTAS
    setTimeout(() => {
        openReplies.forEach((_, commentId) => {
            const repliesContainer = document.getElementById(`replies-${commentId}`);
            if (repliesContainer) {
                repliesContainer.style.display = 'flex';
                const btn = document.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
                if (btn) {
                    const total = repliesContainer.dataset.totalReplies || '0';
                    btn.innerHTML = `
                        <i class="fas fa-chevron-up"></i> 
                        Ocultar ${total} respuestas
                    `;
                }
            }
        });
    }, 50);
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
// 🔥 RENDER COMENTARIOS (VERSIÓN CORREGIDA - CON data-comment-id)
// 🔥 ELIMINADOS LOS INPUTS DE RESPUESTA INLINE
// ============================================================

function renderComments(comments, storyId, currentUserId, container, highlightCommentId = null) {
    if (!container) return;
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
    const isStoryOwner = storyOwnerId === currentUserId;
    let html = '';
    comments.forEach(comment => {
        const cachedLikes = commentLikes.get(comment.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (comment.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (comment.likes?.length || 0);
        const isOwn = comment.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const hasReplies = comment.replies && comment.replies.length > 0;
        const totalReplyCount = countAllReplies(comment);
        const isExpanded = repliesVisibility.get(comment.id) || false;
        const isHighlighted = highlightCommentId && comment.id === highlightCommentId;
        const fileHtml = renderCommentFile(comment);
        html += `
            <div class="comment-item ${isHighlighted ? 'highlighted' : ''}" data-comment-id="${comment.id}" style="${isHighlighted ? 'background:rgba(192,132,252,0.08);border-left:3px solid #c084fc;padding-left:10px;' : ''}">
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
                    ${hasReplies ? renderFlatReplies(comment.replies, storyId, currentUserId, comment.id, comments, highlightCommentId, isExpanded, storyOwnerId) : ''}
                    ${hasReplies ? `
                        <div class="show-replies-btn" data-comment-id="${comment.id}" onclick="window.toggleRepliesVisibility('${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i> 
                            ${isExpanded ? `Ocultar ${totalReplyCount} respuestas` : `Ver ${totalReplyCount} respuestas`}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ============================================================
// 🔥 RENDER RESPUESTAS (VERSIÓN CORREGIDA - CON data-total-replies)
// 🔥 ELIMINADOS LOS INPUTS DE RESPUESTA INLINE
// ============================================================

function renderFlatReplies(replies, storyId, currentUserId, parentCommentId, allComments, highlightCommentId = null, isExpanded = false, storyOwnerId = null) {
    if (!replies || replies.length === 0) return '';
    const flatReplies = flattenReplies(replies, allComments, parentCommentId);
    if (flatReplies.length === 0) return '';
    if (!isExpanded) return '';
    const isStoryOwner = storyOwnerId === currentUserId;
    let html = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;" data-total-replies="${flatReplies.length}">`;
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
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// ============================================================
// 🔥 FUNCIONES GLOBALES PARA EL MODAL (VERSIÓN CORREGIDA)
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    const liked = await likeComment(storyId, commentId);
    if (liked !== false) {
        updateCommentsUI(storyId);
    }
};

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const success = await deleteComment(storyId, commentId, parentCommentId);
    if (success) {
        updateCommentsUI(storyId);
    }
};

// ============================================================
// 🔥 FUNCIÓN PARA RENDERIZAR SOLO RESPUESTAS DE UN COMENTARIO
// ============================================================

function renderRepliesOnly(storyId, commentId, comment) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;
    const isStoryOwner = storyOwnerId === currentUserId;
    
    // Buscar el comentario en el DOM
    const commentElement = container.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!commentElement) {
        // Fallback: re-renderizar todo si no se encuentra el elemento
        updateCommentsUI(storyId);
        return;
    }
    
    // Crear o actualizar el contenedor de respuestas
    let repliesContainer = commentElement.querySelector(`#replies-${commentId}`);
    
    if (!repliesContainer) {
        // Crear el contenedor de respuestas si no existe
        repliesContainer = document.createElement('div');
        repliesContainer.id = `replies-${commentId}`;
        repliesContainer.className = 'replies';
        repliesContainer.style.cssText = 'margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;';
        
        // Insertar después del botón "Ver respuestas"
        const showRepliesBtn = commentElement.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
        if (showRepliesBtn) {
            showRepliesBtn.parentNode.insertBefore(repliesContainer, showRepliesBtn.nextSibling);
        } else {
            const body = commentElement.querySelector('.comment-body');
            if (body) body.appendChild(repliesContainer);
        }
    }
    
    // Generar HTML de las respuestas (SOLO ESTE COMENTARIO)
    const allComments = commentsCache.get(storyId) || [];
    const allReplies = flattenReplies(comment.replies, allComments, commentId);
    
    let repliesHtml = '';
    for (const reply of allReplies) {
        const cachedLikes = commentLikes.get(reply.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (reply.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (reply.likes?.length || 0);
        const isOwn = reply.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const context = getReplyContext(reply, currentUserId, reply._parentId || commentId, allComments);
        
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
        
        repliesHtml += `
            <div class="comment-item reply-item" data-reply-id="${reply.id}">
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
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${reply.id}', '${reply._parentId || commentId}')"
                                    style="background:transparent;border:none;color:rgba(255,107,107,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                                <i class="fas fa-trash" style="font-size:9px;"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    // ACTUALIZAR SOLO EL CONTENEDOR DE RESPUESTAS (NO TODO EL DOM)
    repliesContainer.innerHTML = repliesHtml;
    repliesContainer.dataset.totalReplies = allReplies.length;
    repliesContainer.style.display = 'flex';
    
    // Actualizar el botón "Ver respuestas"
    const showRepliesBtn = commentElement.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
    if (showRepliesBtn) {
        showRepliesBtn.innerHTML = `
            <i class="fas fa-chevron-up"></i> 
            Ocultar ${allReplies.length} respuestas
        `;
    }
    
    // Actualizar el estado de visibilidad
    repliesVisibility.set(commentId, true);
    
    console.log(`✅ Respuestas del comentario ${commentId} renderizadas (${allReplies.length})`);
}

// ============================================================
// 🔥 TOGGLE DE RESPUESTAS - VERSIÓN CORREGIDA (SIN PARPADEOS)
// ============================================================

window.toggleRepliesVisibility = function(commentId) {
    const currentState = repliesVisibility.get(commentId) || false;
    const newState = !currentState;
    repliesVisibility.set(commentId, newState);
    
    // Buscar el contenedor de respuestas específico
    const repliesContainer = document.getElementById(`replies-${commentId}`);
    const showRepliesBtn = document.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
    
    if (repliesContainer) {
        // MOSTRAR/OCULTAR DIRECTAMENTE EN EL DOM - SIN RE-RENDER
        repliesContainer.style.display = newState ? 'flex' : 'none';
        
        // Actualizar el texto del botón
        if (showRepliesBtn) {
            const totalReplies = repliesContainer.dataset.totalReplies || '0';
            const icon = newState ? 'chevron-up' : 'chevron-down';
            const actionText = newState ? 'Ocultar' : 'Ver';
            showRepliesBtn.innerHTML = `
                <i class="fas fa-${icon}"></i> 
                ${actionText} ${totalReplies} respuestas
            `;
        }
        
        console.log(`📂 Respuestas del comentario ${commentId}: ${newState ? 'mostradas' : 'ocultas'}`);
        return;
    }
    
    // Si el contenedor no existe, hacer una carga inicial con renderizado parcial
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const storyId = container.dataset.storyId || window._currentStoryId;
    if (!storyId) return;
    
    // Obtener el comentario del caché
    const comments = commentsCache.get(storyId);
    if (!comments) return;
    
    const comment = findCommentById(comments, commentId);
    if (!comment || !comment.replies || comment.replies.length === 0) {
        showToast('No hay respuestas para mostrar');
        return;
    }
    
    // RENDERIZAR SOLO LAS RESPUESTAS DE ESTE COMENTARIO
    renderRepliesOnly(storyId, commentId, comment);
};

// ============================================================
// 🔥 toggleReplyInput - PUENTE A story-modal.js
// ============================================================

window.toggleReplyInput = function(storyId, commentId) {
    // Delegar a story-modal.js si está disponible
    if (typeof window._toggleReplyInputFromModal === 'function') {
        window._toggleReplyInputFromModal(storyId, commentId);
        return;
    }
    
    // Fallback: ocultar inputs inline (por si acaso)
    document.querySelectorAll('.reply-input-container').forEach(el => {
        el.style.display = 'none';
    });
    
    showToast('💬 Usa el input principal para responder');
};

// ============================================================
// INICIALIZAR COMENTARIOS
// ============================================================

async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null, forceReload = false) {
    if (!storyId) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;
    let comments;
    if (forceReload) {
        comments = await loadComments(storyId, true);
    } else {
        comments = commentsCache.get(storyId);
        if (!comments || comments.length === 0) {
            comments = await loadComments(storyId, false);
        }
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
// 🔥 FUNCIÓN PARA ABRIR PREVISUALIZACIÓN DE IMAGEN
// ============================================================

window.openImagePreview = function(imageUrl) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.92);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        animation: fadeIn 0.3s ease;
    `;
    overlay.innerHTML = `
        <img src="${imageUrl}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:8px;" />
        <button style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:24px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);">
            <i class="fas fa-times"></i>
        </button>
    `;
    overlay.onclick = () => overlay.remove();
    overlay.querySelector('button').onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
    };
    if (!document.getElementById('preview-fade-style')) {
        const style = document.createElement('style');
        style.id = 'preview-fade-style';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
};

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
    updateCommentsUIWithoutReload,
    initComments,
    expandRepliesForComment,
    renderComments,
    renderCommentFile,
    getFileIcon,
    formatFileSize,
    renderRepliesOnly
};