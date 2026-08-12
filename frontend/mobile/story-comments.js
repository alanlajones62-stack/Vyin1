// ============================================================
// story-comments.js - Sistema de comentarios para historias
// VERSIÓN CORREGIDA: SIN RE-RENDER, SIN DUPLICADOS
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

// ============================================================
// 🔥 ESTADO LOCAL (SOLO PARA EL MODAL ACTUAL)
// ============================================================

let localComments = [];
let localCommentLikes = {}; // commentId -> Set de userIds
let localRepliesVisibility = {}; // commentId -> boolean

// ============================================================
// 🔥 FUNCIONES AUXILIARES
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
// 🔥 LOAD COMMENTS (PARA COMPATIBILIDAD CON story-modal.js)
// ============================================================

export async function loadComments(storyId, forceReload = false) {
    if (!storyId) return localComments;
    
    // Si ya tenemos comentarios locales y no forzamos recarga
    if (localComments && localComments.length > 0 && !forceReload) {
        return localComments;
    }
    
    const token = getToken();
    if (!token) return [];

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Error loading comments');

        const comments = await res.json();
        localComments = comments;
        return comments;
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

// ============================================================
// 🔥 RENDER COMENTARIOS (SOLO CUANDO SE ABRE EL MODAL)
// ============================================================

export function renderComments(comments, container, currentUserId, highlightCommentId = null) {
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
        const isLiked = localCommentLikes[comment.id]?.has(currentUserId) || false;
        const likesCount = localCommentLikes[comment.id]?.size || comment.likes?.length || 0;
        const isOwn = comment.userId === currentUserId;
        const hasReplies = comment.replies && comment.replies.length > 0;
        const replyCount = comment.replies?.length || 0;
        const isExpanded = localRepliesVisibility[comment.id] || false;
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
                    <div class="comment-text">${escapeHtml(comment.content)}</div>
                    <div class="comment-meta">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                onclick="window.handleCommentLike('${comment.id}')">
                            <i class="fas fa-heart"></i> <span class="like-count">${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${comment.id}')">
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        ${isOwn ? `
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${comment.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;margin-top:8px;">
                        <input type="text" class="reply-input" id="replyInput-${comment.id}" 
                               placeholder="Escribe una respuesta..." maxlength="500" />
                        <button class="reply-send-btn" onclick="window.handleReplySubmit('${comment.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    
                    ${hasReplies ? renderRepliesHTML(comment.replies, currentUserId, comment.id, highlightCommentId) : ''}
                    
                    ${hasReplies ? `
                        <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${comment.id}')" 
                             style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
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
// 🔥 GENERAR HTML DE RESPUESTAS
// ============================================================

function renderRepliesHTML(replies, currentUserId, parentCommentId, highlightCommentId = null) {
    if (!replies || replies.length === 0) return '';

    const isExpanded = localRepliesVisibility[parentCommentId] || false;
    
    if (!isExpanded) return '';

    let html = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;">`;
    
    replies.forEach(reply => {
        const isLiked = localCommentLikes[reply.id]?.has(currentUserId) || false;
        const likesCount = localCommentLikes[reply.id]?.size || reply.likes?.length || 0;
        const isOwn = reply.userId === currentUserId;
        const isHighlighted = highlightCommentId && reply.id === highlightCommentId;

        html += `
            <div class="comment-item reply-item ${isHighlighted ? 'highlighted' : ''}" data-reply-id="${reply.id}" style="${isHighlighted ? 'background:rgba(192,132,252,0.08);border-left:3px solid #c084fc;padding-left:10px;' : ''}">
                <img class="avatar" src="${reply.avatar || getAvatar(reply.fullName)}" 
                     alt="${reply.fullName}" 
                     style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
                     onclick="window.goToProfileUser('${reply.userId}')" />
                <div class="comment-body" style="flex:1;min-width:0;">
                    <div class="comment-user" onclick="window.goToProfileUser('${reply.userId}')">
                        ${escapeHtml(reply.fullName)}
                        <span class="handle">@${escapeHtml(reply.username)}</span>
                        <span class="time">${formatDate(reply.createdAt)}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(reply.content)}</div>
                    <div class="comment-meta">
                        <button class="btn-like-comment ${isLiked ? 'liked' : ''}" 
                                onclick="window.handleCommentLike('${reply.id}')">
                            <i class="fas fa-heart"></i> <span class="like-count">${formatNumber(likesCount)}</span>
                        </button>
                        <button class="btn-reply-comment" onclick="window.toggleReplyInput('${reply.id}')">
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        ${isOwn ? `
                            <button class="btn-delete-comment" onclick="window.handleCommentDelete('${reply.id}', '${parentCommentId}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="reply-input-container" id="reply-input-${reply.id}" style="display:none;margin-top:6px;">
                        <input type="text" class="reply-input" id="replyInput-${reply.id}" 
                               placeholder="Escribe una respuesta..." maxlength="500" />
                        <button class="reply-send-btn" onclick="window.handleReplySubmit('${reply.id}')">
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
// 🔥 INICIALIZAR COMENTARIOS (AL ABRIR EL MODAL)
// ============================================================

export async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null) {
    if (!storyId) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    const token = getToken();
    if (!token) return;

    // ✅ LIMPIAR ESTADO LOCAL ANTES DE CARGAR
    localComments = [];
    localCommentLikes = {};
    localRepliesVisibility = {};

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Error loading comments');

        const comments = await res.json();
        
        // Ordenar: nuevos primero
        comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Ordenar respuestas: viejas primero
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
        
        // ✅ GUARDAR EN ESTADO LOCAL
        localComments = comments;
        
        // Inicializar likes
        comments.forEach(comment => {
            if (comment.likes && comment.likes.length > 0) {
                localCommentLikes[comment.id] = new Set(comment.likes);
            } else {
                localCommentLikes[comment.id] = new Set();
            }
            
            if (comment.replies) {
                comment.replies.forEach(reply => {
                    if (reply.likes && reply.likes.length > 0) {
                        localCommentLikes[reply.id] = new Set(reply.likes);
                    } else {
                        localCommentLikes[reply.id] = new Set();
                    }
                    if (reply.replies && reply.replies.length > 0) {
                        localRepliesVisibility[reply.id] = false;
                    }
                });
            }
        });
        
        // Inicializar visibilidad de respuestas (ocultas por defecto)
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                localRepliesVisibility[comment.id] = false;
            }
        });

        // 🔥 SI HAY UN COMENTARIO DESTACADO, EXPANDIR LA CADENA DE PADRES
        if (highlightCommentId) {
            const parentChain = getParentChain(comments, highlightCommentId);
            if (parentChain) {
                parentChain.forEach(parentId => {
                    localRepliesVisibility[parentId] = true;
                });
            }
            const parentComment = findParentComment(comments, highlightCommentId);
            if (parentComment) {
                localRepliesVisibility[parentComment.id] = true;
            }
            const highlightedComment = findCommentById(comments, highlightCommentId);
            if (highlightedComment && highlightedComment.replies && highlightedComment.replies.length > 0) {
                localRepliesVisibility[highlightCommentId] = true;
            }
        }

        // ✅ RENDER COMPLETO (SOLO UNA VEZ)
        const currentUser = getCurrentUser();
        renderComments(localComments, container, currentUser?.id, highlightCommentId);

        // Guardar referencia
        container.dataset.storyId = storyId;
        window._currentStoryId = storyId;

        // Configurar eventos del input
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

        // Scroll al comentario destacado
        if (highlightCommentId) {
            setTimeout(() => {
                let highlighted = container.querySelector(`.comment-item[data-comment-id="${highlightCommentId}"]`);
                if (!highlighted) {
                    highlighted = container.querySelector(`.comment-item[data-reply-id="${highlightCommentId}"]`);
                }
                if (highlighted) {
                    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 600);
        }

    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

// ============================================================
// 🔥 AGREGAR COMENTARIO (SIN RE-RENDER)
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

    // ✅ CREAR COMENTARIO LOCAL
    const currentUser = getCurrentUser();
    const tempComment = {
        id: 'local_' + Date.now(),
        userId: currentUser?.id || 'local',
        username: currentUser?.username || 'usuario',
        fullName: currentUser?.fullName || 'Usuario',
        avatar: currentUser?.avatar || getAvatar(currentUser?.fullName || 'U'),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        replies: [],
        likes: [],
        _temp: true
    };

    // ✅ ACTUALIZAR ESTADO LOCAL
    if (parentCommentId) {
        const parentComment = findCommentById(localComments, parentCommentId);
        if (parentComment) {
            if (!parentComment.replies) parentComment.replies = [];
            parentComment.replies.push(tempComment);
            parentComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            localRepliesVisibility[parentCommentId] = true;
        }
    } else {
        localComments.unshift(tempComment);
    }

    // ✅ ACTUALIZAR DOM DIRECTAMENTE
    const container = document.getElementById('commentsList');
    if (container) {
        const currentUserId = currentUser?.id;
        renderComments(localComments, container, currentUserId);
    }

    // ✅ ACTUALIZAR CONTADOR
    updateCommentCount(1);

    // ✅ ENVIAR AL SERVIDOR EN SEGUNDO PLANO
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
        
        // ✅ REEMPLAZAR COMENTARIO TEMPORAL POR EL REAL
        if (parentCommentId) {
            const parentComment = findCommentById(localComments, parentCommentId);
            if (parentComment && parentComment.replies) {
                const idx = parentComment.replies.findIndex(c => c.id === tempComment.id);
                if (idx !== -1) {
                    parentComment.replies[idx] = newComment;
                }
            }
        } else {
            const idx = localComments.findIndex(c => c.id === tempComment.id);
            if (idx !== -1) {
                localComments[idx] = newComment;
            }
        }

        // ✅ ACTUALIZAR LIKES
        if (newComment.likes) {
            localCommentLikes[newComment.id] = new Set(newComment.likes);
        } else {
            localCommentLikes[newComment.id] = new Set();
        }

        // ✅ RE-RENDER SOLO SI ES NECESARIO
        if (container) {
            const currentUserId = currentUser?.id;
            renderComments(localComments, container, currentUserId);
        }

        // ✅ EMITIR VIA SOCKET
        const socket = window.socket;
        if (socket) {
            socket.emit('new_comment', {
                storyId: storyId,
                comment: newComment,
                parentCommentId: parentCommentId
            });
        }

        showToast(parentCommentId ? '💬 Respuesta agregada' : '💬 Comentario enviado');
        return newComment;

    } catch (error) {
        console.error('Error adding comment:', error);
        
        // ❌ REVERTIR COMENTARIO TEMPORAL
        if (parentCommentId) {
            const parentComment = findCommentById(localComments, parentCommentId);
            if (parentComment && parentComment.replies) {
                parentComment.replies = parentComment.replies.filter(c => c.id !== tempComment.id);
            }
        } else {
            localComments = localComments.filter(c => c.id !== tempComment.id);
        }

        if (container) {
            const currentUserId = currentUser?.id;
            renderComments(localComments, container, currentUserId);
        }

        updateCommentCount(-1);
        showToast('Error al comentar', true);
        return null;
    }
}

// ============================================================
// 🔥 ELIMINAR COMENTARIO (SIN RE-RENDER)
// ============================================================

export async function deleteComment(storyId, commentId, parentCommentId = null) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para eliminar', true);
        return false;
    }

    if (!confirm('¿Eliminar este comentario?')) return false;

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

        // ✅ ELIMINAR DEL ESTADO LOCAL
        if (parentCommentId) {
            const parentComment = findCommentById(localComments, parentCommentId);
            if (parentComment && parentComment.replies) {
                parentComment.replies = parentComment.replies.filter(r => r.id !== commentId);
            }
        } else {
            localComments = localComments.filter(c => c.id !== commentId);
        }

        delete localCommentLikes[commentId];

        const container = document.getElementById('commentsList');
        if (container) {
            const currentUser = getCurrentUser();
            renderComments(localComments, container, currentUser?.id);
        }

        updateCommentCount(-1);
        showToast('🗑️ Eliminado');
        return true;

    } catch (error) {
        console.error('Error deleting comment:', error);
        showToast('Error al eliminar', true);
        return false;
    }
}

// ============================================================
// 🔥 DAR LIKE A COMENTARIO (SIN RE-RENDER)
// ============================================================

export async function likeComment(storyId, commentId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return false;
    }

    const currentUserId = getCurrentUser()?.id;
    const isCurrentlyLiked = localCommentLikes[commentId]?.has(currentUserId) || false;

    // ✅ ACTUALIZACIÓN OPTIMISTA
    if (!localCommentLikes[commentId]) {
        localCommentLikes[commentId] = new Set();
    }

    if (isCurrentlyLiked) {
        localCommentLikes[commentId].delete(currentUserId);
    } else {
        localCommentLikes[commentId].add(currentUserId);
    }

    const container = document.getElementById('commentsList');
    if (container) {
        const currentUser = getCurrentUser();
        renderComments(localComments, container, currentUser?.id);
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
        
        if (data.likes) {
            localCommentLikes[commentId] = new Set(data.likes);
        }

        if (container) {
            const currentUser = getCurrentUser();
            renderComments(localComments, container, currentUser?.id);
        }

        showToast(data.liked ? '❤️ Like al comentario' : '💔 Like eliminado');
        return data.liked;

    } catch (error) {
        console.error('Error liking comment:', error);
        
        // ❌ REVERTIR
        if (isCurrentlyLiked) {
            localCommentLikes[commentId].add(currentUserId);
        } else {
            localCommentLikes[commentId].delete(currentUserId);
        }

        if (container) {
            const currentUser = getCurrentUser();
            renderComments(localComments, container, currentUser?.id);
        }

        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADOR DE COMENTARIOS
// ============================================================

function updateCommentCount(increment) {
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) {
        const current = parseInt(commentsEl.textContent.replace(/[^0-9]/g, '')) || 0;
        commentsEl.textContent = formatNumber(current + increment);
    }
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) {
        const current = parseInt(commentsCountEl.textContent.replace(/[^0-9]/g, '')) || 0;
        commentsCountEl.textContent = formatNumber(current + increment);
    }
}

// ============================================================
// 🔥 FUNCIONES GLOBALES (PARA EVENTOS ONCLICK)
// ============================================================

window.handleCommentLike = async function(commentId) {
    const storyId = window._currentStoryId;
    if (storyId) {
        await likeComment(storyId, commentId);
    }
};

window.handleCommentDelete = async function(commentId, parentCommentId = null) {
    const storyId = window._currentStoryId;
    if (storyId) {
        await deleteComment(storyId, commentId, parentCommentId);
    }
};

window.toggleReplyInput = function(commentId) {
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

window.handleReplySubmit = async function(parentCommentId) {
    const input = document.getElementById(`replyInput-${parentCommentId}`);
    if (!input) return;
    
    const content = input.value.trim();
    if (!content) {
        showToast('Escribe una respuesta', true);
        return;
    }
    
    const storyId = window._currentStoryId;
    if (!storyId) return;
    
    const newReply = await addComment(storyId, content, parentCommentId);
    if (newReply) {
        input.value = '';
        const container = document.getElementById(`reply-input-${parentCommentId}`);
        if (container) container.style.display = 'none';
    }
};

window.toggleRepliesVisibility = function(commentId) {
    const currentState = localRepliesVisibility[commentId] || false;
    localRepliesVisibility[commentId] = !currentState;
    
    const container = document.getElementById('commentsList');
    if (container) {
        const currentUser = getCurrentUser();
        renderComments(localComments, container, currentUser?.id);
    }
};

// ============================================================
// 🔥 EXPORTAR FUNCIONES (UNA SOLA VEZ - SIN DUPLICADOS)
// ============================================================

export { 
    loadComments,
    initComments,
    addComment,
    deleteComment,
    likeComment,
    renderComments,
    findCommentById,
    getParentChain,
    localComments,
    localCommentLikes,
    localRepliesVisibility
};