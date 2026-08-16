// ============================================================
// story-comments.js - Sistema de comentarios para historias
// CON ESTADO CORRECTO DE OCULTAR/MOSTRAR RESPUESTAS
// Y FUNCIONES DE CACHÉ PARA EVITAR DUPLICADOS
// VERSIÓN CORREGIDA - CON CONTEO RECURSIVO DE RESPUESTAS
// Y ELIMINACIÓN POR DUEÑO DE HISTORIA
// 🔥 SOPORTE PARA SUBIR ARCHIVOS (SOLO DUEÑO DE HISTORIA)
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

function renderCommentFile(comment) {
    if (!comment.hasFile || !comment.fileUrl) return '';
    
    const icon = getFileIcon(comment.mimetype);
    const size = comment.fileSizeFormatted || formatFileSize(comment.fileSize || 0);
    const isImage = comment.mimetype?.startsWith('image/');
    
    if (isImage) {
        return `
            <div class="comment-file" style="margin-top:6px;">
                <img src="${comment.fileUrl}" alt="Adjunto" 
                     style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.05);"
                     onclick="event.stopPropagation(); window.openImagePreview('${comment.fileUrl}')" />
            </div>
        `;
    }
    
    return `
        <div class="comment-file" style="margin-top:6px;">
            <a href="${comment.fileUrl}" target="_blank" class="message-file" download
               style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;text-decoration:none;color:rgba(255,255,255,0.8);max-width:220px;transition:all 0.2s;">
                <span class="file-icon" style="font-size:22px;color:#c084fc;">${icon}</span>
                <span class="file-info" style="flex:1;min-width:0;">
                    <span class="file-name" style="font-size:11px;font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(comment.originalName || comment.filename || 'Archivo')}</span>
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
// RENDER COMENTARIOS
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
                    <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;margin-top:8px;">
                        <input type="text" class="reply-input" id="replyInput-${comment.id}" 
                               placeholder="Escribe una respuesta..." maxlength="500" />
                        <button class="reply-send-btn" onclick="window.handleReplySubmit('${storyId}', '${comment.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    ${hasReplies ? renderFlatReplies(comment.replies, storyId, currentUserId, comment.id, comments, highlightCommentId, isExpanded, storyOwnerId) : ''}
                    ${hasReplies ? `
                        <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
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
        updateCommentsUIWithoutReload(storyId);
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
    formatFileSize
};