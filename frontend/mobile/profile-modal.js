// ============================================================
// profile-modal.js - Modal de perfil de usuario
// (CON ACTUALIZACIÓN EN TIEMPO REAL, SEGUIDORES Y PRIVACIDAD)
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile
} from './auth.js';

import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO GLOBAL
// ============================================================

let currentProfileId = null;
let currentProfileData = null;
let isProfileModalOpen = false;
let isOwnProfile = false;
let isFollowing = false;
let isPendingRequest = false;
let followStatus = 'none'; // 'none', 'following', 'pending_sent', 'can_follow'
let isPrivate = false;
let canViewStories = false;
let isLoading = false;
let refreshInterval = null;
let storiesCache = [];

// ============================================================
// ABRIR MODAL DE PERFIL
// ============================================================

export async function openProfileModal(userId) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver perfiles', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    if (isProfileModalOpen) {
        closeProfileModal();
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    currentProfileId = userId;
    isProfileModalOpen = true;

    const overlay = document.getElementById('profileModalOverlay');
    if (!overlay) {
        createProfileModalHTML();
    }

    const profileOverlay = document.getElementById('profileModalOverlay');
    if (profileOverlay) {
        profileOverlay.style.display = 'flex';
        profileOverlay.classList.add('active');
    }

    document.body.style.overflow = 'hidden';

    // Limpiar intervalo anterior
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    await loadProfileData(userId);

    // Actualizar cada 15 segundos
    refreshInterval = setInterval(() => {
        if (isProfileModalOpen) {
            refreshProfileData(userId);
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 15000);
}

// ============================================================
// CERRAR MODAL DE PERFIL
// ============================================================

export function closeProfileModal() {
    isProfileModalOpen = false;
    currentProfileId = null;
    currentProfileData = null;

    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
    }

    document.body.style.overflow = '';
}

// ============================================================
// CREAR HTML DEL MODAL
// ============================================================

function createProfileModalHTML() {
    if (document.getElementById('profileModalOverlay')) return;

    const html = `
        <div id="profileModalOverlay" class="profile-modal-overlay" onclick="window.closeProfileModal()">
            <div class="profile-modal-content" onclick="event.stopPropagation()">
                
                <!-- HEADER -->
                <div class="profile-modal-header">
                    <button class="profile-modal-close" onclick="window.closeProfileModal()">
                        <i class="fas fa-times"></i>
                    </button>
                    <span class="profile-modal-title" id="profileModalTitle">Perfil</span>
                    <button class="profile-modal-edit" id="profileEditBtn" style="display:none;" onclick="window.openEditProfile()">
                        <i class="fas fa-pen"></i>
                    </button>
                </div>

                <!-- CONTENIDO -->
                <div class="profile-modal-body" id="profileModalBody">
                    <div class="profile-loading">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <span>Cargando perfil...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    // Eventos
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isProfileModalOpen) {
            closeProfileModal();
        }
    });

    // Funciones globales
    window.closeProfileModal = closeProfileModal;
    window.openEditProfile = openEditProfile;
    window.openFollowersFromProfile = openFollowersFromProfile;
    window.handleProfileFollow = handleProfileFollow;
    window.openStoryFromProfile = openStoryFromProfile;
}

// ============================================================
// ABRIR EDITAR PERFIL
// ============================================================

function openEditProfile() {
    if (!currentProfileData) return;
    closeProfileModal();
    setTimeout(() => {
        import('./edit-profile-modal.js').then(({ openEditProfileModal }) => {
            openEditProfileModal(currentProfileData);
        }).catch(() => {
            if (typeof window.openEditProfileModal === 'function') {
                window.openEditProfileModal(currentProfileData);
            } else {
                showToast('Error al abrir editar perfil', true);
            }
        });
    }, 100);
}

// ============================================================
// ABRIR SEGUIDORES DESDE PERFIL
// ============================================================

function openFollowersFromProfile(filter) {
    if (!currentProfileId) return;
    closeProfileModal();
    setTimeout(() => {
        import('./followers-modal.js').then(({ openFollowersModal }) => {
            openFollowersModal(currentProfileId, filter);
        }).catch(() => {
            if (typeof window.openFollowersModal === 'function') {
                window.openFollowersModal(currentProfileId, filter);
            } else {
                showToast('Error al abrir seguidores', true);
            }
        });
    }, 100);
}

// ============================================================
// ABRIR HISTORIA DESDE PERFIL
// ============================================================

function openStoryFromProfile(storyId) {
    if (!storyId) return;
    closeProfileModal();
    setTimeout(() => {
        openStoryModal(storyId, storiesCache);
    }, 100);
}

// ============================================================
// MANEJAR SEGUIR/DESSEGUIR DESDE PERFIL
// ============================================================

async function handleProfileFollow() {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
        return;
    }

    if (!currentProfileId) return;

    const btn = document.getElementById('profileFollowBtn');
    if (!btn) return;

    // Si es perfil propio, no hacer nada
    if (isOwnProfile) return;

    // Si hay solicitud pendiente, cancelar
    if (followStatus === 'pending_sent') {
        await cancelFollowRequest();
        return;
    }

    const isCurrentlyFollowing = followStatus === 'following';
    const action = isCurrentlyFollowing ? 'unfollow' : 'follow';
    const method = isCurrentlyFollowing ? 'DELETE' : 'POST';

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

    try {
        const url = `${API_URL}/api/follows/${action}`;
        const res = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentProfileId })
        });

        const data = await res.json();

        if (res.ok) {
            if (data.status === 'pending_sent') {
                // Solicitud enviada (perfil privado)
                followStatus = 'pending_sent';
                isFollowing = false;
                updateFollowButton(btn);
                showToast(`📨 Solicitud enviada a ${currentProfileData.fullName}`);
            } else if (action === 'follow') {
                followStatus = 'following';
                isFollowing = true;
                isPendingRequest = false;
                updateFollowButton(btn);
                showToast(`✅ Ahora sigues a ${currentProfileData.fullName}`);
                // Actualizar contador de seguidores
                if (currentProfileData) {
                    currentProfileData.followersCount = (currentProfileData.followersCount || 0) + 1;
                    updateStats(currentProfileData);
                }
            } else {
                followStatus = 'can_follow';
                isFollowing = false;
                isPendingRequest = false;
                updateFollowButton(btn);
                showToast(`💔 Dejaste de seguir a ${currentProfileData.fullName}`);
                if (currentProfileData) {
                    currentProfileData.followersCount = Math.max(0, (currentProfileData.followersCount || 0) - 1);
                    updateStats(currentProfileData);
                }
            }

            // Actualizar perfil en segundo plano
            refreshProfileData(currentProfileId);

        } else {
            showToast(data.error || 'Error al procesar', true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error('Error:', error);
        showToast('Error al procesar', true);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================================
// CANCELAR SOLICITUD DE SEGUIMIENTO
// ============================================================

async function cancelFollowRequest() {
    const token = getToken();
    if (!token) return;

    const btn = document.getElementById('profileFollowBtn');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

    try {
        const res = await fetch(`${API_URL}/api/follows/cancel`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentProfileId })
        });

        if (res.ok) {
            followStatus = 'can_follow';
            isPendingRequest = false;
            updateFollowButton(btn);
            showToast('📨 Solicitud cancelada');
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al cancelar', true);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cancelar', true);
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
// ACTUALIZAR BOTÓN DE SEGUIR
// ============================================================

function updateFollowButton(btn) {
    if (!btn) return;

    if (isOwnProfile) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'flex';

    if (followStatus === 'following') {
        btn.className = 'profile-follow-btn following';
        btn.innerHTML = '<i class="fas fa-check"></i> Siguiendo';
    } else if (followStatus === 'pending_sent') {
        btn.className = 'profile-follow-btn pending';
        btn.innerHTML = '<i class="fas fa-clock"></i> Solicitud enviada';
    } else {
        btn.className = 'profile-follow-btn';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Seguir';
    }

    btn.disabled = false;
}

// ============================================================
// CARGAR DATOS DEL PERFIL
// ============================================================

async function loadProfileData(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver perfiles', true);
        return;
    }

    isLoading = true;
    const body = document.getElementById('profileModalBody');
    if (body) {
        body.innerHTML = `
            <div class="profile-loading">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando perfil...</span>
            </div>
        `;
    }

    try {
        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status === 403) {
                const data = await res.json();
                if (data.error === 'private_profile') {
                    showPrivateProfile();
                    return;
                }
                showToast('No tienes permiso para ver este perfil', true);
            } else if (res.status === 404) {
                showToast('Usuario no encontrado', true);
            } else {
                showToast('Error al cargar el perfil', true);
            }
            closeProfileModal();
            return;
        }

        const profile = await res.json();
        currentProfileData = profile;
        isOwnProfile = profile.isOwnProfile || false;
        isFollowing = profile.isFollowing || false;
        isPendingRequest = profile.hasPendingRequest || false;
        isPrivate = profile.privacy === 'private' || profile.privacy === 'followers';
        canViewStories = profile.canViewStories !== undefined ? profile.canViewStories : true;

        if (isFollowing) {
            followStatus = 'following';
        } else if (isPendingRequest) {
            followStatus = 'pending_sent';
        } else if (isPrivate) {
            followStatus = 'can_request';
        } else {
            followStatus = 'can_follow';
        }

        // Cargar historias del usuario
        await loadUserStories(userId);

        renderProfile(profile);

        // Actualizar título
        const title = document.getElementById('profileModalTitle');
        if (title) {
            title.textContent = isOwnProfile ? 'Mi Perfil' : 'Perfil';
        }

        // Mostrar botón de editar si es propio
        const editBtn = document.getElementById('profileEditBtn');
        if (editBtn) {
            editBtn.style.display = isOwnProfile ? 'flex' : 'none';
        }

    } catch (error) {
        console.error('Error cargando perfil:', error);
        showToast('Error al cargar el perfil', true);
        closeProfileModal();
    } finally {
        isLoading = false;
    }
}

// ============================================================
// CARGAR HISTORIAS DEL USUARIO
// ============================================================

async function loadUserStories(userId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/stories/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            storiesCache = await res.json();
        } else {
            storiesCache = [];
        }
    } catch (error) {
        console.error('Error cargando historias:', error);
        storiesCache = [];
    }
}

// ============================================================
// REFRESCAR DATOS DEL PERFIL
// ============================================================

export async function refreshProfileData(userId) {
    if (!userId) return;
    if (!isProfileModalOpen) return;

    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const profile = await res.json();
            currentProfileData = profile;
            // Actualizar estadísticas sin recargar todo
            updateStats(profile);
            // Actualizar historias
            await loadUserStories(userId);
            renderStories(storiesCache);
        }
    } catch (error) {
        console.error('Error refrescando perfil:', error);
    }
}

// ============================================================
// ACTUALIZAR ESTADÍSTICAS
// ============================================================

function updateStats(profile) {
    const followersEl = document.getElementById('profileFollowersCount');
    const followingEl = document.getElementById('profileFollowingCount');
    const postsEl = document.getElementById('profilePostsCount');

    if (followersEl) followersEl.textContent = formatNumber(profile.followersCount || 0);
    if (followingEl) followingEl.textContent = formatNumber(profile.followingCount || 0);
    if (postsEl) postsEl.textContent = formatNumber(storiesCache.length || 0);
}

// ============================================================
// MOSTRAR PERFIL PRIVADO
// ============================================================

function showPrivateProfile() {
    const body = document.getElementById('profileModalBody');
    if (!body) return;

    body.innerHTML = `
        <div class="profile-private">
            <i class="fas fa-lock"></i>
            <h3>Cuenta privada</h3>
            <p>Este perfil es privado. Envía una solicitud para ver sus historias.</p>
            <button class="profile-follow-btn" onclick="window.handleProfileFollow()">
                <i class="fas fa-user-plus"></i> Seguir
            </button>
        </div>
    `;
}

// ============================================================
// RENDERIZAR PERFIL
// ============================================================

function renderProfile(profile) {
    const body = document.getElementById('profileModalBody');
    if (!body) return;

    const avatar = profile.avatar || getAvatar(profile.fullName);

    // Badge de verificación
    let badgeHtml = '';
    let badgeIcon = '';
    if (profile.isVerified) {
        badgeIcon = '✅';
        badgeHtml = `<span class="profile-verified-badge" title="Cuenta verificada">✅</span>`;
    }
    if (profile.accountType === 'business' || profile.accountType === 'business_verified') {
        const icon = profile.isVerified ? '🏢✅' : '🏢';
        badgeHtml = `<span class="profile-business-badge" title="Cuenta de empresa">${icon}</span>`;
    }

    const isFollowingStatus = isFollowing;
    const isPending = followStatus === 'pending_sent';
    const isOwn = isOwnProfile;

    // Determinar visibilidad de historias
    const canView = canViewStories || isOwn;

    // Bio
    const bio = profile.bio ? escapeHtml(profile.bio) : '';

    // Ubicación
    let locationHtml = '';
    if (profile.countryName) {
        locationHtml = `<span class="profile-location"><i class="fas fa-map-pin"></i> ${escapeHtml(profile.countryName)}</span>`;
    } else if (profile.country) {
        locationHtml = `<span class="profile-location"><i class="fas fa-map-pin"></i> ${escapeHtml(profile.country)}</span>`;
    }

    // Mostrar/ocultar botón de seguir
    const showFollowBtn = !isOwn;

    // Renderizar historias
    const storiesHtml = renderStoriesHTML(storiesCache, canView);

    body.innerHTML = `
        <div class="profile-content">
            <!-- Header del perfil -->
            <div class="profile-header">
                <div class="profile-avatar-container">
                    <img class="profile-avatar" src="${avatar}" alt="${profile.fullName}" />
                    ${badgeHtml}
                </div>
                <div class="profile-name-section">
                    <div class="profile-fullname">
                        ${escapeHtml(profile.fullName)}
                        ${badgeHtml}
                    </div>
                    <div class="profile-username">@${escapeHtml(profile.username)}</div>
                    ${locationHtml}
                </div>
            </div>

            <!-- Bio -->
            ${bio ? `<div class="profile-bio">${bio}</div>` : ''}

            <!-- Stats -->
            <div class="profile-stats">
                <div class="profile-stat" onclick="window.openFollowersFromProfile('followers')">
                    <span class="stat-number" id="profileFollowersCount">${formatNumber(profile.followersCount || 0)}</span>
                    <span class="stat-label">Seguidores</span>
                </div>
                <div class="profile-stat" onclick="window.openFollowersFromProfile('following')">
                    <span class="stat-number" id="profileFollowingCount">${formatNumber(profile.followingCount || 0)}</span>
                    <span class="stat-label">Siguiendo</span>
                </div>
                <div class="profile-stat">
                    <span class="stat-number" id="profilePostsCount">${formatNumber(storiesCache.length || 0)}</span>
                    <span class="stat-label">Publicaciones</span>
                </div>
            </div>

            <!-- Botón de seguir -->
            ${showFollowBtn ? `
                <div class="profile-follow-container">
                    <button class="profile-follow-btn ${isFollowing ? 'following' : isPending ? 'pending' : ''}" 
                            id="profileFollowBtn" 
                            onclick="window.handleProfileFollow()">
                        ${isFollowing ? '<i class="fas fa-check"></i> Siguiendo' : 
                          isPending ? '<i class="fas fa-clock"></i> Solicitud enviada' : 
                          '<i class="fas fa-user-plus"></i> Seguir'}
                    </button>
                </div>
            ` : ''}

            <!-- Stories -->
            <div class="profile-stories-section">
                <div class="profile-stories-header">
                    <span><i class="fas fa-camera"></i> Historias</span>
                    <span class="profile-stories-count">${storiesCache.length || 0}</span>
                </div>
                <div class="profile-stories-grid" id="profileStoriesGrid">
                    ${storiesHtml}
                </div>
            </div>

            <!-- Mensaje si no hay historias -->
            ${storiesCache.length === 0 ? `
                <div class="profile-no-stories">
                    <i class="fas fa-camera"></i>
                    <span>${isOwn ? 'No has publicado historias aún' : 'Este usuario no tiene historias'}</span>
                </div>
            ` : ''}

            <!-- Mensaje si el perfil es privado -->
            ${isPrivate && !isOwn ? `
                <div class="profile-private-notice">
                    <i class="fas fa-lock"></i>
                    <span>Este perfil es privado</span>
                </div>
            ` : ''}
        </div>
    `;
}

// ============================================================
// RENDERIZAR HISTORIAS
// ============================================================

function renderStories(stories) {
    const grid = document.getElementById('profileStoriesGrid');
    if (!grid) return;

    const canView = canViewStories || isOwnProfile;
    const html = renderStoriesHTML(stories, canView);
    grid.innerHTML = html;

    // Actualizar contador
    const countEl = document.getElementById('profilePostsCount');
    if (countEl) {
        countEl.textContent = formatNumber(stories.length || 0);
    }

    const headerCount = document.querySelector('.profile-stories-count');
    if (headerCount) {
        headerCount.textContent = stories.length || 0;
    }

    // Mostrar/ocultar mensaje de no historias
    const noStories = document.querySelector('.profile-no-stories');
    if (noStories) {
        noStories.style.display = stories.length === 0 ? 'flex' : 'none';
    }
}

function renderStoriesHTML(stories, canView) {
    if (!stories || stories.length === 0) {
        return `
            <div class="profile-story-placeholder">
                <i class="fas fa-camera"></i>
                <span>Sin historias</span>
            </div>
        `;
    }

    let html = '';
    stories.forEach(story => {
        const isViewed = story.views?.includes(getCurrentUser()?.id) || false;
        const thumbnail = story.mediaType === 'video' ? story.mediaUrl : story.mediaUrl;

        html += `
            <div class="profile-story-item ${isViewed ? 'viewed' : 'unviewed'}" 
                 onclick="window.openStoryFromProfile('${story.id}')">
                ${story.mediaType === 'video' ? 
                    `<video src="${story.mediaUrl}" muted playsinline></video>` :
                    `<img src="${thumbnail}" loading="lazy" />`
                }
                <div class="profile-story-overlay">
                    <i class="fas fa-play"></i>
                </div>
                ${story.hasSubtitles ? '<span class="profile-story-cc"><i class="fas fa-closed-captioning"></i></span>' : ''}
            </div>
        `;
    });

    return html;
}

// ============================================================
// PRECARGAR PERFIL DEL USUARIO ACTUAL
// ============================================================

export function preloadCurrentUserProfile() {
    const currentUser = getCurrentUser();
    if (currentUser?.id) {
        loadProfileData(currentUser.id).catch(() => {});
    }
}

// ============================================================
// FUNCIONES GLOBALES PARA WINDOW
// ============================================================

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openEditProfile = openEditProfile;
window.openFollowersFromProfile = openFollowersFromProfile;
window.handleProfileFollow = handleProfileFollow;
window.openStoryFromProfile = openStoryFromProfile;

// ============================================================
// INYECTAR ESTILOS
// ============================================================

function injectProfileStyles() {
    if (document.getElementById('profileModalStyles')) return;

    const styles = document.createElement('style');
    styles.id = 'profileModalStyles';
    styles.textContent = `
        /* ============================================================
           OVERLAY
        ============================================================ */
        .profile-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            z-index: 10002;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: profileFadeIn 0.3s ease;
        }
        .profile-modal-overlay.active { display: flex; }

        @keyframes profileFadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }

        /* ============================================================
           CONTENIDO
        ============================================================ */
        .profile-modal-content {
            background: #12122a;
            border-radius: 16px;
            max-width: 480px;
            width: 100%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.04);
            box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        }

        /* ============================================================
           HEADER
        ============================================================ */
        .profile-modal-header {
            display: flex;
            align-items: center;
            padding: 14px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            flex-shrink: 0;
            gap: 12px;
        }
        .profile-modal-title {
            color: #fff;
            font-size: 17px;
            font-weight: 600;
            flex: 1;
        }
        .profile-modal-close {
            background: rgba(255,255,255,0.05);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: rgba(255,255,255,0.4);
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            flex-shrink: 0;
        }
        .profile-modal-close:active { transform: scale(0.9); }
        .profile-modal-edit {
            background: rgba(255,255,255,0.05);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: rgba(255,255,255,0.4);
            font-size: 14px;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            flex-shrink: 0;
        }
        .profile-modal-edit:active { transform: scale(0.9); }

        /* ============================================================
           BODY
        ============================================================ */
        .profile-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        .profile-modal-body::-webkit-scrollbar {
            width: 3px;
        }
        .profile-modal-body::-webkit-scrollbar-thumb {
            background: rgba(192,132,252,0.15);
            border-radius: 10px;
        }

        /* ============================================================
           LOADING
        ============================================================ */
        .profile-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            color: rgba(255,255,255,0.15);
            gap: 12px;
        }
        .profile-loading i { font-size: 32px; }
        .profile-loading span { font-size: 14px; }

        /* ============================================================
           PERFIL PRIVADO
        ============================================================ */
        .profile-private {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            color: rgba(255,255,255,0.3);
            gap: 12px;
        }
        .profile-private i { font-size: 48px; color: rgba(255,255,255,0.05); }
        .profile-private h3 { color: #fff; font-size: 18px; font-weight: 600; }
        .profile-private p { font-size: 13px; color: rgba(255,255,255,0.3); max-width: 280px; }

        /* ============================================================
           CONTENIDO DEL PERFIL
        ============================================================ */
        .profile-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        /* Header del perfil */
        .profile-header {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .profile-avatar-container {
            position: relative;
            flex-shrink: 0;
        }
        .profile-avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid rgba(192,132,252,0.15);
        }
        .profile-avatar-container .profile-verified-badge,
        .profile-avatar-container .profile-business-badge {
            position: absolute;
            bottom: 0;
            right: 0;
            font-size: 14px;
            background: #12122a;
            border-radius: 50%;
            padding: 2px;
        }

        .profile-name-section {
            flex: 1;
            min-width: 0;
        }
        .profile-fullname {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .profile-fullname .profile-verified-badge,
        .profile-fullname .profile-business-badge {
            font-size: 14px;
        }
        .profile-username {
            font-size: 13px;
            color: rgba(255,255,255,0.3);
            margin-top: 2px;
        }
        .profile-location {
            font-size: 12px;
            color: rgba(255,255,255,0.2);
            margin-top: 2px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .profile-location i { font-size: 10px; }

        /* Bio */
        .profile-bio {
            font-size: 14px;
            color: rgba(255,255,255,0.7);
            line-height: 1.5;
            padding: 8px 0;
            border-top: 1px solid rgba(255,255,255,0.04);
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }

        /* Stats */
        .profile-stats {
            display: flex;
            justify-content: space-around;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .profile-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            cursor: pointer;
            padding: 4px 12px;
            border-radius: 8px;
            transition: all 0.2s;
            flex: 1;
        }
        .profile-stat:hover {
            background: rgba(255,255,255,0.04);
        }
        .profile-stat:active {
            transform: scale(0.95);
        }
        .profile-stat .stat-number {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
        }
        .profile-stat .stat-label {
            font-size: 11px;
            color: rgba(255,255,255,0.25);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        /* Botón de seguir */
        .profile-follow-container {
            display: flex;
            justify-content: center;
            padding: 4px 0;
        }
        .profile-follow-btn {
            padding: 10px 32px;
            border-radius: 50px;
            border: none;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            background: linear-gradient(135deg, #c084fc, #db2777);
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .profile-follow-btn:hover {
            transform: scale(1.03);
            box-shadow: 0 4px 20px rgba(192,132,252,0.3);
        }
        .profile-follow-btn:active {
            transform: scale(0.95);
        }
        .profile-follow-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: none !important;
        }
        .profile-follow-btn.following {
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.7);
        }
        .profile-follow-btn.following:hover {
            background: rgba(255,68,68,0.1);
            color: #ff6b6b;
        }
        .profile-follow-btn.pending {
            background: rgba(251,191,36,0.12);
            color: #fbbf24;
        }
        .profile-follow-btn.pending:hover {
            background: rgba(255,68,68,0.1);
            color: #ff6b6b;
        }
        .profile-follow-btn i { font-size: 14px; }

        /* ============================================================
           STORIES
        ============================================================ */
        .profile-stories-section {
            margin-top: 4px;
        }
        .profile-stories-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: rgba(255,255,255,0.3);
            padding: 4px 0 10px;
            font-weight: 500;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .profile-stories-header i { margin-right: 6px; }
        .profile-stories-count {
            background: rgba(255,255,255,0.04);
            padding: 0 10px;
            border-radius: 10px;
            font-size: 11px;
        }

        .profile-stories-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            padding-top: 10px;
        }

        .profile-story-item {
            position: relative;
            aspect-ratio: 1;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            background: #0a0a1a;
            border: 2px solid rgba(255,255,255,0.05);
            transition: all 0.3s;
        }
        .profile-story-item:hover {
            transform: scale(1.02);
            border-color: rgba(192,132,252,0.2);
        }
        .profile-story-item:active {
            transform: scale(0.95);
        }
        .profile-story-item img,
        .profile-story-item video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .profile-story-item .profile-story-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: all 0.3s;
        }
        .profile-story-item:hover .profile-story-overlay {
            opacity: 1;
        }
        .profile-story-item .profile-story-overlay i {
            color: #fff;
            font-size: 20px;
            text-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }
        .profile-story-item.viewed {
            opacity: 0.6;
        }
        .profile-story-item.viewed .profile-story-overlay i {
            color: rgba(255,255,255,0.3);
        }
        .profile-story-item .profile-story-cc {
            position: absolute;
            bottom: 4px;
            right: 4px;
            font-size: 8px;
            color: rgba(255,255,255,0.3);
            background: rgba(0,0,0,0.4);
            padding: 1px 4px;
            border-radius: 4px;
        }

        .profile-story-placeholder {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px 20px;
            color: rgba(255,255,255,0.05);
            gap: 4px;
        }
        .profile-story-placeholder i { font-size: 32px; }
        .profile-story-placeholder span { font-size: 12px; }

        .profile-no-stories {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: rgba(255,255,255,0.05);
            gap: 6px;
            border: 1px dashed rgba(255,255,255,0.04);
            border-radius: 12px;
            margin-top: 4px;
        }
        .profile-no-stories i { font-size: 24px; }
        .profile-no-stories span { font-size: 12px; }

        .profile-private-notice {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 8px;
            background: rgba(251,191,36,0.06);
            border-radius: 8px;
            color: rgba(255,255,255,0.2);
            font-size: 12px;
            border: 1px solid rgba(251,191,36,0.06);
        }
        .profile-private-notice i { color: #fbbf24; }

        /* ============================================================
           RESPONSIVE
        ============================================================ */
        @media (max-width: 520px) {
            .profile-modal-overlay { padding: 12px; }
            .profile-modal-content { max-height: 88vh; border-radius: 12px; }
            .profile-modal-header { padding: 12px 16px; }
            .profile-modal-title { font-size: 15px; }
            .profile-modal-body { padding: 16px; }
            .profile-avatar { width: 60px; height: 60px; }
            .profile-fullname { font-size: 16px; }
            .profile-stories-grid { gap: 4px; }
            .profile-stat .stat-number { font-size: 16px; }
            .profile-follow-btn { padding: 8px 24px; font-size: 13px; }
        }

        @media (max-width: 380px) {
            .profile-modal-content { max-height: 92vh; }
            .profile-modal-body { padding: 12px; }
            .profile-avatar { width: 50px; height: 50px; }
            .profile-fullname { font-size: 14px; }
            .profile-stories-grid { gap: 3px; }
            .profile-stat .stat-number { font-size: 14px; }
            .profile-follow-btn { padding: 6px 18px; font-size: 12px; }
        }

        @media (max-height: 600px) {
            .profile-modal-content { max-height: 92vh; }
            .profile-modal-header { padding: 8px 14px; }
            .profile-modal-body { padding: 12px; }
            .profile-avatar { width: 50px; height: 50px; }
            .profile-fullname { font-size: 15px; }
            .profile-stats { padding: 4px 0; }
            .profile-stat .stat-number { font-size: 14px; }
            .profile-follow-btn { padding: 6px 20px; font-size: 12px; }
            .profile-stories-grid { gap: 3px; }
            .profile-story-item .profile-story-overlay i { font-size: 14px; }
        }

        @media (min-width: 768px) {
            .profile-modal-content { max-width: 460px; }
            .profile-avatar { width: 80px; height: 80px; }
        }
    `;
    document.head.appendChild(styles);
}

// Inyectar estilos
injectProfileStyles();