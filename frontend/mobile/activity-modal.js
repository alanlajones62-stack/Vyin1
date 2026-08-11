// activity-modal.js - VERSIÓN COMPLETA CON SUPERPOSICIÓN Y FILTRADO DE COMENTARIOS

import { getToken, getCurrentUser, showToast, getAvatar } from './auth.js';
import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';

const API_URL = window.location.origin;
let socket = null;

let activityOverlay = null;
let isOpen = false;
let notifications = [];
let unreadCount = 0;

// ============================================================
// CREAR ELEMENTOS DEL MODAL
// ============================================================

function createActivityModal() {
    if (document.querySelector('.activity-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'activity-overlay';
    overlay.id = 'activityOverlay';
    
    overlay.innerHTML = `
        <div class="activity-header">
            <h2><i class="fas fa-heart"></i> Actividad</h2>
            <button class="close-btn" id="closeActivity">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="activity-body" id="activityBody">
            <div class="activity-empty">
                <i class="fas fa-spinner fa-pulse"></i>
                <h3>Cargando actividad...</h3>
            </div>
        </div>
        <div class="activity-actions">
            <button class="mark-all-read" id="markAllRead">
                <i class="fas fa-check-double"></i> Marcar todas como leídas
            </button>
            <button class="clear-all" id="clearAllActivity">
                <i class="fas fa-trash"></i> Limpiar
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    activityOverlay = overlay;
    
    overlay.querySelector('#closeActivity').addEventListener('click', closeActivityModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeActivityModal();
    });
    
    overlay.querySelector('#markAllRead').addEventListener('click', markAllRead);
    overlay.querySelector('#clearAllActivity').addEventListener('click', clearAllActivity);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeActivityModal();
        }
    });
    
    initActivitySocket();
}

// ============================================================
// SOCKET PARA NOTIFICACIONES
// ============================================================

function initActivitySocket() {
    const token = getToken();
    if (!token) return;
    
    if (window.socket) {
        socket = window.socket;
    } else {
        const io = window.io;
        if (io) {
            socket = io(API_URL, {
                auth: { token },
                transports: ['websocket', 'polling']
            });
            window.socket = socket;
        }
    }
    
    if (socket) {
        socket.on('new_notification', (notification) => {
            if (isOpen) {
                loadActivityData();
            } else {
                unreadCount++;
                updateBadge();
            }
        });
        
        socket.on('notification_read', (data) => {
            const items = document.querySelectorAll('.activity-item');
            items.forEach(item => {
                if (item.dataset.id === data.notificationId) {
                    item.classList.remove('unread');
                }
            });
            updateBadge();
        });
        
        socket.on('all_notifications_read', () => {
            document.querySelectorAll('.activity-item').forEach(item => {
                item.classList.remove('unread');
            });
            unreadCount = 0;
            updateBadge();
        });
    }
}

// ============================================================
// ABRIR / CERRAR
// ============================================================

function openActivityModal() {
    if (!activityOverlay) createActivityModal();
    
    isOpen = true;
    activityOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    loadActivityData();
}

function closeActivityModal() {
    isOpen = false;
    if (activityOverlay) {
        activityOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (typeof window.restoreNavToHome === 'function') {
        window.restoreNavToHome();
    }
}

// ============================================================
// CARGAR DATOS DE ACTIVIDAD
// ============================================================

async function loadActivityData() {
    const body = document.getElementById('activityBody');
    if (!body) return;
    
    body.innerHTML = `
        <div class="activity-empty">
            <i class="fas fa-spinner fa-pulse"></i>
            <h3>Cargando actividad...</h3>
        </div>
    `;
    
    const token = getToken();
    if (!token) {
        body.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-lock"></i>
                <h3>Inicia sesión</h3>
                <p>Inicia sesión para ver tu actividad</p>
            </div>
        `;
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/notifications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            notifications = data.notifications || [];
            unreadCount = data.unreadCount || 0;
            renderActivity(body);
            updateBadge();
        } else {
            throw new Error('Error cargando actividad');
        }
    } catch (error) {
        console.error('Error cargando actividad:', error);
        body.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-exclamation-triangle" style="color:#ff6b6b;"></i>
                <h3>Error al cargar</h3>
                <p>Intenta de nuevo más tarde</p>
            </div>
        `;
    }
}

// ============================================================
// MARCAR NOTIFICACIÓN COMO LEÍDA
// ============================================================

async function markNotificationRead(notificationId) {
    const token = getToken();
    if (!token) return;
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            // Actualizar localmente
            const notif = notifications.find(n => n.id === notificationId);
            if (notif) {
                notif.read = true;
                unreadCount = Math.max(0, unreadCount - 1);
                updateBadge();
                
                // Actualizar UI
                const item = document.querySelector(`.activity-item[data-id="${notificationId}"]`);
                if (item) {
                    item.classList.remove('unread');
                    const dot = item.querySelector('.unread-dot');
                    if (dot) dot.remove();
                }
            }
        }
    } catch (error) {
        console.error('Error marcando notificación como leída:', error);
    }
}

// ============================================================
// RENDERIZAR ACTIVIDAD
// ============================================================

function renderActivity(container) {
    if (!notifications || notifications.length === 0) {
        container.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-heart" style="color:rgba(255,107,107,0.05);"></i>
                <h3>Sin actividad</h3>
                <p>Cuando alguien interactúe contigo, aparecerá aquí</p>
            </div>
        `;
        return;
    }
    
    const typeConfig = {
        'like': { icon: '❤️', color: '#ff6b6b', label: 'Like' },
        'comment': { icon: '💬', color: '#c084fc', label: 'Comentario' },
        'reply': { icon: '💬', color: '#34d399', label: 'Respuesta' },
        'reply_to_reply': { icon: '💬', color: '#f472b6', label: 'Respuesta' },
        'follow_request': { icon: '📨', color: '#fbbf24', label: 'Solicitud' },
        'follow_accept': { icon: '✅', color: '#22c55e', label: 'Aceptado' },
        'mention': { icon: '🔔', color: '#f472b6', label: 'Mención' },
        'message': { icon: '💬', color: '#60a5fa', label: 'Mensaje' }
    };
    
    let html = '';
    notifications.forEach((notif, index) => {
        const config = typeConfig[notif.type] || { icon: '🔔', color: 'rgba(255,255,255,0.1)', label: 'Actividad' };
        const isUnread = !notif.read;
        const timeAgo = getTimeAgo(notif.createdAt);
        const isTranslated = notif.translated || false;
        
        const fullName = notif.fromName || 'Usuario';
        const username = notif.fromUsername || 'usuario';
        const avatar = notif.fromAvatar || getAvatar(fullName);
        
        const iconHtml = `<span style="font-size:18px;">${config.icon}</span>`;
        const typeBadge = `<span class="type-badge" style="font-size:8px;background:${config.color}20;color:${config.color};padding:2px 8px;border-radius:8px;margin-left:6px;">${config.label}</span>`;
        const translatedBadge = isTranslated ? 
            `<span class="translated-badge" style="font-size:8px;color:rgba(192,132,252,0.4);margin-left:6px;">🌐 Traducido</span>` : '';
        
        let messageHtml = notif.message || 'Actividad';
        if (notif.type === 'like') {
            messageHtml = `❤️ ${messageHtml}`;
        }
        
        if (notif.type === 'reply' || notif.type === 'reply_to_reply') {
            const fromName = notif.fromName || 'Usuario';
            const preview = notif.replyPreview || notif.data?.replyPreview || '';
            const previewText = preview.length > 40 ? preview.substring(0, 40) + '...' : preview;
            messageHtml = `${fromName} respondió a tu comentario: "${previewText}"`;
        }
        
        let previewHtml = '';
        let commentText = '';
        
        if (notif.type === 'comment' || notif.type === 'reply' || notif.type === 'reply_to_reply' || notif.type === 'mention') {
            commentText = notif.commentPreview || 
                          notif.replyPreview || 
                          notif.data?.commentPreview || 
                          notif.data?.replyPreview || 
                          '';
            
            if (commentText) {
                const truncated = commentText.length > 40 ? commentText.substring(0, 40) + '...' : commentText;
                previewHtml = `
                    <div class="preview" style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:4px;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:2px solid ${config.color};">
                        "${truncated}"
                    </div>
                `;
            }
        }
        
        let actionHtml = '';
        if (notif.type === 'follow_request') {
            actionHtml = `
                <div class="action-buttons" style="display:flex;gap:6px;margin-top:6px;">
                    <button class="accept-follow" data-user-id="${notif.fromUserId}" 
                            style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.2);color:#22c55e;padding:4px 14px;border-radius:14px;font-size:10px;cursor:pointer;">
                        <i class="fas fa-check"></i> Aceptar
                    </button>
                    <button class="reject-follow" data-user-id="${notif.fromUserId}" 
                            style="background:rgba(255,107,107,0.15);border:1px solid rgba(255,107,107,0.2);color:#ff6b6b;padding:4px 14px;border-radius:14px;font-size:10px;cursor:pointer;">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                </div>
            `;
        }
        
        let storyLink = '';
        if (notif.storyId) {
            storyLink = `
                <span class="story-link" data-story-id="${notif.storyId}" 
                      data-comment-id="${notif.commentId || ''}"
                      data-notification-id="${notif.id}"
                      style="font-size:9px;color:rgba(192,132,252,0.3);cursor:pointer;margin-top:2px;display:inline-block;">
                    <i class="fas fa-book-open"></i> Ver historia
                </span>
            `;
        }
        
        html += `
            <div class="activity-item ${isUnread ? 'unread' : ''}" 
                 data-id="${notif.id}" 
                 data-index="${index}"
                 style="position:relative;display:flex;align-items:flex-start;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.02);cursor:pointer;transition:background 0.2s;${isUnread ? 'background:rgba(192,132,252,0.02);' : ''}">
                
                <img class="avatar" src="${avatar}" alt="${fullName}" 
                     style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:12px;"
                     onerror="this.src='${getAvatar(fullName)}'" />
                
                <div class="content" style="flex:1;min-width:0;">
                    <div class="text" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                        <span class="from-name" style="font-weight:600;color:#fff;font-size:13px;">${fullName}</span>
                        <span class="from-username" style="font-size:11px;color:rgba(255,255,255,0.2);">@${username}</span>
                        ${typeBadge}
                        ${translatedBadge}
                    </div>
                    <div class="message" style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px;line-height:1.4;">
                        ${messageHtml}
                    </div>
                    ${previewHtml}
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                        <span class="time" style="font-size:10px;color:rgba(255,255,255,0.15);">${timeAgo}</span>
                        ${storyLink}
                    </div>
                    ${actionHtml}
                </div>
                
                <div class="icon" style="font-size:18px;flex-shrink:0;margin-left:8px;">${iconHtml}</div>
                
                ${isUnread ? `<span class="unread-dot" style="position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:#c084fc;"></span>` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.accept-follow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            handleFollowAction(userId, 'accept');
        });
    });
    
    container.querySelectorAll('.reject-follow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            handleFollowAction(userId, 'reject');
        });
    });
    
    // 🔥 EVENTOS PARA ENLACES DE HISTORIAS - MARCA LA NOTIFICACIÓN COMO LEÍDA
    container.querySelectorAll('.story-link').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const storyId = el.dataset.storyId;
            const commentId = el.dataset.commentId || '';
            const notificationId = el.dataset.notificationId || '';
            
            if (storyId) {
                // 🔥 MARCAR NOTIFICACIÓN COMO LEÍDA
                if (notificationId) {
                    await markNotificationRead(notificationId);
                }
                
                // 🔥 ABRIR HISTORIA CON COMENTARIO DESTACADO
                window.openStoryFromActivityOverlay(storyId, commentId, notificationId);
            }
        });
    });
    
    // 🔥 CLICK EN TODA LA NOTIFICACIÓN
    container.querySelectorAll('.activity-item').forEach(item => {
        item.addEventListener('click', async () => {
            const notificationId = item.dataset.id;
            const storyLink = item.querySelector('.story-link');
            
            if (storyLink) {
                const storyId = storyLink.dataset.storyId;
                const commentId = storyLink.dataset.commentId || '';
                const notifId = storyLink.dataset.notificationId || '';
                
                if (storyId) {
                    if (notifId) {
                        await markNotificationRead(notifId);
                    }
                    window.openStoryFromActivityOverlay(storyId, commentId, notifId);
                }
            }
        });
    });
}

// ============================================================
// 🔥 ABRIR HISTORIA SUPERPUESTA DESDE ACTIVIDAD (CORREGIDO)
// ============================================================

window.openStoryFromActivityOverlay = function(storyId, commentId = '', notificationId = '') {
    if (!storyId) return;
    
    console.log('📱 Abriendo historia desde actividad:', storyId, 'comentario:', commentId);
    
    // 🔥 MARCAR QUE VIENE DE ACTIVIDAD
    window._fromActivityModal = true;
    window._activityCommentId = commentId;
    window._activityNotificationId = notificationId;
    
    // 🔥 ABRIR HISTORIA SUPERPUESTA
    openStoryModal(storyId, null, false, null);
    
    // Si hay commentId, esperar a que cargue y hacer scroll
    if (commentId) {
        setTimeout(() => {
            // Buscar en el modal de historia
            const commentElement = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
            if (commentElement) {
                commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                commentElement.style.background = 'rgba(192,132,252,0.1)';
                commentElement.style.borderLeft = '3px solid #c084fc';
                setTimeout(() => {
                    commentElement.style.background = '';
                    commentElement.style.borderLeft = '';
                }, 3000);
            } else {
                const replyElement = document.querySelector(`.comment-item[data-reply-id="${commentId}"]`);
                if (replyElement) {
                    replyElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    replyElement.style.background = 'rgba(192,132,252,0.1)';
                    replyElement.style.borderLeft = '3px solid #c084fc';
                    setTimeout(() => {
                        replyElement.style.background = '';
                        replyElement.style.borderLeft = '';
                    }, 3000);
                }
            }
        }, 800);
    }
};

// ============================================================
// ABRIR PERFIL DESDE ACTIVIDAD
// ============================================================

window.openProfileFromActivity = (userId) => {
    if (userId) {
        closeActivityModal();
        setTimeout(() => {
            import('./profile-modal.js').then(({ openProfileModal }) => {
                openProfileModal(userId);
            });
        }, 300);
    }
};

// ============================================================
// MANEJAR ACCIÓN DE SEGUIR
// ============================================================

async function handleFollowAction(userId, action) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para hacer esto', true);
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/follows/${action}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast(action === 'accept' ? '✅ Solicitud aceptada' : '❌ Solicitud rechazada');
            loadActivityData();
        } else {
            showToast(data.error || 'Error', true);
        }
    } catch (error) {
        console.error('Error en acción de follow:', error);
        showToast('Error al procesar', true);
    }
}

// ============================================================
// ACCIONES
// ============================================================

async function markAllRead() {
    const token = getToken();
    if (!token) return;
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            document.querySelectorAll('.activity-item').forEach(item => {
                item.classList.remove('unread');
                const dot = item.querySelector('.unread-dot');
                if (dot) dot.remove();
            });
            unreadCount = 0;
            updateBadge();
            showToast('✅ Todas las notificaciones marcadas como leídas');
        }
    } catch (error) {
        console.error('Error marcando todas como leídas:', error);
        showToast('Error al marcar todas', true);
    }
}

async function clearAllActivity() {
    const token = getToken();
    if (!token) return;
    
    if (!confirm('¿Eliminar todas las notificaciones?')) return;
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/clear-all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            notifications = [];
            unreadCount = 0;
            const body = document.getElementById('activityBody');
            if (body) {
                renderActivity(body);
            }
            updateBadge();
            showToast('🗑️ Notificaciones eliminadas');
        }
    } catch (error) {
        console.error('Error eliminando notificaciones:', error);
        showToast('Error al eliminar', true);
    }
}

function updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
    
    const navBadge = document.getElementById('navNotifBadge');
    if (navBadge) {
        if (unreadCount > 0) {
            navBadge.style.display = 'flex';
            navBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            navBadge.style.display = 'none';
        }
    }
}

// ============================================================
// UTILIDADES
// ============================================================

function getTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ============================================================
// ACCIONES GLOBALES (LEGACY)
// ============================================================

window.openStoryFromActivity = (storyId) => {
    if (storyId) {
        closeActivityModal();
        setTimeout(() => {
            openStoryModal(storyId);
        }, 300);
    }
};

// ============================================================
// EXPORTAR
// ============================================================

export { 
    openActivityModal, 
    closeActivityModal,
    updateBadge,
    markNotificationRead
};