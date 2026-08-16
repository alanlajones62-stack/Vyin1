// profile-native.js - Perfil nativo del usuario (SECCIÓN NATIVA)
// OPTIMIZADO: Sin estado de carga, con precarga y actualización en tiempo real
// 🔥 NAVEGACIÓN: Soporte para followers-modal con fromNative=true
// 🔥 INTEGRADO CON i18n PARA TRADUCCIÓN DE INTERFAZ
// 🔥 CORREGIDO: Soporte para miniaturas de video y encuestas
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile
} from './auth.js';

import { formatNumber } from './utils.js';

// 🔥 IMPORTAR SISTEMA i18n
import { t, onLocaleChange, translateAll } from './i18n.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO
// ============================================================

let currentProfileUserId = null;
let currentProfileData = null;
let isProfileSectionVisible = false;
let refreshInterval = null;
let localeUnsubscribe = null;

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
// 🔥 ESCUCHAR CAMBIOS DE IDIOMA
// ============================================================

function initI18nForProfileNative() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    
    localeUnsubscribe = onLocaleChange(() => {
        if (isProfileSectionVisible && currentProfileData) {
            const stories = storiesCache.get(currentProfileUserId) || [];
            updateProfileNativeUI(currentProfileData, stories);
        }
    });
}

// ============================================================
// 🔥 PRECARGAR PERFIL DEL USUARIO ACTUAL
// ============================================================

function preloadCurrentUserProfile() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.id) return;
    
    const userId = currentUser.id;
    
    if (profileCache.has(userId)) {
        console.log(`✅ Perfil de ${currentUser.fullName} ya en caché`);
        return;
    }
    
    console.log(`🔄 Pre-cargando perfil de ${currentUser.fullName}...`);
    
    const token = getToken();
    if (!token) return;
    
    fetch(`${API_URL}/api/users/profile/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (res.ok) return res.json();
        throw new Error('Error cargando perfil');
    })
    .then(user => {
        profileCache.set(userId, user);
        console.log(`✅ Perfil de ${user.fullName} pre-cargado`);
        return fetch(`${API_URL}/api/stories/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    })
    .then(res => {
        if (res && res.ok) return res.json();
        return [];
    })
    .then(stories => {
        storiesCache.set(userId, stories);
        console.log(`✅ ${stories.length} historias pre-cargadas`);
    })
    .catch(err => {
        console.warn('⚠️ Error pre-cargando perfil:', err.message);
    });
}

// ============================================================
// MOSTRAR PERFIL NATIVO (CON CACHÉ PRIMERO)
// ============================================================

function showProfileNative(userId) {
    if (!userId) {
        showToast(t('error.notFound') || 'Usuario no encontrado', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para ver tu perfil', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    console.log(`👤 Mostrando perfil nativo: ${userId}`);

    initI18nForProfileNative();

    currentProfileUserId = userId;
    isProfileSectionVisible = true;

    const section = document.getElementById('sectionProfile');
    if (section) {
        section.classList.remove('hidden');
    }

    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const navProfile = document.getElementById('navProfile');
    if (navProfile) navProfile.classList.add('active');

    if (profileCache.has(userId) && storiesCache.has(userId)) {
        console.log(`📦 Usando caché para perfil nativo de ${userId}`);
        const user = profileCache.get(userId);
        const stories = storiesCache.get(userId);
        updateProfileNativeUI(user, stories);
        currentProfileData = user;
        refreshProfileInBackgroundNative(userId);
    } else {
        loadProfileDataNative(userId);
    }

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
    }, 10000);
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

    if (localeUnsubscribe) {
        localeUnsubscribe();
        localeUnsubscribe = null;
    }

    isProfileSectionVisible = false;
    currentProfileUserId = null;
    currentProfileData = null;

    const section = document.getElementById('sectionProfile');
    if (section) {
        section.classList.add('hidden');
    }

    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const navFeed = document.getElementById('navFeed');
    if (navFeed) navFeed.classList.add('active');
}

// ============================================================
// CARGAR DATOS DEL PERFIL NATIVO
// ============================================================

async function loadProfileDataNative(userId) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para ver tu perfil', true);
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
                showToast(t('error.notFound') || 'Usuario no encontrado', true);
            } else if (res.status === 403) {
                showToast(t('profile.private') || 'Este perfil es privado', true);
            } else {
                showToast(t('error.general') || 'Error al cargar el perfil', true);
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
        showToast(t('error.general') || 'Error al cargar el perfil', true);
    }
}

// ============================================================
// 🔥 REFRESCAR PERFIL EN SEGUNDO PLANO
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
            
            let stories = [];
            if (storiesRes.ok) {
                stories = await storiesRes.json();
                storiesCache.set(userId, stories);
            }

            if (isProfileSectionVisible && currentProfileUserId === userId) {
                updateProfileNativeUI(user, stories);
            }

            console.log(`🔄 Perfil nativo ${userId} actualizado en tiempo real`);
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// 🔥 GENERAR MINIATURA DE HISTORIA - SOPORTE PARA TODOS LOS TIPOS
// ============================================================

function generateStoryThumbnail(story, userId) {
    const storyId = story.id;
    const mediaType = story.mediaType || 'image';
    
    // 🔥 Para encuestas
    if (mediaType === 'survey' && story.surveyData) {
        const survey = story.surveyData;
        const question = survey.question || '📊 Encuesta';
        const totalVotes = survey.options?.reduce((sum, o) => sum + (o.votes || 0), 0) || 0;
        return `
            <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${storyId}', '${userId}')">
                <div class="text-thumb" style="background:linear-gradient(135deg, rgba(192,132,252,0.1), rgba(219,39,119,0.05));">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span style="font-size:20px;">📊</span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.6);font-weight:600;text-align:center;line-height:1.2;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${escapeHtml(question.substring(0, 20))}${question.length > 20 ? '…' : ''}
                        </span>
                        <span style="font-size:8px;color:rgba(255,255,255,0.2);">${totalVotes} ${t('survey.votes') || 'votos'}</span>
                    </div>
                </div>
                <div class="thumb-overlay" style="background:linear-gradient(0deg, rgba(192,132,252,0.3), transparent);">
                    <i class="fas fa-chart-pie"></i> ${formatNumber(totalVotes)}
                </div>
            </div>
        `;
    }
    
    // 🔥 Para imágenes
    if (mediaType === 'image' && story.mediaUrl) {
        return `
            <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${storyId}', '${userId}')">
                <img src="${story.mediaUrl}" alt="Historia" loading="lazy" decoding="async" />
                <div class="thumb-overlay">
                    <i class="fas fa-heart"></i> ${formatNumber(story.likes?.length || 0)}
                </div>
            </div>
        `;
    }
    
    // 🔥 Para videos
    if (mediaType === 'video' && story.mediaUrl) {
        return `
            <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${storyId}', '${userId}')">
                <div class="text-thumb" style="background:linear-gradient(135deg, rgba(96,165,250,0.1), rgba(6,182,212,0.05));">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span style="font-size:24px;">🎬</span>
                        <span style="font-size:9px;color:rgba(255,255,255,0.3);font-weight:500;">${t('story.video') || 'Video'}</span>
                        ${story.hasSubtitles ? `<span style="font-size:7px;color:rgba(192,132,252,0.3);">CC</span>` : ''}
                    </div>
                </div>
                <div class="thumb-overlay">
                    <i class="fas fa-play"></i>
                    <i class="fas fa-heart" style="margin-left:6px;"></i> ${formatNumber(story.likes?.length || 0)}
                </div>
            </div>
        `;
    }
    
    // 🔥 Para texto
    if (mediaType === 'text' && story.textContent) {
        const text = story.textContent || '';
        return `
            <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${storyId}', '${userId}')">
                <div class="text-thumb" style="background:${story.textBgColor || '#1a1a2e'}">
                    ${escapeHtml(text.substring(0, 25))}${text.length > 25 ? '…' : ''}
                </div>
                <div class="thumb-overlay">
                    <i class="fas fa-font"></i>
                    <i class="fas fa-heart" style="margin-left:6px;"></i> ${formatNumber(story.likes?.length || 0)}
                </div>
            </div>
        `;
    }
    
    // 🔥 Fallback genérico
    return `
        <div class="profile-story-thumb-native" onclick="window.openStoryFromProfileNative('${storyId}', '${userId}')">
            <div class="text-thumb" style="background:rgba(255,255,255,0.02);">
                <i class="fas fa-file" style="font-size:24px;color:rgba(255,255,255,0.05);"></i>
            </div>
        </div>
    `;
}

// ============================================================
// OBTENER INSIGNIA DE VERIFICACIÓN
// ============================================================

function getVerificationBadgeNative(user) {
    if (!user) return '';

    if (user.isVerified) {
        if (user.role === 'admin') {
            return `<span class="verified-badge" title="${t('profile.adminVerified') || 'Administrador verificado'}"><i class="fas fa-shield-alt"></i></span>`;
        } else if (user.accountType === 'business_verified' || user.accountType === 'business') {
            return `<span class="verified-badge" title="${t('profile.businessVerified') || 'Empresa verificada'}"><i class="fas fa-building"></i></span>`;
        } else {
            return `<span class="verified-badge" title="${t('profile.verified') || 'Cuenta verificada'}"><i class="fas fa-check-circle"></i></span>`;
        }
    }

    if (user.role === 'admin') {
        return `<span class="verified-badge" title="${t('profile.admin') || 'Administrador'}"><i class="fas fa-shield-alt"></i></span>`;
    }

    return '';
}

// ============================================================
// TRADUCIR UI DEL PERFIL NATIVO
// ============================================================

function translateProfileNativeUI() {
    const container = document.getElementById('profileNativeContent');
    if (!container) return;

    const statLabels = container.querySelectorAll('.profile-stats-native .stat .label');
    const labelKeys = ['profile.followers', 'profile.following', 'profile.stories'];
    statLabels.forEach((label, index) => {
        if (index < labelKeys.length) {
            const text = t(labelKeys[index]);
            if (text && text !== labelKeys[index]) {
                label.textContent = text;
            }
        }
    });

    const sectionTitle = container.querySelector('.profile-stories-native .section-title');
    if (sectionTitle) {
        const textNode = sectionTitle.childNodes[1];
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const text = t('profile.stories');
            if (text && text !== 'profile.stories') {
                textNode.textContent = text;
            }
        }
    }

    const followBtn = container.querySelector('#profileFollowBtnNative');
    if (followBtn) {
        const isFollowing = followBtn.classList.contains('following');
        const isOwnProfile = followBtn.getAttribute('data-own') === 'true';
        
        if (isOwnProfile) {
            const text = t('profile.edit');
            if (text && text !== 'profile.edit') {
                followBtn.innerHTML = '<i class="fas fa-pen"></i> ' + text;
            }
        } else if (isFollowing) {
            const text = t('profile.unfollow');
            if (text && text !== 'profile.unfollow') {
                followBtn.innerHTML = '<i class="fas fa-check"></i> ' + text;
            }
        } else {
            const text = t('profile.follow');
            if (text && text !== 'profile.follow') {
                followBtn.innerHTML = '<i class="fas fa-user-plus"></i> ' + text;
            }
        }
    }

    const noStories = container.querySelector('.profile-no-stories-native span');
    if (noStories) {
        const text = t('profile.noStories');
        if (text && text !== 'profile.noStories') {
            noStories.textContent = text;
        }
    }
}

// ============================================================
// ACTUALIZAR UI DEL PERFIL NATIVO - CON SOPORTE PARA TODOS LOS TIPOS
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
        const thumbnails = displayStories.map(story => generateStoryThumbnail(story, user.id)).join('');
        storiesHtml = `<div class="profile-stories-grid-native">${thumbnails}</div>`;

        if (stories.length > 6) {
            storiesHtml += `
                <div style="text-align:center;font-size:9px;color:rgba(255,255,255,0.15);padding:2px 0;">
                    +${stories.length - 6} ${t('profile.more') || 'más'}
                </div>
            `;
        }
    } else {
        storiesHtml = `
            <div class="profile-no-stories-native">
                <i class="fas fa-camera"></i>
                <span>${t('profile.noStories') || 'No hay historias'}</span>
            </div>
        `;
    }

    let followText = t('profile.follow') || 'Seguir';
    let followClass = 'profile-follow-btn-native';
    let followDisabled = false;
    let followIcon = '<i class="fas fa-user-plus"></i>';
    let followOnClick = `window.handleProfileFollowNative()`;
    let dataOwn = 'false';

    if (isOwnProfile) {
        followText = t('profile.edit') || 'Editar perfil';
        followClass = 'profile-follow-btn-native';
        followDisabled = false;
        followIcon = '<i class="fas fa-pen"></i>';
        followOnClick = `window.openEditProfileFromNative()`;
        dataOwn = 'true';
    } else if (isFollowing) {
        followText = t('profile.unfollow') || 'Siguiendo';
        followClass = 'profile-follow-btn-native following';
        followIcon = '<i class="fas fa-check"></i>';
        dataOwn = 'false';
    } else if (hasPendingRequest) {
        followText = t('profile.requestSent') || 'Solicitud enviada';
        followClass = 'profile-follow-btn-native';
        followIcon = '<i class="fas fa-clock"></i>';
        dataOwn = 'false';
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
                <button class="${followClass}" id="profileFollowBtnNative" ${followDisabled ? 'disabled' : ''} onclick="${followOnClick}" data-own="${dataOwn}">
                    ${followIcon}
                    ${followText}
                </button>
            </div>

            <div class="profile-stats-native">
                <div class="stat" onclick="window.openFollowersFromNative('followers')" style="cursor:pointer;">
                    <span class="number">${formatNumber(followersCount)}</span>
                    <span class="label">${t('profile.followers') || 'Seguidores'}</span>
                </div>
                <div class="stat" onclick="window.openFollowersFromNative('following')" style="cursor:pointer;">
                    <span class="number">${formatNumber(followingCount)}</span>
                    <span class="label">${t('profile.following') || 'Siguiendo'}</span>
                </div>
                <div class="stat">
                    <span class="number">${formatNumber(stories?.length || 0)}</span>
                    <span class="label">${t('profile.stories') || 'Historias'}</span>
                </div>
            </div>

            <div class="profile-stories-native">
                <div class="section-title">
                    <i class="fas fa-images"></i> ${t('profile.stories') || 'Historias'}
                    <span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:auto;">${stories?.length || 0}</span>
                </div>
                ${storiesHtml}
            </div>
        </div>
    `;

    setTimeout(translateProfileNativeUI, 50);
}

// ============================================================
// MANEJAR SEGUIR DESDE PERFIL NATIVO
// ============================================================

window.handleProfileFollowNative = async function() {
    if (!currentProfileUserId) return;

    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para seguir', true);
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
                btn.innerHTML = `<i class="fas fa-check"></i> ${t('profile.unfollow') || 'Siguiendo'}`;
                btn.setAttribute('data-own', 'false');
                showToast(`✅ ${t('profile.followed') || 'Siguiendo a'} ${currentProfileData?.fullName}`);
            } else if (data.status === 'pending_sent') {
                btn.classList.remove('following');
                btn.innerHTML = `<i class="fas fa-clock"></i> ${t('profile.requestSent') || 'Solicitud enviada'}`;
                btn.setAttribute('data-own', 'false');
                showToast(`📨 ${t('profile.requestSentTo') || 'Solicitud enviada a'} ${currentProfileData?.fullName}`);
            } else {
                btn.classList.remove('following');
                btn.innerHTML = `<i class="fas fa-user-plus"></i> ${t('profile.follow') || 'Seguir'}`;
                btn.setAttribute('data-own', 'false');
                showToast(`❌ ${t('profile.unfollowed') || 'Dejaste de seguir'}`);
            }

            const followersEl = document.querySelector('.profile-stats-native .stat:first-child .number');
            if (followersEl) {
                const current = parseInt(followersEl.textContent.replace(/[^0-9]/g, '')) || 0;
                const newCount = data.followersCount || data.followersCount !== undefined ? data.followersCount : current + (data.following ? 1 : -1);
                followersEl.textContent = formatNumber(newCount);
            }

            clearProfileCache(currentProfileUserId);
        } else {
            showToast(data.error || t('error.general') || 'Error al seguir', true);
        }
    } catch (error) {
        console.error('Error following user:', error);
        showToast(t('error.general') || 'Error al seguir', true);
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
            showToast(t('error.general') || 'Error al abrir edición de perfil', true);
        }
    });
};

// ============================================================
// 🔥 ABRIR SEGUIDORES DESDE NATIVO
// ============================================================

window.openFollowersFromNative = function(filter) {
    if (!currentProfileUserId) {
        showToast(t('error.notFound') || 'Usuario no encontrado', true);
        return;
    }

    console.log(`📊 Abriendo ${filter} desde perfil nativo para: ${currentProfileUserId}`);

    import('./followers-modal.js').then(({ openFollowersModal }) => {
        openFollowersModal(currentProfileUserId, filter, true, true);
    }).catch((err) => {
        console.error('❌ Error cargando followers-modal:', err);
        showToast(t('error.general') || 'Error al abrir seguidores', true);
    });
};

// ============================================================
// ABRIR HISTORIA DESDE PERFIL NATIVO
// ============================================================

window.openStoryFromProfileNative = function(storyId, profileUserId) {
    if (!storyId) return;

    const userId = profileUserId || currentProfileUserId;

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
    clearProfileCache,
    preloadCurrentUserProfile,
    translateProfileNativeUI,
    initI18nForProfileNative
};