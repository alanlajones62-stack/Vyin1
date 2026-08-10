// ============================================================
// story-comments.js - Cargar comentarios sin duplicados
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml
} from './auth.js';

const API_URL = window.location.origin;

// 🔥 FUNCIÓN PARA CARGAR COMENTARIOS - LIMPIA ANTES DE RENDERIZAR
export async function initComments(storyId, containerId, highlightCommentId = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('⚠️ Contenedor de comentarios no encontrado:', containerId);
        return;
    }

    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            console.warn('⚠️ Error cargando comentarios:', res.status);
            return;
        }

        const comments = await res.json();
        
        // 🔥 LIMPIAR EL CONTENEDOR ANTES DE RENDERIZAR
        container.innerHTML = '';
        
        if (!comments || comments.length === 0) {
            container.innerHTML = `
                <div class="no-comments">
                    <i class="fas fa-comment-slash"></i>
                    <span>No hay comentarios aún. ¡Sé el primero!</span>
                </div>
            `;
            return;
        }

        // 🔥 RENDERIZAR COMENTARIOS
        const currentUser = getCurrentUser();
        const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

        let html = '';
        comments.forEach(comment => {
            const avatar = comment.avatar || userAvatar;
            const isOwner = comment.userId === currentUser?.id;
            
            html += `
                <div class="comment-item" data-comment-id="${comment.id}" ${highlightCommentId === comment.id ? 'style="background:rgba(192,132,252,0.1);border-left:2px solid #c084fc;"' : ''}>
                    <img class="avatar" src="${avatar}" alt="${comment.fullName}" />
                    <div class="comment-body">
                        <div class="comment-user">
                            ${escapeHtml(comment.fullName)}
                            <span class="handle">@${comment.username || 'usuario'}</span>
                            <span class="time">${formatDate(comment.createdAt)}</span>
                        </div>
                        <div class="comment-text">${escapeHtml(comment.content)}</div>
                        <div class="comment-meta">
                            <button class="btn-like-comment" data-comment-id="${comment.id}">
                                <i class="fas fa-heart"></i> <span class="like-count">${comment.likes?.length || 0}</span>
                            </button>
                            <button class="btn-reply-comment" data-comment-id="${comment.id}">
                                <i class="fas fa-reply"></i> Responder
                            </button>
                            <button class="btn-delete-comment" data-comment-id="${comment.id}" style="display:${isOwner ? 'inline-flex' : 'none'}">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="replies" id="replies-${comment.id}">
                            ${renderReplies(comment.replies, currentUser)}
                        </div>
                        <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;">
                            <input type="text" class="reply-input" placeholder="Escribe una respuesta..." maxlength="500" />
                            <button class="reply-send-btn" data-comment-id="${comment.id}">Enviar</button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        
        // 🔥 CONFIGURAR EVENTOS
        if (typeof window.setupCommentEvents === 'function') {
            window.setupCommentEvents();
        }

        console.log('✅ Comentarios cargados:', comments.length);

    } catch (error) {
        console.error('❌ Error cargando comentarios:', error);
        container.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Error al cargar comentarios</span>
            </div>
        `;
    }
}

// 🔥 FUNCIÓN AUXILIAR PARA RENDERIZAR RESPUESTAS
function renderReplies(replies, currentUser) {
    if (!replies || replies.length === 0) return '';
    
    let html = '';
    replies.forEach(reply => {
        const avatar = reply.avatar || currentUser?.avatar || getAvatar(reply.fullName || 'U');
        const isOwner = reply.userId === currentUser?.id;
        
        html += `
            <div class="comment-item" data-comment-id="${reply.id}">
                <img class="avatar" src="${avatar}" alt="${reply.fullName}" />
                <div class="comment-body">
                    <div class="comment-user">
                        ${escapeHtml(reply.fullName)}
                        <span class="handle">@${reply.username || 'usuario'}</span>
                        <span class="time">${formatDate(reply.createdAt)}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(reply.content)}</div>
                    <div class="comment-meta">
                        <button class="btn-like-comment" data-comment-id="${reply.id}">
                            <i class="fas fa-heart"></i> <span class="like-count">${reply.likes?.length || 0}</span>
                        </button>
                        <button class="btn-reply-comment" data-comment-id="${reply.id}">
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        <button class="btn-delete-comment" data-comment-id="${reply.id}" style="display:${isOwner ? 'inline-flex' : 'none'}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="replies" id="replies-${reply.id}">
                        ${renderReplies(reply.replies, currentUser)}
                    </div>
                    <div class="reply-input-container" id="reply-input-${reply.id}" style="display:none;">
                        <input type="text" class="reply-input" placeholder="Escribe una respuesta..." maxlength="500" />
                        <button class="reply-send-btn" data-comment-id="${reply.id}">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// ============================================================
// CARGAR COMENTARIOS (ALIAS)
// ============================================================

export function loadComments(storyId, containerId) {
    return initComments(storyId, containerId);
}