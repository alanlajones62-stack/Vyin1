// profile-modal.js - Modal para ver perfil de usuario (VERSIÓN CORREGIDA)
// CON CACHÉ, NAVEGACIÓN INFINITA Y CARGA INSTANTÁNEA

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
let refreshInterval = null;

// 🔥 PILA DE NAVEGACIÓN INFINITA
let profileNavigationStack = [];

// 🔥 CACHÉ DE PERFILES
const profileCache = new Map();
const storiesCache = new Map();
const MAX_CACHE_SIZE = 50;

function cleanCache() {
    if (profileCache.size > MAX_CACHE_SIZE) {
        const keys = Array.from(profileCache.keys());
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        toRemove.forEach(key => {
            profileCache.delete(key);
            storiesCache.delete(key);
        });
    }
}

function clearProfileCache(userId) {
    if (userId) {
        profileCache.delete(userId);
        storiesCache.delete(userId);
    }
}

// ============================================================
// 🔥 FUNCIÓN PARA LIMPIAR EL CONTENIDO DEL MODAL
// ============================================================

function clearModalContent() {
    const container = document.getElementById('profileModalBody');
    if (!container) return;
    
    container.innerHTML = `
        <div class="profile-loading">
            <i class="fas fa-spinner fa-pulse"></i>
            <span>Cargando perfil...</span>
        </div>
    `;
}

// ============================================================
// 🔥 FUNCIÓN PARA RESTAURAR SEGUIDORES DESDE PERFIL
// ============================================================

function restoreFollowersFromProfile() {
    console.log('🔄 [PROFILE] Restaurando seguidores desde perfil');
    
    if (window._followersContextData) {
        const context = window._followersContextData;
        console.log(`📌 [PROFILE] Contexto encontrado: userId=${context.userId}, filter=${context.filter}`);
        
        if (typeof window.restoreFollowersModal === 'function') {
            setTimeout(() => {
                window.restoreFollowersModal();
                window._followersContextData = null;
                window._fromFollowers = false;
            }, 150);
        } else {
            import('./followers-modal.js').then(({ restoreFollowersModal }) => {
                setTimeout(() => {
                    restoreFollowersModal();
                    window._followersContextData = null;
                    window._fromFollowers = false;
                }, 150);
            }).catch(err => {
                console.error('❌ Error importando followers-modal:', err);
            });
        }
    }
}

// ============================================================
// 🔥 FUNCIÓN PARA REDIRIGIR A PERFIL NATIVO
// ============================================================

function redirectToNativeProfile(userId) {
    console.log(`🔄 Redirigiendo al perfil nativo: ${userId}`);
    
    if (isProfileModalOpen) {
        // Cerrar todo el stack
        profileNavigationStack = [];
        closeProfileModalInternal(false);
    }
    
    import('./profile-native.js').then(({ showProfileNative }) => {
        showProfileNative(userId);
    }).catch(err => {
        console.error('❌ Error importando profile-native:', err);
        showToast('Error al abrir perfil', true);
    });
}

// ============================================================
// 🔥 FUNCIÓN PARA CARGAR PERFIL CON CACHÉ
// ============================================================

async function loadProfileWithCache(userId) {
    // 🔥 1. Verificar caché
    if (profileCache.has(userId)) {
        console.log(`📦 Perfil ${userId} desde caché`);
        const user = profileCache.get(userId);
        const stories = storiesCache.get(userId) || [];
        currentProfileData = user;
        updateProfileModalUI(user, stories);
        
        // 🔥 2. Actualizar en segundo plano
        refreshProfileInBackground(userId);
        return true;
    }
    return false;
}

// ============================================================
// ABRIR MODAL DE PERFIL
// ============================================================

function openProfileModal(userId, fromFollowers = false) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    console.log(`👤 Abriendo perfil modal: ${userId}, desde seguidores: ${fromFollowers}`);

    // 🔥 VERIFICAR SI ES EL PROPIO USUARIO
    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
        console.log('👤 Es el propio usuario, redirigiendo a perfil nativo');
        redirectToNativeProfile(userId);
        return;
    }

    // 🔥 Si ya está abierto el mismo perfil, traerlo al frente
    if (isProfileModalOpen && currentProfileUserId === userId) {
        bringProfileToFront();
        return;
    }

    // 🔥 Si hay un perfil abierto, guardar en pila
    if (isProfileModalOpen) {
        profileNavigationStack.push({
            userId: currentProfileUserId,
            data: currentProfileData,
            fromFollowers: window._fromFollowers || false,
            scrollPosition: document.querySelector('.profile-modal-body')?.scrollTop || 0
        });
        // Cerrar sin restaurar seguidores
        closeProfileModalInternal(false);
    }

    currentProfileUserId = userId;
    isProfileModalOpen = true;
    isEditMode = false;

    if (fromFollowers) {
        window._fromFollowers = true;
    }

    // 🔥 Asegurar overlay
    const overlay = document.getElementById('profileModalOverlay');
    if (!overlay) {
        createProfileModalHTML();
    }

    const overlayEl = document.getElementById('profileModalOverlay');
    if (overlayEl) {
        overlayEl.style.display = 'flex';
        overlayEl.classList.add('active');
        overlayEl.style.zIndex = '10006';
    }

    document.body.style.overflow = 'hidden';

    // 🔥 1. Mostrar caché primero (INSTANTÁNEO)
    const cached = loadProfileWithCache(userId);
    
    if (!cached) {
        // 🔥 2. Si no hay caché, mostrar loading y cargar
        clearModalContent();
        loadProfileData(userId);
    }

    // 🔥 3. Refresco en segundo plano
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    refreshInterval = setInterval(() => {
        if (isProfileModalOpen && currentProfileUserId === userId) {
            refreshProfileInBackground(userId);
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 15000);
}

// ============================================================
// 🔥 TRAER PERFIL AL FRENTE
// ============================================================

function bringProfileToFront() {
    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        overlay.style.zIndex = '10006';
    }
}

// ============================================================
// CERRAR MODAL DE PERFIL - INTERNO (SIN RESTAURAR)
// ============================================================

function closeProfileModalInternal(restoreFollowers = true) {
    console.log('🔒 Cerrando modal de perfil (interno)');
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    clearModalContent();

    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }

    const wasFromFollowers = window._fromFollowers || false;
    const contextData = window._followersContextData || null;
    
    isProfileModalOpen = false;
    currentProfileUserId = null;
    currentProfileData = null;

    document.body.style.overflow = '';

    if (restoreFollowers && wasFromFollowers && contextData) {
        console.log('🔄 [CLOSE] Restaurando seguidores desde perfil');
        setTimeout(() => {
            if (typeof window.restoreFollowersModal === 'function') {
                window.restoreFollowersModal();
                window._followersContextData = null;
                window._fromFollowers = false;
            } else {
                import('./followers-modal.js').then(({ restoreFollowersModal }) => {
                    restoreFollowersModal();
                    window._followersContextData = null;
                    window._fromFollowers = false;
                }).catch(err => {
                    console.error('❌ Error importando followers-modal:', err);
                });
            }
        }, 200);
    }
}

// ============================================================
// CERRAR MODAL DE PERFIL - PÚBLICO (CON RESTAURACIÓN DE PILA)
// ============================================================

function closeProfileModal() {
    console.log('🔒 Cerrando modal de perfil (público)');
    console.log(`📊 Pila actual: ${profileNavigationStack.length} elementos`);
    
    if (isEditMode) {
        if (typeof window.closeEditProfileModal === 'function') {
            window.closeEditProfileModal();
        }
        isEditMode = false;
    }

    // 🔥 Verificar si hay elementos en la pila para volver
    if (profileNavigationStack.length > 0) {
        const previous = profileNavigationStack.pop();
        console.log(`🔄 Volviendo al perfil anterior: ${previous.userId}`);
        
        // Cerrar el actual sin restaurar seguidores
        closeProfileModalInternal(false);
        
        // 🔥 Abrir el anterior INSTANTÁNEAMENTE (desde caché)
        setTimeout(() => {
            // Restaurar estado
            currentProfileUserId = previous.userId;
            currentProfileData = previous.data;
            isProfileModalOpen = true;
            
            if (previous.fromFollowers) {
                window._fromFollowers = true;
            }
            
            const overlay = document.getElementById('profileModalOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.add('active');
                overlay.style.zIndex = '10006';
            }
            
            document.body.style.overflow = 'hidden';
            
            // 🔥 Mostrar desde caché o cargar
            if (profileCache.has(previous.userId)) {
                const user = profileCache.get(previous.userId);
                const stories = storiesCache.get(previous.userId) || [];
                currentProfileData = user;
                updateProfileModalUI(user, stories);
                // Actualizar en segundo plano
                refreshProfileInBackground(previous.userId);
            } else {
                clearModalContent();
                loadProfileData(previous.userId);
            }
            
            // Restaurar scroll position
            setTimeout(() => {
                const body = document.querySelector('.profile-modal-body');
                if (body && previous.scrollPosition) {
                    body.scrollTop = previous.scrollPosition;
                }
            }, 50);
            
        }, 100);
        return;
    }

    // Si no hay pila, cerrar normalmente
    closeProfileModalInternal(true);
}

// ============================================================
// CREAR HTML DEL MODAL DE PERFIL
// ============================================================

function createProfileModalHTML() {
    if (document.getElementById('profileModalOverlay')) return;

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

    window.closeProfileModal = closeProfileModal;
    window.openFollowersFromProfile = openFollowersFromProfile;
    window.handleProfileFollow = handleFollowUser;
    window.openStoryFromProfileOverlay = openStoryFromProfileOverlay;
    window.openEditProfileFromModal = openEditProfileFromModal;
    window.restoreFollowersFromProfile = restoreFollowersFromProfile;
    window.redirectToNativeProfile = redirectToNativeProfile;
}

// ============================================================
// 🔥 ABRIR EDITAR PERFIL DESDE EL MODAL
// ============================================================

function openEditProfileFromModal() {
    if (!currentProfileData) return;
    closeProfileModal();
    setTimeout(() => {
        import('./edit-profile-modal.js').then(({ openEditProfileModal }) => {
            openEditProfileModal(currentProfileData);
        }).catch(() => {
            if (typeof window.openEditProfileModal === 'function') {
                window.openEditProfileModal(currentProfileData);
            } else {
                showToast('Error al abrir edición de perfil', true);
            }
        });
    }, 100);
}

// ============================================================
// 🔥 ABRIR MODAL DE SEGUIDORES DESDE EL PERFIL
// ============================================================

function openFollowersFromProfile(filter) {
    if (!currentProfileUserId) {
        showToast('Usuario no encontrado', true);
        return;
    }
    
    console.log(`📊 Abriendo ${filter} para usuario: ${currentProfileUserId}`);
    
    const userId = currentProfileUserId;
    
    // 🔥 Guardar el perfil actual en la pila
    profileNavigationStack.push({
        userId: currentProfileUserId,
        data: currentProfileData,
        fromFollowers: window._fromFollowers || false,
        scrollPosition: document.querySelector('.profile-modal-body')?.scrollTop || 0
    });
    
    // 🔥 Cerrar perfil SIN restaurar seguidores
    closeProfileModalInternal(false);
    
    // 🔥 Abrir followers
    import('./followers-modal.js').then(({ openFollowersModal }) => {
        openFollowersModal(userId, filter, true);
    }).catch((err) => {
        console.error('❌ Error cargando followers-modal:', err);
        showToast('Error al abrir seguidores', true);
        // Restaurar perfil si falla
        const previous = profileNavigationStack.pop();
        if (previous) {
            setTimeout(() => {
                openProfileModal(previous.userId, previous.fromFollowers);
            }, 100);
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
        clearProfileCache(userId);

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

        const user = await res.json();
        currentProfileData = user;

        // 🔥 Guardar en caché
        profileCache.set(userId, user);
        cleanCache();

        const storiesRes = await fetch(`${API_URL}/api/stories/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let stories = [];
        if (storiesRes.ok) {
            stories = await storiesRes.json();
            storiesCache.set(userId, stories);
            window._profileStories = stories;
            cleanCache();
        }

        updateProfileModalUI(user, stories);

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
            
            let stories = [];
            if (storiesRes.ok) {
                stories = await storiesRes.json();
                storiesCache.set(userId, stories);
                window._profileStories = stories;
            }

            // 🔥 Solo actualizar UI si sigue siendo el perfil visible
            if (isProfileModalOpen && currentProfileUserId === userId) {
                currentProfileData = user;
                updateProfileModalUI(user, stories);
            }
            
            console.log(`🔄 Perfil ${userId} actualizado en segundo plano`);
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// 🔥 ACTUALIZAR SOLO LAS HISTORIAS
// ============================================================

function updateStoriesOnly(stories) {
    const container = document.getElementById('profileModalBody');
    if (!container) return;

    const storiesSection = container.querySelector('.profile-stories-section');
    if (!storiesSection) return;

    const grid = storiesSection.querySelector('.profile-stories-grid');
    if (!grid) return;

    let storiesHtml = '';
    if (stories && stories.length > 0) {
        const storiesJson = JSON.stringify(stories).replace(/"/g, '&quot;');
        const displayStories = stories.slice(0, 6);
        
        const thumbnails = displayStories.map(story => {
            if (story.mediaType === 'image' && story.mediaUrl) {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${currentProfileUserId}')">
                        <img src="${story.mediaUrl}" alt="Historia" loading="lazy" decoding="async" />
                        <div class="thumb-overlay">
                            <i class="fas fa-heart"></i> ${formatNumber(story.likes?.length || 0)}
                        </div>
                    </div>
                `;
            } else if (story.mediaType === 'text' && story.textContent) {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${currentProfileUserId}')">
                        <div class="text-thumb">${escapeHtml(story.textContent.substring(0, 20))}${story.textContent.length > 20 ? '...' : ''}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="profile-story-thumb" onclick="window.openStoryFromProfileOverlay('${story.id}', '${storiesJson}', '${currentProfileUserId}')">
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

    grid.innerHTML = storiesHtml;

    const statNumbers = container.querySelectorAll('.profile-stats .stat .number');
    if (statNumbers.length >= 3) {
        statNumbers[2].textContent = formatNumber(stories?.length || 0);
    }

    const sectionTitle = storiesSection.querySelector('.section-title span:last-child');
    if (sectionTitle) {
        sectionTitle.textContent = stories?.length || 0;
    }
}

// ============================================================
// 🔥 OBTENER INSIGNIA DE VERIFICACIÓN
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
// ACTUALIZAR UI DEL MODAL DE PERFIL
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
    let followOnClick = `window.handleProfileFollow()`;

    if (isOwnProfile) {
        followText = 'Editar perfil';
        followClass = 'btn-edit-profile';
        followDisabled = false;
        followIcon = '<i class="fas fa-pen"></i>';
        followOnClick = `window.openEditProfileFromModal()`;
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
            <button class="${followClass}" id="profileFollowBtn" ${followDisabled ? 'disabled' : ''} onclick="${followOnClick}">
                ${followIcon}
                ${followText}
            </button>
        </div>

        <div class="profile-stats">
            <div class="stat" onclick="window.openFollowersFromProfile('followers')" style="cursor:pointer;">
                <span class="number">${formatNumber(followersCount)}</span>
                <span class="label">Seguidores</span>
            </div>
            <div class="stat" onclick="window.openFollowersFromProfile('following')" style="cursor:pointer;">
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
            
            clearProfileCache(userId);
            // Actualizar caché en segundo plano
            refreshProfileInBackground(userId);
        } else {
            showToast(data.error || 'Error al seguir', true);
        }
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Error al seguir', true);
    }
}

// ============================================================
// 🔥 FUNCIÓN ESPECIAL: ABRIR HISTORIA SOBRE EL PERFIL
// ============================================================

function openStoryFromProfileOverlay(storyId, storiesJson, profileUserId) {
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
                storyOverlay.style.zIndex = '10007';
            }
        }, 50);
        
    } catch (e) {
        console.error('Error abriendo historia superpuesta:', e);
        closeProfileModal();
        setTimeout(() => window.openStoryModal(storyId), 100);
    }
}

// ============================================================
// 🔥 PRE-CARGAR PERFIL DEL USUARIO ACTUAL
// ============================================================

function preloadCurrentUserProfile() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.id) return;
    
    const userId = currentUser.id;
    
    if (profileCache.has(userId)) return;
    
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
        window._profileStories = stories;
        console.log(`✅ ${stories.length} historias pre-cargadas`);
    })
    .catch(err => {
        console.warn('⚠️ Error pre-cargando perfil:', err.message);
    });
}

// ============================================================
// 🔥 FUNCIÓN PARA ACTUALIZAR PERFIL DESDE OTROS MODALES
// ============================================================

function refreshCurrentProfile() {
    if (currentProfileUserId) {
        refreshProfileInBackground(currentProfileUserId);
    }
}

// ============================================================
// FUNCIONES GLOBALES (window) - EXPUESTAS
// ============================================================

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openFollowersFromProfile = openFollowersFromProfile;
window.handleProfileFollow = handleFollowUser;
window.openStoryFromProfileOverlay = openStoryFromProfileOverlay;
window.openEditProfileFromModal = openEditProfileFromModal;
window.clearProfileCache = clearProfileCache;
window.refreshCurrentProfile = refreshCurrentProfile;
window.restoreFollowersFromProfile = restoreFollowersFromProfile;
window.redirectToNativeProfile = redirectToNativeProfile;

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
// ✅ EXPORTAR
// ============================================================

export { 
    openProfileModal, 
    closeProfileModal, 
    loadProfileData, 
    handleFollowUser,
    preloadCurrentUserProfile,
    getVerificationBadge,
    openFollowersFromProfile,
    clearProfileCache,
    refreshCurrentProfile,
    restoreFollowersFromProfile,
    redirectToNativeProfile
};