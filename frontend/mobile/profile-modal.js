// profile-modal.js - Modal para ver perfil de usuario (OPTIMIZADO)
// CON RESTAURACIÓN DE NAVEGACIÓN A INICIO

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile
} from './auth.js';

import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';

const API_URL = window.location.origin;
let currentProfileUserId = null;
let currentProfileData = null;
let isProfileModalOpen = false;
let isEditMode = false;

// ============================================================
// 🔥 CACHÉ DE PERFILES Y HISTORIAS
// ============================================================

const profileCache = new Map();
const storiesCache = new Map();
let preloadedProfileId = null;
let preloadedStories = [];

// ============================================================
// 🔥 FUNCIÓN PARA RESTAURAR NAVEGACIÓN A INICIO
// ============================================================

function restoreNavToHome() {
    // Quitar clase active de todos los botones de navegación
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    
    // Activar el botón de Inicio
    const navFeed = document.getElementById('navFeed');
    if (navFeed) navFeed.classList.add('active');
}

// ============================================================
// 🔥 PRE-CARGAR PERFIL DEL USUARIO LOGEADO EN SEGUNDO PLANO
// ============================================================

function preloadCurrentUserProfile() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.id) return;

    const userId = currentUser.id;
    
    if (profileCache.has(userId)) return;

    console.log(`🔄 Pre-cargando perfil de ${currentUser.fullName} en segundo plano...`);

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
        preloadedProfileId = userId;
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
        preloadedStories = stories;
        storiesCache.set(userId, stories);
        window._profileStories = stories;
        console.log(`✅ ${stories.length} historias pre-cargadas`);
    })
    .catch(err => {
        console.warn('⚠️ Error pre-cargando perfil:', err.message);
    });
}

// ============================================================
// ABRIR MODAL DE PERFIL
// ============================================================

function openProfileModal(userId) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    if (isProfileModalOpen && currentProfileUserId === userId) {
        return;
    }

    if (isProfileModalOpen) {
        closeProfileModal();
    }

    currentProfileUserId = userId;
    isProfileModalOpen = true;
    isEditMode = false;

    const overlay = document.getElementById('profileModalOverlay');
    if (!overlay) {
        createProfileModalHTML();
    }

    document.getElementById('profileModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    loadProfileData(userId);
}

// ============================================================
// CERRAR MODAL DE PERFIL - CON RESTAURACIÓN A INICIO
// ============================================================

function closeProfileModal() {
    if (isEditMode) {
        if (typeof window.closeEditProfileModal === 'function') {
            window.closeEditProfileModal();
        }
        isEditMode = false;
    }

    isProfileModalOpen = false;
    currentProfileUserId = null;
    currentProfileData = null;

    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    document.body.style.overflow = '';
    
    // 🔥 RESTAURAR NAVEGACIÓN A INICIO
    restoreNavToHome();
}

// ============================================================
// CREAR HTML DEL MODAL DE PERFIL
// ============================================================

function createProfileModalHTML() {
    const html = `
        <div id="profileModalOverlay" class="profile-modal-overlay" onclick="window.closeProfileModal()">
            <div class="profile-modal-content" onclick="event.stopPropagation()">
                <div class="profile-modal-header">
                    <span class="title"><i class="fas fa-user"></i> Perfil</span>
                    <button class="close-btn" onclick="window.closeProfileModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isProfileModalOpen) {
            closeProfileModal();
        }
    });
}

// ============================================================
// CARGAR DATOS DEL PERFIL (CON CACHÉ)
// ============================================================

async function loadProfileData(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver perfiles', true);
        closeProfileModal();
        return;
    }

    try {
        let user = profileCache.get(userId);
        let stories = storiesCache.get(userId);

        if (user && stories) {
            console.log(`📦 Usando caché para perfil ${userId}`);
            updateProfileModalUI(user, stories);
            refreshProfileInBackground(userId);
            return;
        }

        if (user) {
            console.log(`📦 Perfil en caché, cargando historias...`);
            const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (storiesRes.ok) {
                stories = await storiesRes.json();
                storiesCache.set(userId, stories);
                window._profileStories = stories;
            }
            updateProfileModalUI(user, stories || []);
            return;
        }

        console.log(`📡 Cargando perfil ${userId} desde servidor...`);
        
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
            closeProfileModal();
            return;
        }

        user = await res.json();
        currentProfileData = user;

        profileCache.set(userId, user);

        const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (storiesRes.ok) {
            stories = await storiesRes.json();
            storiesCache.set(userId, stories);
            window._profileStories = stories;
        }

        updateProfileModalUI(user, stories || []);

    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Error al cargar el perfil', true);
        closeProfileModal();
    }
}

// ============================================================
// 🔥 ACTUALIZAR PERFIL EN SEGUNDO PLANO
// ============================================================

async function refreshProfileInBackground(userId) {
    try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/api/users/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const user = await res.json();
            profileCache.set(userId, user);
            
            const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (storiesRes.ok) {
                const stories = await storiesRes.json();
                storiesCache.set(userId, stories);
                window._profileStories = stories;
            }
            
            console.log(`🔄 Perfil ${userId} actualizado en segundo plano`);
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// 🔥 OBTENER INSIGNIA DE VERIFICACIÓN - ESTILO TIKTOK/X (SOLO AL LADO DEL NOMBRE)
// ============================================================

function getVerificationBadge(user) {
    if (!user) return '';
    
    if (user.isVerified) {
        if (user.role === 'admin') {
            return `<span class="verification-badge admin-verified" title="Administrador verificado"></span>`;
        } else if (user.accountType === 'business_verified' || user.accountType === 'business') {
            return `<span class="verification-badge business" title="Empresa verificada"></span>`;
        } else {
            return `<span class="verification-badge verified" title="Cuenta verificada"></span>`;
        }
    }
    
    if (user.role === 'admin') {
        return `<span class="verification-badge admin" title="Administrador"></span>`;
    }
    
    return '';
}

// ============================================================
// ACTUALIZAR UI DEL MODAL DE PERFIL (OPTIMIZADO)
// ============================================================

function updateProfileModalUI(user, stories) {
    const container = document.getElementById('profileModalBody');
    if (!container) return;

    const currentUser = getCurrentUser();
    const isFollowing = user.isFollowing || false;
    const hasPendingRequest = user.hasPendingRequest || false;
    const isOwnProfile = currentUser?.id === user.id;

    const followersCount = user.followersCount || 0;
    const followingCount = user.followingCount || 0;

    const badgeHtml = getVerificationBadge(user);

    let storiesHtml = '';
    if (stories && stories.length > 0) {
        const storiesJson = JSON.stringify(stories).replace(/"/g, '&quot;');
        const displayStories = stories.slice(0, 6);
        
        const thumbnails = displayStories.map(story => {
            if (story.mediaType === 'image' && story.mediaUrl) {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${user.id}')">
                        <img src="${story.mediaUrl}" alt="Historia" loading="lazy" decoding="async" />
                        <div class="thumb-overlay">
                            <i class="fas fa-heart"></i> ${formatNumber(story.likes?.length || 0)}
                        </div>
                    </div>
                `;
            } else if (story.mediaType === 'text' && story.textContent) {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${user.id}')">
                        <div class="text-thumb">${escapeHtml(story.textContent.substring(0, 20))}${story.textContent.length > 20 ? '...' : ''}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${user.id}')">
                        <div class="text-thumb">
                            <i class="fas fa-file" style="font-size:14px;color:rgba(255,255,255,0.1);"></i>
                        </div>
                    </div>
                `;
            }
        }).join('');
        
        storiesHtml = `<div class="profile-stories-grid">${thumbnails}</div>`;
        
        if (stories.length > 6) {
            storiesHtml += `
                <div style="text-align:center;font-size:9px;color:rgba(255,255,255,0.15);padding:2px 0;">
                    +${stories.length - 6} más
                </div>
            `;
        }
    } else {
        storiesHtml = `
            <div class="profile-no-stories">
                <i class="fas fa-camera"></i>
                <span>No hay historias</span>
            </div>
        `;
    }

    let followText = 'Seguir';
    let followClass = 'btn-follow';
    let followDisabled = false;
    let followIcon = '<i class="fas fa-user-plus"></i>';

    if (isOwnProfile) {
        followText = 'Editar perfil';
        followClass = 'btn-edit-profile';
        followDisabled = false;
        followIcon = '<i class="fas fa-pen"></i>';
    } else if (isFollowing) {
        followText = 'Siguiendo';
        followClass = 'btn-follow following';
        followIcon = '<i class="fas fa-check"></i>';
    } else if (hasPendingRequest) {
        followText = 'Solicitud enviada';
        followClass = 'btn-follow';
        followIcon = '<i class="fas fa-clock"></i>';
    }

    const avatarUrl = user.avatar || getAvatar(user.fullName);
    const fullName = escapeHtml(user.fullName);
    const username = escapeHtml(user.username);
    const bio = user.bio ? escapeHtml(user.bio) : '';
    const countryName = user.countryName ? escapeHtml(user.countryName) : '';

    container.innerHTML = `
        <div class="profile-cover">
            <div class="profile-avatar-wrapper">
                <img class="profile-avatar" src="${avatarUrl}" 
                     alt="${fullName}" 
                     loading="eager"
                     onerror="this.src='${getAvatar(user.fullName || 'U')}'" />
            </div>
            <div class="profile-name">
                ${fullName}
                ${badgeHtml}
            </div>
            <div class="profile-username">@${username}</div>
            ${bio ? `<div class="profile-bio">${bio}</div>` : ''}
            ${countryName ? `<div class="profile-bio" style="font-size:10px;color:rgba(255,255,255,0.2);"><i class="fas fa-map-marker-alt"></i> ${countryName}</div>` : ''}
        </div>

        <div class="profile-follow-btn">
            <button class="${followClass}" id="profileFollowBtn" ${followDisabled ? 'disabled' : ''}>
                ${followIcon}
                ${followText}
            </button>
        </div>

        <div class="profile-stats">
            <div class="stat">
                <span class="number">${formatNumber(followersCount)}</span>
                <span class="label">Seguidores</span>
            </div>
            <div class="stat">
                <span class="number">${formatNumber(followingCount)}</span>
                <span class="label">Siguiendo</span>
            </div>
            <div class="stat">
                <span class="number">${formatNumber(stories?.length || 0)}</span>
                <span class="label">Historias</span>
            </div>
        </div>

        <div class="profile-stories-section">
            <div class="section-title">
                <i class="fas fa-images"></i> Historias
                <span style="font-size:9px;color:rgba(255,255,255,0.15);margin-left:auto;">${stories?.length || 0}</span>
            </div>
            ${storiesHtml}
        </div>
    `;

    const followBtn = document.getElementById('profileFollowBtn');
    if (followBtn) {
        if (isOwnProfile) {
            followBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔧 Click en Editar perfil - desde profile-modal');
                
                isEditMode = true;
                const userData = currentProfileData || getCurrentUser();
                console.log('📦 userData para editar:', userData);
                
                if (typeof window.openEditProfileModal === 'function') {
                    console.log('✅ window.openEditProfileModal es función, ejecutando...');
                    window.openEditProfileModal(userData);
                } else {
                    console.error('❌ window.openEditProfileModal NO es función');
                    console.log('🔍 window.openEditProfileModal:', window.openEditProfileModal);
                    showToast('Error al abrir edición de perfil', true);
                }
            });
        } else {
            followBtn.addEventListener('click', async () => {
                await handleFollowUser(user.id, followBtn);
            });
        }
    }
}

// ============================================================
// MANEJAR SEGUIR USUARIO
// ============================================================

async function handleFollowUser(userId, btn) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
        return;
    }

    const isFollowing = btn.classList.contains('following');
    const method = isFollowing ? 'DELETE' : 'POST';

    try {
        const res = await fetch(`${API_URL}/api/follows/${isFollowing ? 'unfollow' : 'follow'}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
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
            
            const followersEl = document.querySelector('.profile-stats .stat:first-child .number');
            if (followersEl) {
                const current = parseInt(followersEl.textContent.replace(/[^0-9]/g, '')) || 0;
                const newCount = data.followersCount || data.followersCount !== undefined ? data.followersCount : current + (data.following ? 1 : -1);
                followersEl.textContent = formatNumber(newCount);
            }
            
            profileCache.delete(userId);
            storiesCache.delete(userId);
        } else {
            showToast(data.error || 'Error al seguir', true);
        }
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Error al seguir', true);
    }
}

// ============================================================
// 🔥 FUNCIÓN ESPECIAL: ABRIR HISTORIA SOBRE EL PERFIL (SUPERPUESTA)
// ============================================================

window.openStoryFromProfileOverlay = function(storyId, storiesJson, profileUserId) {
    try {
        let stories = window._profileStories || [];
        
        if (stories.length === 0 && storiesJson) {
            try {
                stories = JSON.parse(storiesJson);
            } catch (e) {
                console.warn('Error parsing stories JSON');
                stories = [];
            }
        }
        
        const userId = profileUserId || currentProfileUserId;
        
        window._fromProfileModal = true;
        window._profileContextUserId = userId;
        
        if (stories && stories.length > 1) {
            window.openStoryModal(storyId, stories, true, userId);
        } else if (stories && stories.length === 1) {
            window.openStoryModal(storyId, null, true, userId);
        } else {
            window.openStoryModal(storyId, null, true, userId);
        }
        
        setTimeout(() => {
            const storyOverlay = document.getElementById('storyModalOverlay');
            if (storyOverlay) {
                storyOverlay.style.zIndex = '10001';
            }
        }, 50);
        
    } catch (e) {
        console.error('Error abriendo historia superpuesta:', e);
        closeProfileModal();
        setTimeout(() => window.openStoryModal(storyId), 100);
    }
};

// ============================================================
// FUNCIONES GLOBALES (window)
// ============================================================

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;

window.openStoryFromProfile = function(storyId) {
    closeProfileModal();
    setTimeout(() => {
        window.openStoryModal(storyId);
    }, 300);
};

window.openStoryFromProfileWithList = function(storyId, storiesJson, profileUserId) {
    window.openStoryFromProfileOverlay(storyId, storiesJson, profileUserId);
};

window.goToProfileUserFromModal = function() {
    const userId = window._modalUserId;
    if (userId) {
        closeProfileModal();
        setTimeout(() => {
            const currentUser = getCurrentUser();
            if (currentUser?.id === userId) {
                openProfileModal(userId);
            } else {
                window.location.href = `profile.html?id=${userId}`;
            }
        }, 300);
    }
};

// ============================================================
// EXPORTAR - SOLO UNA VEZ AL FINAL
// ============================================================

export { 
    openProfileModal, 
    closeProfileModal, 
    loadProfileData, 
    handleFollowUser,
    preloadCurrentUserProfile,
    getVerificationBadge
};