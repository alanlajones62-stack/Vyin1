// ============================================================
// story-comments.js - Sistema de comentarios para historias
// 🔥 CON LIKES DE COMENTARIOS Y RESPUESTAS
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO DE COMENTARIOS
// ============================================================

let commentsCache = new Map();
let repliesVisibility = new Map();

// ============================================================
// FUNCIONES AUXILIARES PARA ARCHIVOS
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
// RENDER ARCHIVO ADJUNTO
// ============================================================

function renderCommentFile(comment) {
    if (!comment.hasFile || !comment.fileUrl) return '';
    
    const size = comment.fileSizeFormatted || formatFileSize(comment.fileSize || 0);
    const isImage = comment.mimetype?.startsWith('image/') || isImageExtension(comment.fileUrl);
    const isPDF = comment.mimetype === 'application/pdf' || comment.fileUrl.toLowerCase().endsWith('.pdf');
    const isVideo = comment.mimetype?.startsWith('video/') || isVideoExtension(comment.fileUrl);
    const isAudio = comment.mimetype?.startsWith('audio/') || isAudioExtension(comment.fileUrl);
    const isText = comment.mimetype === 'text/plain' || comment.fileUrl.toLowerCase().endsWith('.txt');
    const fileUrl = comment.fileUrl;
    const filename = escapeHtml(comment.originalName || comment.filename || 'Archivo');
    const mimetype = comment.mimetype || '';
    
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
    
    if (isPDF) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'application/pdf'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#ff6b6b;"><i class="fas fa-file-pdf"></i></span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-eye"></i></span>
                </div>
            </div>
        `;
    }
    
    if (isVideo) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'video/mp4'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#f472b6;"><i class="fas fa-video"></i></span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-play"></i></span>
                </div>
            </div>
        `;
    }
    
    if (isAudio) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'audio/mpeg'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#60a5fa;"><i class="fas fa-music"></i></span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-play"></i></span>
                </div>
            </div>
        `;
    }
    
    if (isText) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <div onclick="event.stopPropagation(); window.openFileViewer('${fileUrl}', '${mimetype || 'text/plain'}', '${filename}')" 
                     style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;cursor:pointer;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                    <span class="file-icon" style="font-size:22px;color:#fbbf24;"><i class="fas fa-file-alt"></i></span>
                    <span class="file-info" style="flex:1;min-width:0;">
                        <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${filename}</span>
                        <span class="file-size" style="font-size:9px;color:rgba(255,255,255,0.2);">${size}</span>
                    </span>
                    <span class="file-open" style="color:rgba(255,255,255,0.15);"><i class="fas fa-eye"></i></span>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="comment-file" style="margin-top:6px;">
            <a href="${fileUrl}" target="_blank" class="message-file" download
               style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;text-decoration:none;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                <span class="file-icon" style="font-size:22px;color:#c084fc;"><i class="fas fa-file"></i></span>
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
// FUNCIONES DE BÚSQUEDA
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

function findRootComment(comments, commentId) {
    if (!comments) return null;
    let currentComment = findCommentById(comments, commentId);
    if (!currentComment) return null;
    let parent = findParentComment(comments, commentId);
    if (!parent) return currentComment;
    let root = parent;
    let nextParent = findParentComment(comments, parent.id);
    while (nextParent) {
        root = nextParent;
        nextParent = findParentComment(comments, root.id);
    }
    return root;
}

// ============================================================
// FUNCIONES DE CACHÉ
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
}

function addReplyToCache(storyId, parentCommentId, reply) {
    if (!storyId || !parentCommentId || !reply) return;
    if (!commentsCache.has(storyId)) commentsCache.set(storyId, []);
    const comments = commentsCache.get(storyId);
    const parentComment = findCommentById(comments, parentCommentId);
    if (!parentComment) {
        console.warn(`⚠️ Padre ${parentCommentId} no encontrado en caché`);
        return;
    }
    let rootComment = findRootComment(comments, parentCommentId);
    if (!rootComment) rootComment = parentComment;
    if (!rootComment.replies) rootComment.replies = [];
    const exists = rootComment.replies.some(r => r.id === reply.id);
    if (exists) return;
    reply._parentId = parentCommentId;
    reply._rootId = rootComment.id;
    rootComment.replies.push(reply);
    rootComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    commentsCache.set(storyId, comments);
    if (reply.replies && reply.replies.length > 0) repliesVisibility.set(reply.id, false);
    repliesVisibility.set(rootComment.id, true);
    console.log(`✅ Respuesta agregada al caché del comentario ${rootComment.id}`);
}

// ============================================================
// SUBIR ARCHIVO
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
            if (comment.replies && comment.replies.length > 0) repliesVisibility.set(comment.id, false);
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
// 🔥 DAR/QUITAR LIKE A COMENTARIO
// ============================================================

async function toggleCommentLike(storyId, commentId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return false;
    }

    try {
        // Verificar estado actual desde la UI
        const likeBtn = document.querySelector(`.like-btn[data-comment-id="${commentId}"]`);
        const isLiked = likeBtn?.classList.contains('liked') || false;
        
        const method = isLiked ? 'DELETE' : 'POST';
        
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments/${commentId}/like`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Error al procesar like', true);
            return false;
        }

        const data = await res.json();
        
        // Actualizar UI del botón
        if (likeBtn) {
            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.innerHTML = `<i class="fas fa-heart" style="color:#f472b6;"></i> <span class="like-count" data-comment-id="${commentId}">${data.likesCount || 0}</span>`;
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.innerHTML = `<i class="fas fa-heart"></i> <span class="like-count" data-comment-id="${commentId}">${data.likesCount || 0}</span>`;
            }
        }
        
        // Actualizar contador si existe separado
        const countEl = document.querySelector(`.like-count[data-comment-id="${commentId}"]`);
        if (countEl) {
            countEl.textContent = data.likesCount || 0;
        }
        
        // Actualizar en caché
        if (commentsCache.has(storyId)) {
            const comments = commentsCache.get(storyId);
            const comment = findCommentById(comments, commentId);
            if (comment) {
                comment.likes = data.likes || [];
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error toggling comment like:', error);
        showToast('Error al procesar like', true);
        return false;
    }
}

// ============================================================
// 🔥 RENDER BOTÓN DE LIKE
// ============================================================

function renderLikeButton(commentId, likes, currentUserId) {
    if (!likes) likes = [];
    const isLiked = likes.includes(currentUserId);
    const count = likes.length || 0;
    
    return `
        <button class="like-btn ${isLiked ? 'liked' : ''}" 
                data-comment-id="${commentId}"
                onclick="window.handleCommentLike('${commentId}')"
                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
            <i class="fas fa-heart" style="${isLiked ? 'color:#f472b6;' : ''}"></i>
            <span class="like-count" data-comment-id="${commentId}">${count}</span>
        </button>
    `;
}

// ============================================================
// ACTUALIZAR UI DE COMENTARIOS
// ============================================================

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
    const openReplies = new Map();
    document.querySelectorAll('.replies').forEach(el => {
        const commentId = el.id.replace('replies-', '');
        if (el.style.display !== 'none') {
            openReplies.set(commentId, true);
        }
    });
    renderComments(comments, storyId, currentUser?.id, container);
    setTimeout(() => {
        openReplies.forEach((_, commentId) => {
            const repliesContainer = document.getElementById(`replies-${commentId}`);
            if (repliesContainer) {
                repliesContainer.style.display = 'flex';
                const btn = document.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
                if (btn) {
                    const total = repliesContainer.dataset.totalReplies || '0';
                    btn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${total} respuestas`;
                }
            }
        });
    }, 50);
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
// 🔥 RENDER COMENTARIOS - CON LIKES
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
        const isOwn = comment.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const hasReplies = comment.replies && comment.replies.length > 0;
        const totalReplyCount = countAllReplies(comment);
        const isExpanded = repliesVisibility.get(comment.id) || false;
        const isHighlighted = highlightCommentId && comment.id === highlightCommentId;
        const fileHtml = renderCommentFile(comment);
        const likeButtonHtml = renderLikeButton(comment.id, comment.likes, currentUserId);
        
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
                    <div class="comment-meta" style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${comment.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${likeButtonHtml}
                        ${canDelete ? `
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${comment.id}')"
                                    style="background:transparent;border:none;color:rgba(255,107,107,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                                <i class="fas fa-trash" style="font-size:9px;"></i>
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
// 🔥 RENDER RESPUESTAS - CON LIKES
// ============================================================

function renderFlatReplies(replies, storyId, currentUserId, parentCommentId, allComments, highlightCommentId = null, isExpanded = false, storyOwnerId = null) {
    if (!replies || replies.length === 0) return '';
    const flatReplies = flattenReplies(replies, allComments, parentCommentId);
    if (flatReplies.length === 0) return '';
    if (!isExpanded) return '';
    const isStoryOwner = storyOwnerId === currentUserId;
    let html = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;" data-total-replies="${flatReplies.length}">`;
    flatReplies.forEach((reply) => {
        const isOwn = reply.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const isHighlighted = highlightCommentId && reply.id === highlightCommentId;
        const fileHtml = renderCommentFile(reply);
        const isNestedReply = reply._parentId && reply._parentId !== parentCommentId;
        const likeButtonHtml = renderLikeButton(reply.id, reply.likes, currentUserId);
        
        html += `
            <div class="comment-item reply-item ${isHighlighted ? 'highlighted' : ''}" data-reply-id="${reply.id}" data-parent-id="${reply._parentId || parentCommentId}" style="${isHighlighted ? 'background:rgba(192,132,252,0.08);border-left:3px solid #c084fc;padding-left:10px;' : ''}">
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
                        ${isNestedReply ? `<span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:4px;">↳ en respuesta</span>` : ''}
                    </div>
                    ${reply.content ? `<div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>` : ''}
                    ${fileHtml}
                    <div class="comment-meta" style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${likeButtonHtml}
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
// AGREGAR RESPUESTA AL DOM - CON LIKES
// ============================================================

function addReplyToDOM(storyId, parentCommentId, reply) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;
    const isStoryOwner = storyOwnerId === currentUserId;
    
    const allComments = commentsCache.get(storyId) || [];
    let rootComment = findRootComment(allComments, parentCommentId);
    if (!rootComment) {
        rootComment = findCommentById(allComments, parentCommentId);
        if (!rootComment) return;
    }
    
    let repliesContainer = document.getElementById(`replies-${rootComment.id}`);
    
    if (!repliesContainer) {
        const commentElement = container.querySelector(`.comment-item[data-comment-id="${rootComment.id}"]`);
        if (!commentElement) return;
        
        repliesContainer = document.createElement('div');
        repliesContainer.id = `replies-${rootComment.id}`;
        repliesContainer.className = 'replies';
        repliesContainer.style.cssText = 'margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;';
        
        let showRepliesBtn = commentElement.querySelector(`.show-replies-btn[data-comment-id="${rootComment.id}"]`);
        if (!showRepliesBtn) {
            showRepliesBtn = document.querySelector(`.show-replies-btn[data-comment-id="${rootComment.id}"]`);
        }
        if (showRepliesBtn) {
            showRepliesBtn.parentNode.insertBefore(repliesContainer, showRepliesBtn.nextSibling);
        } else {
            const body = commentElement.querySelector('.comment-body');
            if (body) body.appendChild(repliesContainer);
        }
        
        if (showRepliesBtn) {
            const totalReplies = rootComment.replies?.length || 0;
            showRepliesBtn.innerHTML = `
                <i class="fas fa-chevron-down"></i> 
                Ver ${totalReplies} respuestas
            `;
        }
        
        repliesVisibility.set(rootComment.id, true);
    }
    
    const existingReply = repliesContainer.querySelector(`[data-reply-id="${reply.id}"]`);
    if (existingReply) return;
    
    const isOwn = reply.userId === currentUserId;
    const canDelete = isOwn || isStoryOwner;
    const fileHtml = renderCommentFile(reply);
    const isNestedReply = reply._parentId && reply._parentId !== rootComment.id;
    const likeButtonHtml = renderLikeButton(reply.id, reply.likes, currentUserId);
    
    const replyHtml = `
        <div class="comment-item reply-item" data-reply-id="${reply.id}" data-parent-id="${reply._parentId || rootComment.id}" style="animation: commentSlideIn 0.3s ease;">
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
                    ${isNestedReply ? `<span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:4px;">↳ en respuesta</span>` : ''}
                </div>
                ${reply.content ? `<div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>` : ''}
                ${fileHtml}
                <div class="comment-meta" style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                    <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
                            style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                        <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                    </button>
                    ${likeButtonHtml}
                    ${canDelete ? `
                        <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${reply.id}', '${reply._parentId || rootComment.id}')"
                                style="background:transparent;border:none;color:rgba(255,107,107,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-trash" style="font-size:9px;"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    repliesContainer.insertAdjacentHTML('beforeend', replyHtml);
    
    const showRepliesBtn = document.querySelector(`.show-replies-btn[data-comment-id="${rootComment.id}"]`);
    if (showRepliesBtn) {
        const total = repliesContainer.querySelectorAll('.reply-item').length;
        showRepliesBtn.innerHTML = `
            <i class="fas fa-chevron-up"></i> 
            Ocultar ${total} respuestas
        `;
        repliesContainer.dataset.totalReplies = total;
    }
    
    console.log(`✅ Respuesta agregada al DOM (${reply.id})`);
}

// ============================================================
// TOGGLE DE RESPUESTAS
// ============================================================

window.toggleRepliesVisibility = function(commentId) {
    const currentState = repliesVisibility.get(commentId) || false;
    const newState = !currentState;
    repliesVisibility.set(commentId, newState);
    const repliesContainer = document.getElementById(`replies-${commentId}`);
    const showRepliesBtn = document.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
    if (repliesContainer) {
        repliesContainer.style.display = newState ? 'flex' : 'none';
        if (showRepliesBtn) {
            const totalReplies = repliesContainer.dataset.totalReplies || '0';
            const icon = newState ? 'chevron-up' : 'chevron-down';
            const actionText = newState ? 'Ocultar' : 'Ver';
            showRepliesBtn.innerHTML = `<i class="fas fa-${icon}"></i> ${actionText} ${totalReplies} respuestas`;
        }
        console.log(`📂 Respuestas ${newState ? 'mostradas' : 'ocultas'}`);
        return;
    }
    const container = document.getElementById('commentsList');
    if (!container) return;
    const storyId = container.dataset.storyId || window._currentStoryId;
    if (!storyId) return;
    const comments = commentsCache.get(storyId);
    if (!comments) return;
    const comment = findCommentById(comments, commentId);
    if (!comment || !comment.replies || comment.replies.length === 0) {
        showToast('No hay respuestas para mostrar');
        return;
    }
    renderRepliesOnly(storyId, commentId, comment);
};

// ============================================================
// RENDER RESPUESTAS SOLO - CON LIKES
// ============================================================

function renderRepliesOnly(storyId, commentId, comment) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;
    const storyOwnerId = window._modalUserId || window._storyOwnerId || null;
    const isStoryOwner = storyOwnerId === currentUserId;
    let commentElement = container.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!commentElement) {
        const replyElement = container.querySelector(`.reply-item[data-reply-id="${commentId}"]`);
        if (replyElement) {
            commentElement = replyElement.closest('.comment-item');
            if (commentElement) {
                const parentId = commentElement.dataset.commentId;
                if (parentId) {
                    const parentComment = findCommentById(commentsCache.get(storyId), parentId);
                    if (parentComment) {
                        renderRepliesOnly(storyId, parentId, parentComment);
                        return;
                    }
                }
            }
        }
    }
    if (!commentElement) {
        console.warn(`⚠️ No se encontró el comentario ${commentId}, recargando...`);
        initComments(storyId, 'commentsList', null, true);
        return;
    }
    let repliesContainer = commentElement.querySelector(`#replies-${commentId}`);
    if (!repliesContainer) {
        repliesContainer = document.createElement('div');
        repliesContainer.id = `replies-${commentId}`;
        repliesContainer.className = 'replies';
        repliesContainer.style.cssText = 'margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;';
        let showRepliesBtn = commentElement.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
        if (!showRepliesBtn) {
            showRepliesBtn = document.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
        }
        if (showRepliesBtn) {
            showRepliesBtn.parentNode.insertBefore(repliesContainer, showRepliesBtn.nextSibling);
        } else {
            const body = commentElement.querySelector('.comment-body');
            if (body) body.appendChild(repliesContainer);
        }
    }
    const allComments = commentsCache.get(storyId) || [];
    const allReplies = flattenReplies(comment.replies, allComments, commentId);
    let repliesHtml = '';
    for (const reply of allReplies) {
        const isOwn = reply.userId === currentUserId;
        const canDelete = isOwn || isStoryOwner;
        const fileHtml = renderCommentFile(reply);
        const isNestedReply = reply._parentId && reply._parentId !== commentId;
        const likeButtonHtml = renderLikeButton(reply.id, reply.likes, currentUserId);
        
        repliesHtml += `
            <div class="comment-item reply-item" data-reply-id="${reply.id}" data-parent-id="${reply._parentId || commentId}">
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
                        ${isNestedReply ? `<span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:4px;">↳ en respuesta</span>` : ''}
                    </div>
                    ${reply.content ? `<div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>` : ''}
                    ${fileHtml}
                    <div class="comment-meta" style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${likeButtonHtml}
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
    repliesContainer.innerHTML = repliesHtml;
    repliesContainer.dataset.totalReplies = allReplies.length;
    repliesContainer.style.display = 'flex';
    const showRepliesBtn = commentElement.querySelector(`.show-replies-btn[data-comment-id="${commentId}"]`);
    if (showRepliesBtn) {
        showRepliesBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${allReplies.length} respuestas`;
    }
    repliesVisibility.set(commentId, true);
    console.log(`✅ ${allReplies.length} respuestas renderizadas`);
}

// ============================================================
// HANDLE COMMENT DELETE
// ============================================================

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const success = await deleteComment(storyId, commentId, parentCommentId);
    if (success) {
        updateCommentsUI(storyId);
    }
};

// ============================================================
// 🔥 HANDLE COMMENT LIKE (GLOBAL)
// ============================================================

window.handleCommentLike = async function(commentId) {
    const storyId = window._currentStoryId || document.getElementById('commentsList')?.dataset?.storyId;
    if (!storyId) {
        showToast('Error: historia no cargada', true);
        return;
    }
    await toggleCommentLike(storyId, commentId);
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
            parentChain.forEach(parentId => repliesVisibility.set(parentId, true));
            const parentComment = findParentComment(comments, highlightCommentId);
            if (parentComment) repliesVisibility.set(parentComment.id, true);
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

function expandRepliesForComment(commentId) {
    if (!commentId) return;
    let found = false;
    for (const [storyId, comments] of commentsCache) {
        const comment = findCommentById(comments, commentId);
        if (comment) {
            const parentChain = getParentChain(comments, commentId);
            if (parentChain) {
                parentChain.forEach(parentId => repliesVisibility.set(parentId, true));
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
            if (storyId) updateCommentsUI(storyId);
        }
    }
}

// ============================================================
// EXPORTACIONES
// ============================================================

export {
    commentsCache,
    repliesVisibility,
    findCommentById,
    findParentComment,
    findRootComment,
    getParentChain,
    loadComments,
    addComment,
    deleteComment,
    uploadCommentFile,
    addCommentToCache,
    addReplyToCache,
    updateCommentsUI,
    updateCommentsUIWithoutReload,
    initComments,
    expandRepliesForComment,
    renderComments,
    renderCommentFile,
    getFileIcon,
    formatFileSize,
    renderRepliesOnly,
    addReplyToDOM,
    toggleCommentLike,
    renderLikeButton
};