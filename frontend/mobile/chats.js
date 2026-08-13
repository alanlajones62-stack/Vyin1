// ============================================================
// CHAT MOBILE - RENDERIZADO OPTIMIZADO SIN PARPADEOS
// CON SOPORTE PARA ENLACES (TikTok, YouTube, Vyin, etc.)
// ============================================================

import { getToken, getCurrentUser, showToast as authShowToast } from './auth.js';
import { openProfileModal } from './profile-modal.js';

const API_URL = window.location.origin;

let currentUser = null;
let currentConversation = null;
let conversations = { active: [], pending: [], archived: [] };
let messages = [];
let socket = null;
let messageInput = null;
let isLoadingMore = false;
let hasMoreMessages = true;
let nextOffset = 0;
const MESSAGES_PER_PAGE = 30;
let currentTab = 'active';
let isRendering = false;

let conversationsListEl = document.getElementById('conversationsList');
let messagesContainerEl = document.getElementById('messagesContainer');
let messagesPanelEl = document.getElementById('messagesPanel');
let typingTimeout = null;
let isTyping = false;
let userStatuses = new Map();
let scrollTimeout = null;
let isInitialLoad = true;

// ============================================================
// 🔗 DETECCIÓN Y APERTURA DE ENLACES - CORREGIDO
// ============================================================

function detectAndRenderLinks(text) {
    if (!text) return text;
    
    let html = text;
    
    const vyinPattern = /(https?:\/\/[^\s]*vyin-social\.onrender\.com\/(?:story|feed|profile)\/[a-zA-Z0-9_-]+)/gi;
    const tiktokPattern = /(https?:\/\/[^\s]*(?:vm\.tiktok\.com|tiktok\.com)[^\s]*)/gi;
    const youtubePattern = /(https?:\/\/[^\s]*(?:youtube\.com|youtu\.be)[^\s]*)/gi;
    const instagramPattern = /(https?:\/\/[^\s]*instagram\.com[^\s]*)/gi;
    const twitterPattern = /(https?:\/\/[^\s]*(?:twitter\.com|x\.com)[^\s]*)/gi;
    const urlPattern = /(https?:\/\/[^\s<>]+)/gi;
    
    function createLinkHtml(url, domain, icon, label, type) {
        return `<a href="${url}" target="_blank" class="link-preview ${type}-link" data-url="${url}" data-type="${type}">
            <span class="link-domain">${icon} ${domain}</span>
            <span class="link-title">${label}</span>
        </a>`;
    }
    
    html = html.replace(vyinPattern, (match) => {
        const url = match.trim();
        const type = url.includes('/story/') ? 'story' : 
                     url.includes('/profile/') ? 'profile' : 
                     url.includes('/feed/') ? 'feed' : 'link';
        const label = type === 'story' ? '📖 Ver historia' : 
                      type === 'profile' ? '👤 Ver perfil' : 
                      type === 'feed' ? '📱 Ver publicación' : '🔗 Abrir enlace';
        const icon = type === 'story' ? '📖' : type === 'profile' ? '👤' : type === 'feed' ? '📱' : '🔗';
        return createLinkHtml(url, 'Vyin', icon, label, 'vyin');
    });
    
    html = html.replace(tiktokPattern, (match) => {
        const url = match.trim();
        return createLinkHtml(url, 'TikTok', '🎵', 'Ver video en TikTok', 'tiktok');
    });
    
    html = html.replace(youtubePattern, (match) => {
        const url = match.trim();
        return createLinkHtml(url, 'YouTube', '▶️', 'Ver video en YouTube', 'youtube');
    });
    
    html = html.replace(instagramPattern, (match) => {
        const url = match.trim();
        return createLinkHtml(url, 'Instagram', '📸', 'Ver en Instagram', 'instagram');
    });
    
    html = html.replace(twitterPattern, (match) => {
        const url = match.trim();
        return createLinkHtml(url, 'Twitter/X', '🐦', 'Ver en Twitter/X', 'twitter');
    });
    
    html = html.replace(urlPattern, (match) => {
        if (match.includes('link-preview')) return match;
        
        const url = match.trim();
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            const displayUrl = url.length > 40 ? url.substring(0, 40) + '...' : url;
            return createLinkHtml(url, domain, '🔗', displayUrl, 'other');
        } catch (e) {
            return createLinkHtml(url, 'Enlace', '🔗', url.length > 40 ? url.substring(0, 40) + '...' : url, 'other');
        }
    });
    
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 🔥 ABRIR ENLACE DESDE EL CHAT - CON SOPORTE PARA PERFIL E HISTORIA
// ============================================================

function openLinkFromChat(event) {
    const link = event.target.closest('a.link-preview');
    if (!link) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const url = link.getAttribute('data-url') || link.href;
    const type = link.getAttribute('data-type') || 'other';
    
    console.log(`🔗 Abriendo enlace: ${url} (tipo: ${type})`);
    
    if (type === 'vyin' || url.includes('vyin-social.onrender.com')) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            
            let storyId = null;
            const storyMatch = pathname.match(/\/story\/([a-zA-Z0-9_-]+)/);
            if (storyMatch) {
                storyId = storyMatch[1];
            }
            if (!storyId) {
                const params = new URLSearchParams(urlObj.search);
                storyId = params.get('storyId');
            }
            if (storyId) {
                console.log(`📖 Abriendo historia: ${storyId}`);
                import('./story-modal.js').then(({ openStoryModal }) => {
                    openStoryModal(storyId);
                }).catch((err) => {
                    console.error('❌ Error cargando story-modal:', err);
                    window.open(url, '_blank');
                });
                return;
            }
            
            const profileMatch = pathname.match(/\/profile\/([a-zA-Z0-9_-]+)/);
            if (profileMatch) {
                const userId = profileMatch[1];
                console.log(`👤 Abriendo perfil: ${userId}`);
                openProfileModal(userId);
                return;
            }
            
            window.open(url, '_blank');
            
        } catch (e) {
            console.warn('Error procesando enlace de Vyin:', e);
            window.open(url, '_blank');
        }
        return;
    }
    
    window.open(url, '_blank');
}

// ============================================================
// 🔥 ABRIR PERFIL DEL USUARIO DE LA CONVERSACIÓN ACTUAL - CORREGIDO
// ============================================================

window.openProfileFromChat = function() {
    if (!currentConversation) {
        showToast('No hay usuario seleccionado', true);
        return;
    }
    
    const userId = currentConversation.id;
    const fullName = currentConversation.fullName || 'Usuario';
    console.log(`👤 Abriendo perfil de ${fullName} (${userId}) desde chat`);
    
    // 🔥 GUARDAR EL ESTADO ACTUAL DEL CHAT
    const currentConversationBackup = { ...currentConversation };
    const messagesBackup = [...messages];
    const scrollPosition = messagesContainerEl?.scrollTop || 0;
    
    // 🔥 Guardar en variable global para restaurar después
    window._chatContext = {
        conversation: currentConversationBackup,
        messages: messagesBackup,
        scrollPosition: scrollPosition,
        isChatOpen: true
    };
    
    // Abrir el perfil (NO cerramos el chat)
    openProfileModal(userId);
};

// ============================================================
// 🔥 RESTAURAR CHAT DESDE PERFIL
// ============================================================

window.restoreChatFromProfile = function() {
    if (window._chatContext && window._chatContext.isChatOpen) {
        console.log('🔄 Restaurando chat desde perfil');
        
        // Restaurar la conversación
        currentConversation = window._chatContext.conversation;
        messages = window._chatContext.messages;
        
        // Asegurar que el panel de mensajes esté visible
        if (messagesPanelEl) {
            messagesPanelEl.classList.add('active');
        }
        
        // Renderizar mensajes y restaurar scroll
        renderMessages();
        if (window._chatContext.scrollPosition) {
            setTimeout(() => {
                messagesContainerEl.scrollTop = window._chatContext.scrollPosition;
            }, 50);
        }
        
        // Actualizar header del chat
        updateChatHeaderStatus(currentConversation.id);
        
        // Limpiar el contexto
        window._chatContext = null;
        
        // Re-renderizar conversaciones para actualizar el estado activo
        renderConversations();
    }
};

// ============================================================
// CONFIGURAR EVENT DELEGATION PARA ENLACES
// ============================================================
function setupLinkDelegation() {
    if (!messagesContainerEl) return;
    messagesContainerEl.removeEventListener('click', openLinkFromChat);
    messagesContainerEl.addEventListener('click', openLinkFromChat);
}

// ============================================================
// 📜 SCROLL - SIEMPRE AL FINAL
// ============================================================

function ensureScrollAtBottom() {
    if (!messagesContainerEl) return;
    setTimeout(() => {
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }, 50);
}

// ============================================================
// 📦 PERSISTENCIA EN LOCALSTORAGE
// ============================================================

function saveChatState(userId) {
    if (!userId) return;
    try {
        const state = {
            messages: messages.slice(-50),
            scrollPosition: messagesContainerEl?.scrollTop || 0,
            timestamp: Date.now(),
            conversationStatus: currentConversation?.status || 'active'
        };
        localStorage.setItem(`chat_state_${userId}`, JSON.stringify(state));
    } catch (error) {
        console.error('Error guardando estado del chat:', error);
    }
}

function loadChatState(userId) {
    try {
        const data = localStorage.getItem(`chat_state_${userId}`);
        if (!data) return null;
        const state = JSON.parse(data);
        if (state && Date.now() - state.timestamp < 300000) {
            return state;
        }
        return null;
    } catch (error) {
        console.error('Error cargando estado del chat:', error);
        return null;
    }
}

function clearChatState(userId) {
    if (userId) {
        localStorage.removeItem(`chat_state_${userId}`);
    }
}

// ============================================================
// SHOW TOAST
// ============================================================
function showToast(message, isError = false) {
    if (typeof authShowToast === 'function') {
        authShowToast(message, isError);
        return;
    }
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : 'success'}`;
    toast.innerHTML = `<i class="fas fa-${isError ? 'exclamation-triangle' : 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 2800);
}

// ============================================================
// UTILIDADES
// ============================================================
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.floor((now - date) / 3600000);
    if (diffHours < 24) return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (diffHours < 48) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    const diffHours = Math.floor((now - date) / 3600000);
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatLastSeen(timestamp) {
    if (!timestamp) return 'recientemente';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    const diffHours = Math.floor((now - date) / 3600000);
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffMins < 1) return 'ahora mismo';
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours} h`;
    if (diffDays === 1) return 'ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function getDateDivider(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('active', show);
    }
}

// ============================================================
// FUNCIONES PRINCIPALES
// ============================================================
async function fetchUserInfo(userId) {
    const token = getToken();
    if (!token) return null;
    try {
        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) return await res.json();
    } catch (error) { console.error('Error fetching user:', error); }
    return null;
}

async function fetchUserStatus(userId) {
    const token = getToken();
    if (!token) return { status: 'offline', lastSeen: null };
    try {
        const res = await fetch(`${API_URL}/api/users/status/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            userStatuses.set(userId, { status: data.status, lastSeen: data.lastSeen });
            return data;
        }
    } catch (error) { console.error('Error fetching user status:', error); }
    return { status: 'offline', lastSeen: null };
}

function updateChatHeaderStatus(userId) {
    const statusEl = document.getElementById('chatStatus');
    const dot = statusEl?.querySelector('.status-dot-small');
    const text = statusEl?.querySelector('span:last-child');
    if (!statusEl || !dot || !text) return;

    const status = userStatuses.get(userId);
    if (status && status.status === 'online') {
        dot.className = 'status-dot-small status-online';
        text.textContent = 'En línea';
    } else {
        dot.className = 'status-dot-small status-offline';
        text.textContent = status?.lastSeen ? `Último visto ${formatLastSeen(status.lastSeen)}` : 'Desconectado';
    }
}

// ============================================================
// CAMBIAR TAB
// ============================================================
window.switchChatTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.chat-tab').forEach(el => el.classList.remove('active'));
    document.querySelector(`.chat-tab[data-tab="${tab}"]`)?.classList.add('active');
    renderConversations();
};

// ============================================================
// CARGAR CONVERSACIONES
// ============================================================
async function loadConversations() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/chats/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            
            conversations = {
                active: data.active || [],
                pending: data.pending || [],
                archived: data.archived || []
            };

            const pendingCount = document.getElementById('pendingCount');
            if (pendingCount) {
                pendingCount.textContent = conversations.pending.length || '0';
            }

            const allUserIds = [
                ...conversations.active.map(c => c.user.id),
                ...conversations.pending.map(c => c.user.id),
                ...conversations.archived.map(c => c.user.id)
            ];
            
            if (allUserIds.length > 0) {
                const statusRes = await fetch(`${API_URL}/api/users/status/batch`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: allUserIds })
                });
                if (statusRes.ok) {
                    const statuses = await statusRes.json();
                    statuses.forEach(s => {
                        userStatuses.set(s.userId, { status: s.status, lastSeen: s.lastSeen });
                    });
                }
            }

            renderConversations();
        } else if (res.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
    } catch (error) { 
        console.error('Error cargando conversaciones:', error);
        showToast('❌ Error cargando conversaciones', true);
    }
}

// ============================================================
// RENDERIZAR CONVERSACIONES
// ============================================================
function renderConversations() {
    if (!conversationsListEl) return;
    
    const searchTerm = document.getElementById('searchConversations')?.value.toLowerCase() || '';
    
    let allConversations = [];
    if (currentTab === 'active') allConversations = conversations.active || [];
    else if (currentTab === 'pending') allConversations = conversations.pending || [];
    else if (currentTab === 'archived') allConversations = conversations.archived || [];
    
    if (searchTerm) {
        allConversations = allConversations.filter(c =>
            c.user.fullName?.toLowerCase().includes(searchTerm) ||
            c.user.username?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (allConversations.length === 0) {
        const emptyMessages = {
            active: 'No hay conversaciones activas',
            pending: 'No hay solicitudes de chat pendientes',
            archived: 'No hay conversaciones archivadas'
        };
        conversationsListEl.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,0.08);">
                <i class="fas fa-comments" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                <span style="font-size:14px;">${emptyMessages[currentTab] || 'No hay conversaciones'}</span>
            </div>
        `;
        return;
    }
    
    conversationsListEl.innerHTML = allConversations.map(conv => {
        const userStatus = userStatuses.get(conv.user.id) || { status: 'offline', lastSeen: null };
        const statusClass = userStatus.status === 'online' ? 'status-online' : 'status-offline';
        const isActive = currentConversation?.id === conv.user.id;
        
        let pendingBadge = '';
        let pendingActions = '';
        
        if (conv.isPending && currentTab === 'pending') {
            pendingBadge = `<span class="pending-badge">Solicitud</span>`;
            pendingActions = `
                <div class="pending-actions">
                    <button class="btn-accept" onclick="event.stopPropagation(); window.acceptChatRequest('${conv.user.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn-reject" onclick="event.stopPropagation(); window.rejectChatRequest('${conv.user.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }
        
        const initials = conv.user.fullName 
            ? conv.user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : 'U';
        
        return `
        <div class="conversation-item ${isActive ? 'active' : ''}" onclick="window.selectConversation('${conv.user.id}')">
            <div class="conversation-avatar-wrapper">
                <div class="conversation-avatar" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;font-weight:700;font-size:18px;">
                    ${conv.user.avatar ? `<img src="${conv.user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.textContent='${initials}'" />` : initials}
                </div>
                <span class="status-dot ${statusClass}"></span>
            </div>
            <div class="conversation-info">
                <div class="conversation-name">
                    <div class="name-text">
                        <span>${escapeHtml(conv.user.fullName || conv.user.username)}</span>
                        ${conv.user.isVerified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}
                        ${pendingBadge}
                    </div>
                    <span class="conversation-time">${formatTimeAgo(conv.lastMessage.timestamp)}</span>
                </div>
                <div class="conversation-last-message">
                    ${conv.lastMessage.fromMe ? '<span class="is-own">Tú:</span>' : ''}
                    ${escapeHtml(conv.lastMessage.content?.substring(0, 50) || '')}${(conv.lastMessage.content?.length || 0) > 50 ? '...' : ''}
                    ${conv.isPending ? ' <span style="color:#c084fc;font-size:10px;">· Solicitud de chat</span>' : ''}
                    ${conv.status === 'archived' ? ' <span style="color:rgba(255,255,255,0.15);font-size:10px;">· Archivado</span>' : ''}
                </div>
            </div>
            ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount > 9 ? '9+' : conv.unreadCount}</div>` : ''}
            ${pendingActions}
        </div>
    `}).join('');
}

// ============================================================
// ACEPTAR/RECHAZAR SOLICITUD
// ============================================================
window.acceptChatRequest = async function(userId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/chats/conversations/${userId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showToast('✅ Solicitud de chat aceptada');
            loadConversations();
            setTimeout(() => window.selectConversation(userId), 500);
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al aceptar solicitud', true);
        }
    } catch (error) {
        console.error('Error aceptando solicitud:', error);
        showToast('❌ Error al aceptar solicitud', true);
    }
};

window.rejectChatRequest = async function(userId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/chats/conversations/${userId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showToast('❌ Solicitud de chat rechazada');
            loadConversations();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al rechazar solicitud', true);
        }
    } catch (error) {
        console.error('Error rechazando solicitud:', error);
        showToast('❌ Error al rechazar solicitud', true);
    }
};

// ============================================================
// CARGAR MENSAJES
// ============================================================
async function loadMessages(userId, loadMore = false, offset = 0) {
    const token = getToken();
    if (!token) return;

    if (!loadMore && !isInitialLoad) {
        const cached = loadChatState(userId);
        if (cached && cached.messages && cached.messages.length > 0) {
            console.log(`📦 Cargando ${cached.messages.length} mensajes desde caché local`);
            messages = cached.messages;
            renderMessages();
            if (cached.scrollPosition) {
                setTimeout(() => {
                    messagesContainerEl.scrollTop = cached.scrollPosition;
                }, 50);
            }
            if (currentConversation) {
                currentConversation.status = cached.conversationStatus || 'active';
            }
            refreshMessagesInBackground(userId);
            return;
        }
    }

    if (!loadMore) {
        messages = [];
        hasMoreMessages = true;
        nextOffset = 0;
        showLoading(true);
    }

    try {
        const url = `${API_URL}/api/chats/messages/${userId}?limit=${MESSAGES_PER_PAGE}&offset=${offset}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            const newMessages = data.messages || [];
            
            if (currentConversation) {
                currentConversation.status = data.conversationStatus || 'active';
                currentConversation.mutualFollow = data.mutualFollow || false;
            }
            
            if (loadMore) {
                const existingIds = new Set(messages.map(m => m.id));
                const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                const oldScrollHeight = messagesContainerEl?.scrollHeight || 0;
                const oldScrollTop = messagesContainerEl?.scrollTop || 0;
                
                messages = [...uniqueNew.reverse(), ...messages];
                hasMoreMessages = data.hasMore || false;
                nextOffset = offset + MESSAGES_PER_PAGE;
                
                renderMessages();
                if (messagesContainerEl) {
                    requestAnimationFrame(() => {
                        const newScrollHeight = messagesContainerEl.scrollHeight;
                        messagesContainerEl.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
                    });
                }
            } else {
                messages = newMessages;
                hasMoreMessages = data.hasMore || false;
                nextOffset = MESSAGES_PER_PAGE;
                renderMessages();
                ensureScrollAtBottom();
                markMessagesAsRead(userId);
                saveChatState(userId);
            }
        }
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        if (!loadMore) showToast('❌ Error cargando mensajes', true);
    }
    if (!loadMore) {
        showLoading(false);
        isInitialLoad = false;
    }
}

async function refreshMessagesInBackground(userId) {
    try {
        const token = getToken();
        if (!token) return;
        const url = `${API_URL}/api/chats/messages/${userId}?limit=${MESSAGES_PER_PAGE}&offset=0`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            const newMessages = data.messages || [];
            if (newMessages.length > messages.length) {
                messages = newMessages;
                renderMessages();
                saveChatState(userId);
            }
        }
    } catch (error) {}
}

// ============================================================
// 📝 RENDERIZAR MENSAJES
// ============================================================
function renderMessages() {
    if (isRendering) return;
    isRendering = true;
    
    if (!messagesContainerEl) {
        isRendering = false;
        return;
    }
    
    const scrollTop = messagesContainerEl.scrollTop;
    const scrollHeight = messagesContainerEl.scrollHeight;
    const clientHeight = messagesContainerEl.clientHeight;
    const wasNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;

    if (messages.length === 0) {
        let emptyMessage = 'No hay mensajes';
        let emptySubMessage = 'Envía el primer mensaje';
        
        if (currentConversation?.status === 'pending') {
            emptyMessage = '💬 Solicitud de chat pendiente';
            emptySubMessage = 'Espera a que el usuario acepte tu solicitud';
        } else if (currentConversation?.status === 'archived') {
            emptyMessage = '📦 Conversación archivada';
            emptySubMessage = 'Sigue al usuario para reactivar el chat';
        }
        
        messagesContainerEl.innerHTML = `
            <div class="empty-state-chat">
                <i class="fas fa-comment-dots"></i>
                <h3>${emptyMessage}</h3>
                <p>${emptySubMessage}</p>
            </div>
        `;
        isRendering = false;
        return;
    }

    let messagesHtml = '';
    let lastDate = '';

    for (const msg of messages) {
        const msgDate = getDateDivider(msg.timestamp);
        if (msgDate !== lastDate) {
            messagesHtml += `
                <div class="date-divider"><span>${msgDate}</span></div>
            `;
            lastDate = msgDate;
        }

        const messageId = msg.id || `temp_${Date.now()}_${Math.random()}`;
        const processedContent = detectAndRenderLinks(escapeHtml(msg.content));
        
        messagesHtml += `
            <div class="message ${msg.isOwn ? 'message-own' : 'message-other'}" data-message-id="${messageId}">
                <div class="message-bubble">
                    <div class="message-content">${processedContent}</div>
                    <div class="message-time">
                        ${formatTime(msg.timestamp)}
                        ${msg.isOwn ? `<span class="message-read">${msg.read ? '✓✓' : '✓'}</span>` : ''}
                        ${msg.isOwn ? `<i class="fas fa-trash-alt delete-message" onclick="event.stopPropagation(); window.deleteMessage('${messageId}')"></i>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    requestAnimationFrame(() => {
        messagesContainerEl.innerHTML = messagesHtml;
        setupLinkDelegation();
        
        if (wasNearBottom) {
            requestAnimationFrame(() => {
                messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
            });
        } else {
            const newScrollHeight = messagesContainerEl.scrollHeight;
            const ratio = scrollTop / (scrollHeight || 1);
            messagesContainerEl.scrollTop = ratio * newScrollHeight;
        }
        isRendering = false;
    });
}

// ============================================================
// ➕ AÑADIR UN SOLO MENSAJE
// ============================================================
function appendSingleMessage(msg) {
    if (!messagesContainerEl || isRendering) return;

    if (messagesContainerEl.querySelector('.empty-state-chat') || messages.length === 0) {
        renderMessages();
        ensureScrollAtBottom();
        return;
    }

    let lastDate = '';
    const existingDateDividers = messagesContainerEl.querySelectorAll('.date-divider');
    if (existingDateDividers.length > 0) {
        const lastDivider = existingDateDividers[existingDateDividers.length - 1];
        if (lastDivider) {
            lastDate = lastDivider.textContent.trim();
        }
    }

    const msgDate = getDateDivider(msg.timestamp);
    let html = '';
    
    if (msgDate !== lastDate) {
        html += `
            <div class="date-divider"><span>${msgDate}</span></div>
        `;
    }

    const messageId = msg.id || `temp_${Date.now()}_${Math.random()}`;
    const processedContent = detectAndRenderLinks(escapeHtml(msg.content));
    
    html += `
        <div class="message ${msg.isOwn ? 'message-own' : 'message-other'}" data-message-id="${messageId}" style="animation: messageIn 0.3s ease;">
            <div class="message-bubble">
                <div class="message-content">${processedContent}</div>
                <div class="message-time">
                    ${formatTime(msg.timestamp)}
                    ${msg.isOwn ? `<span class="message-read">${msg.read ? '✓✓' : '✓'}</span>` : ''}
                    ${msg.isOwn ? `<i class="fas fa-trash-alt delete-message" onclick="event.stopPropagation(); window.deleteMessage('${messageId}')"></i>` : ''}
                </div>
            </div>
        </div>
    `;

    messagesContainerEl.insertAdjacentHTML('beforeend', html);
    setupLinkDelegation();
    ensureScrollAtBottom();
}

// ============================================================
// 🔄 ACTUALIZAR UN SOLO MENSAJE
// ============================================================
function updateSingleMessage(tempId, realMessage) {
    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"]`);
    if (msgEl) {
        const contentEl = msgEl.querySelector('.message-content');
        const timeEl = msgEl.querySelector('.message-time');
        if (contentEl) {
            const processedContent = detectAndRenderLinks(escapeHtml(realMessage.content));
            contentEl.innerHTML = processedContent;
        }
        if (timeEl) {
            timeEl.innerHTML = `
                ${formatTime(realMessage.timestamp)}
                <span class="message-read">${realMessage.read ? '✓✓' : '✓'}</span>
                <i class="fas fa-trash-alt delete-message" onclick="event.stopPropagation(); window.deleteMessage('${realMessage.id}')"></i>
            `;
        }
        msgEl.dataset.messageId = realMessage.id;
    }
}

// ============================================================
// 🗑️ ELIMINAR UN SOLO MENSAJE
// ============================================================
function removeSingleMessage(messageId) {
    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (msgEl) {
        msgEl.remove();
        if (messagesContainerEl.querySelectorAll('.message').length === 0) {
            messagesContainerEl.innerHTML = `
                <div class="empty-state-chat">
                    <i class="fas fa-comment-dots"></i>
                    <h3>No hay mensajes</h3>
                    <p>Envía el primer mensaje</p>
                </div>
            `;
        }
    }
}

function markMessagesAsRead(userId) {
    const token = getToken();
    if (!token) return;

    let updated = false;
    messages.forEach(msg => {
        if (!msg.isOwn && !msg.read) {
            msg.read = true;
            updated = true;
        }
    });
    if (updated) {
        document.querySelectorAll('.message-other .message-read').forEach(el => {
            el.textContent = '✓✓';
        });
    }

    if (socket && socket.connected) {
        socket.emit('mark_messages_read', { withUserId: userId });
    }

    fetch(`${API_URL}/api/chats/conversations/${userId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    }).catch(err => console.error('Error marking read:', err));
}

function setupInfiniteScroll() {
    if (!messagesContainerEl) return;
    messagesContainerEl.removeEventListener('scroll', handleScroll);
    messagesContainerEl.addEventListener('scroll', handleScroll, { passive: true });
}

function handleScroll() {
    if (!messagesContainerEl) return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
        if (messagesContainerEl.scrollTop === 0 && hasMoreMessages && !isLoadingMore && currentConversation) {
            isLoadingMore = true;
            loadMessages(currentConversation.id, true, nextOffset).then(() => {
                isLoadingMore = false;
            });
        }
        if (currentConversation) {
            saveChatState(currentConversation.id);
        }
    }, 200);
}

// ============================================================
// 🔥 SELECCIONAR CONVERSACIÓN
// ============================================================
window.selectConversation = async function(userIdOrObject) {
    let userId, userData;
    if (typeof userIdOrObject === 'string') {
        userId = userIdOrObject;
        const allConvs = [...conversations.active, ...conversations.pending, ...conversations.archived];
        const existingConv = allConvs.find(c => c.user.id === userId);
        if (existingConv) userData = existingConv.user;
        else userData = await fetchUserInfo(userId);
        if (!userData) { showToast('❌ No se pudo cargar el usuario', true); return; }
    } else {
        userData = userIdOrObject;
        userId = userData.id;
    }

    if (currentConversation && messages.length > 0) {
        saveChatState(currentConversation.id);
    }

    currentConversation = {
        id: userData.id,
        fullName: userData.fullName,
        username: userData.username,
        avatar: userData.avatar,
        status: 'active'
    };

    await fetchUserStatus(userId);

    renderConversations();
    isInitialLoad = true;
    await loadMessages(userId, false, 0);
    showMessagesPanel();
    updateChatHeaderStatus(userId);
};

// ============================================================
// 🔥 MOSTRAR PANEL DE MENSAJES
// ============================================================
function showMessagesPanel() {
    if (!messagesPanelEl) return;
    messagesPanelEl.classList.add('active');

    const avatar = document.getElementById('chatAvatar');
    const name = document.getElementById('chatName');
    const backBtn = document.getElementById('backChatBtn');

    const initials = currentConversation?.fullName 
        ? currentConversation.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    // Limpiar avatar anterior
    const avatarContainer = avatar?.parentElement;
    if (avatarContainer) {
        const oldInitials = avatarContainer.querySelector('.avatar-initials');
        if (oldInitials) oldInitials.remove();
    }

    if (avatar) {
        if (currentConversation?.avatar) {
            avatar.src = currentConversation.avatar;
            avatar.style.display = 'block';
            avatar.onerror = function() {
                this.style.display = 'none';
                const initialsEl = this.parentElement.querySelector('.avatar-initials');
                if (initialsEl) initialsEl.style.display = 'flex';
            };
        } else {
            avatar.style.display = 'none';
            let initialsEl = avatar.parentElement.querySelector('.avatar-initials');
            if (!initialsEl) {
                initialsEl = document.createElement('div');
                initialsEl.className = 'avatar-initials';
                initialsEl.style.cssText = 'width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;';
                avatar.parentElement.insertBefore(initialsEl, avatar);
            }
            initialsEl.textContent = initials;
            initialsEl.style.display = 'flex';
        }
    }
    
    if (name) {
        name.textContent = currentConversation?.fullName || currentConversation?.username || 'Usuario';
        name.style.cursor = 'pointer';
        name.onclick = function(e) {
            e.stopPropagation();
            window.openProfileFromChat();
        };
    }
    
    if (avatar) {
        avatar.style.cursor = 'pointer';
        avatar.onclick = function(e) {
            e.stopPropagation();
            window.openProfileFromChat();
        };
    }
    
    if (backBtn) {
        backBtn.onclick = function() {
            if (currentConversation) {
                saveChatState(currentConversation.id);
            }
            // 🔥 LIMPIAR CONVERSACIÓN ACTUAL
            currentConversation = null;
            window._chatContext = null;
            messagesPanelEl.classList.remove('active');
            messagesContainerEl.innerHTML = `
                <div class="empty-state-chat">
                    <i class="fas fa-comment-dots"></i>
                    <h3>No hay mensajes</h3>
                    <p>Selecciona una conversación</p>
                </div>
            `;
            // Limpiar avatar del header
            const avatarEl = document.getElementById('chatAvatar');
            if (avatarEl) {
                avatarEl.src = '';
                avatarEl.style.display = 'block';
                const initialsEl = avatarEl.parentElement.querySelector('.avatar-initials');
                if (initialsEl) initialsEl.style.display = 'none';
            }
            renderConversations();
            loadConversations();
        };
    }

    messageInput = document.getElementById('messageInput');
    if (messageInput) {
        const newInput = messageInput.cloneNode(true);
        messageInput.parentNode.replaceChild(newInput, messageInput);
        messageInput = newInput;

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendMessage();
            }
        });
        messageInput.addEventListener('input', handleTyping);
        setTimeout(() => messageInput.focus(), 300);
    }

    setupInfiniteScroll();
    setupLinkDelegation();
    ensureScrollAtBottom();
}

// ============================================================
// ENVIAR MENSAJE
// ============================================================
window.sendMessage = async function() {
    if (!messageInput || !messageInput.value.trim() || !currentConversation) return;
    const content = messageInput.value.trim();
    messageInput.value = '';
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    const token = getToken();
    if (!token) { showToast('❌ Sesión expirada', true); return; }

    const tempId = 'temp_' + Date.now();
    const newMsg = {
        id: tempId,
        content,
        timestamp: new Date().toISOString(),
        isOwn: true,
        read: false
    };
    messages.push(newMsg);
    
    appendSingleMessage(newMsg);

    try {
        const res = await fetch(`${API_URL}/api/chats/messages/${currentConversation.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        if (res.ok) {
            const realMessage = await res.json();
            const index = messages.findIndex(m => m.id === tempId);
            if (index !== -1) {
                messages[index] = realMessage;
                updateSingleMessage(tempId, realMessage);
                saveChatState(currentConversation.id);
            }
            loadConversations();
        } else {
            messages = messages.filter(m => m.id !== tempId);
            removeSingleMessage(tempId);
            showToast('❌ Error al enviar mensaje', true);
        }
    } catch (error) {
        messages = messages.filter(m => m.id !== tempId);
        removeSingleMessage(tempId);
        showToast('❌ Error de conexión', true);
    }
    if (sendBtn) sendBtn.disabled = false;
};

// ============================================================
// ELIMINAR MENSAJE
// ============================================================
window.deleteMessage = async function(messageId) {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/api/chats/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            messages = messages.filter(m => m.id !== messageId);
            removeSingleMessage(messageId);
            loadConversations();
            if (currentConversation) {
                saveChatState(currentConversation.id);
            }
            showToast('✅ Mensaje eliminado');
        }
    } catch (error) {
        console.error('Error eliminando mensaje:', error);
        showToast('❌ Error al eliminar', true);
    }
};

// ============================================================
// TYPING
// ============================================================
function handleTyping() {
    if (!socket || !socket.connected || !currentConversation) return;
    if (typingTimeout) clearTimeout(typingTimeout);
    if (!isTyping && messageInput && messageInput.value.trim().length > 0) {
        isTyping = true;
        socket.emit('typing', { to: currentConversation.id, isTyping: true });
    }
    typingTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            socket.emit('typing', { to: currentConversation.id, isTyping: false });
        }
    }, 1000);
}

// ============================================================
// SOCKET
// ============================================================
function initSocket() {
    const token = getToken();
    if (!token) return;

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    window.socket = socket;

    socket.on('connect', () => {
        console.log('🔌 Socket conectado en chat');
        if (currentUser) {
            socket.emit('user_online', { page: 'chat' });
        }
    });

    socket.on('receive_message', (message) => {
        if (currentConversation && message.from === currentConversation.id) {
            const newMsg = { ...message, isOwn: false };
            messages.push(newMsg);
            appendSingleMessage(newMsg);
            markMessagesAsRead(currentConversation.id);
            saveChatState(currentConversation.id);
        }
        loadConversations();
        if (message.from !== currentConversation?.id) {
            showToast(`📩 Nuevo mensaje de ${message.fromName || 'alguien'}`);
        }
    });

    socket.on('chat_request_received', (data) => {
        showToast(`📨 ${data.fromUser?.fullName || 'Alguien'} quiere chatear contigo`);
        loadConversations();
    });

    socket.on('chat_request_accepted', (data) => {
        showToast(`✅ ${data.fromUser?.fullName || 'Alguien'} aceptó tu solicitud de chat`);
        loadConversations();
        if (currentConversation && currentConversation.id === data.fromUserId) {
            loadMessages(currentConversation.id, false, 0);
        }
    });

    socket.on('message_sent', (message) => {
        const index = messages.findIndex(m => m.id === message.id);
        if (index !== -1) {
            messages[index] = message;
            updateSingleMessage(message.id, message);
            saveChatState(currentConversation?.id);
        }
    });

    socket.on('user_typing', (data) => {
        const indicator = document.getElementById('typingIndicator');
        if (indicator && currentConversation && data.from === currentConversation.id) {
            indicator.style.display = data.isTyping ? 'block' : 'none';
            if (data.isTyping) {
                setTimeout(() => {
                    if (indicator && indicator.style.display === 'block') {
                        indicator.style.display = 'none';
                    }
                }, 3000);
            }
        }
    });

    socket.on('messages_read', (data) => {
        if (currentConversation && data.byUserId === currentConversation.id) {
            let updated = false;
            messages.forEach(msg => {
                if (msg.isOwn && !msg.read) {
                    msg.read = true;
                    updated = true;
                }
            });
            if (updated) {
                document.querySelectorAll('.message-own .message-read').forEach(el => {
                    el.textContent = '✓✓';
                });
                saveChatState(currentConversation.id);
            }
        }
        loadConversations();
    });

    socket.on('message_deleted', (data) => {
        messages = messages.filter(m => m.id !== data.messageId);
        removeSingleMessage(data.messageId);
        saveChatState(currentConversation?.id);
    });

    socket.on('conversations_update', () => {
        loadConversations();
    });

    socket.on('user_status_changed', (data) => {
        userStatuses.set(data.userId, { status: data.status, lastSeen: data.lastSeen });
        if (currentConversation && currentConversation.id === data.userId) {
            updateChatHeaderStatus(data.userId);
        }
        renderConversations();
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket desconectado');
    });
}

// ============================================================
// INICIALIZAR
// ============================================================
async function init() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        const token = getToken();
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
        try {
            const res = await fetch(`${API_URL}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) currentUser = await res.json();
        } catch (error) { console.error('Error cargando usuario:', error); }
    }

    const searchInput = document.getElementById('searchConversations');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderConversations());
    }

    await loadConversations();
    initSocket();

    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    if (userId) {
        setTimeout(async () => {
            await window.selectConversation(userId);
        }, 500);
    }

    setupLinkDelegation();
    console.log('📱 Chat mobile optimizado - con detección de enlaces corregida y perfil');
}

// Exponer funciones globales
window.selectConversation = window.selectConversation;
window.sendMessage = window.sendMessage;
window.deleteMessage = window.deleteMessage;
window.switchChatTab = window.switchChatTab;
window.acceptChatRequest = window.acceptChatRequest;
window.rejectChatRequest = window.rejectChatRequest;
window.openLinkFromChat = openLinkFromChat;
window.openProfileFromChat = openProfileFromChat;
window.restoreChatFromProfile = restoreChatFromProfile;

document.addEventListener('DOMContentLoaded', init);