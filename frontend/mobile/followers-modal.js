// followers-modal.js - Modal de seguidores/seguidos
// CON NAVEGACIÓN POR PILA Y CONTEXTO
// ============================================================

import { getToken, getCurrentUser, showToast, getAvatar, escapeHtml } from './auth.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO GLOBAL
// ============================================================

let isFollowersModalOpen = false;
let currentUserId = null;
let currentFilter = 'followers';
let followersList = [];
let followingList = [];
let filteredList = [];
let searchQuery = '';
let isLoading = false;
let isFromProfile = false;

// 🔥 CONTEXTO PARA NAVEGACIÓN
let followersContext = null;
let followersNavigationStack = [];

// 🔥 CACHÉ DE LISTAS
const followersCache = new Map();
const MAX_CACHE_SIZE = 30;

// ============================================================
// ABRIR MODAL DE SEGUIDORES
// ============================================================

async function openFollowersModal(userId, filter = 'followers', fromProfile = false) {
    if (!userId) {
        showToast('Usuario no encontrado', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver seguidores', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    console.log(`📊 Abriendo modal de seguidores: userId=${userId}, filter=${filter}, desde perfil: ${fromProfile}`);

    // 🔥 Guardar contexto
    isFromProfile = fromProfile;
    currentUserId = userId;
    currentFilter = filter || 'followers';
    searchQuery = '';
    followersList = [];
    followingList = [];
    filteredList = [];
    isFollowersModalOpen = true;
    isLoading = false;

    // 🔥 Crear o obtener overlay
    let overlay = document.getElementById('followersModalOverlay');
    if (!overlay) {
        createFollowersModalHTML();
        overlay = document.getElementById('followersModalOverlay');
    }

    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        overlay.style.zIndex = '10005';
    }

    document.body.style.overflow = 'hidden';
    updateTabs(currentFilter);
    await loadFollowersData(userId);
}

// ============================================================
// 🔥 FUNCIÓN PARA ACTUALIZAR TABS
// ============================================================

function updateTabs(filter) {
    console.log(`🔄 Actualizando tabs a: ${filter}`);
    
    document.querySelectorAll('.followers-tab').forEach(tab => {
        const tabFilter = tab.dataset.filter;
        if (tabFilter === filter) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    updateModalTitle();
}

// ============================================================
// CERRAR MODAL DE SEGUIDORES
// ============================================================

function closeFollowersModal() {
    console.log('🔒 Cerrando modal de seguidores');
    console.log(`📊 Pila de followers: ${followersNavigationStack.length} elementos`);
    
    const container = document.getElementById('followersListContainer');
    if (container) {
        container.innerHTML = `
            <div class="followers-loading">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando...</span>
            </div>
        `;
    }

    // 🔥 Verificar si hay que restaurar un perfil anterior
    if (followersNavigationStack.length > 0) {
        const previous = followersNavigationStack.pop();
        console.log(`🔄 Restaurando perfil anterior desde followers: ${previous.userId}`);
        
        isFollowersModalOpen = false;
        currentUserId = null;
        followersList = [];
        followingList = [];
        filteredList = [];
        searchQuery = '';

        const overlay = document.getElementById('followersModalOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
            overlay.style.zIndex = '';
        }

        document.body.style.overflow = '';

        // 🔥 Restaurar perfil anterior
        setTimeout(() => {
            import('./profile-modal.js').then(({ openProfileModal }) => {
                openProfileModal(previous.userId, previous.fromFollowers || false);
            }).catch(err => {
                console.error('❌ Error importando profile-modal:', err);
                showToast('Error al restaurar perfil', true);
            });
        }, 150);
        return;
    }

    // 🔥 Si no hay pila, cerrar normalmente
    isFollowersModalOpen = false;
    isFromProfile = false;
    currentUserId = null;
    followersList = [];
    followingList = [];
    filteredList = [];
    searchQuery = '';

    const overlay = document.getElementById('followersModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }

    document.body.style.overflow = '';
}

// ============================================================
// 🔥 RESTAURAR MODAL DE SEGUIDORES DESDE PERFIL
// ============================================================

function restoreFollowersModal() {
    if (!followersContext) {
        console.log('⚠️ No hay contexto de seguidores para restaurar');
        return;
    }

    const context = followersContext;
    console.log(`🔄 Restaurando modal de seguidores: userId=${context.userId}, filter=${context.filter}`);

    currentUserId = context.userId;
    currentFilter = context.filter || 'followers';
    isFromProfile = true;
    isFollowersModalOpen = true;

    const overlay = document.getElementById('followersModalOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        overlay.style.zIndex = '10005';
    }

    searchQuery = '';
    const searchInput = document.getElementById('followersSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    const clearBtn = document.getElementById('followersSearchClear');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    updateTabs(context.filter);
    document.body.style.overflow = 'hidden';

    loadFollowersData(context.userId);
}

// ============================================================
// CREAR HTML DEL MODAL
// ============================================================

function createFollowersModalHTML() {
    if (document.getElementById('followersModalOverlay')) return;

    console.log('🏗️ Creando HTML del modal de seguidores');

    const html = `
        <div id="followersModalOverlay" class="followers-modal-overlay" onclick="window.closeFollowersModal()">
            <div class="followers-modal-content" onclick="event.stopPropagation()">
                <div class="followers-modal-header">
                    <span class="title"><i class="fas fa-users"></i> <span id="followersModalTitle">Seguidores</span></span>
                    <button class="close-btn" onclick="window.closeFollowersModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="followers-modal-search">
                    <i class="fas fa-search"></i>
                    <input type="text" id="followersSearchInput" placeholder="Buscar usuario..." />
                    <button class="followers-search-clear" id="followersSearchClear" style="display:none;">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>

                <div class="followers-modal-tabs">
                    <button class="followers-tab" data-filter="followers" onclick="window.switchFollowersTab('followers')">
                        <i class="fas fa-users"></i>
                        <span>Seguidores</span>
                        <span class="tab-count" id="followersCount">0</span>
                    </button>
                    <button class="followers-tab" data-filter="following" onclick="window.switchFollowersTab('following')">
                        <i class="fas fa-user-friends"></i>
                        <span>Siguiendo</span>
                        <span class="tab-count" id="followingCount">0</span>
                    </button>
                </div>

                <div class="followers-modal-list" id="followersListContainer">
                    <div class="followers-loading">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <span>Cargando...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    const searchInput = document.getElementById('followersSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            const clearBtn = document.getElementById('followersSearchClear');
            if (clearBtn) {
                clearBtn.style.display = searchQuery.length > 0 ? 'flex' : 'none';
            }
            filterAndRenderList();
        });
    }

    const clearBtn = document.getElementById('followersSearchClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const searchInputEl = document.getElementById('followersSearchInput');
            if (searchInputEl) {
                searchInputEl.value = '';
                searchQuery = '';
                clearBtn.style.display = 'none';
                filterAndRenderList();
                searchInputEl.focus();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFollowersModalOpen) {
            closeFollowersModal();
        }
    });

    window.closeFollowersModal = closeFollowersModal;
    window.switchFollowersTab = switchFollowersTab;
    window.handleFollowersFollow = handleFollowersFollow;
    window.openProfileFromFollowers = openProfileFromFollowers;
    window.restoreFollowersModal = restoreFollowersModal;

    injectFollowersStyles();
}

// ============================================================
// 🔥 CAMBIAR FILTRO
// ============================================================

function switchFollowersTab(filter) {
    console.log(`🔄 Cambiando a filtro: ${filter}`);
    
    currentFilter = filter;
    searchQuery = '';
    
    const searchInput = document.getElementById('followersSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    const clearBtn = document.getElementById('followersSearchClear');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    updateTabs(filter);
    filterAndRenderList();
}

// ============================================================
// ACTUALIZAR TÍTULO DEL MODAL
// ============================================================

function updateModalTitle() {
    const title = document.getElementById('followersModalTitle');
    if (!title) return;

    const currentUser = getCurrentUser();
    const isOwnProfile = currentUser?.id === currentUserId;
    
    if (currentFilter === 'followers') {
        title.textContent = isOwnProfile ? 'Tus seguidores' : 'Seguidores';
    } else {
        title.textContent = isOwnProfile ? 'A quienes sigues' : 'Siguiendo';
    }
}

// ============================================================
// CARGAR DATOS DE SEGUIDORES/SEGUIDOS (CON CACHÉ)
// ============================================================

async function loadFollowersData(userId) {
    const token = getToken();
    if (!token) return;

    isLoading = true;
    const container = document.getElementById('followersListContainer');
    if (container) {
        container.innerHTML = `
            <div class="followers-loading">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando...</span>
            </div>
        `;
    }

    try {
        console.log(`📡 Cargando seguidores para userId: ${userId}`);

        // 🔥 Verificar caché
        const cacheKey = `followers_${userId}`;
        if (followersCache.has(cacheKey)) {
            const cached = followersCache.get(cacheKey);
            console.log(`📦 Seguidores desde caché: ${cached.followersList.length} seguidores`);
            followersList = cached.followersList;
            followingList = cached.followingList;
            updateCounts();
            filterAndRenderList();
            isLoading = false;
            
            // 🔥 Actualizar en segundo plano
            refreshFollowersInBackground(userId);
            return;
        }

        // 🔥 Cargar desde servidor
        const followersRes = await fetch(`${API_URL}/api/follows/followers/${userId}?t=${Date.now()}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });

        if (followersRes.ok) {
            followersList = await followersRes.json();
            console.log(`📊 Seguidores cargados: ${followersList.length}`);
        }

        const followingRes = await fetch(`${API_URL}/api/follows/following/${userId}?t=${Date.now()}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });

        if (followingRes.ok) {
            followingList = await followingRes.json();
            console.log(`📊 Siguiendo cargados: ${followingList.length}`);
        }

        // 🔥 Guardar en caché
        followersCache.set(cacheKey, {
            followersList: followersList,
            followingList: followingList,
            timestamp: Date.now()
        });

        if (followersCache.size > MAX_CACHE_SIZE) {
            const keys = Array.from(followersCache.keys());
            const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
            toRemove.forEach(key => followersCache.delete(key));
        }

        updateCounts();
        filterAndRenderList();

    } catch (error) {
        console.error('Error cargando seguidores:', error);
        if (container) {
            container.innerHTML = `
                <div class="followers-empty">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Error al cargar la lista</span>
                </div>
            `;
        }
    } finally {
        isLoading = false;
    }
}

// ============================================================
// 🔥 REFRESCAR SEGUIDORES EN SEGUNDO PLANO
// ============================================================

async function refreshFollowersInBackground(userId) {
    try {
        const token = getToken();
        if (!token) return;

        const cacheKey = `followers_${userId}`;
        const followersRes = await fetch(`${API_URL}/api/follows/followers/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let newFollowers = [];
        let newFollowing = [];

        if (followersRes.ok) {
            newFollowers = await followersRes.json();
        }

        const followingRes = await fetch(`${API_URL}/api/follows/following/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (followingRes.ok) {
            newFollowing = await followingRes.json();
        }

        followersCache.set(cacheKey, {
            followersList: newFollowers,
            followingList: newFollowing,
            timestamp: Date.now()
        });

        if (isFollowersModalOpen && currentUserId === userId) {
            followersList = newFollowers;
            followingList = newFollowing;
            updateCounts();
            filterAndRenderList();
            console.log(`🔄 Seguidores de ${userId} actualizados en segundo plano`);
        }
    } catch (e) {
        // Silencioso
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADORES
// ============================================================

function updateCounts() {
    const followersCount = document.getElementById('followersCount');
    if (followersCount) {
        followersCount.textContent = followersList.length;
    }
    const followingCount = document.getElementById('followingCount');
    if (followingCount) {
        followingCount.textContent = followingList.length;
    }
}

// ============================================================
// 🔥 FILTRAR Y RENDERIZAR LISTA
// ============================================================

function filterAndRenderList() {
    const list = currentFilter === 'followers' ? followersList : followingList;
    
    console.log(`📋 Filtrando lista: ${currentFilter}, total: ${list.length}`);
    
    if (searchQuery) {
        filteredList = list.filter(user => 
            user.fullName?.toLowerCase().includes(searchQuery) ||
            user.username?.toLowerCase().includes(searchQuery)
        );
    } else {
        filteredList = list;
    }

    renderList(filteredList);
}

// ============================================================
// RENDERIZAR LISTA
// ============================================================

function renderList(users) {
    const container = document.getElementById('followersListContainer');
    if (!container) return;

    if (users.length === 0) {
        const currentUser = getCurrentUser();
        const isOwnProfile = currentUser?.id === currentUserId;
        const emptyMessage = currentFilter === 'followers' 
            ? (isOwnProfile ? 'No tienes seguidores aún' : 'Este usuario no tiene seguidores')
            : (isOwnProfile ? 'No sigues a nadie aún' : 'Este usuario no sigue a nadie');
        
        container.innerHTML = `
            <div class="followers-empty">
                <i class="fas fa-user-friends"></i>
                <span>${searchQuery ? 'No se encontraron resultados' : emptyMessage}</span>
                ${searchQuery ? '<small>Intenta con otra búsqueda</small>' : ''}
            </div>
        `;
        return;
    }

    const currentUser = getCurrentUser();

    let html = '';
    users.forEach(user => {
        const isFollowing = currentUser?.following?.includes(user.id) || false;
        const isOwn = currentUser?.id === user.id;

        let badge = '';
        if (user.isVerified) {
            badge = '<i class="fas fa-check-circle verified-badge" title="Verificado"></i>';
        }

        html += `
            <div class="followers-item" onclick="window.openProfileFromFollowers('${user.id}')">
                <img class="followers-avatar" src="${user.avatar || getAvatar(user.fullName)}" alt="${user.fullName}" />
                <div class="followers-info">
                    <div class="followers-name">
                        ${escapeHtml(user.fullName)} ${badge}
                    </div>
                    <div class="followers-username">@${escapeHtml(user.username)}</div>
                </div>
                ${!isOwn ? `
                    <button class="followers-follow-btn ${isFollowing ? 'following' : ''}" 
                            data-user-id="${user.id}" 
                            onclick="event.stopPropagation(); window.handleFollowersFollow('${user.id}', this)">
                        ${isFollowing ? '<i class="fas fa-check"></i> Siguiendo' : '<i class="fas fa-plus"></i> Seguir'}
                    </button>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================
// MANEJAR SEGUIR/DESSEGUIR
// ============================================================

window.handleFollowersFollow = async function(userId, btn) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
        return;
    }

    const isFollowing = btn.classList.contains('following');
    const url = isFollowing ? `${API_URL}/api/follows/unfollow` : `${API_URL}/api/follows/follow`;
    const method = isFollowing ? 'DELETE' : 'POST';

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        });

        const data = await res.json();
        if (res.ok) {
            if (isFollowing) {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-plus"></i> Seguir';
                showToast('💔 Dejaste de seguir');
            } else {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-check"></i> Siguiendo';
                showToast('✅ Ahora sigues a este usuario');
            }
            
            const cacheKey = `followers_${currentUserId}`;
            followersCache.delete(cacheKey);
            loadFollowersData(currentUserId);
        } else {
            const errorData = await res.json();
            showToast(errorData.error || 'Error al procesar', true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al procesar', true);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ============================================================
// 🔥 ABRIR PERFIL DESDE SEGUIDORES (CON PILA)
// ============================================================

window.openProfileFromFollowers = function(userId) {
    if (!userId) return;
    
    console.log(`👤 Abriendo perfil de ${userId} desde seguidores`);
    
    // 🔥 Guardar el followers actual en la pila ANTES de abrir el perfil
    followersNavigationStack.push({
        userId: currentUserId,
        filter: currentFilter
    });
    
    console.log(`📌 Pila de followers actualizada: ${followersNavigationStack.length} elementos`);
    
    // 🔥 Guardar contexto para volver a followers
    followersContext = {
        userId: currentUserId,
        filter: currentFilter,
        returnToFollowers: true
    };
    
    window._followersContextData = followersContext;
    window._fromFollowers = true;
    
    // 🔥 Ocultar modal de seguidores
    const overlay = document.getElementById('followersModalOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
    }
    
    // 🔥 Abrir perfil
    if (typeof window.openProfileModal === 'function') {
        window.openProfileModal(userId, true);
    } else {
        import('./profile-modal.js').then(({ openProfileModal }) => {
            openProfileModal(userId, true);
        }).catch((err) => {
            console.error('Error abriendo perfil:', err);
            showToast('Error al abrir perfil', true);
        });
    }
};

// ============================================================
// INYECTAR ESTILOS
// ============================================================

function injectFollowersStyles() {
    if (document.getElementById('followersModalStyles')) return;

    const styles = document.createElement('style');
    styles.id = 'followersModalStyles';
    styles.textContent = `
        .followers-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 26, 0.92);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            z-index: 10005;
            display: none;
            flex-direction: column;
            animation: followersModalFadeIn 0.35s ease;
        }
        .followers-modal-overlay.active { display: flex; }
        @keyframes followersModalFadeIn {
            0% { opacity: 0; transform: scale(0.98); }
            100% { opacity: 1; transform: scale(1); }
        }
        .followers-modal-content {
            background: #12122a;
            border-radius: 0;
            width: 100%;
            max-width: 100%;
            max-height: 100vh;
            height: 100vh;
            overflow: hidden;
            position: relative;
            border: none;
            box-shadow: none;
            display: flex;
            flex-direction: column;
        }
        .followers-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 20px 12px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            flex-shrink: 0;
            background: transparent;
        }
        .followers-modal-header .title {
            font-weight: 700;
            font-size: 18px;
            color: #fff;
        }
        .followers-modal-header .close-btn {
            background: rgba(255,255,255,0.05);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: rgba(255,255,255,0.4);
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }
        .followers-modal-header .close-btn:active {
            transform: scale(0.88);
            background: rgba(255,255,255,0.1);
        }
        .followers-modal-search {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            flex-shrink: 0;
            position: relative;
        }
        .followers-modal-search i {
            color: rgba(255,255,255,0.2);
            font-size: 14px;
        }
        .followers-modal-search input {
            flex: 1;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 50px;
            padding: 8px 14px;
            color: #fff;
            font-size: 14px;
            outline: none;
            font-family: inherit;
            transition: all 0.3s;
        }
        .followers-modal-search input::placeholder {
            color: rgba(255,255,255,0.2);
        }
        .followers-modal-search input:focus {
            border-color: rgba(192,132,252,0.2);
            background: rgba(255,255,255,0.06);
        }
        .followers-search-clear {
            background: none;
            border: none;
            color: rgba(255,255,255,0.2);
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            display: none;
            transition: all 0.2s;
        }
        .followers-search-clear:hover {
            color: rgba(255,255,255,0.4);
        }
        .followers-modal-tabs {
            display: flex;
            padding: 8px 20px;
            gap: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            flex-shrink: 0;
            background: rgba(255,255,255,0.02);
        }
        .followers-tab {
            background: none;
            border: none;
            color: rgba(255,255,255,0.3);
            padding: 8px 16px;
            border-radius: 50px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: inherit;
        }
        .followers-tab i { font-size: 14px; }
        .followers-tab .tab-count {
            background: rgba(255,255,255,0.06);
            padding: 0 8px;
            border-radius: 10px;
            font-size: 11px;
            min-width: 20px;
            text-align: center;
        }
        .followers-tab.active {
            background: rgba(192,132,252,0.12);
            color: #c084fc;
        }
        .followers-tab.active .tab-count {
            background: rgba(192,132,252,0.2);
            color: #c084fc;
        }
        .followers-tab:active { transform: scale(0.95); }
        .followers-modal-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 4px;
        }
        .followers-modal-list::-webkit-scrollbar { width: 3px; }
        .followers-modal-list::-webkit-scrollbar-track { background: transparent; }
        .followers-modal-list::-webkit-scrollbar-thumb {
            background: rgba(192,132,252,0.2);
            border-radius: 10px;
        }
        .followers-modal-list::-webkit-scrollbar-thumb:hover {
            background: rgba(192,132,252,0.4);
        }
        .followers-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px;
            color: rgba(255,255,255,0.15);
        }
        .followers-loading i { font-size: 32px; margin-bottom: 6px; }
        .followers-loading span { font-size: 13px; }
        .followers-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            color: rgba(255,255,255,0.15);
            gap: 8px;
            text-align: center;
        }
        .followers-empty i { font-size: 32px; color: rgba(255,255,255,0.05); }
        .followers-empty span { font-size: 14px; }
        .followers-empty small { font-size: 12px; color: rgba(255,255,255,0.08); }
        .followers-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid transparent;
        }
        .followers-item:hover {
            background: rgba(255,255,255,0.03);
            border-color: rgba(255,255,255,0.04);
        }
        .followers-item:active { transform: scale(0.99); }
        .followers-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .followers-info { flex: 1; min-width: 0; }
        .followers-name {
            font-weight: 600;
            font-size: 14px;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .followers-name .verified-badge { color: #c084fc; font-size: 12px; }
        .followers-username { font-size: 12px; color: rgba(255,255,255,0.3); }
        .followers-follow-btn {
            padding: 6px 14px;
            border-radius: 50px;
            border: none;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            flex-shrink: 0;
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.7);
        }
        .followers-follow-btn:hover { background: rgba(255,255,255,0.1); }
        .followers-follow-btn.following {
            background: rgba(192,132,252,0.12);
            color: #c084fc;
        }
        .followers-follow-btn.following:hover {
            background: rgba(255,68,68,0.1);
            color: #ff6b6b;
        }
        .followers-follow-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .followers-follow-btn i { font-size: 10px; margin-right: 4px; }
        @media (max-width: 480px) {
            .followers-modal-header { padding: 12px 16px 10px; }
            .followers-modal-header .title { font-size: 16px; }
            .followers-modal-header .close-btn { width: 32px; height: 32px; font-size: 16px; }
            .followers-modal-search { padding: 8px 16px; }
            .followers-modal-search input { font-size: 13px; padding: 6px 12px; }
            .followers-modal-tabs { padding: 6px 16px; }
            .followers-tab { font-size: 12px; padding: 6px 12px; }
            .followers-item { padding: 8px 12px; }
            .followers-avatar { width: 36px; height: 36px; }
            .followers-name { font-size: 13px; }
            .followers-follow-btn { font-size: 10px; padding: 4px 12px; }
        }
        @media (max-width: 380px) {
            .followers-modal-header { padding: 10px 12px 8px; }
            .followers-modal-header .title { font-size: 14px; }
            .followers-modal-header .close-btn { width: 28px; height: 28px; font-size: 14px; }
            .followers-modal-search { padding: 6px 12px; }
            .followers-modal-search input { font-size: 12px; padding: 5px 10px; }
            .followers-modal-tabs { padding: 4px 12px; }
            .followers-tab { font-size: 11px; padding: 4px 10px; }
            .followers-item { padding: 6px 10px; }
            .followers-avatar { width: 32px; height: 32px; }
            .followers-name { font-size: 12px; }
            .followers-follow-btn { font-size: 9px; padding: 3px 10px; }
        }
        @media (max-height: 600px) {
            .followers-modal-header { padding: 8px 14px 6px; }
            .followers-modal-header .title { font-size: 15px; }
            .followers-modal-header .close-btn { width: 28px; height: 28px; font-size: 14px; }
            .followers-modal-search { padding: 6px 14px; }
            .followers-modal-tabs { padding: 4px 14px; }
            .followers-tab { font-size: 11px; padding: 4px 10px; }
            .followers-item { padding: 6px 10px; }
            .followers-avatar { width: 32px; height: 32px; }
            .followers-follow-btn { font-size: 10px; padding: 4px 10px; }
        }
    `;
    document.head.appendChild(styles);
}

// ============================================================
// ✅ EXPORTACIONES
// ============================================================

export { 
    openFollowersModal, 
    closeFollowersModal,
    restoreFollowersModal
};