// ============================================================
// story-comments.js - Sistema de comentarios para historias
// CON ESTADO CORRECTO DE OCULTAR/MOSTRAR RESPUESTAS
// VERSIÓN CORREGIDA - CON CACHÉ CON EXPIRACIÓN
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO DE COMENTARIOS
// ============================================================

let commentsCache = new Map(); // storyId -> { comments, timestamp }
let commentLikes = new Map(); // commentId -> Set de userIds
let repliesVisibility = new Map(); // commentId -> boolean (true = visible, false = oculto)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de expiración

// ============================================================
// FUNCIÓN PARA BUSCAR COMENTARIO POR ID (RECURSIVA)
// ============================================================

function findCommentById(comments, commentId) {
    if (!comments) return null;
    
    for (const comment of comments) {
        if (comment.id === commentId) {
            return comment;
        }
        if (comment.replies && comment.replies.length > 0) {
            const found = findCommentById(comment.replies, commentId);
            if (found) return found;
        }
    }
    return null;
}

// ============================================================
// FUNCIÓN PARA OBTENER EL COMENTARIO PADRE (RECURSIVA)
// ============================================================

function findParentComment(comments, commentId, parent = null) {
    if (!comments) return null;
    
    for (const comment of comments) {
        if (comment.id === commentId) {
            return parent;
        }
        if (comment.replies && comment.replies.length > 0) {
            const result = findParentComment(comment.replies, commentId, comment);
            if (result !== null) return result;
        }
    }
    return null;
}

// ============================================================
// FUNCIÓN PARA OBTENER LA CADENA DE PADRES (PARA EXPANDIR)
// ============================================================

function getParentChain(comments, commentId, chain = []) {
    if (!comments) return null;
    
    for (const comment of comments) {
        if (comment.id === commentId) {
            return chain;
        }
        if (comment.replies && comment.replies.length > 0) {
            const newChain = [...chain, comment.id];
            const result = getParentChain(comment.replies, commentId, newChain);
            if (result) return result;
        }
    }
    return null;
}

// ============================================================
// 🔥 CONTAR TODOS LOS COMENTARIOS (INCLUYENDO RESPUESTAS ANIDADAS)
// ============================================================

export function getTotalCommentsCount(storyId) {
    const cached = commentsCache.get(storyId);
    if (!cached) return 0;
    
    const comments = cached.comments;
    let total = 0;
    
    // Función recursiva para contar comentarios y respuestas
    function countComments(items) {
        if (!items || items.length === 0) return;
        
        for (const item of items) {
            total++; // Contar este comentario/respuesta
            if (item.replies && item.replies.length > 0) {
                countComments(item.replies); // Contar respuestas anidadas
            }
        }
    }
    
    countComments(comments);
    return total;
}

// ============================================================
// EXPORTAR getTotalCommentsCount GLOBALMENTE
// ============================================================

window.getTotalCommentsCount = getTotalCommentsCount;

// ============================================================
// CARGAR COMENTARIOS (CON CACHÉ CON EXPIRACIÓN)
// ============================================================

export async function loadComments(storyId, forceReload = false) {
    if (!storyId) return [];

    const token = getToken();
    if (!token) return [];

    if (forceReload && commentsCache.has(storyId)) {
        console.log('🔄 [COMMENTS] Forzando recarga, eliminando caché');
        commentsCache.delete(storyId);
    }

    if (commentsCache.has(storyId)) {
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
            }
        });
        
        commentsCache.set(storyId, {
            comments: comments,
            timestamp: Date.now()
        });
        
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(comment.id, false);
            }
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
// AGREGAR COMENTARIO - CORREGIDO (SIN DUPLICADOS)
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
        
        if (commentsCache.has(storyId)) {
            const cached = commentsCache.get(storyId);
            const comments = cached.comments;
            
            if (parentCommentId) {
                const parentComment = findCommentById(comments, parentCommentId);
                if (parentComment) {
                    if (!parentComment.replies) parentComment.replies = [];
                    parentComment.replies.push(newComment);
                    parentComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    repliesVisibility.set(parentCommentId, true);
                }
            } else {
                comments.unshift(newComment);
            }
            commentsCache.set(storyId, {
                comments: comments,
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

        if (commentsCache.has(storyId)) {
            const cached = commentsCache.get(storyId);
            const comments = cached.comments;
            
            if (parentCommentId) {
                const parentComment = findCommentById(comments, parentCommentId);
                if (parentComment && parentComment.replies) {
                    parentComment.replies = parentComment.replies.filter(r => r.id !== commentId);
                }
            } else {
                const filtered = comments.filter(c => c.id !== commentId);
                commentsCache.set(storyId, {
                    comments: filtered,
                    timestamp: Date.now()
                });
            }
        }

        updateCommentsUI(storyId);

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

export async function likeComment(storyId, commentId) {
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
        
        const currentUserId = getCurrentUser()?.id;
        if (commentLikes.has(commentId)) {
            const likes = commentLikes.get(commentId);
            if (data.liked) {
                likes.add(currentUserId);
            } else {
                likes.delete(currentUserId);
            }
        } else {
            const newSet = new Set();
            if (data.liked) newSet.add(currentUserId);
            commentLikes.set(commentId, newSet);
        }

        updateCommentsUI(storyId);

        showToast(data.liked ? '❤️ Like al comentario' : '💔 Like eliminado');
        return data.liked;

    } catch (error) {
        console.error('Error liking comment:', error);
        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// ACTUALIZAR UI DE COMENTARIOS LOCALMENTE
// ============================================================

function updateCommentsUI(storyId) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const currentUser = getCurrentUser();
    const cached = commentsCache.get(storyId);
    const comments = cached ? cached.comments : [];
    
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
// FUNCIÓN PARA APLANAR RESPUESTAS (TODAS EN EL MISMO NIVEL)
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
// RENDER COMENTARIOS PRINCIPALES
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
        const isExpanded = repliesVisibility.get(comment.id) || false;
        
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
                                data-comment-id="${comment.id}"
                                onclick="window.handleCommentLike('${storyId}', '${comment.id}')">
                            <i class="fas fa-heart"></i> <span>${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${comment.id}')">
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

function renderFlatReplies(replies, storyId, currentUserId, parentCommentId, allComments, highlightCommentId = null, isExpanded = false) {
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
                                onclick="window.handleCommentLike('${storyId}', '${reply.id}')"
                                style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                            <i class="fas fa-heart" style="font-size:10px;color:${isLiked ? '#ff6b6b' : 'inherit'};"></i> <span>${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
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
// FUNCIONES GLOBALES PARA EL MODAL
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    const liked = await likeComment(storyId, commentId);
    if (liked !== false) {
        updateCommentsUI(storyId);
    }
    return liked;
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
            if (input) {
                input.focus();
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
    
    const newReply = await addComment(storyId, content, parentCommentId);
    if (newReply) {
        input.value = '';
        const container = document.getElementById(`reply-input-${parentCommentId}`);
        if (container) container.style.display = 'none';
        updateCommentsUI(storyId);
    }
};

// ============================================================
// TOGGLE VISIBILIDAD DE RESPUESTAS
// ============================================================

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
// INICIALIZAR COMENTARIOS EN MODAL - CORREGIDO
// ============================================================

export async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null, forceReload = false) {
    if (!storyId) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;

    if (!forceReload && commentsCache.has(storyId)) {
        const cached = commentsCache.get(storyId);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log('📦 [COMMENTS] Usando caché para renderizar');
            const comments = cached.comments;
            const currentUser = getCurrentUser();
            renderComments(comments, storyId, currentUser?.id, container, highlightCommentId);
            return;
        }
    }

    console.log('🌐 [COMMENTS] Recargando comentarios desde servidor (forceReload=true)');
    const comments = await loadComments(storyId, true);
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
        const sendComment = async () => {
            const content = input.value.trim();
            if (!content) return;

            sendBtn.disabled = true;
            const newComment = await addComment(storyId, content);
            if (newComment) {
                input.value = '';
            }
            sendBtn.disabled = false;
        };

        sendBtn.onclick = sendComment;
        input.onkeydown = (e) => {
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
// EXPORTAR FUNCIÓN PARA EXPANDIR RESPUESTAS DESDE NOTIFICACIONES
// ============================================================

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
        updateCommentsUI(window._currentStoryId);
    }
}