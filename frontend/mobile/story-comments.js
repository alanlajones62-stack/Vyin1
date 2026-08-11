// ============================================================
// story-comments.js - Sistema de comentarios para historias
// CON FILTRADO DE COMENTARIO DESTACADO AL PRINCIPIO
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

let commentsCache = new Map();
let commentLikes = new Map();
let repliesVisibility = new Map();

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

    if (forceReload && commentsCache.has(storyId)) {
        commentsCache.delete(storyId);
    }

    if (commentsCache.has(storyId)) {
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
        
        commentsCache.set(storyId, comments);
        
        comments.forEach(comment => {
            if (comment.replies && comment.replies.length > 0) {
                repliesVisibility.set(comment.id, false);
            }
        });
        
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

        const container = document.getElementById('commentsList');
        if (container) {
            const currentUser = getCurrentUser();
            if (parentCommentId) {
                appendReplyToDOM(storyId, parentCommentId, newComment, currentUser?.id, container);
            } else {
                prependCommentToDOM(storyId, newComment, currentUser?.id, container);
            }
            updateModalCommentCount(storyId);
        }

        showToast(parentCommentId ? '💬 Respuesta agregada' : '💬 Comentario agregado');
        return newComment;

    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Error al comentar', true);
        return null;
    }
}

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
    
    let repliesContainer = parentElement.querySelector('.replies');
    if (!repliesContainer) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<div class="replies" id="replies-${parentCommentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;"></div>`;
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
        
        let showBtn = parentElement.querySelector('.show-replies-btn');
        if (!showBtn) {
            const newShowBtn = document.createElement('div');
            newShowBtn.className = 'show-replies-btn';
            newShowBtn.style.cssText = 'font-size:12px; color:rgba(192,132,252,0.4); cursor:pointer; margin-top:4px;';
            const parentComment = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
            const count = parentComment ? getAllReplies(parentComment).length : 0;
            newShowBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${count} respuestas`;
            newShowBtn.onclick = () => window.toggleRepliesVisibility(storyId, parentCommentId);
            
            if (repliesContainer) {
                repliesContainer.after(newShowBtn);
            }
        }
        repliesVisibility.set(parentCommentId, true);
    }
    
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
                 style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:10px;"
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
    
    const showBtn = parentElement.querySelector('.show-replies-btn');
    if (showBtn) {
        const parentCommentData = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
        const count = parentCommentData ? getAllReplies(parentCommentData).length : 0;
        showBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar ${count} respuestas`;
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

        const container = document.getElementById('commentsList');
        if (container) {
            const element = findCommentElement(container, commentId);
            if (element) {
                element.remove();
            }
            updateModalCommentCount(storyId);
            
            if (parentCommentId) {
                const parentElement = container.querySelector(`.comment-item[data-comment-id="${parentCommentId}"]`);
                if (parentElement) {
                    const showBtn = parentElement.querySelector('.show-replies-btn');
                    if (showBtn) {
                        const parentCommentData = findCommentById(commentsCache.get(storyId) || [], parentCommentId);
                        const count = parentCommentData ? getAllReplies(parentCommentData).length : 0;
                        if (count > 0) {
                            showBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver ${count} respuestas`;
                            showBtn.style.display = 'block';
                        } else {
                            showBtn.style.display = 'none';
                        }
                    }
                }
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
        let isLiked = data.liked;
        
        if (commentLikes.has(commentId)) {
            const likes = commentLikes.get(commentId);
            if (data.liked) {
                likes.add(currentUserId);
            } else {
                likes.delete(currentUserId);
            }
            isLiked = likes.has(currentUserId);
        } else {
            const newSet = new Set();
            if (data.liked) newSet.add(currentUserId);
            commentLikes.set(commentId, newSet);
            isLiked = data.liked;
        }

        const likesCount = data.likesCount || 0;
        updateCommentLikeUI(commentId, isLiked, likesCount);

        showToast(data.liked ? '❤️ Like al comentario' : '💔 Like eliminado');
        return data.liked;

    } catch (error) {
        console.error('Error liking comment:', error);
        showToast('Error al dar like', true);
        return false;
    }
}

// ============================================================
// FUNCIONES GLOBALES PARA EL MODAL
// ============================================================

window.handleCommentLike = async function(storyId, commentId) {
    await likeComment(storyId, commentId);
};

window.handleCommentDelete = async function(storyId, commentId, parentCommentId = null) {
    if (!confirm('¿Eliminar este comentario?')) return;
    await deleteComment(storyId, commentId, parentCommentId);
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
    }
};

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
    
    let repliesContainer = commentElement.querySelector('.replies');
    const showRepliesBtn = commentElement.querySelector('.show-replies-btn');
    const allReplies = getAllReplies(comment);
    const replyCount = allReplies.length;
    
    if (newState) {
        if (!repliesContainer) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = `<div class="replies" id="replies-${commentId}" style="margin-left: 40px; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-left: 2px solid rgba(192,132,252,0.08); padding-left: 12px;"></div>`;
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
            
            const currentUser = getCurrentUser();
            allReplies.forEach(reply => {
                appendReplyToDOM(storyId, commentId, reply, currentUser?.id, container);
            });
            
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
        if (repliesContainer) {
            repliesContainer.style.display = 'none';
        }
        if (showRepliesBtn) {
            showRepliesBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver ${replyCount} respuestas`;
        }
    }
};

// ============================================================
// 🔥 RENDER INICIAL DE COMENTARIOS CON FILTRADO
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
        updateModalCommentCount(storyId);
        return;
    }

    let commentsList = [...comments];
    
    // 🔥 SI HAY UN COMENTARIO DESTACADO, MOVERLO AL PRINCIPIO
    let highlightedComment = null;
    let highlightedIndex = -1;
    
    if (highlightCommentId) {
        for (let i = 0; i < commentsList.length; i++) {
            if (commentsList[i].id === highlightCommentId) {
                highlightedComment = commentsList[i];
                highlightedIndex = i;
                break;
            }
        }
        
        // Si el comentario está en la lista, moverlo al principio
        if (highlightedComment && highlightedIndex > 0) {
            commentsList.splice(highlightedIndex, 1);
            commentsList.unshift(highlightedComment);
            
            // Expandir respuestas del comentario padre si es una respuesta
            let parentCommentId = null;
            for (const comment of comments) {
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
    }

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
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateModalCommentCount(storyId);
}

// ============================================================
// INICIALIZAR COMENTARIOS EN MODAL
// ============================================================

export async function initComments(storyId, containerId = 'commentsList', highlightCommentId = null) {
    if (!storyId) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.dataset.storyId = storyId;
    window._currentStoryId = storyId;

    const comments = await loadComments(storyId, true);
    const currentUser = getCurrentUser();
    
    // 🔥 SI HAY UN COMENTARIO DESTACADO, EXPANDIR SUS RESPUESTAS
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

    const input = document.getElementById('commentInput');
    const sendBtn = document.getElementById('sendCommentBtn');

    if (input && sendBtn) {
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
    
    // 🔥 SCROLL AL COMENTARIO DESTACADO
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

export function expandRepliesForComment(commentId) {
    if (!commentId) return;
    
    let found = false;
    let foundStoryId = null;
    let foundParentId = null;
    
    for (const [storyId, comments] of commentsCache) {
        for (const comment of comments) {
            if (comment.id === commentId) {
                foundParentId = comment.id;
                found = true;
                foundStoryId = storyId;
                break;
            }
            const allReplies = getAllReplies(comment);
            for (const reply of allReplies) {
                if (reply.id === commentId) {
                    foundParentId = comment.id;
                    found = true;
                    foundStoryId = storyId;
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }
    
    if (found && foundStoryId && foundParentId) {
        repliesVisibility.set(foundParentId, true);
        const container = document.getElementById('commentsList');
        if (container) {
            const comments = commentsCache.get(foundStoryId) || [];
            const currentUser = getCurrentUser();
            renderComments(comments, foundStoryId, currentUser?.id, container, commentId);
        }
    }
}