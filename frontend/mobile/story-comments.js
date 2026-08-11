// story-comments.js - VERSIÓN CORREGIDA CON LIMPIEZA DE CACHÉ Y MEJOR RENDIMIENTO
// 🔥 CORREGIDO: Limpieza de caché, renderizado eficiente, scroll en móvil

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

let commentsCache = new Map();
let commentLikes = new Map();
let repliesVisibility = new Map();
let isRendering = false;
let currentStoryId = null;

// ============================================================
// 🔥 FUNCIONES DE CACHÉ
// ============================================================

function clearCommentsCache(storyId) {
    if (storyId) {
        commentsCache.delete(storyId);
        console.log(`🧹 [COMMENTS] Caché limpiado para historia ${storyId}`);
    } else {
        commentsCache.clear();
        console.log('🧹 [COMMENTS] Caché de comentarios completamente limpiado');
    }
}

function getCommentsFromCache(storyId) {
    return commentsCache.get(storyId) || null;
}

function setCommentsCache(storyId, comments) {
    commentsCache.set(storyId, comments);
}

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

function getAllReplies(comment) {
    if (!comment || !comment.replies || comment.replies.length === 0) {
        return [];
    }
    
    let allReplies = [];
    const flatten = (replies) => {
        for (const reply of replies) {
            allReplies.push(reply);
            if (reply.replies && reply.replies.length > 0) {
                flatten(reply.replies);
            }
        }
    };
    flatten(comment.replies);
    return allReplies;
}

function countAllComments(comments) {
    if (!comments) return 0;
    let count = comments.length;
    comments.forEach(comment => {
        count += getAllReplies(comment).length;
    });
    return count;
}

function getReplyContext(reply, currentUserId, parentComment) {
    if (!parentComment) {
        return { text: '', color: 'rgba(255,255,255,0.25)', isTarget: false };
    }
    
    const parentAuthorName = parentComment.fullName || parentComment.username || 'usuario';
    const parentAuthorId = parentComment.userId || null;
    const replyToUserId = reply.replyToUserId || parentAuthorId;
    const replyToName = reply.replyToName || parentAuthorName;
    
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

function updateCommentLikeUI(commentId, isLiked, likesCount) {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const commentElement = findCommentElement(container, commentId);
    if (!commentElement) return;
    
    const likeBtn = commentElement.querySelector(`.btn-like-comment[data-comment-id="${commentId}"]`);
    if (likeBtn) {
        if (isLiked) {
            likeBtn.classList.add('liked');
        } else {
            likeBtn.classList.remove('liked');
        }
        const span = likeBtn.querySelector('span');
        if (span) {
            span.textContent = formatNumber(likesCount);
        }
        const heart = likeBtn.querySelector('.fa-heart');
        if (heart) {
            heart.style.color = isLiked ? '#ff6b6b' : 'inherit';
        }
    }
}

function findCommentElement(container, commentId) {
    let element = container.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (element) return element;
    element = container.querySelector(`.comment-item[data-reply-id="${commentId}"]`);
    if (element) return element;
    return null;
}

function updateModalCommentCount(storyId) {
    const comments = commentsCache.get(storyId) || [];
    const total = countAllComments(comments);
    
    const modalComments = document.getElementById('modalComments');
    if (modalComments) {
        modalComments.textContent = formatNumber(total);
    }
    const commentsCount = document.getElementById('commentsCount');
    if (commentsCount) {
        commentsCount.textContent = formatNumber(total);
    }
}

// ============================================================
// CARGAR COMENTARIOS
// ============================================================

export async function loadComments(storyId, forceReload = false) {
    if (!storyId) return [];

    const token = getToken();
    if (!token) return [];

    if (!forceReload && commentsCache.has(storyId)) {
        console.log(`📦 [COMMENTS] Usando caché para historia ${storyId}`);
        return commentsCache.get(storyId);
    }

    try {
        console.log(`📡 [COMMENTS] Cargando comentarios para historia ${storyId}`);
        
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Error loading comments');

        const comments = await res.json();
        
        // Ordenar comentarios: nuevos primero
        comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Ordenar respuestas: viejas primero (cronológico)
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
        
        // Guardar en caché
        commentsCache.set(storyId, comments);
        
        // Inicializar visibilidad de respuestas (ocultas por defecto)
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(comment.id, false);
            }
        });
        
        // Guardar likes
        comments.forEach(comment => {
            if (comment.likes) {
                commentLikes.set(comment.id, new Set(comment.likes));
            }
            const allReplies = getAllReplies(comment);
            allReplies.forEach(reply => {
                if (reply.likes) {
                    commentLikes.set(reply.id, new Set(reply.likes));
                }
            });
        });

        console.log(`✅ [COMMENTS] ${comments.length} comentarios cargados para historia ${storyId}`);
        return comments;
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

// ============================================================
// AGREGAR COMENTARIO
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
        
        // Actualizar caché
        if (commentsCache.has(storyId)) {
            const comments = commentsCache.get(storyId);
            
            if (parentCommentId) {
                const parentComment = findCommentById(comments, parentCommentId);
                if (parentComment) {
                    if (!parentComment.replies) parentComment.replies = [];
                    const exists = parentComment.replies.some(r => r.id === newComment.id);
                    if (!exists) {
                        parentComment.replies.push(newComment);
                        parentComment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                        repliesVisibility.set(parentCommentId, true);
                    }
                }
            } else {
                const exists = comments.some(c => c.id === newComment.id);
                if (!exists) {
                    comments.unshift(newComment);
                }
            }
            commentsCache.set(storyId, comments);
        } else {
            commentsCache.set(storyId, [newComment]);
        }

        // Actualizar DOM
        const container = document.getElementById('commentsList');
        if (container) {
            const currentUser = getCurrentUser();
            if (parentCommentId) {
                appendReplyToDOM(storyId, parentCommentId, newComment, currentUser?.id, container);
            } else {
                prependCommentToDOM(storyId, newComment, currentUser?.id, container);
            }
            updateModalCommentCount(storyId);
            
            // 🔥 SCROLL AL NUEVO COMENTARIO
            setTimeout(() => {
                const newElement = container.querySelector(parentCommentId 
                    ? `.comment-item[data-reply-id="${newComment.id}"]` 
                    : `.comment-item[data-comment-id="${newComment.id}"]`);
                if (newElement) {
                    newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
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
// FUNCIONES DE DOM
// ============================================================

function prependCommentToDOM(storyId, comment, currentUserId, container) {
    if (!container) return;
    const existing = container.querySelector(`.comment-item[data-comment-id="${comment.id}"]`);
    if (existing) return;
    
    const firstChild = container.firstChild;
    const tempDiv = document.createElement('div');
    const isLiked = comment.likes?.includes(currentUserId) || false;
    const likesCount = comment.likes?.length || 0;
    const allReplies = getAllReplies(comment);
    const replyCount = allReplies.length;
    const hasReplies = replyCount > 0;
    
    tempDiv.innerHTML = `
        <div class="comment-item" data-comment-id="${comment.id}">
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
                    ${comment.userId === currentUserId ? `
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
                
                ${hasReplies ? `
                    <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${storyId}', '${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
                        <i class="fas fa-chevron-down"></i> 
                        Ver ${replyCount} respuestas
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    const newCommentElement = tempDiv.firstElementChild;
    
    if (firstChild) {
        container.insertBefore(newCommentElement, firstChild);
    } else {
        container.appendChild(newCommentElement);
    }
}

function appendReplyToDOM(storyId, parentCommentId, reply, currentUserId, container) {
    if (!container) return;
    const existing = container.querySelector(`.comment-item[data-reply-id="${reply.id}"]`);
    if (existing) return;
    
    let parentElement = container.querySelector(`.comment-item[data-comment-id="${parentCommentId}"]`);
    if (!parentElement) {
        parentElement = container.querySelector(`.comment-item[data-reply-id="${parentCommentId}"]`);
        if (parentElement) {
            const parentCommentItem = parentElement.closest('.comment-item[data-comment-id]');
            if (parentCommentItem) {
                parentElement = parentCommentItem;
            }
        }
    }
    if (!parentElement) return;
    
    let repliesContainer = parentElement.querySelector('.replies-container');
    if (!repliesContainer) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<div class="replies-container" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: ${repliesVisibility.get(parentCommentId) ? 'flex' : 'none'}; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;"></div>`;
        repliesContainer = tempDiv.firstElementChild;
        
        const replyInput = parentElement.querySelector('.reply-input-container');
        const showRepliesBtn = parentElement.querySelector('.show-replies-btn');
        
        if (replyInput) {
            replyInput.after(repliesContainer);
        } else if (showRepliesBtn) {
            showRepliesBtn.after(repliesContainer);
        } else {
            const meta = parentElement.querySelector('.comment-meta');
            if (meta) {
                meta.after(repliesContainer);
            }
        }
        
        // Asegurar que el botón "Ver respuestas" exista
        let showBtn = parentElement.querySelector('.show-replies-btn');
        if (!showBtn) {
            const newShowBtn = document.createElement('div');
            newShowBtn.className = 'show-replies-btn';
            newShowBtn.style.cssText = 'font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;';
            const parentComment = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
            const count = parentComment ? getAllReplies(parentComment).length : 0;
            newShowBtn.innerHTML = `<i class="fas fa-chevron-${repliesVisibility.get(parentCommentId) ? 'up' : 'down'}"></i> ${repliesVisibility.get(parentCommentId) ? 'Ocultar' : 'Ver'} ${count} respuestas`;
            newShowBtn.onclick = () => window.toggleRepliesVisibility(storyId, parentCommentId);
            
            if (repliesContainer) {
                repliesContainer.after(newShowBtn);
            }
        }
    }
    
    // Si está oculto, mostrarlo
    if (repliesContainer.style.display === 'none') {
        repliesContainer.style.display = 'flex';
        const showBtn = parentElement.querySelector('.show-replies-btn');
        if (showBtn) {
            const parentComment = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
            const count = parentComment ? getAllReplies(parentComment).length : 0;
            showBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${count} respuestas`;
        }
    }
    
    const parentComment = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
    const context = getReplyContext(reply, currentUserId, parentComment);
    
    const tempDiv = document.createElement('div');
    const isLiked = reply.likes?.includes(currentUserId) || false;
    const likesCount = reply.likes?.length || 0;
    const isOwn = reply.userId === currentUserId;
    
    tempDiv.innerHTML = `
        <div class="comment-item reply-item" data-reply-id="${reply.id}">
            <img class="avatar" src="${reply.avatar || getAvatar(reply.fullName)}" 
                 alt="${reply.fullName}" 
                 style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;cursor:pointer;"
                 onclick="window.goToProfileUser('${reply.userId}')" />
            <div class="comment-body" style="flex:1;min-width:0;">
                <div class="comment-user" onclick="window.goToProfileUser('${reply.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                    <span style="font-weight:600;color:#fff;">${escapeHtml(reply.fullName)}</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(reply.username)}</span>
                    <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(reply.createdAt)}</span>
                </div>
                ${context.text ? `
                    <div class="reply-context" style="font-size:11px; color:${context.color}; margin:2px 0 4px 0;">
                        <i class="fas fa-reply" style="font-size:8px; margin-right:4px;"></i>
                        <span>${context.text}</span>
                    </div>
                ` : ''}
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
                        <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${reply.id}', '${parentCommentId}')"
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
    
    const newReplyElement = tempDiv.firstElementChild;
    repliesContainer.appendChild(newReplyElement);
    
    // Actualizar contador del botón
    const showBtn = parentElement.querySelector('.show-replies-btn');
    if (showBtn) {
        const parentCommentData = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
        const count = parentCommentData ? getAllReplies(parentCommentData).length : 0;
        const isExpanded = repliesVisibility.get(parentCommentId) || false;
        showBtn.innerHTML = `<i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i> ${isExpanded ? 'Ocultar' : 'Ver'} ${count} respuestas`;
    }
}

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    await likeComment(storyId, commentId);
};

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    await deleteComment(storyId, commentId, parentCommentId);
};

window.toggleReplyInput = function(storyId, commentId) {
    // Cerrar otros inputs
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
                // 🔥 SCROLL AL INPUT EN MÓVIL
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
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
    }
};

// ============================================================
// TOGGLE VISIBILIDAD DE RESPUESTAS
// ============================================================

window.toggleRepliesVisibility = function(storyId, commentId) {
    const currentState = repliesVisibility.get(commentId) || false;
    const newState = !currentState;
    repliesVisibility.set(commentId, newState);
    
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    const comment = findCommentById(commentsCache.get(storyId) || [], commentId);
    if (!comment) return;
    
    const commentElement = container.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (!commentElement) return;
    
    let repliesContainer = commentElement.querySelector('.replies-container');
    const showRepliesBtn = commentElement.querySelector('.show-replies-btn');
    const allReplies = getAllReplies(comment);
    const replyCount = allReplies.length;
    
    if (newState) {
        // Mostrar respuestas
        if (!repliesContainer) {
            // Crear el contenedor
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = `<div class="replies-container" id="replies-${commentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;"></div>`;
            repliesContainer = tempDiv.firstElementChild;
            
            const replyInput = commentElement.querySelector('.reply-input-container');
            if (replyInput) {
                replyInput.after(repliesContainer);
            } else {
                const meta = commentElement.querySelector('.comment-meta');
                if (meta) {
                    meta.after(repliesContainer);
                }
            }
            
            // Renderizar todas las respuestas
            const currentUser = getCurrentUser();
            allReplies.forEach(reply => {
                appendReplyToDOM(storyId, commentId, reply, currentUser?.id, container);
            });
            
            // Asegurar que el botón exista
            let showBtn = commentElement.querySelector('.show-replies-btn');
            if (!showBtn) {
                const newShowBtn = document.createElement('div');
                newShowBtn.className = 'show-replies-btn';
                newShowBtn.style.cssText = 'font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;';
                newShowBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${replyCount} respuestas`;
                newShowBtn.onclick = () => window.toggleRepliesVisibility(storyId, commentId);
                if (repliesContainer) {
                    repliesContainer.after(newShowBtn);
                }
            }
        } else {
            repliesContainer.style.display = 'flex';
        }
        
        if (showRepliesBtn) {
            showRepliesBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${replyCount} respuestas`;
        }
    } else {
        // Ocultar respuestas
        if (repliesContainer) {
            repliesContainer.style.display = 'none';
        }
        if (showRepliesBtn) {
            showRepliesBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver ${replyCount} respuestas`;
        }
    }
};

// ============================================================
// RENDER INICIAL DE COMENTARIOS
// ============================================================

export function renderComments(comments, storyId, currentUserId, container, highlightCommentId = null) {
    if (!container) return;
    
    // Evitar re-renderizados múltiples
    if (isRendering) return;
    isRendering = true;

    if (!comments || comments.length === 0) {
        container.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-comment-slash"></i>
                <span>No hay comentarios aún</span>
            </div>
        `;
        updateModalCommentCount(storyId);
        isRendering = false;
        return;
    }

    let commentsList = [...comments];
    let highlightedComment = null;
    let highlightedIndex = -1;
    let isReplyHighlight = false;
    let parentCommentIdForHighlight = null;
    
    // Buscar comentario destacado
    if (highlightCommentId) {
        for (let i = 0; i < commentsList.length; i++) {
            if (commentsList[i].id === highlightCommentId) {
                highlightedComment = commentsList[i];
                highlightedIndex = i;
                break;
            }
        }
        
        if (!highlightedComment) {
            for (const comment of commentsList) {
                const allReplies = getAllReplies(comment);
                for (const reply of allReplies) {
                    if (reply.id === highlightCommentId) {
                        highlightedComment = reply;
                        isReplyHighlight = true;
                        parentCommentIdForHighlight = comment.id;
                        break;
                    }
                }
                if (highlightedComment) break;
            }
        }
        
        if (isReplyHighlight && parentCommentIdForHighlight) {
            repliesVisibility.set(parentCommentIdForHighlight, true);
        }
        
        if (highlightedComment && !isReplyHighlight && highlightedIndex > 0) {
            commentsList.splice(highlightedIndex, 1);
            commentsList.unshift(highlightedComment);
        }
    }

    // Construir HTML
    let html = '';
    
    commentsList.forEach(comment => {
        const cachedLikes = commentLikes.get(comment.id);
        const isLiked = cachedLikes ? cachedLikes.has(currentUserId) : (comment.likes?.includes(currentUserId) || false);
        const likesCount = cachedLikes ? cachedLikes.size : (comment.likes?.length || 0);
        const isOwn = comment.userId === currentUserId;
        const allReplies = getAllReplies(comment);
        const replyCount = allReplies.length;
        const hasReplies = replyCount > 0;
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
                    
                    ${hasReplies ? `
                        <div class="show-replies-btn" onclick="window.toggleRepliesVisibility('${storyId}', '${comment.id}')" style="font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;">
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i> 
                            ${isExpanded ? `Ocultar ${replyCount} respuestas` : `Ver ${replyCount} respuestas`}
                        </div>
                    ` : ''}
                    
                    ${isExpanded && hasReplies ? `
                        <div class="replies-container" id="replies-${comment.id}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;">
                            ${allReplies.map(reply => {
                                const rLiked = reply.likes?.includes(currentUserId) || false;
                                const rLikesCount = reply.likes?.length || 0;
                                const rOwn = reply.userId === currentUserId;
                                const rContext = getReplyContext(reply, currentUserId, comment);
                                const isReplyHighlighted = highlightCommentId && reply.id === highlightCommentId;
                                
                                return `
                                    <div class="comment-item reply-item ${isReplyHighlighted ? 'highlighted' : ''}" data-reply-id="${reply.id}" style="${isReplyHighlighted ? 'background:rgba(192,132,252,0.08);border-left:3px solid #c084fc;padding-left:10px;' : ''}">
                                        <img class="avatar" src="${reply.avatar || getAvatar(reply.fullName)}" 
                                             alt="${reply.fullName}" 
                                             style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;cursor:pointer;"
                                             onclick="window.goToProfileUser('${reply.userId}')" />
                                        <div class="comment-body" style="flex:1;min-width:0;">
                                            <div class="comment-user" onclick="window.goToProfileUser('${reply.userId}')" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">
                                                <span style="font-weight:600;color:#fff;">${escapeHtml(reply.fullName)}</span>
                                                <span style="font-size:11px;color:rgba(255,255,255,0.2);">@${escapeHtml(reply.username)}</span>
                                                <span style="font-size:10px;color:rgba(255,255,255,0.15);">${formatDate(reply.createdAt)}</span>
                                            </div>
                                            ${rContext.text ? `
                                                <div class="reply-context" style="font-size:11px; color:${rContext.color}; margin:2px 0 4px 0;">
                                                    <i class="fas fa-reply" style="font-size:8px; margin-right:4px;"></i>
                                                    <span>${rContext.text}</span>
                                                </div>
                                            ` : ''}
                                            <div class="comment-text" style="font-size:15px; line-height:1.5; color:rgba(255,255,255,0.85);">${escapeHtml(reply.content)}</div>
                                            <div class="comment-meta" style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
                                                <button class="btn-like-comment ${rLiked ? 'liked' : ''}" 
                                                        data-comment-id="${reply.id}"
                                                        onclick="window.handleCommentLike('${storyId}', '${reply.id}')"
                                                        style="background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;transition:all 0.2s;">
                                                    <i class="fas fa-heart" style="font-size:10px;color:${rLiked ? '#ff6b6b' : 'inherit'};"></i> <span>${formatNumber(rLikesCount)}</span>
                                                </button>
                                                <button class="btn-reply-comment" onclick="window.toggleReplyInput('${storyId}', '${reply.id}')"
                                                        style="background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;">
                                                    <i class="fas fa-reply" style="font-size:9px;"></i> Responder
                                                </button>
                                                ${rOwn ? `
                                                    <button class="btn-delete-comment" onclick="window.handleCommentDelete('${storyId}', '${reply.id}', '${comment.id}')"
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
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    // Reemplazar el contenido de una vez
    container.innerHTML = html;
    updateModalCommentCount(storyId);
    isRendering = false;
    
    // Scroll al comentario destacado
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
        }, 400);
    }
}

// ============================================================
// INICIALIZAR COMENTARIOS
// ============================================================

export async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null) {
    if (!storyId) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.dataset.storyId = storyId;
    currentStoryId = storyId;

    console.log(`📡 [COMMENTS] Inicializando comentarios para historia ${storyId} (highlight: ${highlightCommentId || 'ninguno'})`);

    const comments = await loadComments(storyId, true);
    const currentUser = getCurrentUser();
    
    // Expandir respuestas si hay highlight
    if (highlightCommentId) {
        let parentCommentId = null;
        for (const comment of comments) {
            if (comment.id === highlightCommentId) {
                parentCommentId = comment.id;
                break;
            }
            const allReplies = getAllReplies(comment);
            for (const reply of allReplies) {
                if (reply.id === highlightCommentId) {
                    parentCommentId = comment.id;
                    break;
                }
            }
            if (parentCommentId) break;
        }
        
        if (parentCommentId) {
            repliesVisibility.set(parentCommentId, true);
        }
    }
    
    renderComments(comments, storyId, currentUser?.id, container, highlightCommentId);

    // Configurar input de comentarios
    const input = document.getElementById('commentInput');
    const sendBtn = document.getElementById('sendCommentBtn');

    if (input && sendBtn) {
        // 🔥 Limpiar eventos anteriores (evitar duplicados)
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        const finalInput = document.getElementById('commentInput');
        const finalSendBtn = document.getElementById('sendCommentBtn');
        
        if (finalInput && finalSendBtn) {
            const sendComment = async () => {
                const content = finalInput.value.trim();
                if (!content) {
                    showToast('Escribe un comentario', true);
                    return;
                }

                finalSendBtn.disabled = true;
                finalSendBtn.textContent = 'Enviando...';
                
                try {
                    const newComment = await addComment(storyId, content);
                    if (newComment) {
                        finalInput.value = '';
                        showToast('💬 Comentario enviado');
                    }
                } catch (error) {
                    console.error('Error enviando comentario:', error);
                    showToast('Error al enviar comentario', true);
                } finally {
                    finalSendBtn.disabled = false;
                    finalSendBtn.textContent = 'Enviar';
                    finalInput.focus();
                }
            };

            finalSendBtn.onclick = sendComment;
            finalInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendComment();
                }
            };
        }
    }
}

// ============================================================
// EXPORTACIONES
// ============================================================

export { 
    clearCommentsCache,
    getCommentsFromCache,
    setCommentsCache,
    loadComments,
    addComment,
    deleteComment,
    likeComment,
    renderComments,
    initComments
};