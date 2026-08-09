// profile-modal.js - Modal para ver perfil de usuario (VERSIÓN COMPLETA CORREGIDA)
// CON SISTEMA DE BLOQUEO Y PRIVACIDAD COMPLETO

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
let lastRefreshTime = 0;
let pendingProfileLoads = new Map();

// ============================================================
// PILA DE NAVEGACIÓN
// ============================================================

let navigationStack = [];

// ============================================================
// CACHÉ DE PERFILES
// ============================================================

const profileCache = new Map();
const storiesCache = new Map();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ============================================================
// FUNCIONES DE CACHÉ
// ============================================================

function cleanCache() {
    const now = Date.now();
    for (const [key, value] of profileCache) {
        if (now - value.timestamp > CACHE_TTL) {
            profileCache.delete(key);
            storiesCache.delete(key);
        }
    }
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
// SKELETON LOADING
// ============================================================

function showSkeletonLoader() {
    const container = document.getElementById('profileModalBody');
    if (!container) return;
    
    container.innerHTML = `
        <div class="profile-skeleton">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-line" style="width:60%;margin:12px auto 6px;"></div>
            <div class="skeleton-line" style="width:40%;margin:0 auto 16px;"></div>
            <div class="skeleton-line" style="width:80%;margin:0 auto 8px;"></div>
            <div class="skeleton-line" style="width:70%;margin:0 auto 16px;"></div>
            <div style="display:flex;gap:12px;justify-content:center;margin:16px 0;">
                <div class="skeleton-line" style="width:80px;height:36px;border-radius:18px;"></div>
            </div>
            <div style="display:flex;gap:24px;justify-content:center;margin:16px 0;">
                <div style="text-align:center;">
                    <div class="skeleton-line" style="width:40px;height:20px;margin:0 auto;"></div>
                    <div class="skeleton-line" style="width:60px;height:10px;margin:4px auto;"></div>
                </div>
                <div style="text-align:center;">
                    <div class="skeleton-line" style="width:40px;height:20px;margin:0 auto;"></div>
                    <div class="skeleton-line" style="width:60px;height:10px;margin:4px auto;"></div>
                </div>
                <div style="text-align:center;">
                    <div class="skeleton-line" style="width:40px;height:20px;margin:0 auto;"></div>
                    <div class="skeleton-line" style="width:60px;height:10px;margin:4px auto;"></div>
                </div>
            </div>
            <div style="margin-top:20px;">
                <div class="skeleton-line" style="width:100%;height:100px;border-radius:12px;"></div>
            </div>
        </div>
    `;
}

function clearModalContent() {
    const container = document.getElementById('profileModalBody');
    if (!container) return;
    showSkeletonLoader();
}

// ============================================================
// FUNCIÓN PARA CARGAR PERFIL CON CACHÉ
// ============================================================

function loadProfileWithCache(userId) {
    const now = Date.now();
    
    if (profileCache.has(userId)) {
        const cached = profileCache.get(userId);
        if (now - cached.timestamp < CACHE_TTL) {
            console.log(`📦 Perfil ${userId} desde caché (${Math.round((now - cached.timestamp)/1000)}s)`);
            const user = cached.data;
            const stories = storiesCache.get(userId)?.data || [];
            currentProfileData = user;
            updateProfileModalUI(user, stories);
            refreshProfileInBackground(userId, true);
            return true;
        } else {
            profileCache.delete(userId);
            storiesCache.delete(userId);
        }
    }
    return false;
}

// ============================================================
// CARGAR DATOS DEL PERFIL
// ============================================================

async function loadProfileData(userId, silent = false) {
    const startTime = performance.now();
    const token = getToken();
    
    if (!token) {
        showToast('Inicia sesión para ver perfiles', true);
        closeProfileModal();
        return;
    }

    try {
        if (!silent) {
            clearProfileCache(userId);
        }

        console.log(`📡 Cargando perfil ${userId} desde servidor...`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${API_URL}/api/users/profile/${userId}?includeStories=true`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 🔥 MANEJAR DIFERENTES CÓDIGOS DE RESPUESTA
        if (!res.ok) {
            if (res.status === 404) {
                showToast('Usuario no encontrado', true);
                closeProfileModal();
                return;
            } else if (res.status === 403) {
                const errorData = await res.json().catch(() => ({}));
                const privacy = errorData.privacy || 'private';
                
                // 🔥 PERFIL TOTALMENTE PRIVADO - NADIE PUEDE VERLO
                showPrivateProfileUI(userId, true);
                return;
            } else {
                showToast('Error al cargar el perfil', true);
                closeProfileModal();
                return;
            }
        }

        const data = await res.json();
        const user = data.user || data;
        const stories = data.stories || [];

        currentProfileData = user;

        // Guardar en caché
        profileCache.set(userId, {
            data: user,
            timestamp: Date.now()
        });
        storiesCache.set(userId, {
            data: stories,
            timestamp: Date.now()
        });
        window._profileStories = stories;
        cleanCache();

        updateProfileModalUI(user, stories);

        const loadTime = performance.now() - startTime;
        console.log(`✅ Perfil cargado en ${Math.round(loadTime)}ms`);

    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('La carga del perfil está tomando demasiado tiempo', true);
        } else {
            console.error('Error loading profile:', error);
            if (!silent) {
                showToast('Error al cargar el perfil', true);
            }
        }
        closeProfileModal();
    }
}

// ============================================================
// 🔥 MOSTRAR UI PARA PERFIL PRIVADO
// ============================================================

function showPrivateProfileUI(userId, isStrictPrivate = false) {
    const container = document.getElementById('profileModalBody');
    if (!container) return;

    const currentUser = getCurrentUser();
    const isOwnProfile = currentUser?.id === userId;

    // 🔥 SI ES EL DUEÑO DEL PERFIL, PUEDE VERLO COMPLETO
    if (isOwnProfile) {
        loadProfileData(userId);
        return;
    }

    // 🔥 PERFIL TOTALMENTE PRIVADO - NADIE PUEDE VERLO
    if (isStrictPrivate) {
        container.innerHTML = `
            <div class="profile-private-container">
                <div class="private-lock-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <h3>Este perfil es privado</h3>
                <p>Este perfil no está disponible para otros usuarios.</p>
            </div>
        `;
        return;
    }

    // 🔥 PERFIL "SOLO SEGUIDORES" - Mostrar opción de seguir
    // Verificar si ya hay solicitud pendiente en el localStorage
    const hasPendingRequest = localStorage.getItem(`follow_pending_${userId}`) === 'true';
    
    container.innerHTML = `
        <div class="profile-private-container">
            <div class="private-lock-icon">
                <i class="fas fa-user-friends"></i>
            </div>
            <h3>Cuenta privada</h3>
            <p>Sigue a esta cuenta para ver sus fotos, historias y videos.</p>
            <div class="private-actions">
                ${currentUser && currentUser.id !== userId ? `
                    <button class="btn-private-follow" id="btnPrivateFollow" 
                            onclick="window.handleFollowPrivate('${userId}')"
                            ${hasPendingRequest ? 'disabled' : ''}>
                        ${hasPendingRequest ? '<i class="fas fa-clock"></i> Solicitud enviada' : '<i class="fas fa-user-plus"></i> Enviar solicitud'}
                    </button>
                ` : `
                    <p style="color:rgba(255,255,255,0.2);font-size:13px;">Inicia sesión para seguir</p>
                `}
            </div>
        </div>
    `;
}

// ============================================================
// 🔥 MANEJAR SOLICITUD DE SEGUIMIENTO PARA PERFIL PRIVADO
// ============================================================

window.handleFollowPrivate = async function(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para enviar solicitud', true);
        return;
    }

    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
        showToast('No puedes seguirte a ti mismo', true);
        return;
    }

    // Verificar si ya hay solicitud pendiente en localStorage
    if (localStorage.getItem(`follow_pending_${userId}`) === 'true') {
        showToast('Ya enviaste una solicitud a este usuario', true);
        return;
    }

    const btn = document.getElementById('btnPrivateFollow');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    }

    try {
        // 🔥 USAR LA RUTA CORRECTA: /api/follows/follow
        const res = await fetch(`${API_URL}/api/follows/follow`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        });

        const data = await res.json();
        
        if (res.ok) {
            if (data.status === 'pending_sent') {
                // 🔥 GUARDAR ESTADO EN LOCALSTORAGE
                localStorage.setItem(`follow_pending_${userId}`, 'true');
                
                showToast('✅ Solicitud de seguimiento enviada');
                
                // Actualizar el botón inmediatamente
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-clock"></i> Solicitud enviada';
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                }
                
                // Actualizar el estado en currentProfileData
                if (currentProfileData) {
                    currentProfileData.hasPendingRequest = true;
                    currentProfileData.isFollowing = false;
                }
                
                // Recargar el perfil en segundo plano para actualizar el estado
                setTimeout(() => {
                    clearProfileCache(userId);
                    loadProfileData(userId);
                }, 1000);
                
            } else if (data.status === 'following') {
                showToast('✅ Ahora sigues a este usuario');
                localStorage.removeItem(`follow_pending_${userId}`);
                clearProfileCache(userId);
                loadProfileData(userId);
            } else {
                showToast(data.message || 'Solicitud enviada');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-user-plus"></i> Enviar solicitud';
                }
            }
        } else {
            // Si hay error, restaurar el botón
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Enviar solicitud';
            }
            showToast(data.error || 'Error al enviar solicitud', true);
        }
    } catch (error) {
        console.error('Error sending follow request:', error);
        showToast('Error al enviar solicitud', true);
        // Restaurar el botón en caso de error
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Enviar solicitud';
        }
    }
};

// ============================================================
// ACTUALIZAR PERFIL EN SEGUNDO PLANO
// ============================================================

async function refreshProfileInBackground(userId, silent = false) {
    const now = Date.now();
    if (now - lastRefreshTime < 30000 && !silent) return;
    
    try {
        const token = getToken();
        if (!token) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${API_URL}/api/users/profile/${userId}?includeStories=true&minimal=true`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            const user = data.user || data;
            const stories = data.stories || [];
            
            profileCache.set(userId, {
                data: user,
                timestamp: Date.now()
            });
            storiesCache.set(userId, {
                data: stories,
                timestamp: Date.now()
            });
            window._profileStories = stories;

            if (isProfileModalOpen && currentProfileUserId === userId) {
                currentProfileData = user;
                updateProfileModalUI(user, stories);
            }
            
            lastRefreshTime = now;
            if (!silent) {
                console.log(`🔄 Perfil ${userId} actualizado en segundo plano`);
            }
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// OBTENER INSIGNIA DE VERIFICACIÓN
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
// 🔥 MANEJAR BLOQUEO DE USUARIO
// ============================================================

window.handleBlockUser = async function(userId) {
    if (!userId) return;
    
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para bloquear', true);
        return;
    }

    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
        showToast('No puedes bloquearte a ti mismo', true);
        return;
    }

    try {
        // 🔥 VERIFICAR EL ESTADO ACTUAL DEL BLOQUEO
        const checkRes = await fetch(`${API_URL}/api/blocked/check/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        let isBlocked = false;
        let isBlockedBy = false;
        
        if (checkRes.ok) {
            const data = await checkRes.json();
            isBlocked = data.isBlocked || false;
            isBlockedBy = data.isBlockedBy || false;
        }

        // Si el usuario objetivo nos bloqueó a nosotros, no podemos hacer nada
        if (isBlockedBy) {
            showToast('No puedes interactuar con este usuario', true);
            return;
        }

        if (isBlocked) {
            // 🔥 DESBLOQUEAR
            const res = await fetch(`${API_URL}/api/blocked/unblock/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                showToast('✅ Usuario desbloqueado');
                clearProfileCache(userId);
                await loadProfileData(userId);
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al desbloquear', true);
            }
        } else {
            // 🔥 BLOQUEAR
            const res = await fetch(`${API_URL}/api/blocked/block`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            if (res.ok) {
                showToast('🔒 Usuario bloqueado');
                closeProfileModal();
                clearProfileCache(userId);
                setTimeout(() => openProfileModal(userId), 300);
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al bloquear', true);
            }
        }
    } catch (error) {
        console.error('Error al bloquear/desbloquear:', error);
        showToast('Error al procesar la solicitud', true);
    }
};

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
    const privacy = user.privacy || 'public';

    // 🔥 VERIFICAR BLOQUEOS
    const isBlockedByOwner = user.isBlockedBy || false;
    const isBlocked = user.isBlocked || false;

    // 🔥 CASO 1: El dueño del perfil bloqueó al usuario actual
    if (isBlockedByOwner) {
        container.innerHTML = `
            <div class="profile-not-found">
                <i class="fas fa-user-slash" style="font-size:48px;color:rgba(255,255,255,0.05);margin-bottom:16px;"></i>
                <h3 style="color:rgba(255,255,255,0.2);font-weight:400;">Usuario no encontrado</h3>
                <p style="color:rgba(255,255,255,0.08);font-size:13px;">El usuario que buscas no existe</p>
            </div>
        `;
        return;
    }

    // 🔥 CASO 2: PERFIL TOTALMENTE PRIVADO (privacy === 'private')
    // → NADIE puede verlo excepto el dueño
    if (!isOwnProfile && privacy === 'private') {
        showPrivateProfileUI(user.id, true);
        return;
    }

    // 🔥 CASO 3: PERFIL "SOLO SEGUIDORES" (privacy === 'followers')
    // → Solo seguidores y el dueño pueden verlo
    if (!isOwnProfile && privacy === 'followers' && !isFollowing) {
        // Verificar si hay solicitud pendiente en localStorage
        const pendingInStorage = localStorage.getItem(`follow_pending_${user.id}`) === 'true';
        if (pendingInStorage || hasPendingRequest) {
            // Mostrar que ya se envió solicitud
            showPrivateProfileUIWithPending(user.id);
            return;
        }
        showPrivateProfileUI(user.id, false);
        return;
    }

    // Si llegamos aquí, el perfil es visible
    // Limpiar estado de solicitud pendiente si el usuario ya es seguidor
    if (isFollowing) {
        localStorage.removeItem(`follow_pending_${user.id}`);
    }

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

    // 🔥 BOTÓN DE SEGUIR
    let followText = 'Seguir';
    let followClass = 'btn-follow';
    let followDisabled = false;
    let followIcon = '<i class="fas fa-user-plus"></i>';
    let followOnClick = `window.handleProfileFollow('${user.id}')`;

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
        followDisabled = true;
    }

    // 🔥 BOTÓN DE BLOQUEO
    let blockButton = '';
    
    if (!isOwnProfile && !isBlockedByOwner) {
        if (isBlocked) {
            blockButton = `
                <button class="btn-block blocked" onclick="window.handleBlockUser('${user.id}')">
                    <i class="fas fa-unlock"></i>
                    Desbloquear
                </button>
            `;
        } else {
            blockButton = `
                <button class="btn-block" onclick="window.handleBlockUser('${user.id}')">
                    <i class="fas fa-ban"></i>
                    Bloquear
                </button>
            `;
        }
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
                ${isBlocked ? `<span class="blocked-badge">🔒 Bloqueado</span>` : ''}
            </div>
            <div class="profile-username">@${username}</div>
            ${bio ? `<div class="profile-bio">${bio}</div>` : ''}
            ${countryName ? `<div class="profile-bio" style="font-size:10px;color:rgba(255,255,255,0.2);"><i class="fas fa-map-marker-alt"></i> ${countryName}</div>` : ''}
        </div>

        <div class="profile-actions">
            <div class="profile-follow-btn">
                <button class="${followClass}" id="profileFollowBtn" ${followDisabled ? 'disabled' : ''} onclick="${followOnClick}">
                    ${followIcon}
                    ${followText}
                </button>
            </div>
            ${blockButton}
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
// 🔥 MOSTRAR UI CON SOLICITUD PENDIENTE
// ============================================================

function showPrivateProfileUIWithPending(userId) {
    const container = document.getElementById('profileModalBody');
    if (!container) return;

    container.innerHTML = `
        <div class="profile-private-container">
            <div class="private-lock-icon">
                <i class="fas fa-user-friends"></i>
            </div>
            <h3>Cuenta privada</h3>
            <p>Sigue a esta cuenta para ver sus fotos, historias y videos.</p>
            <div class="private-actions">
                <button class="btn-private-follow" disabled style="opacity:0.6;cursor:not-allowed;">
                    <i class="fas fa-clock"></i> Solicitud enviada
                </button>
            </div>
        </div>
    `;
}

// ============================================================
// 🔥 ABRIR MODAL DE PERFIL
// ============================================================

function openProfileModal(userId, fromFollowers = false, fromFollowersStack = null) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    console.log(`👤 Abriendo perfil modal: ${userId}, desde followers: ${fromFollowers}`);

    const currentUser = getCurrentUser();

    // Si ya está abierto el mismo perfil, traerlo al frente
    if (isProfileModalOpen && currentProfileUserId === userId) {
        bringProfileToFront();
        return;
    }

    // GUARDAR EL CONTEXTO ACTUAL EN LA PILA
    if (isProfileModalOpen) {
        navigationStack.push({
            type: 'profile',
            userId: currentProfileUserId,
            data: currentProfileData,
            fromFollowers: window._fromFollowers || false,
            scrollPosition: document.querySelector('.profile-modal-body')?.scrollTop || 0,
            followersContext: window._followersContextData || null
        });
        console.log(`📌 Perfil ${currentProfileUserId} guardado en pila. Pila: ${navigationStack.length}`);
    }

    if (fromFollowers && fromFollowersStack) {
        window._followersContextData = fromFollowersStack;
        window._fromFollowers = true;
    }

    currentProfileUserId = userId;
    isProfileModalOpen = true;
    isEditMode = false;
    window._fromFollowers = fromFollowers;

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

    // Intentar cargar desde caché
    const cached = loadProfileWithCache(userId);
    
    if (!cached) {
        showSkeletonLoader();
        loadProfileData(userId);
    }

    scheduleProfileRefresh(userId);
}

// ============================================================
// PROGRAMAR REFRESH
// ============================================================

function scheduleProfileRefresh(userId) {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    refreshInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastRefreshTime < 60000) return;
        
        if (isProfileModalOpen && currentProfileUserId === userId) {
            lastRefreshTime = now;
            refreshProfileInBackground(userId, true);
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 120000);
}

// ============================================================
// TRAER PERFIL AL FRENTE
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
// CERRAR MODAL DE PERFIL
// ============================================================

function closeProfileModalInternal(restoreFromStack = true) {
    console.log('🔒 Cerrando modal de perfil (interno)');
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }

    isProfileModalOpen = false;
    currentProfileUserId = null;
    currentProfileData = null;
    document.body.style.overflow = '';
}

function closeProfileModal() {
    console.log('🔒 Cerrando modal de perfil (público)');
    console.log(`📊 Pila actual: ${navigationStack.length} elementos`);
    
    if (isEditMode) {
        if (typeof window.closeEditProfileModal === 'function') {
            window.closeEditProfileModal();
        }
        isEditMode = false;
    }

    if (navigationStack.length > 0) {
        const previous = navigationStack.pop();
        console.log(`🔄 Restaurando: ${previous.type} - ${previous.userId || 'N/A'}`);
        
        closeProfileModalInternal(false);
        
        setTimeout(() => {
            if (previous.type === 'profile') {
                restorePreviousProfile(previous);
            } else if (previous.type === 'followers') {
                restorePreviousFollowers(previous);
            }
        }, 150);
        return;
    }

    closeProfileModalInternal(false);
}

// ============================================================
// RESTAURAR PERFIL ANTERIOR
// ============================================================

function restorePreviousProfile(previous) {
    console.log(`🔄 Restaurando perfil: ${previous.userId}`);
    
    currentProfileUserId = previous.userId;
    currentProfileData = previous.data;
    isProfileModalOpen = true;
    
    if (previous.fromFollowers) {
        window._fromFollowers = true;
    }
    
    if (previous.followersContext) {
        window._followersContextData = previous.followersContext;
    } else {
        window._followersContextData = null;
        window._fromFollowers = false;
    }
    
    const overlay = document.getElementById('profileModalOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        overlay.style.zIndex = '10006';
    }
    
    document.body.style.overflow = 'hidden';
    
    if (profileCache.has(previous.userId)) {
        const cached = profileCache.get(previous.userId);
        const user = cached.data;
        const stories = storiesCache.get(previous.userId)?.data || [];
        currentProfileData = user;
        updateProfileModalUI(user, stories);
        refreshProfileInBackground(previous.userId, true);
    } else {
        showSkeletonLoader();
        loadProfileData(previous.userId);
    }
    
    setTimeout(() => {
        const body = document.querySelector('.profile-modal-body');
        if (body && previous.scrollPosition) {
            body.scrollTop = previous.scrollPosition;
        }
    }, 50);
}

// ============================================================
// RESTAURAR LISTA DE SEGUIDORES
// ============================================================

function restorePreviousFollowers(previous) {
    console.log(`🔄 Restaurando lista de seguidores: userId=${previous.userId}, filter=${previous.filter}`);
    
    if (previous.context) {
        import('./followers-modal.js').then(({ restoreFollowersModal }) => {
            window._followersContextData = previous.context;
            if (typeof restoreFollowersModal === 'function') {
                restoreFollowersModal();
            }
        }).catch(err => {
            console.error('❌ Error restaurando followers:', err);
            openFollowersModal(previous.userId, previous.filter || 'followers', true);
        });
    } else {
        import('./followers-modal.js').then(({ openFollowersModal }) => {
            openFollowersModal(previous.userId, previous.filter || 'followers', true);
        }).catch(err => {
            console.error('❌ Error abriendo followers:', err);
            showToast('Error al restaurar seguidores', true);
        });
    }
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
    window.handleBlockUser = window.handleBlockUser;
    window.handleFollowPrivate = window.handleFollowPrivate;
}

// ============================================================
// ABRIR EDITAR PERFIL DESDE EL MODAL
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
// ABRIR MODAL DE SEGUIDORES DESDE EL PERFIL
// ============================================================

function openFollowersFromProfile(filter) {
    if (!currentProfileUserId) {
        showToast('Usuario no encontrado', true);
        return;
    }
    
    console.log(`📊 Abriendo ${filter} para usuario: ${currentProfileUserId}`);
    
    const userId = currentProfileUserId;
    
    navigationStack.push({
        type: 'followers',
        userId: currentProfileUserId,
        filter: filter,
        context: window._followersContextData || null,
        fromFollowers: window._fromFollowers || false
    });
    
    window._followersContextData = {
        userId: currentProfileUserId,
        filter: filter,
        returnToProfile: true
    };
    
    closeProfileModalInternal(false);
    
    setTimeout(() => {
        import('./followers-modal.js').then(({ openFollowersModal }) => {
            window._profileContext = {
                userId: currentProfileUserId,
                filter: filter
            };
            openFollowersModal(userId, filter, true);
        }).catch((err) => {
            console.error('❌ Error cargando followers-modal:', err);
            showToast('Error al abrir seguidores', true);
        });
    }, 100);
}

// ============================================================
// MANEJAR SEGUIR USUARIO
// ============================================================

async function handleFollowUser(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
        return;
    }

    const btn = document.getElementById('profileFollowBtn');
    if (!btn) return;

    const isFollowing = btn.classList.contains('following');
    const method = isFollowing ? 'DELETE' : 'POST';
    const endpoint = isFollowing ? 'unfollow' : 'follow';

    try {
        const res = await fetch(`${API_URL}/api/follows/${endpoint}`, {
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
                localStorage.removeItem(`follow_pending_${userId}`);
                clearProfileCache(userId);
                loadProfileData(userId);
            } else if (data.status === 'pending_sent') {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-clock"></i> Solicitud enviada';
                btn.disabled = true;
                localStorage.setItem(`follow_pending_${userId}`, 'true');
                showToast(`📨 Solicitud enviada a ${currentProfileData?.fullName}`);
            } else {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Seguir';
                btn.disabled = false;
                localStorage.removeItem(`follow_pending_${userId}`);
                showToast('❌ Dejaste de seguir');
                clearProfileCache(userId);
                loadProfileData(userId);
            }
        } else {
            showToast(data.error || 'Error al seguir', true);
        }
    } catch (error) {
        console.error('Error following user:', error);
        showToast('Error al seguir', true);
    }
}

// ============================================================
// ABRIR HISTORIA SOBRE EL PERFIL
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
    
    setTimeout(async () => {
        try {
            const token = getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/api/users/profile/${userId}?includeStories=true&minimal=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const user = data.user || data;
                const stories = data.stories || [];
                
                profileCache.set(userId, {
                    data: user,
                    timestamp: Date.now()
                });
                storiesCache.set(userId, {
                    data: stories,
                    timestamp: Date.now()
                });
                cleanCache();
                console.log(`✅ Perfil ${userId} pre-cargado`);
            }
        } catch (e) {
            // Silencioso
        }
    }, 1000);
}

// ============================================================
// FUNCIONES GLOBALES (window)
// ============================================================

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openFollowersFromProfile = openFollowersFromProfile;
window.handleProfileFollow = handleFollowUser;
window.openStoryFromProfileOverlay = openStoryFromProfileOverlay;
window.openEditProfileFromModal = openEditProfileFromModal;
window.clearProfileCache = clearProfileCache;
window.handleBlockUser = window.handleBlockUser;
window.handleFollowPrivate = window.handleFollowPrivate;
window.preloadCurrentUserProfile = preloadCurrentUserProfile;

// ============================================================
// EXPORTAR
// ============================================================

export { 
    openProfileModal, 
    closeProfileModal, 
    loadProfileData, 
    handleFollowUser,
    openFollowersFromProfile,
    clearProfileCache,
    preloadCurrentUserProfile
};