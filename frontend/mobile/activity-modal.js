// ============================================================
// activity-modal.js - VERSIÓN COMPLETA CON SUPERPOSICIÓN Y FILTRADO DE COMENTARIOS
// 🔥 INTEGRADO CON i18n PARA TRADUCCIÓN DE INTERFAZ
// 🔥 CORREGIDO: Eliminación de notificaciones
// 🔥 NUEVO: refreshNotificationCount() para actualizar contador desde fuera
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar } from './auth.js';
import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';

// 🔥 IMPORTAR SISTEMA i18n
import { t, onLocaleChange, translateAll } from './i18n.js';

const API_URL = window.location.origin;
let socket = null;

let activityOverlay = null;
let isOpen = false;
let notifications = [];
let unreadCount = 0;
let localeUnsubscribe = null;

// ============================================================
// 🔥 ESCUCHAR CAMBIOS DE IDIOMA
// ============================================================

function initI18nForActivity() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    
    localeUnsubscribe = onLocaleChange(() => {
        if (isOpen) {
            translateActivityUI();
        }
    });
}

// ============================================================
// 🔥 TRADUCIR UI DE ACTIVIDAD
// ============================================================

function translateActivityUI() {
    const overlay = document.getElementById('activityOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    
    console.log('🌐 Traduciendo UI de actividad...');
    
    // Traducir título
    const title = overlay.querySelector('.activity-header h2');
    if (title) {
        const icon = title.querySelector('i');
        const text = t('nav.notifications');
        if (text && text !== 'nav.notifications') {
            title.innerHTML = '';
            if (icon) title.appendChild(icon);
            title.appendChild(document.createTextNode(' ' + text));
        }
    }
    
    // Traducir botones de acciones
    const markBtn = overlay.querySelector('.mark-all-read');
    if (markBtn) {
        const icon = markBtn.querySelector('i');
        const text = t('notif.markAllRead');
        if (text && text !== 'notif.markAllRead') {
            markBtn.innerHTML = '';
            if (icon) markBtn.appendChild(icon);
            markBtn.appendChild(document.createTextNode(' ' + text));
        }
    }
    
    const clearBtn = overlay.querySelector('.clear-all');
    if (clearBtn) {
        const icon = clearBtn.querySelector('i');
        const text = t('notif.clearAll');
        if (text && text !== 'notif.clearAll') {
            clearBtn.innerHTML = '';
            if (icon) clearBtn.appendChild(icon);
            clearBtn.appendChild(document.createTextNode(' ' + text));
        }
    }
    
    // Traducir estados vacíos
    const emptyStates = overlay.querySelectorAll('.activity-empty h3, .activity-empty p');
    emptyStates.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // Traducir elementos de actividad (si hay)
    const items = overlay.querySelectorAll('.activity-item');
    items.forEach(item => {
        const fromName = item.querySelector('.from-name');
        const typeBadge = item.querySelector('.type-badge');
        const message = item.querySelector('.message');
        const time = item.querySelector('.time');
        const storyLink = item.querySelector('.story-link');
        const acceptBtn = item.querySelector('.accept-follow');
        const rejectBtn = item.querySelector('.reject-follow');
        
        // Traducir badge de tipo
        if (typeBadge) {
            const type = typeBadge.textContent.trim().toLowerCase();
            const typeMap = {
                'like': t('notif.typeLike'),
                'comment': t('notif.typeComment'),
                'reply': t('notif.typeReply'),
                'follow_request': t('notif.typeFollowRequest'),
                'follow_accept': t('notif.typeFollowAccept'),
                'mention': t('notif.typeMention'),
                'message': t('notif.typeMessage')
            };
            if (typeMap[type]) {
                typeBadge.textContent = typeMap[type];
            }
        }
        
        // Traducir botón de aceptar/rechazar
        if (acceptBtn) {
            const text = t('notif.accept');
            if (text && text !== 'notif.accept') {
                acceptBtn.innerHTML = `<i class="fas fa-check"></i> ${text}`;
            }
        }
        if (rejectBtn) {
            const text = t('notif.reject');
            if (text && text !== 'notif.reject') {
                rejectBtn.innerHTML = `<i class="fas fa-times"></i> ${text}`;
            }
        }
        
        // Traducir enlace "Ver historia"
        if (storyLink) {
            const icon = storyLink.querySelector('i');
            const text = t('story.view');
            if (text && text !== 'story.view') {
                storyLink.innerHTML = '';
                if (icon) storyLink.appendChild(icon);
                storyLink.appendChild(document.createTextNode(' ' + text));
            }
        }
    });
    
    console.log('✅ UI de actividad traducida');
}

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
            <h2><i class="fas fa-heart"></i> ${t('nav.notifications') || 'Actividad'}</h2>
            <button class="close-btn" id="closeActivity">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="activity-body" id="activityBody">
            <div class="activity-empty">
                <i class="fas fa-spinner fa-pulse"></i>
                <h3 data-i18n="modal.loading">${t('modal.loading') || 'Cargando actividad...'}</h3>
            </div>
        </div>
        <div class="activity-actions">
            <button class="mark-all-read" id="markAllRead">
                <i class="fas fa-check-double"></i> ${t('notif.markAllRead') || 'Marcar todas como leídas'}
            </button>
            <button class="clear-all" id="clearAllActivity">
                <i class="fas fa-trash"></i> ${t('notif.clearAll') || 'Limpiar'}
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    activityOverlay = overlay;
    
    // Inicializar i18n
    initI18nForActivity();
    
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
                refreshNotificationCount();
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
            refreshNotificationCount();
        });
        
        socket.on('all_notifications_read', () => {
            document.querySelectorAll('.activity-item').forEach(item => {
                item.classList.remove('unread');
            });
            unreadCount = 0;
            updateBadge();
            refreshNotificationCount();
        });
        
        socket.on('notification_deleted', (data) => {
            const item = document.querySelector(`.activity-item[data-id="${data.notificationId}"]`);
            if (item) {
                item.remove();
                notifications = notifications.filter(n => n.id !== data.notificationId);
                updateBadge();
                refreshNotificationCount();
                
                // Verificar si ya no hay notificaciones
                if (notifications.length === 0) {
                    const body = document.getElementById('activityBody');
                    if (body) {
                        body.innerHTML = `
                            <div class="activity-empty">
                                <i class="fas fa-heart" style="color:rgba(255,107,107,0.05);"></i>
                                <h3 data-i18n="notif.empty">${t('notif.empty') || 'Sin actividad'}</h3>
                                <p data-i18n="notif.emptyDesc">${t('notif.emptyDesc') || 'Cuando alguien interactúe contigo, aparecerá aquí'}</p>
                            </div>
                        `;
                        setTimeout(translateActivityUI, 100);
                    }
                }
            }
        });
        
        socket.on('all_notifications_cleared', () => {
            notifications = [];
            unreadCount = 0;
            const body = document.getElementById('activityBody');
            if (body) {
                body.innerHTML = `
                    <div class="activity-empty">
                        <i class="fas fa-heart" style="color:rgba(255,107,107,0.05);"></i>
                        <h3 data-i18n="notif.empty">${t('notif.empty') || 'Sin actividad'}</h3>
                        <p data-i18n="notif.emptyDesc">${t('notif.emptyDesc') || 'Cuando alguien interactúe contigo, aparecerá aquí'}</p>
                    </div>
                `;
                setTimeout(translateActivityUI, 100);
            }
            updateBadge();
            refreshNotificationCount();
        });
        
        socket.on('notification_count_updated', (data) => {
            console.log(`🔔 Contador actualizado vía socket: ${data.unreadCount}`);
            unreadCount = data.unreadCount || 0;
            updateBadge();
        });
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADOR DESDE FUERA
// ============================================================

async function refreshNotificationCount() {
    const token = getToken();
    if (!token) {
        console.log('🔒 Sin token, no se puede actualizar contador');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            unreadCount = data.unreadCount || 0;
            
            // Actualizar badge en navegación
            const navBadge = document.getElementById('navNotifBadge');
            if (navBadge) {
                if (unreadCount > 0) {
                    navBadge.style.display = 'flex';
                    navBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                } else {
                    navBadge.style.display = 'none';
                }
            }
            
            // Actualizar badge del header (si existe)
            const headerBadge = document.querySelector('.icon-btn .badge');
            if (headerBadge) {
                if (unreadCount > 0) {
                    headerBadge.style.display = 'flex';
                    headerBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                } else {
                    headerBadge.style.display = 'none';
                }
            }
            
            // Actualizar badge interno
            const badge = document.getElementById('notifBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.style.display = 'flex';
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }
            
            console.log(`🔔 Contador actualizado: ${unreadCount} notificaciones no leídas`);
        }
    } catch (error) {
        console.warn('⚠️ Error actualizando contador de notificaciones:', error);
    }
}

// ============================================================
// ABRIR / CERRAR
// ============================================================

function openActivityModal() {
    if (!activityOverlay) createActivityModal();
    
    isOpen = true;
    window._activityModalOpen = true;
    activityOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Traducir UI al abrir
    setTimeout(translateActivityUI, 100);
    
    loadActivityData();
}

function closeActivityModal() {
    isOpen = false;
    window._activityModalOpen = false;
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
            <h3 data-i18n="modal.loading">${t('modal.loading') || 'Cargando actividad...'}</h3>
        </div>
    `;
    
    const token = getToken();
    if (!token) {
        body.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-lock"></i>
                <h3 data-i18n="error.unauthorized">${t('error.unauthorized') || 'Inicia sesión'}</h3>
                <p data-i18n="notif.loginToView">${t('notif.loginToView') || 'Inicia sesión para ver tu actividad'}</p>
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
            refreshNotificationCount();
            // Traducir después de renderizar
            setTimeout(translateActivityUI, 100);
        } else {
            throw new Error('Error cargando actividad');
        }
    } catch (error) {
        console.error('Error cargando actividad:', error);
        body.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-exclamation-triangle" style="color:#ff6b6b;"></i>
                <h3 data-i18n="error.general">${t('error.general') || 'Error al cargar'}</h3>
                <p data-i18n="error.retry">${t('error.retry') || 'Intenta de nuevo más tarde'}</p>
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
                refreshNotificationCount();
                
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
                <h3 data-i18n="notif.empty">${t('notif.empty') || 'Sin actividad'}</h3>
                <p data-i18n="notif.emptyDesc">${t('notif.emptyDesc') || 'Cuando alguien interactúe contigo, aparecerá aquí'}</p>
            </div>
        `;
        return;
    }
    
    const typeConfig = {
        'like': { icon: '❤️', color: '#ff6b6b', label: t('notif.typeLike') || 'Like' },
        'comment': { icon: '💬', color: '#c084fc', label: t('notif.typeComment') || 'Comentario' },
        'reply': { icon: '💬', color: '#34d399', label: t('notif.typeReply') || 'Respuesta' },
        'reply_to_reply': { icon: '💬', color: '#f472b6', label: t('notif.typeReply') || 'Respuesta' },
        'follow_request': { icon: '📨', color: '#fbbf24', label: t('notif.typeFollowRequest') || 'Solicitud' },
        'follow_accept': { icon: '✅', color: '#22c55e', label: t('notif.typeFollowAccept') || 'Aceptado' },
        'mention': { icon: '🔔', color: '#f472b6', label: t('notif.typeMention') || 'Mención' },
        'message': { icon: '💬', color: '#60a5fa', label: t('notif.typeMessage') || 'Mensaje' }
    };
    
    let html = '';
    notifications.forEach((notif, index) => {
        const config = typeConfig[notif.type] || { icon: '🔔', color: 'rgba(255,255,255,0.1)', label: t('notif.typeActivity') || 'Actividad' };
        const isUnread = !notif.read;
        const timeAgo = getTimeAgo(notif.createdAt);
        const isTranslated = notif.translated || false;
        
        const fullName = notif.fromName || 'Usuario';
        const username = notif.fromUsername || 'usuario';
        const avatar = notif.fromAvatar || getAvatar(fullName);
        
        const iconHtml = `<span style="font-size:18px;">${config.icon}</span>`;
        const typeBadge = `<span class="type-badge" style="font-size:8px;background:${config.color}20;color:${config.color};padding:2px 8px;border-radius:8px;margin-left:6px;">${config.label}</span>`;
        const translatedBadge = isTranslated ? 
            `<span class="translated-badge" style="font-size:8px;color:rgba(192,132,252,0.4);margin-left:6px;">🌐 ${t('notif.translated') || 'Traducido'}</span>` : '';
        
        let messageHtml = notif.message || t('notif.activity') || 'Actividad';
        if (notif.type === 'like') {
            messageHtml = `❤️ ${messageHtml}`;
        }
        
        if (notif.type === 'reply' || notif.type === 'reply_to_reply') {
            const fromName = notif.fromName || 'Usuario';
            const preview = notif.replyPreview || notif.data?.replyPreview || '';
            const previewText = preview.length > 40 ? preview.substring(0, 40) + '...' : preview;
            messageHtml = `${fromName} ${t('notif.repliedToComment') || 'respondió a tu comentario'}: "${previewText}"`;
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
                        <i class="fas fa-check"></i> ${t('notif.accept') || 'Aceptar'}
                    </button>
                    <button class="reject-follow" data-user-id="${notif.fromUserId}" 
                            style="background:rgba(255,107,107,0.15);border:1px solid rgba(255,107,107,0.2);color:#ff6b6b;padding:4px 14px;border-radius:14px;font-size:10px;cursor:pointer;">
                        <i class="fas fa-times"></i> ${t('notif.reject') || 'Rechazar'}
                    </button>
                </div>
            `;
        }
        
        // 🔥 BOTÓN DE ELIMINAR INDIVIDUAL
        let deleteBtnHtml = `
            <button class="delete-notification" data-id="${notif.id}" 
                    style="background:none;border:none;color:rgba(255,255,255,0.05);font-size:11px;cursor:pointer;padding:2px 6px;border-radius:4px;transition:color 0.2s;margin-left:4px;"
                    title="${t('action.delete') || 'Eliminar'}">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        let storyLink = '';
        const storyId = notif.storyId || '';
        let highlightId = '';
        
        if (notif.type === 'reply' || notif.type === 'reply_to_reply') {
            highlightId = notif.replyId || notif.commentId || '';
        } else if (notif.type === 'comment' || notif.type === 'mention') {
            highlightId = notif.commentId || '';
        }
        
        if (storyId) {
            storyLink = `
                <span class="story-link" data-story-id="${storyId}" 
                      data-highlight-id="${highlightId}"
                      data-notification-id="${notif.id}"
                      style="font-size:9px;color:rgba(192,132,252,0.3);cursor:pointer;margin-top:2px;display:inline-block;">
                    <i class="fas fa-book-open"></i> ${t('story.view') || 'Ver historia'}
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
                        ${deleteBtnHtml}
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
    
    // Eventos para seguir
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
    
    // 🔥 EVENTO PARA ELIMINAR NOTIFICACIÓN INDIVIDUAL
    container.querySelectorAll('.delete-notification').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const notificationId = btn.dataset.id;
            if (notificationId) {
                await deleteSingleNotification(notificationId);
            }
        });
    });
    
    // EVENTOS PARA ENLACES DE HISTORIAS
    container.querySelectorAll('.story-link').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const storyId = el.dataset.storyId;
            const highlightId = el.dataset.highlightId || '';
            const notificationId = el.dataset.notificationId || '';
            
            if (storyId) {
                if (notificationId) {
                    await markNotificationRead(notificationId);
                }
                window.openStoryFromActivityOverlay(storyId, highlightId, notificationId);
            }
        });
    });
    
    // CLICK EN TODA LA NOTIFICACIÓN
    container.querySelectorAll('.activity-item').forEach(item => {
        item.addEventListener('click', async () => {
            const notificationId = item.dataset.id;
            const storyLink = item.querySelector('.story-link');
            
            if (storyLink) {
                const storyId = storyLink.dataset.storyId;
                const highlightId = storyLink.dataset.highlightId || '';
                const notifId = storyLink.dataset.notificationId || '';
                
                if (storyId) {
                    if (notifId) {
                        await markNotificationRead(notifId);
                    }
                    window.openStoryFromActivityOverlay(storyId, highlightId, notifId);
                }
            }
        });
    });
}

// ============================================================
// 🔥 ELIMINAR NOTIFICACIÓN INDIVIDUAL
// ============================================================

async function deleteSingleNotification(notificationId) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para hacer esto', true);
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/${notificationId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            // Eliminar de la lista local
            notifications = notifications.filter(n => n.id !== notificationId);
            
            // Eliminar del DOM
            const item = document.querySelector(`.activity-item[data-id="${notificationId}"]`);
            if (item) {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    item.remove();
                    // Verificar si ya no hay notificaciones
                    if (notifications.length === 0) {
                        const body = document.getElementById('activityBody');
                        if (body) {
                            body.innerHTML = `
                                <div class="activity-empty">
                                    <i class="fas fa-heart" style="color:rgba(255,107,107,0.05);"></i>
                                    <h3 data-i18n="notif.empty">${t('notif.empty') || 'Sin actividad'}</h3>
                                    <p data-i18n="notif.emptyDesc">${t('notif.emptyDesc') || 'Cuando alguien interactúe contigo, aparecerá aquí'}</p>
                                </div>
                            `;
                            setTimeout(translateActivityUI, 100);
                        }
                    }
                }, 300);
            }
            
            // Actualizar contador
            updateBadge();
            refreshNotificationCount();
            showToast('🗑️ ' + (data.message || t('notif.deleted') || 'Notificación eliminada'));
        } else {
            showToast(data.error || t('error.general') || 'Error al eliminar', true);
        }
    } catch (error) {
        console.error('Error eliminando notificación:', error);
        showToast(t('error.network') || 'Error de conexión', true);
    }
}

// ============================================================
// 🔥 MARCAR TODAS COMO LEÍDAS - CORREGIDO
// ============================================================

async function markAllRead() {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para hacer esto', true);
        return;
    }
    
    // Verificar si hay notificaciones no leídas
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) {
        showToast(t('notif.allRead') || 'No hay notificaciones sin leer', true);
        return;
    }
    
    const markBtn = document.getElementById('markAllRead');
    if (markBtn) {
        markBtn.disabled = true;
        markBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' + (t('action.loading') || 'Procesando...');
    }
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/read-all`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            // Actualizar UI
            document.querySelectorAll('.activity-item').forEach(item => {
                item.classList.remove('unread');
                const dot = item.querySelector('.unread-dot');
                if (dot) dot.remove();
            });
            
            // Marcar localmente
            notifications.forEach(n => n.read = true);
            unreadCount = 0;
            
            updateBadge();
            refreshNotificationCount();
            showToast('✅ ' + (data.message || t('notif.allMarkedRead') || 'Todas las notificaciones marcadas como leídas'));
        } else {
            showToast(data.error || t('error.general') || 'Error', true);
        }
    } catch (error) {
        console.error('Error marcando todas como leídas:', error);
        showToast(t('error.network') || 'Error de conexión', true);
    } finally {
        if (markBtn) {
            markBtn.disabled = false;
            markBtn.innerHTML = `<i class="fas fa-check-double"></i> ${t('notif.markAllRead') || 'Marcar todas como leídas'}`;
        }
    }
}

// ============================================================
// 🔥 LIMPIAR TODAS LAS NOTIFICACIONES - CORREGIDO
// ============================================================

async function clearAllActivity() {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para hacer esto', true);
        return;
    }
    
    // Verificar si hay notificaciones
    if (!notifications || notifications.length === 0) {
        showToast(t('notif.empty') || 'No hay notificaciones para eliminar', true);
        return;
    }
    
    if (!confirm(t('notif.confirmClearAll') || '¿Eliminar todas las notificaciones? Esta acción no se puede deshacer.')) {
        return;
    }
    
    // Deshabilitar botón mientras se procesa
    const clearBtn = document.getElementById('clearAllActivity');
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' + (t('action.loading') || 'Eliminando...');
    }
    
    try {
        const res = await fetch(`${API_URL}/api/notifications/clear-all`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            notifications = [];
            unreadCount = 0;
            
            const body = document.getElementById('activityBody');
            if (body) {
                body.innerHTML = `
                    <div class="activity-empty">
                        <i class="fas fa-heart" style="color:rgba(255,107,107,0.05);"></i>
                        <h3 data-i18n="notif.empty">${t('notif.empty') || 'Sin actividad'}</h3>
                        <p data-i18n="notif.emptyDesc">${t('notif.emptyDesc') || 'Cuando alguien interactúe contigo, aparecerá aquí'}</p>
                    </div>
                `;
                setTimeout(translateActivityUI, 100);
            }
            
            updateBadge();
            refreshNotificationCount();
            showToast('🗑️ ' + (data.message || t('notif.allCleared') || 'Todas las notificaciones eliminadas'));
        } else {
            showToast(data.error || t('error.general') || 'Error al eliminar notificaciones', true);
        }
    } catch (error) {
        console.error('Error eliminando notificaciones:', error);
        showToast(t('error.network') || 'Error de conexión', true);
    } finally {
        // Restaurar botón
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = `<i class="fas fa-trash"></i> ${t('notif.clearAll') || 'Limpiar'}`;
        }
    }
}

// ============================================================
// ABRIR HISTORIA SUPERPUESTA DESDE ACTIVIDAD
// ============================================================

window.openStoryFromActivityOverlay = function(storyId, highlightId = '', notificationId = '') {
    if (!storyId) return;
    
    console.log('📱 Abriendo historia desde actividad:', storyId, 'highlight:', highlightId);
    
    window._fromActivityModal = true;
    window._activityCommentId = highlightId;
    window._activityNotificationId = notificationId;
    
    openStoryModal(storyId, null, false, null);
    
    if (highlightId) {
        setTimeout(() => {
            let targetElement = document.querySelector(`.comment-item[data-comment-id="${highlightId}"]`);
            if (!targetElement) {
                targetElement = document.querySelector(`.comment-item[data-reply-id="${highlightId}"]`);
            }
            
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetElement.style.background = 'rgba(192,132,252,0.15)';
                targetElement.style.borderLeft = '3px solid #c084fc';
                targetElement.style.transition = 'all 0.3s ease';
                
                const parentReplyContainer = targetElement.closest('.replies');
                if (parentReplyContainer) {
                    const parentCommentItem = parentReplyContainer.closest('.comment-item');
                    if (parentCommentItem) {
                        const parentId = parentCommentItem.dataset.commentId;
                        if (parentId) {
                            const visibilityState = window.repliesVisibility?.get(parentId);
                            if (visibilityState === false) {
                                window.toggleRepliesVisibility(parentId);
                            }
                        }
                    }
                }
                
                setTimeout(() => {
                    targetElement.style.background = '';
                    targetElement.style.borderLeft = '';
                }, 4000);
            } else {
                console.log('⚠️ No se encontró el elemento con ID:', highlightId);
            }
        }, 800);
    }
};

// ============================================================
// MANEJAR ACCIÓN DE SEGUIR
// ============================================================

async function handleFollowAction(userId, action) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para hacer esto', true);
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
            showToast(action === 'accept' ? '✅ ' + (t('notif.followAccepted') || 'Solicitud aceptada') : '❌ ' + (t('notif.followRejected') || 'Solicitud rechazada'));
            loadActivityData();
        } else {
            showToast(data.error || t('error.general') || 'Error', true);
        }
    } catch (error) {
        console.error('Error en acción de follow:', error);
        showToast(t('error.general') || 'Error al procesar', true);
    }
}

// ============================================================
// ACTUALIZAR BADGE
// ============================================================

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
    
    if (diff < 60) return t('time.justNow') || 'ahora';
    if (diff < 3600) return `${t('time.minutesAgo', { n: Math.floor(diff / 60) })}`;
    if (diff < 86400) return `${t('time.hoursAgo', { n: Math.floor(diff / 3600) })}`;
    if (diff < 604800) return `${t('time.daysAgo', { n: Math.floor(diff / 86400) })}`;
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
    markNotificationRead,
    translateActivityUI,
    initI18nForActivity,
    refreshNotificationCount  // 🔥 NUEVO: Exportar para uso externo
};