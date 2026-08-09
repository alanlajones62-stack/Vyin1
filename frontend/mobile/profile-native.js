// profile-native.js - Perfil nativo del usuario (SECCIÓN NATIVA)
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile
} from './auth.js';

import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO
// ============================================================

let currentProfileUserId = null;
let currentProfileData = null;
let isProfileSectionVisible = false;
let refreshInterval = null;

// ============================================================
// CACHÉ
// ============================================================

const profileCache = new Map();
const storiesCache = new Map();
const MAX_CACHE_SIZE = 20;

function cleanCache() {
    if (profileCache.size > MAX_CACHE_SIZE) {
        const keys = Array.from(profileCache.keys());
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        toRemove.forEach(key => profileCache.delete(key));
    }
    if (storiesCache.size > MAX_CACHE_SIZE) {
        const keys = Array.from(storiesCache.keys());
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        toRemove.forEach(key => storiesCache.delete(key));
    }
}

function clearProfileCache(userId) {
    if (userId) {
        profileCache.delete(userId);
        storiesCache.delete(userId);
    }
}

// ============================================================
// MOSTRAR PERFIL NATIVO
// ============================================================

function showProfileNative(userId) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver tu perfil', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    console.log(`👤 Mostrando perfil nativo: ${userId}`);

    currentProfileUserId = userId;
    isProfileSectionVisible = true;

    // Mostrar la sección de perfil
    const section = document.getElementById('sectionProfile');
    if (section) {
        section.classList.remove('hidden');
    }

    // Activar el botón de perfil en la navegación
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const navProfile = document.getElementById('navProfile');
    if (navProfile) navProfile.classList.add('active');

    // Cargar datos
    loadProfileDataNative(userId);

    // Iniciar refresco en segundo plano
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    refreshInterval = setInterval(() => {
        if (isProfileSectionVisible && currentProfileUserId === userId) {
            refreshProfileInBackgroundNative(userId);
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 15000);
}

// ============================================================
// OCULTAR PERFIL NATIVO (VOLVER A INICIO)
// ============================================================

function hideProfileNative() {
    console.log('🔒 Ocultando perfil nativo');

    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    isProfileSectionVisible = false;
    currentProfileUserId = null;
    currentProfileData = null;

    // Ocultar la sección de perfil
    const section = document.getElementById('sectionProfile');
    if (section) {
        section.classList.add('hidden');
    }

    // Activar el botón de inicio
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const navFeed = document.getElementById('navFeed');
    if (navFeed) navFeed.classList.add('active');

    // Limpiar contenido
    const container = document.getElementById('profileNativeContent');
    if (container) {
        container.innerHTML = `
            <div class="empty-state" id="profileLoadingState">
                <i class="fas fa-spinner fa-pulse"></i>
                <h3>Cargando perfil</h3>
                <p>Espera un momento...</p>
            </div>
        `;
    }
}

// ============================================================
// CARGAR DATOS DEL PERFIL NATIVO
// ============================================================

async function loadProfileDataNative(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver tu perfil', true);
        return;
    }

    try {
        clearProfileCache(userId);

        console.log(`📡 Cargando perfil nativo ${userId} desde servidor...`);

        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status === 404) {
                showToast('Usuario no encontrado', true);
            } else if (res.status === 403) {
                showToast('Este perfil es privado', true);
            } else {
                showToast('Error al cargar el perfil', true);
            }
            return;
        }

        const user = await res.json();
        currentProfileData = user;

        profileCache.set(userId, user);
        cleanCache();

        const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let stories = [];
        if (storiesRes.ok) {
            stories = await storiesRes.json();
            storiesCache.set(userId, stories);
            cleanCache();
        }

        updateProfileNativeUI(user, stories);

    } catch (error) {
        console.error('Error loading profile native:', error);
        showToast('Error al cargar el perfil', true);
    }
}

// ============================================================
// REFRESCAR PERFIL EN SEGUNDO PLANO
// ============================================================

async function refreshProfileInBackgroundNative(userId) {
    try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const user = await res.json();
            profileCache.set(userId, user);
            currentProfileData = user;

            const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (storiesRes.ok) {
                const stories = await storiesRes.json();
                storiesCache.set(userId, stories);
                if (isProfileSectionVisible && currentProfileUserId === userId) {
                    updateStoriesOnlyNative(stories);
                }
            }

            console.log(`🔄 Perfil nativo ${userId} actualizado en segundo plano`);
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// ACTUALIZAR SOLO HISTORIAS
// ============================================================

function updateStoriesOnlyNative(stories) {
    const container = document.getElementById('profileNativeContent');
    if (!container) return;

    const storiesSection = container.querySelector('.profile-stories-native');
    if (!storiesSection) return;

    const grid = storiesSection.querySelector('.profile-stories-grid-native');
    if (!grid) return;

    let storiesHtml = '';
    if (stories && stories.length > 0) {
        const displayStories = stories.slice(0, 6);

        const thumbnails = displayStories.map(story => {
            if (story.mediaType === 'image' && story.mediaUrl) {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${currentProfileUserId}')">
                        <img src="${story.mediaUrl}" alt="Historia" loading="lazy" decoding="async" />
                        <div class="thumb-overlay">
                            <i class="fas fa-heart"></i> ${formatNumber(story.likes?.length || 0)}
                        </div>
                    </div>
                `;
            } else if (story.mediaType === 'text' && story.textContent) {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${currentProfileUserId}')">
                        <div class="text-thumb">${escapeHtml(story.textContent.substring(0, 20))}${story.textContent.length > 20 ? '...' : ''}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${currentProfileUserId}')">
                        <div class="text-thumb">
                            <i class="fas fa-file" style="font-size:14px;color:rgba(255,255,255,0.1);"></i>
                        </div>
                    </div>
                `;
            }
        }).join('');

        storiesHtml = `<div class="profile-stories-grid-native">${thumbnails}</div>`;

        if (stories.length > 6) {
            storiesHtml += `
                <div style="text-align:center;font-size:9px;color:rgba(255,255,255,0.15);padding:2px 0;">
                    +${stories.length - 6} más
                </div>
            `;
        }
    } else {
        storiesHtml = `
            <div class="profile-no-stories-native">
                <i class="fas fa-camera"></i>
                <span>No hay historias</span>
            </div>
        `;
    }

    grid.innerHTML = storiesHtml;
}

// ============================================================
// OBTENER INSIGNIA DE VERIFICACIÓN
// ============================================================

function getVerificationBadgeNative(user) {
    if (!user) return '';

    if (user.isVerified) {
        if (user.role === 'admin') {
            return `<span class="verified-badge" title="Administrador verificado"><i class="fas fa-shield-alt"></i></span>`;
        } else if (user.accountType === 'business_verified' || user.accountType === 'business') {
            return `<span class="verified-badge" title="Empresa verificada"><i class="fas fa-building"></i></span>`;
        } else {
            return `<span class="verified-badge" title="Cuenta verificada"><i class="fas fa-check-circle"></i></span>`;
        }
    }

    if (user.role === 'admin') {
        return `<span class="verified-badge" title="Administrador"><i class="fas fa-shield-alt"></i></span>`;
    }

    return '';
}

// ============================================================
// ACTUALIZAR UI DEL PERFIL NATIVO
// ============================================================

function updateProfileNativeUI(user, stories) {
    const container = document.getElementById('profileNativeContent');
    if (!container) return;

    const currentUser = getCurrentUser();
    const isFollowing = user.isFollowing || false;
    const hasPendingRequest = user.hasPendingRequest || false;
    const isOwnProfile = currentUser?.id === user.id;

    const followersCount = user.followersCount || 0;
    const followingCount = user.followingCount || 0;

    const badgeHtml = getVerificationBadgeNative(user);

    let storiesHtml = '';
    if (stories && stories.length > 0) {
        const displayStories = stories.slice(0, 6);

        const thumbnails = displayStories.map(story => {
            if (story.mediaType === 'image' && story.mediaUrl) {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${user.id}')">
                        <img src="${story.mediaUrl}" alt="Historia" loading="lazy" decoding="async" />
                        <div class="thumb-overlay">
                            <i class="fas fa-heart"></i> ${formatNumber(story.likes?.length || 0)}
                        </div>
                    </div>
                `;
            } else if (story.mediaType === 'text' && story.textContent) {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${user.id}')">
                        <div class="text-thumb">${escapeHtml(story.textContent.substring(0, 20))}${story.textContent.length > 20 ? '...' : ''}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${story.id}', '${user.id}')">
                        <div class="text-thumb">
                            <i class="fas fa-file" style="font-size:14px;color:rgba(255,255,255,0.1);"></i>
                        </div>
                    </div>
                `;
            }
        }).join('');

        storiesHtml = `<div class="profile-stories-grid-native">${thumbnails}</div>`;

        if (stories.length > 6) {
            storiesHtml += `
                <div style="text-align:center;font-size:9px;color:rgba(255,255,255,0.15);padding:2px 0;">
                    +${stories.length - 6} más
                </div>
            `;
        }
    } else {
        storiesHtml = `
            <div class="profile-no-stories-native">
                <i class="fas fa-camera"></i>
                <span>No hay historias</span>
            </div>
        `;
    }

    let followText = 'Seguir';
    let followClass = 'profile-follow-btn-native';
    let followDisabled = false;
    let followIcon = '<i class="fas fa-user-plus"></i>';
    let followOnClick = `window.handleProfileFollowNative()`;

    if (isOwnProfile) {
        followText = 'Editar perfil';
        followClass = 'profile-follow-btn-native';
        followDisabled = false;
        followIcon = '<i class="fas fa-pen"></i>';
        followOnClick = `window.openEditProfileFromNative()`;
    } else if (isFollowing) {
        followText = 'Siguiendo';
        followClass = 'profile-follow-btn-native following';
        followIcon = '<i class="fas fa-check"></i>';
    } else if (hasPendingRequest) {
        followText = 'Solicitud enviada';
        followClass = 'profile-follow-btn-native';
        followIcon = '<i class="fas fa-clock"></i>';
    }

    const avatarUrl = user.avatar || getAvatar(user.fullName);
    const fullName = escapeHtml(user.fullName);
    const username = escapeHtml(user.username);
    const bio = user.bio ? escapeHtml(user.bio) : '';
    const countryName = user.countryName ? escapeHtml(user.countryName) : '';

    container.innerHTML = `
        <div class="profile-native">
            <div class="profile-cover-native">
                <img class="profile-avatar-native" src="${avatarUrl}" 
                     alt="${fullName}" 
                     loading="eager"
                     onerror="this.src='${getAvatar(user.fullName || 'U')}'" />
                <div class="profile-name-native">
                    ${fullName}
                    ${badgeHtml}
                </div>
                <div class="profile-username-native">@${username}</div>
                ${bio ? `<div class="profile-bio-native">${bio}</div>` : ''}
                ${countryName ? `<div class="profile-country-native"><i class="fas fa-map-marker-alt"></i> ${countryName}</div>` : ''}
                <button class="${followClass}" id="profileFollowBtnNative" ${followDisabled ? 'disabled' : ''} onclick="${followOnClick}">
                    ${followIcon}
                    ${followText}
                </button>
            </div>

            <div class="profile-stats-native">
                <div class="stat" onclick="window.openFollowersFromNative('followers')" style="cursor:pointer;">
                    <span class="number">${formatNumber(followersCount)}</span>
                    <span class="label">Seguidores</span>
                </div>
                <div class="stat" onclick="window.openFollowersFromNative('following')" style="cursor:pointer;">
                    <span class="number">${formatNumber(followingCount)}</span>
                    <span class="label">Siguiendo</span>
                </div>
                <div class="stat">
                    <span class="number">${formatNumber(stories?.length || 0)}</span>
                    <span class="label">Historias</span>
                </div>
            </div>

            <div class="profile-stories-native">
                <div class="section-title">
                    <i class="fas fa-images"></i> Historias
                    <span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:auto;">${stories?.length || 0}</span>
                </div>
                ${storiesHtml}
            </div>
        </div>
    `;
}

// ============================================================
// MANEJAR SEGUIR DESDE PERFIL NATIVO
// ============================================================

window.handleProfileFollowNative = async function() {
    if (!currentProfileUserId) return;

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
        return;
    }

    const btn = document.getElementById('profileFollowBtnNative');
    if (!btn) return;

    const isFollowing = btn.classList.contains('following');
    const method = isFollowing ? 'DELETE' : 'POST';

    try {
        const res = await fetch(`${API_URL}/api/follows/${isFollowing ? 'unfollow' : 'follow'}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentProfileUserId })
        });

        const data = await res.json();
        if (res.ok) {
            if (data.status === 'following' || data.following) {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-check"></i> Siguiendo';
                showToast(`✅ Siguiendo a ${currentProfileData?.fullName}`);
            } else if (data.status === 'pending_sent') {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-clock"></i> Solicitud enviada';
                showToast(`📨 Solicitud enviada a ${currentProfileData?.fullName}`);
            } else {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Seguir';
                showToast('❌ Dejaste de seguir');
            }

            const followersEl = document.querySelector('.profile-stats-native .stat:first-child .number');
            if (followersEl) {
                const current = parseInt(followersEl.textContent.replace(/[^0-9]/g, '')) || 0;
                const newCount = data.followersCount || data.followersCount !== undefined ? data.followersCount : current + (data.following ? 1 : -1);
                followersEl.textContent = formatNumber(newCount);
            }

            clearProfileCache(currentProfileUserId);
        } else {
            showToast(data.error || 'Error al seguir', true);
        }
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Error al seguir', true);
    }
};

// ============================================================
// ABRIR EDITAR PERFIL DESDE NATIVO
// ============================================================

window.openEditProfileFromNative = function() {
    if (!currentProfileData) return;
    import('./edit-profile-modal.js').then(({ openEditProfileModal }) => {
        openEditProfileModal(currentProfileData);
    }).catch(() => {
        if (typeof window.openEditProfileModal === 'function') {
            window.openEditProfileModal(currentProfileData);
        } else {
            showToast('Error al abrir edición de perfil', true);
        }
    });
};

// ============================================================
// ABRIR SEGUIDORES DESDE NATIVO
// ============================================================

window.openFollowersFromNative = function(filter) {
    if (!currentProfileUserId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    console.log(`📊 Abriendo ${filter} desde perfil nativo para: ${currentProfileUserId}`);

    import('./followers-modal.js').then(({ openFollowersModal }) => {
        openFollowersModal(currentProfileUserId, filter, true);
    }).catch((err) => {
        console.error('❌ Error cargando followers-modal:', err);
        showToast('Error al abrir seguidores', true);
    });
};

// ============================================================
// ABRIR HISTORIA DESDE PERFIL NATIVO
// ============================================================

window.openStoryFromProfileNative = function(storyId, profileUserId) {
    if (!storyId) return;

    const userId = profileUserId || currentProfileUserId;

    // Obtener historias del caché
    let stories = [];
    if (userId && storiesCache.has(userId)) {
        stories = storiesCache.get(userId);
    }

    window._fromProfileModal = true;
    window._profileContextUserId = userId;

    if (stories && stories.length > 1) {
        window.openStoryModal(storyId, stories, true, userId);
    } else {
        window.openStoryModal(storyId, null, true, userId);
    }
};

// ============================================================
// FUNCIONES EXPORTADAS
// ============================================================

export {
    showProfileNative,
    hideProfileNative,
    loadProfileDataNative,
    refreshProfileInBackgroundNative,
    updateProfileNativeUI,
    getVerificationBadgeNative,
    clearProfileCache
};