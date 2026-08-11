// ============================================================
// story-comments.js - Sistema de comentarios para historias
// VERSIÓN COMPLETA CORREGIDA - SIN RE-RENDERS AL PUBLICAR
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
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================
// FUNCIONES AUXILIARES
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
// CONTAR TODOS LOS COMENTARIOS (INCLUYENDO RESPUESTAS ANIDADAS)
// ============================================================

export function getTotalCommentsCount(storyId) {
    const comments = getCachedComments(storyId);
    if (!comments || comments.length === 0) return 0;
    
    let total = 0;
    function countComments(items) {
        if (!items || items.length === 0) return;
        for (const item of items) {
            total++;
            if (item.replies && item.replies.length > 0) {
                countComments(item.replies);
            }
        }
    }
    countComments(comments);
    return total;
}

// ============================================================
// OBTENER COMENTARIOS DEL CACHÉ
// ============================================================

export function getCachedComments(storyId) {
    if (commentsCache.has(storyId)) {
        const cached = commentsCache.get(storyId);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached.comments;
        } else {
            commentsCache.delete(storyId);
        }
    }
    return null;
}

// ============================================================
// AGREGAR COMENTARIO AL CACHÉ
// ============================================================

export function addCommentToCache(storyId, comment) {
    const cached = getCachedComments(storyId);
    if (cached) {
        cached.unshift(comment);
        commentsCache.set(storyId, {
            comments: cached,
            timestamp: Date.now()
        });
    } else {
        commentsCache.set(storyId, {
            comments: [comment],
            timestamp: Date.now()
        });
    }
}

// ============================================================
// CARGAR COMENTARIOS (CON CACHÉ CON EXPIRACIÓN)
// ============================================================

export async function loadComments(storyId, forceReload = false) {
    if (!storyId) return [];
    const token = getToken();
    if (!token) return [];

    if (!forceReload && commentsCache.has(storyId)) {
        const cached = commentsCache.get(storyId);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`📦 [COMMENTS] Usando caché (${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
            return cached.comments;
        } else {
            console.log('⏰ [COMMENTS] Caché expirada, recargando...');
            commentsCache.delete(storyId);
        }
    }

    try {
        console.log('🌐 [COMMENTS] Cargando comentarios desde servidor');
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
                if (item.replies && item.replies.length > 0) {
                    sortReplies(item.replies);
                }
            });
        };
        
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                sortReplies(comment.replies);
                repliesVisibility.set(comment.id, true);
            }
        });
        
        commentsCache.set(storyId, {
            comments: comments,
            timestamp: Date.now()
        });
        
        comments.forEach(comment => {
            if (comment.likes) {
                commentLikes.set(comment.id, new Set(comment.likes));
            }
            if (comment.replies) {
                comment.replies.forEach(reply => {
                    if (reply.likes) {
                        commentLikes.set(reply.id, new Set(reply.likes));
                    }
                    if (reply.replies && reply.replies.length > 0) {
                        repliesVisibility.set(reply.id, true);
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
// AGREGAR COMENTARIO AL SERVIDOR
// ============================================================

export async function addComment(storyId, content, parentCommentId = null) {
    if (!storyId || !content || content.trim().length === 0) {
        showToast('Escribe un comentario', true);
        return null;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para comentar', true);
        return null;
    }

    if (content.length > 500) {
        showToast('Máximo 500 caracteres', true);
        return null;
    }

    try {
        let url = `${API_URL}/api/stories/${storyId}/comments`;
        let body = { content: content.trim() };
        
        if (parentCommentId) {
            url = `${API_URL}/api/stories/${storyId}/comments/${parentCommentId}/replies`;
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
        
        const cached = getCachedComments(storyId);
        if (cached) {
            if (parentCommentId) {
                const parentComment = findCommentById(cached, parentCommentId);
                if (parentComment) {
                    if (!parentComment.replies) parentComment.replies = [];
                    parentComment.replies.push(newComment);
                    parentComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    repliesVisibility.set(parentCommentId, true);
                }
            } else {
                cached.unshift(newComment);
            }
            commentsCache.set(storyId, {
                comments: cached,
                timestamp: Date.now()
            });
        }

        const socket = window.socket;
        if (socket) {
            socket.emit('new_comment', {
                storyId: storyId,
                comment: newComment,
                parentCommentId: parentCommentId
            });
        }

        showToast(parentCommentId ? '💬 Respuesta agregada' : '💬 Comentario agregado');
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

export async function deleteComment(storyId, commentId, parentCommentId = null) {
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

        const cached = getCachedComments(storyId);
        if (cached) {
            if (parentCommentId) {
                const parentComment = findCommentById(cached, parentCommentId);
                if (parentComment && parentComment.replies) {
                    parentComment.replies = parentComment.replies.filter(r => r.id !== commentId);
                }
            } else {
                const filtered = cached.filter(c => c.id !== commentId);
                commentsCache.set(storyId, {
                    comments: filtered,
                    timestamp: Date.now()
                });
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
// DAR LIKE A COMENTARIO - VERSIÓN OPTIMISTA
// ============================================================

export async function likeComment(storyId, commentId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return false;
    }

    const currentUserId = getCurrentUser()?.id;
    if (!currentUserId) {
        showToast('Inicia sesión para dar like', true);
        return false;
    }

    let previousState = {
        isLiked: false,
        likesCount: 0,
        likesSet: null
    };

    if (commentLikes.has(commentId)) {
        const likesSet = commentLikes.get(commentId);
        previousState.isLiked = likesSet.has(currentUserId);
        previousState.likesCount = likesSet.size;
        previousState.likesSet = new Set(likesSet);
    }

    const newLikedState = !previousState.isLiked;
    const newLikesCount = newLikedState ? previousState.likesCount + 1 : Math.max(0, previousState.likesCount - 1);

    if (commentLikes.has(commentId)) {
        const likesSet = commentLikes.get(commentId);
        if (newLikedState) {
            likesSet.add(currentUserId);
        } else {
            likesSet.delete(currentUserId);
        }
    } else {
        const newSet = new Set();
        if (newLikedState) newSet.add(currentUserId);
        commentLikes.set(commentId, newSet);
    }

    updateCommentLikeUI(commentId, newLikedState, newLikesCount);

    const cached = getCachedComments(storyId);
    if (cached) {
        const comment = findCommentById(cached, commentId);
        if (comment) {
            if (!comment.likes) comment.likes = [];
            if (newLikedState) {
                if (!comment.likes.includes(currentUserId)) {
                    comment.likes.push(currentUserId);
                }
            } else {
                comment.likes = comment.likes.filter(id => id !== currentUserId);
            }
            commentsCache.set(storyId, {
                comments: cached,
                timestamp: Date.now()
            });
        }
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();

        if (res.ok) {
            const serverLiked = data.liked || false;
            const serverLikesCount = data.likesCount || 0;
            const serverLikes = data.likes || [];
            
            const serverLikesSet = new Set(serverLikes);
            commentLikes.set(commentId, serverLikesSet);
            
            updateCommentLikeUI(commentId, serverLiked, serverLikesCount);
            
            const cached2 = getCachedComments(storyId);
            if (cached2) {
                const comment2 = findCommentById(cached2, commentId);
                if (comment2) {
                    comment2.likes = serverLikes;
                    commentsCache.set(storyId, {
                        comments: cached2,
                        timestamp: Date.now()
                    });
                }
            }

            showToast(serverLiked ? '❤️ Like' : '💔 Like quitado');
            return serverLiked;
        } else {
            if (previousState.likesSet) {
                commentLikes.set(commentId, previousState.likesSet);
            } else {
                commentLikes.delete(commentId);
            }
            
            updateCommentLikeUI(commentId, previousState.isLiked, previousState.likesCount);
            
            const cached3 = getCachedComments(storyId);
            if (cached3) {
                const comment3 = findCommentById(cached3, commentId);
                if (comment3) {
                    if (previousState.isLiked) {
                        if (!comment3.likes.includes(currentUserId)) {
                            comment3.likes.push(currentUserId);
                        }
                    } else {
                        comment3.likes = comment3.likes.filter(id => id !== currentUserId);
                    }
                    commentsCache.set(storyId, {
                        comments: cached3,
                        timestamp: Date.now()
                    });
                }
            }
            
            showToast(data.error || 'Error al dar like', true);
            return false;
        }
    } catch (error) {
        console.error('Error en like:', error);
        
        if (previousState.likesSet) {
            commentLikes.set(commentId, previousState.likesSet);
        } else {
            commentLikes.delete(commentId);
        }
        
        updateCommentLikeUI(commentId, previousState.isLiked, previousState.likesCount);
        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// ACTUALIZAR UI DE UN SOLO LIKE (SIN RECARGAR TODO)
// ============================================================

function updateCommentLikeUI(commentId, isLiked, likesCount) {
    const elements = document.querySelectorAll(`.comment-item[data-comment-id="${commentId}"], .comment-item[data-reply-id="${commentId}"]`);
    
    elements.forEach(element => {
        const likeBtn = element.querySelector('.btn-like-comment');
        if (likeBtn) {
            likeBtn.classList.toggle('liked', isLiked);
            
            const icon = likeBtn.querySelector('i');
            if (icon) {
                icon.style.color = isLiked ? '#ff6b6b' : '';
            }
            
            const span = likeBtn.querySelector('.like-count');
            if (span) {
                span.textContent = formatNumber(likesCount);
            }
        }
    });
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
            contextText = `Respondiste`;
            contextColor = 'rgba(52,211,153,0.6)';
        }
        isTarget = false;
    } else if (replyToUserId && replyToUserId === currentUserId) {
        contextText = `Te respondió`;
        contextColor = 'rgba(192,132,252,0.7)';
        isTarget = true;
    } else if (replyToUserId) {
        contextText = `Respondió a @${replyToName}`;
        contextColor = 'rgba(255,255,255,0.25)';
        isTarget = false;
    } else if (parentAuthorId && parentAuthorId !== currentUserId) {
        contextText = `Respondió a @${parentAuthorName}`;
        contextColor = 'rgba(255,255,255,0.25)';
        isTarget = false;
    } else {
        contextText = `Respondió`;
        contextColor = 'rgba(255,255,255,0.15)';
        isTarget = false;
    }
    
    return {
        text: contextText,
        color: contextColor,
        isTarget: isTarget,
        targetName: replyToName
    };
}

// ============================================================
// FUNCIÓN PARA APLANAR RESPUESTAS
// ============================================================

function flattenReplies(replies, allComments, parentId) {
    if (!replies || replies.length === 0) return [];
    
    let result = [];
    
    replies.forEach(reply => {
        result.push({
            ...reply,
            _parentId: parentId
        });
        
        if (reply.replies && reply.replies.length > 0) {
            const nested = flattenReplies(reply.replies, allComments, reply.id);
            result = result.concat(nested);
        }
    });
    
    return result;
}

// ============================================================
// RENDER COMENTARIOS PRINCIPALES - CON RESPUESTAS SIEMPRE VISIBLES
// ============================================================

export function renderComments(comments, storyId, currentUserId, container, highlightCommentId = null) {
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

    let html = '';
    comments.forEach(comment => {
        const cachedLikes = commentLikes.get(comment.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (comment.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (comment.likes?.length || 0);
        const isOwn = comment.userId === currentUserId;
        const hasReplies = comment.replies && comment.replies.length > 0;
        const replyCount = comment.replies?.length || 0;
        const isExpanded = repliesVisibility.get(comment.id) !== false;
        
        const isHighlighted = highlightCommentId && comment.id === highlightCommentId;

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
                    </div>
                    <div class="comment-text" style="font-size:16px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(comment.content)}</div>
                    <div class="comment-meta">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                data-comment-id="${comment.id}">
                            <i class="fas fa-heart" style="color:${isLiked ? '#ff6b6b' : 'inherit'};"></i> <span class="like-count">${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" data-comment-id="${comment.id}">
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        ${isOwn ? `
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
                    
                    ${hasReplies ? renderFlatReplies(comment.replies, storyId, currentUserId, comment.id, comments, highlightCommentId, isExpanded) : ''}
                    
                    ${hasReplies ? `
                        <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i> 
                            ${isExpanded ? `Ocultar ${replyCount} respuestas` : `Ver ${replyCount} respuestas`}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================
// RENDER RESPUESTAS - TODAS EN EL MISMO NIVEL (APLANADAS)
// ============================================================

function renderFlatReplies(replies, storyId, currentUserId, parentCommentId, allComments, highlightCommentId = null, isExpanded = true) {
    if (!replies || replies.length === 0) return '';

    const flatReplies = flattenReplies(replies, allComments, parentCommentId);
    
    if (flatReplies.length === 0) return '';

    if (!isExpanded) return '';

    let html = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;">`;
    
    flatReplies.forEach((reply) => {
        const cachedLikes = commentLikes.get(reply.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (reply.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (reply.likes?.length || 0);
        const isOwn = reply.userId === currentUserId;
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
                    </div>
                    ${contextHtml}
                    <div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>
                    <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                data-comment-id="${reply.id}"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                            <i class="fas fa-heart" style="font-size:10px;color:${isLiked ? '#ff6b6b' : 'inherit'};"></i> <span class="like-count">${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" data-comment-id="${reply.id}"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                            <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                        </button>
                        ${isOwn ? `
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
// 🔥 AÑADIR COMENTARIO A LA UI - INSERCIÓN LOCAL (SIN RE-RENDER)
// ============================================================

export function addCommentToUI(comment) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) {
        console.warn('⚠️ commentsList no encontrado en el DOM');
        return false;
    }

    const existingComment = commentsList.querySelector(`[data-comment-id="${comment.id}"]`);
    if (existingComment) {
        console.log('⚠️ Comentario ya existe en la UI, omitiendo duplicado');
        return true;
    }

    const noComments = commentsList.querySelector('.no-comments');
    if (noComments) {
        noComments.remove();
    }

    const isTemp = comment._isTemp || false;
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.setAttribute('data-comment-id', comment.id);
    if (isTemp) {
        div.setAttribute('data-temp-id', comment.id);
        div.style.opacity = '0.6';
        div.style.borderLeft = '2px solid rgba(192,132,252,0.3)';
    }
    
    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

    div.innerHTML = `
        <img class="avatar" src="${comment.avatar || userAvatar}" alt="${comment.fullName}" onclick="window.goToProfileUser('${comment.userId}')" />
        <div class="comment-body">
            <div class="comment-user" onclick="window.goToProfileUser('${comment.userId}')">
                ${escapeHtml(comment.fullName)}
                <span class="handle">@${comment.username || 'usuario'}</span>
                <span class="time">${formatDate(comment.createdAt)}</span>
                ${isTemp ? '<span style="font-size:10px;color:rgba(192,132,252,0.5);margin-left:8px;">⏳ Enviando...</span>' : ''}
            </div>
            <div class="comment-text">${escapeHtml(comment.content)}</div>
            <div class="comment-meta">
                <button class="btn-like-comment" data-comment-id="${comment.id}">
                    <i class="fas fa-heart"></i> <span class="like-count">0</span>
                </button>
                <button class="btn-reply-comment" data-comment-id="${comment.id}">
                    <i class="fas fa-reply"></i> Responder
                </button>
            </div>
            <div class="replies" id="replies-${comment.id}"></div>
            <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;">
                <input type="text" class="reply-input" id="replyInput-${comment.id}" placeholder="Escribe una respuesta..." maxlength="500" />
                <button class="reply-send-btn" data-comment-id="${comment.id}">Enviar</button>
            </div>
        </div>
    `;

    commentsList.insertBefore(div, commentsList.firstChild);
    console.log('✅ Comentario añadido a la UI:', comment.id);
    return true;
}

// ============================================================
// 🔥 AÑADIR RESPUESTA A LA UI - INSERCIÓN LOCAL (SIN RE-RENDER)
// ============================================================

export function addReplyToUI(storyId, parentCommentId, reply) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return false;

    const repliesContainer = document.getElementById(`replies-${parentCommentId}`);
    if (!repliesContainer) {
        console.warn('⚠️ Contenedor de respuestas no encontrado para:', parentCommentId);
        return false;
    }

    const existingReply = repliesContainer.querySelector(`[data-reply-id="${reply.id}"]`);
    if (existingReply) {
        console.log('⚠️ Respuesta ya existe, omitiendo duplicado');
        return true;
    }

    const isTemp = reply._isTemp || false;
    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

    const cachedComments = getCachedComments(storyId);
    const context = getReplyContext(reply, currentUser?.id, parentCommentId, cachedComments || []);

    const div = document.createElement('div');
    div.className = 'comment-item reply-item';
    div.setAttribute('data-reply-id', reply.id);
    if (isTemp) {
        div.setAttribute('data-temp-id', reply.id);
        div.style.opacity = '0.6';
        div.style.borderLeft = '2px solid rgba(192,132,252,0.3)';
    }

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

    div.innerHTML = `
        <img class="avatar" src="${reply.avatar || userAvatar}" 
             alt="${reply.fullName}" 
             style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
             onclick="window.goToProfileUser('${reply.userId}')" />
        <div class="comment-body" style="flex:1;min-width:0;">
            <div class="comment-user" onclick="window.goToProfileUser('${reply.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                <span style="font-weight:600;color:#fff;">${escapeHtml(reply.fullName)}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(reply.username)}</span>
                <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(reply.createdAt)}</span>
                ${isTemp ? '<span style="font-size:10px;color:rgba(192,132,252,0.5);margin-left:8px;">⏳ Enviando...</span>' : ''}
            </div>
            ${contextHtml}
            <div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>
            <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                <button class="btn-like-comment" 
                        data-comment-id="${reply.id}"
                        style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                    <i class="fas fa-heart" style="font-size:10px;"></i> <span class="like-count">0</span>
                </button>
                <button class="btn-reply-comment" data-comment-id="${reply.id}"
                        style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                    <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                </button>
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
    `;

    repliesContainer.appendChild(div);
    console.log('✅ Respuesta añadida a la UI:', reply.id);
    return true;
}

// ============================================================
// 🔥 REEMPLAZAR COMENTARIO TEMPORAL CON REAL
// ============================================================

export function replaceTempComment(storyId, tempId, realComment) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return false;

    const tempElement = commentsList.querySelector(`[data-temp-id="${tempId}"]`);
    if (!tempElement) {
        console.warn('⚠️ Elemento temporal no encontrado:', tempId);
        return false;
    }

    const div = document.createElement('div');
    div.className = 'comment-item';
    div.setAttribute('data-comment-id', realComment.id);
    
    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

    div.innerHTML = `
        <img class="avatar" src="${realComment.avatar || userAvatar}" alt="${realComment.fullName}" onclick="window.goToProfileUser('${realComment.userId}')" />
        <div class="comment-body">
            <div class="comment-user" onclick="window.goToProfileUser('${realComment.userId}')">
                ${escapeHtml(realComment.fullName)}
                <span class="handle">@${realComment.username || 'usuario'}</span>
                <span class="time">${formatDate(realComment.createdAt)}</span>
            </div>
            <div class="comment-text">${escapeHtml(realComment.content)}</div>
            <div class="comment-meta">
                <button class="btn-like-comment" data-comment-id="${realComment.id}">
                    <i class="fas fa-heart"></i> <span class="like-count">0</span>
                </button>
                <button class="btn-reply-comment" data-comment-id="${realComment.id}">
                    <i class="fas fa-reply"></i> Responder
                </button>
            </div>
            <div class="replies" id="replies-${realComment.id}"></div>
            <div class="reply-input-container" id="reply-input-${realComment.id}" style="display:none;">
                <input type="text" class="reply-input" id="replyInput-${realComment.id}" placeholder="Escribe una respuesta..." maxlength="500" />
                <button class="reply-send-btn" data-comment-id="${realComment.id}">Enviar</button>
            </div>
        </div>
    `;

    tempElement.replaceWith(div);
    console.log('✅ Comentario temporal reemplazado por real:', tempId, '→', realComment.id);
    return true;
}

// ============================================================
// 🔥 REEMPLAZAR RESPUESTA TEMPORAL CON REAL
// ============================================================

export function replaceTempReply(storyId, tempId, realReply) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return false;

    const tempElement = commentsList.querySelector(`[data-temp-id="${tempId}"]`);
    if (!tempElement) {
        console.warn('⚠️ Respuesta temporal no encontrada:', tempId);
        return false;
    }

    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

    const div = document.createElement('div');
    div.className = 'comment-item reply-item';
    div.setAttribute('data-reply-id', realReply.id);

    const parentCommentId = tempElement.closest('.replies')?.id?.replace('replies-', '') || null;
    const cachedComments = getCachedComments(storyId);
    const context = getReplyContext(realReply, currentUser?.id, parentCommentId, cachedComments || []);

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

    div.innerHTML = `
        <img class="avatar" src="${realReply.avatar || userAvatar}" 
             alt="${realReply.fullName}" 
             style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
             onclick="window.goToProfileUser('${realReply.userId}')" />
        <div class="comment-body" style="flex:1;min-width:0;">
            <div class="comment-user" onclick="window.goToProfileUser('${realReply.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                <span style="font-weight:600;color:#fff;">${escapeHtml(realReply.fullName)}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(realReply.username)}</span>
                <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(realReply.createdAt)}</span>
            </div>
            ${contextHtml}
            <div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(realReply.content)}</div>
            <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                <button class="btn-like-comment" 
                        data-comment-id="${realReply.id}"
                        style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                    <i class="fas fa-heart" style="font-size:10px;"></i> <span class="like-count">0</span>
                </button>
                <button class="btn-reply-comment" data-comment-id="${realReply.id}"
                        style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                    <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                </button>
            </div>
            <div class="reply-input-container" id="reply-input-${realReply.id}" style="display:none;margin-top:6px;">
                <input type="text" class="reply-input" id="replyInput-${realReply.id}" 
                       placeholder="Escribe una respuesta..." maxlength="500"
                       style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:6px 12px;font-size:13px;color:#fff;outline:none;" />
                <button class="reply-send-btn" onclick="window.handleReplySubmit('${storyId}', '${realReply.id}')"
                        style="background:rgba(192,132,252,0.15);border:1px solid rgba(192,132,252,0.2);border-radius:12px;color:#c084fc;padding:6px 14px;font-size:12px;cursor:pointer;transition:all 0.2s;">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    tempElement.replaceWith(div);
    console.log('✅ Respuesta temporal reemplazada por real:', tempId, '→', realReply.id);
    return true;
}

// ============================================================
// 🔥 ACTUALIZAR CONTADOR DE COMENTARIOS EN LA UI
// ============================================================

export function updateCommentCounter(storyId) {
    const total = getTotalCommentsCount(storyId);
    
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) {
        commentsEl.textContent = formatNumber(total);
    }
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) {
        commentsCountEl.textContent = formatNumber(total);
    }
}

// ============================================================
// INICIALIZAR COMENTARIOS EN MODAL
// ============================================================

export async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null, forceReload = false) {
    if (!storyId) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;

    container.innerHTML = `
        <div class="no-comments">
            <i class="fas fa-spinner fa-pulse"></i>
            <span>Cargando comentarios...</span>
        </div>
    `;

    const comments = await loadComments(storyId, forceReload);
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

    const input = document.getElementById('commentInput');
    const sendBtn = document.getElementById('sendCommentBtn');

    if (input && sendBtn) {
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        const finalInput = document.getElementById('commentInput');
        const finalSendBtn = document.getElementById('sendCommentBtn');
        
        const sendComment = async () => {
            const content = finalInput.value.trim();
            if (!content) return;

            finalSendBtn.disabled = true;
            const newComment = await addComment(storyId, content);
            if (newComment) {
                finalInput.value = '';
            }
            finalSendBtn.disabled = false;
        };

        finalSendBtn.onclick = sendComment;
        finalInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendComment();
            }
        };
    }
    
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
// FUNCIONES GLOBALES PARA EL MODAL
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    const allButtons = document.querySelectorAll(`.btn-like-comment[data-comment-id="${commentId}"]`);
    let targetBtn = null;
    for (const btn of allButtons) {
        if (btn.dataset.commentId === commentId) {
            targetBtn = btn;
            break;
        }
    }
    if (targetBtn && targetBtn.classList.contains('processing')) return;
    if (targetBtn) targetBtn.classList.add('processing');
    
    try {
        const result = await likeComment(storyId, commentId);
        return result;
    } catch (error) {
        console.error('Error en like:', error);
        return false;
    } finally {
        if (targetBtn) {
            setTimeout(() => targetBtn.classList.remove('processing'), 300);
        }
    }
};

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const success = await deleteComment(storyId, commentId, parentCommentId);
    if (success) {
        const container = document.getElementById('commentsList');
        if (container) {
            const currentUser = getCurrentUser();
            const comments = getCachedComments(storyId);
            if (comments) {
                renderComments(comments, storyId, currentUser?.id, container);
            }
        }
    }
};

window.toggleReplyInput = function(storyId, commentId) {
    document.querySelectorAll('.reply-input-container').forEach(el => {
        if (el.id !== `reply-input-${commentId}`) {
            el.style.display = 'none';
            const input = el.querySelector('input');
            if (input) input.value = '';
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
            if (input) {
                input.focus();
                if ('ontouchstart' in window) {
                    input.click();
                    setTimeout(() => input.focus(), 100);
                }
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
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
    
    if (input.disabled) return;
    input.disabled = true;
    
    const sendBtn = input.parentElement?.querySelector('.reply-send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
    }
    
    try {
        const newReply = await addComment(storyId, content, parentCommentId);
        if (newReply) {
            input.value = '';
            const container = document.getElementById(`reply-input-${parentCommentId}`);
            if (container) container.style.display = 'none';
            
            const commentsContainer = document.getElementById('commentsList');
            if (commentsContainer) {
                const currentUser = getCurrentUser();
                const comments = getCachedComments(storyId);
                if (comments) {
                    renderComments(comments, storyId, currentUser?.id, commentsContainer);
                }
            }
        }
    } catch (error) {
        console.error('Error enviando respuesta:', error);
        showToast('Error al enviar respuesta', true);
    } finally {
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
};

window.toggleRepliesVisibility = function(commentId) {
    const currentState = repliesVisibility.get(commentId) !== false;
    const newState = !currentState;
    repliesVisibility.set(commentId, newState);
    
    const container = document.getElementById('commentsList');
    if (container) {
        const storyId = container.dataset.storyId || window._currentStoryId;
        if (storyId) {
            const currentUser = getCurrentUser();
            const comments = getCachedComments(storyId);
            if (comments) {
                renderComments(comments, storyId, currentUser?.id, container);
            }
        }
    }
};

export function expandRepliesForComment(commentId) {
    if (!commentId) return;
    
    let found = false;
    for (const [storyId, cached] of commentsCache) {
        const comments = cached.comments;
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
                const currentUser = getCurrentUser();
                const comments = getCachedComments(storyId);
                if (comments) {
                    renderComments(comments, storyId, currentUser?.id, container);
                }
            }
        }
    }
}

export { repliesVisibility };