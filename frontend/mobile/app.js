// ============================================================
// app.js - VERSIÓN COMPLETA CON FEED INFINITO POR CURSOR
// (CORREGIDO: REDIRIGE A LOGIN SIN SESIÓN)
// ============================================================

import {
    getToken, getCurrentUser, setCurrentUser,
    restoreSession, updateUIForLoggedIn, updateUIForLoggedOut,
    verifySession, logout, goToProfile, showToast,
    getAvatar, formatDate, escapeHtml, getUserLanguage,
    translateText, translateStories, getLanguageInfo,
    getAvailableLanguages, LANGUAGES
} from './auth.js';

import { formatNumber } from './utils.js';

// Importar modales
import { openStoryModal, closeStoryModal } from './story-modal.js';
import { openProfileModal, closeProfileModal, preloadCurrentUserProfile } from './profile-modal.js';
import { openEditProfileModal, closeEditProfileModal } from './edit-profile-modal.js';
import { openCreator, closeCreator } from './story-creator-modal.js';
import { openExploreModal, closeExploreModal } from './explore-modal.js';
import { openActivityModal, closeActivityModal, updateBadge } from './activity-modal.js';

const API_URL = window.location.origin;

// ============================================================
// 🔥 DETECCIÓN DE IPHONE Y GPU
// ============================================================

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isIPhone = /iPhone/.test(navigator.userAgent);

const isHighPerformance = (() => {
    if (isIPhone) {
        const match = navigator.userAgent.match(/iPhone OS (\d+)_/);
        if (match) {
            const version = parseInt(match[1]);
            return version >= 11;
        }
        return true;
    }
    return false;
})();

console.log(`📱 Dispositivo: ${isIPhone ? 'iPhone' : isIOS ? 'iPad' : 'Otro'}`);
console.log(`⚡ GPU: ${isHighPerformance ? 'Alta' : 'Estándar'}`);

// ============================================================
// 🔥 CONFIGURACIÓN
// ============================================================

const PAGE_SIZE = 20;
const CURSOR_CACHE_KEY = 'vyn_feed_cursor';

const VIEWED_STORIES_KEY = 'vyn_mobile_viewed_stories';
const LIKED_STORIES_KEY = 'vyn_mobile_liked_stories';
const TRANSLATION_CACHE_KEY = 'vyn_translation_cache';
const VIEWED_IN_RECENT_KEY = 'vyn_viewed_in_recent';

// ============================================================
// ESTADO GLOBAL
// ============================================================

let allStories = [];
let displayedStories = [];
let viewedStories = new Set();
let viewedInRecent = new Set();
let likedStories = new Set();
let socket = null;
let currentFilter = 'ranked';
let isLoading = false;
let isPreloadDone = false;
let isAppActive = true;
let userLanguage = 'es';
let translationAvailable = true;
let userRegion = 'other';
let userCountry = null;
let pendingNewStories = 0;

// 🔥 Estado del feed por cursor
let feedCursor = null;
let hasMoreStories = true;
let isLoadingMore = false;
let totalRemaining = 0;
let isInitialLoad = true;

// 🔥 Caché de traducciones
let translationCache = {};

// ============================================================
// CONSTANTES DE TIEMPO
// ============================================================

const TEN_MINUTES = 10 * 60 * 1000; // 10 minutos en milisegundos

// ============================================================
// CARGAR CACHÉ DE TRADUCCIONES
// ============================================================

function loadTranslationCache() {
    try {
        const cached = localStorage.getItem(TRANSLATION_CACHE_KEY);
        if (cached) {
            translationCache = JSON.parse(cached);
            console.log(`📦 Cargadas ${Object.keys(translationCache).length} traducciones en caché`);
        }
    } catch (e) {
        console.error('Error cargando caché de traducciones:', e);
    }
}

function saveTranslationCache() {
    try {
        const keys = Object.keys(translationCache);
        if (keys.length > 50) {
            const toRemove = keys.slice(0, keys.length - 50);
            toRemove.forEach(key => delete translationCache[key]);
        }
        localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(translationCache));
    } catch (e) {
        console.error('Error guardando caché de traducciones:', e);
    }
}

function getCachedTranslation(storyId, language) {
    const key = `${storyId}_${language}`;
    if (translationCache[key]) {
        const cached = translationCache[key];
        if (Date.now() - cached.timestamp < 86400000) {
            return cached.data;
        }
        delete translationCache[key];
        saveTranslationCache();
    }
    return null;
}

function setCachedTranslation(storyId, language, data) {
    const key = `${storyId}_${language}`;
    translationCache[key] = {
        data: data,
        timestamp: Date.now()
    };
    saveTranslationCache();
}

// ============================================================
// PERSISTENCIA
// ============================================================

function loadPersistedData() {
    try {
        const viewed = localStorage.getItem(VIEWED_STORIES_KEY);
        if (viewed) {
            viewedStories = new Set(JSON.parse(viewed));
            console.log(`👁️ Cargadas ${viewedStories.size} historias vistas`);
        }
        
        const viewedRecent = localStorage.getItem(VIEWED_IN_RECENT_KEY);
        if (viewedRecent) {
            viewedInRecent = new Set(JSON.parse(viewedRecent));
            console.log(`🔄 Cargadas ${viewedInRecent.size} historias vistas en Recientes`);
        }
        
        const liked = localStorage.getItem(LIKED_STORIES_KEY);
        if (liked) {
            likedStories = new Set(JSON.parse(liked));
            console.log(`❤️ Cargadas ${likedStories.size} historias con like`);
        }
        loadTranslationCache();
    } catch (e) {
        console.error('Error cargando datos persistidos:', e);
    }
}

function saveViewedStory(storyId) {
    viewedStories.add(storyId);
    try {
        localStorage.setItem(VIEWED_STORIES_KEY, JSON.stringify([...viewedStories]));
    } catch (e) {}
}

function saveViewedInRecent(storyId) {
    viewedInRecent.add(storyId);
    try {
        localStorage.setItem(VIEWED_IN_RECENT_KEY, JSON.stringify([...viewedInRecent]));
    } catch (e) {}
}

function isViewedInRecent(storyId) {
    return viewedInRecent.has(storyId);
}

function saveLikedStory(storyId) {
    likedStories.add(storyId);
    try {
        localStorage.setItem(LIKED_STORIES_KEY, JSON.stringify([...likedStories]));
    } catch (e) {}
}

function isStoryViewed(storyId) {
    return viewedStories.has(storyId);
}

function isStoryLiked(storyId) {
    return likedStories.has(storyId);
}

// ============================================================
// 🔥 GUARDAR/RESTAURAR CURSOR
// ============================================================

function saveFeedCursor(cursor) {
    if (!cursor) return;
    try {
        localStorage.setItem(CURSOR_CACHE_KEY, JSON.stringify({
            cursor: cursor,
            filter: currentFilter,
            timestamp: Date.now()
        }));
    } catch (e) {}
}

function restoreFeedCursor() {
    try {
        const saved = localStorage.getItem(CURSOR_CACHE_KEY);
        if (!saved) return null;
        
        const data = JSON.parse(saved);
        // Solo restaurar si es el mismo filtro y no pasó más de 5 minutos
        if (data.filter === currentFilter && (Date.now() - data.timestamp) < 300000) {
            console.log(`🔄 Restaurando cursor: ${data.cursor}`);
            return data.cursor;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADORES
// ============================================================

function updateStoryCounters(storyId, data) {
    if (data.viewsCount !== undefined) {
        const viewCountEl = document.getElementById(`view-count-${storyId}`);
        if (viewCountEl) {
            viewCountEl.textContent = formatNumber(data.viewsCount);
        }
    }
    
    if (data.likesCount !== undefined) {
        const likeCountEl = document.getElementById(`like-count-${storyId}`);
        if (likeCountEl) {
            likeCountEl.textContent = formatNumber(data.likesCount);
        }
        const heartIcon = document.getElementById(`heart-icon-${storyId}`);
        if (heartIcon && data.liked !== undefined) {
            heartIcon.style.color = data.liked ? '#ff6b6b' : 'inherit';
        }
        const likeBtn = document.querySelector(`.btn-like[data-story-id="${storyId}"]`);
        if (likeBtn && data.liked !== undefined) {
            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> Quitar';
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';
            }
        }
    }
    
    if (data.commentsCount !== undefined) {
        const commentCountEl = document.getElementById(`comment-count-${storyId}`);
        if (commentCountEl) {
            commentCountEl.textContent = formatNumber(data.commentsCount);
        }
    }
}

// ============================================================
// 🔥 FUNCIÓN PARA RESTAURAR NAVEGACIÓN A INICIO
// ============================================================

function restoreNavToHome() {
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    const navFeed = document.getElementById('navFeed');
    if (navFeed) navFeed.classList.add('active');
}

window.restoreNavToHome = restoreNavToHome;

// ============================================================
// INICIALIZAR
// ============================================================

async function init() {
    console.log('📱 Iniciando Vyin Social...');

    loadPersistedData();

    const hasSession = restoreSession();
    const currentUser = getCurrentUser();

    if (currentUser) {
        userLanguage = currentUser.language || 'es';
        userRegion = currentUser.region || 'other';
        userCountry = currentUser.country || null;
        console.log(`🌐 Idioma del usuario: ${userLanguage}`);
        console.log(`📍 Región: ${userRegion}, País: ${userCountry}`);
    }

    if (hasSession && currentUser) {
        updateUIForLoggedIn();
        const isValid = await verifySession();
        if (!isValid) {
            updateUIForLoggedOut();
            showToast('Sesión expirada', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        } else {
            const refreshedUser = getCurrentUser();
            if (refreshedUser) {
                userLanguage = refreshedUser.language || 'es';
                userRegion = refreshedUser.region || 'other';
                userCountry = refreshedUser.country || null;
            }
            
            initSocket();
            updateHeaderUI(getCurrentUser());
            
            // Intentar restaurar el cursor guardado
            feedCursor = restoreFeedCursor();
            
            await fetchFeedByCursor('ranked', feedCursor);
            document.querySelector('.filter-btn[data-filter="ranked"]')?.classList.add('active');
            
            if (!isPreloadDone) {
                setTimeout(() => {
                    console.log('🔄 Pre-cargando perfil...');
                    preloadCurrentUserProfile();
                    isPreloadDone = true;
                }, 1500);
            }
        }
    } else {
        // 🔥 SIN SESIÓN: Mostrar pantalla de login
        updateUIForLoggedOut();
        showToast('Inicia sesión para ver el contenido', true);
        
        // Mostrar mensaje en el feed
        const container = document.getElementById('feedContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="padding:60px 20px;text-align:center;">
                    <i class="fas fa-lock" style="font-size:48px;color:#c084fc;margin-bottom:20px;display:block;"></i>
                    <h3 style="color:#fff;margin-bottom:10px;">Contenido privado</h3>
                    <p style="color:rgba(255,255,255,0.4);margin-bottom:20px;">Inicia sesión para ver las historias de tus amigos</p>
                    <button onclick="window.location.href='/login.html'" 
                            style="background:linear-gradient(135deg,#c084fc,#db2777);
                                   border:none;
                                   color:#fff;
                                   padding:12px 32px;
                                   border-radius:50px;
                                   font-size:16px;
                                   font-weight:600;
                                   cursor:pointer;">
                        <i class="fas fa-sign-in-alt"></i> Iniciar sesión
                    </button>
                </div>
            `;
        }
    }

    setupEvents();
    setupIOSOptimizations();
    console.log('✅ App lista');
}

// ============================================================
// 🔥 UPDATE HEADER UI - CORREGIDO (OCULTA LOGIN CUANDO HAY USUARIO)
// ============================================================

function updateHeaderUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const userBadge = document.getElementById('userBadge');
    const navProfile = document.getElementById('navProfile');
    const avatar = document.getElementById('headerAvatar');
    const name = document.getElementById('headerName');
    
    if (!user) {
        // Usuario NO logueado
        if (userBadge) userBadge.style.display = 'none';
        if (navProfile) navProfile.style.display = 'none';
        if (loginBtn) {
            loginBtn.style.display = 'flex';
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Iniciar sesión';
            loginBtn.onclick = () => {
                window.location.href = '/login.html';
            };
        }
        return;
    }

    // 🔥 Usuario logueado - OCULTAR loginBtn y MOSTRAR userBadge
    if (loginBtn) {
        loginBtn.style.display = 'none';
    }
    
    if (userBadge) userBadge.style.display = 'flex';
    if (navProfile) navProfile.style.display = 'flex';

    if (avatar) {
        avatar.src = user.avatar || getAvatar(user.fullName || user.username);
        avatar.onerror = function() {
            this.src = getAvatar(user.fullName || user.username);
        };
    }
    if (name) name.textContent = user.fullName || user.username;
}

// ============================================================
// 🔥 OPTIMIZACIONES PARA IPHONE
// ============================================================

function setupIOSOptimizations() {
    if (!isIPhone) return;
    console.log('🍎 Optimizaciones para iPhone...');

    const container = document.getElementById('feedContainer');
    if (container) {
        container.style.webkitOverflowScrolling = 'touch';
        container.style.overscrollBehavior = 'contain';
    }

    document.addEventListener('visibilitychange', () => {
        isAppActive = !document.hidden;
    });

    document.querySelectorAll('img').forEach(img => {
        img.loading = 'lazy';
        img.decoding = 'async';
    });

    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
        if (isAppActive) {
            return originalRAF.call(window, callback);
        }
        return 0;
    };
}

// ============================================================
// SOCKET
// ============================================================

function initSocket() {
    const token = getToken();
    if (socket || !token) return;

    socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: true,
        multiplex: false
    });
    window.socket = socket;

    socket.on('connect', () => {
        console.log('🔌 Socket conectado');
        socket.emit('user_online', { 
            page: 'mobile',
            device: isIPhone ? 'iphone' : 'other'
        });
    });

    socket.on('new_story', (data) => {
        const currentUser = getCurrentUser();
        if (currentUser && data.userId === currentUser.id) return;
        if (allStories.some(s => s.id === data.id)) return;
        
        allStories.push(data);
        
        // Solo mostrar badge si la historia es relevante y estamos en RECIENTES
        if (currentFilter === 'recent') {
            const storyCountry = data.country || null;
            const storyRegion = data.region || 'other';
            
            let isRelevant = false;
            if (userCountry && storyCountry === userCountry) {
                isRelevant = true;
            } else if (storyRegion === userRegion && !userCountry) {
                isRelevant = true;
            } else if (storyRegion === userRegion && storyCountry === userCountry) {
                isRelevant = true;
            } else if (!userCountry && userRegion === 'other') {
                isRelevant = true;
            }
            
            if (isRelevant) {
                pendingNewStories++;
                showNewStoriesBadge();
            }
        }
        
        // En PARA TI, actualizar en segundo plano
        if (currentFilter === 'ranked') {
            refreshFeedInBackground();
        }
    });

    socket.on('story_liked', (data) => {
        const story = allStories.find(s => s.id === data.storyId);
        if (story) {
            story.likes = data.likes || [];
            updateStoryCounters(data.storyId, {
                likesCount: data.likes?.length || 0,
                liked: data.liked,
                viewsCount: story.views?.length || 0
            });
        }
    });

    socket.on('story_viewed', (data) => {
        const story = allStories.find(s => s.id === data.storyId);
        if (story) {
            story.views = data.views || [];
            updateStoryCounters(data.storyId, {
                viewsCount: data.viewsCount || 0
            });
        }
    });

    socket.on('new_comment', (data) => {
        const story = allStories.find(s => s.id === data.storyId);
        if (story) {
            if (!story.comments) story.comments = [];
            story.comments.push(data.comment);
            updateStoryCounters(data.storyId, {
                commentsCount: story.comments.length
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket desconectado');
    });
}

// ============================================================
// 🔥 SHOW NEW STORIES BADGE
// ============================================================

function showNewStoriesBadge() {
    const badge = document.getElementById('newBadge');
    if (!badge) return;
    
    if (currentFilter !== 'recent') {
        badge.style.display = 'none';
        return;
    }
    
    badge.style.display = 'flex';
    const countEl = document.getElementById('newBadgeCount');
    if (countEl) {
        countEl.textContent = pendingNewStories;
    }
    const textEl = document.getElementById('newBadgeText');
    if (textEl) {
        textEl.textContent = pendingNewStories === 1 ? 'Nueva historia' : 'Nuevas historias';
    }
}

function hideNewStoriesBadge() {
    const badge = document.getElementById('newBadge');
    if (badge) {
        badge.style.display = 'none';
    }
    pendingNewStories = 0;
}

// ============================================================
// 🔥 FETCH FEED POR CURSOR (SOLO CON SESIÓN)
// ============================================================

async function fetchFeedByCursor(filter, cursor = null) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver historias', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    if (isLoading) return;
    isLoading = true;
    currentFilter = filter;
    isInitialLoad = cursor === null || cursor === 'null';

    if (filter !== 'recent') {
        hideNewStoriesBadge();
    }

    try {
        const limit = PAGE_SIZE;
        let url = `${API_URL}/api/stories/feed/cursor?filter=${filter}&limit=${limit}`;
        if (cursor && cursor !== 'null') {
            url += `&cursor=${cursor}`;
        }

        console.log(`📡 Cargando feed por cursor: ${url}`);
        console.log(`📍 Cursor: ${cursor || 'INICIO'}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        let stories = data.data || [];
        const pagination = data.pagination || {};
        
        hasMoreStories = pagination.hasMore || false;
        totalRemaining = pagination.totalRemaining || 0;
        const nextCursor = pagination.nextCursor || null;

        console.log(`📡 Recibidas ${stories.length} historias (más: ${hasMoreStories}, restantes: ${totalRemaining})`);

        // ============================================================
        // 🔥 FILTRAR POR TIEMPO SEGÚN EL MODO
        // ============================================================
        
        const now = Date.now();

        if (filter === 'recent') {
            // RECIENTES: Solo historias con menos de 10 minutos
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age < TEN_MINUTES;
            });
            console.log(`📊 [RECIENTES] ${stories.length} historias con menos de 10 minutos`);
            
            // 🔥 RECIENTES: Filtrar historias vistas en RECIENTES
            stories = stories.filter(s => !isViewedInRecent(s.id));
            
        } else if (filter === 'ranked') {
            // PARA TI: Solo historias con más de 10 minutos
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age >= TEN_MINUTES;
            });
            console.log(`📊 [PARA TI] ${stories.length} historias con más de 10 minutos`);
            
            // 🔥 PARA TI: Filtrar historias ya vistas GLOBALMENTE
            stories = stories.filter(s => !isStoryViewed(s.id));
        }

        // 🔥 FILTRAR historias del propio usuario
        const currentUser = getCurrentUser();
        if (currentUser) {
            stories = stories.filter(s => s.userId !== currentUser.id);
        }

        // 🔥 FILTRAR historias ocultas
        stories = stories.filter(s => !s.hidden);

        // Enriquecer con datos de usuario
        const users = await fetchUsers(stories.map(s => s.userId));
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });

        const enrichedStories = stories.map(story => {
            const owner = userMap[story.userId] || story.userData || story.user || {};
            return {
                ...story,
                userData: {
                    id: owner.id || story.userId,
                    username: owner.username || story.username || 'usuario',
                    fullName: owner.fullName || story.fullName || 'Usuario',
                    avatar: owner.avatar || story.avatar || getAvatar(owner.fullName || 'U'),
                    isVerified: owner.isVerified || false,
                    accountType: owner.accountType || 'personal',
                    country: owner.country || story.country || null,
                    region: owner.region || story.region || 'other'
                },
                hasSubtitles: story.hasSubtitles || false,
                subtitles: story.subtitles || null,
                language: story.language || 'es'
            };
        });

        // Si es la primera carga o no hay cursor, reemplazar todo
        if (cursor === null || cursor === 'null') {
            displayedStories = enrichedStories;
        } else {
            // Agregar solo historias que no estén ya en displayedStories
            const existingIds = new Set(displayedStories.map(s => s.id));
            const newStories = enrichedStories.filter(s => !existingIds.has(s.id));
            displayedStories = [...displayedStories, ...newStories];
        }

        // 🔥 Guardar el nuevo cursor
        if (nextCursor) {
            feedCursor = nextCursor;
            saveFeedCursor(feedCursor);
        } else {
            hasMoreStories = false;
        }

        console.log(`📊 ${filter} - Mostrando ${displayedStories.length} historias`);

        renderFeed(displayedStories);
        isLoading = false;

        // 🔥 Pre-cargar siguiente página si hay más
        if (hasMoreStories && displayedStories.length > 0) {
            preloadNextPage();
        }

    } catch (error) {
        console.error('Error cargando feed por cursor:', error);
        if (displayedStories.length === 0 && allStories.length === 0) {
            showToast('Error al cargar el feed', true);
        }
        isLoading = false;
    }
}

// ============================================================
// 🔥 FETCH USERS (PARA ENRIQUECER HISTORIAS)
// ============================================================

async function fetchUsers(userIds) {
    try {
        const token = getToken();
        if (!token) return [];
        
        const uniqueIds = [...new Set(userIds)];
        const res = await fetch(`${API_URL}/api/users/batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userIds: uniqueIds })
        });
        
        if (res.ok) {
            return await res.json();
        }
        return [];
    } catch (error) {
        console.warn('Error fetching users:', error);
        return [];
    }
}

// ============================================================
// 🔥 PRE-CARGAR SIGUIENTE PÁGINA
// ============================================================

let preloadTimeout = null;

function preloadNextPage() {
    if (preloadTimeout) clearTimeout(preloadTimeout);
    if (!hasMoreStories || isLoadingMore) return;
    
    preloadTimeout = setTimeout(() => {
        console.log(`🔄 Pre-cargando siguiente página (cursor: ${feedCursor})...`);
        loadMoreStories(true);
    }, 1500);
}

// ============================================================
// 🔥 LOAD MORE STORIES (SOLO CON SESIÓN)
// ============================================================

async function loadMoreStories(preload = false) {
    if (isLoadingMore || !hasMoreStories) return;
    
    isLoadingMore = true;
    
    try {
        const token = getToken();
        if (!token) {
            isLoadingMore = false;
            return;
        }
        
        const limit = PAGE_SIZE;
        let url = `${API_URL}/api/stories/feed/cursor?filter=${currentFilter}&limit=${limit}`;
        if (feedCursor && feedCursor !== 'null') {
            url += `&cursor=${feedCursor}`;
        }
        
        console.log(`📡 Cargando más historias (cursor: ${feedCursor})...`);
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        let stories = data.data || [];
        const pagination = data.pagination || {};
        
        hasMoreStories = pagination.hasMore || false;
        totalRemaining = pagination.totalRemaining || 0;
        const nextCursor = pagination.nextCursor || null;
        
        // ============================================================
        // 🔥 FILTRAR POR TIEMPO SEGÚN EL MODO
        // ============================================================
        
        const now = Date.now();

        if (currentFilter === 'recent') {
            // RECIENTES: Solo historias con menos de 10 minutos
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age < TEN_MINUTES;
            });
            // RECIENTES: Filtrar historias vistas en RECIENTES
            stories = stories.filter(s => !isViewedInRecent(s.id));
            
        } else if (currentFilter === 'ranked') {
            // PARA TI: Solo historias con más de 10 minutos
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age >= TEN_MINUTES;
            });
            // PARA TI: Filtrar historias ya vistas GLOBALMENTE
            stories = stories.filter(s => !isStoryViewed(s.id));
        }
        
        const currentUser = getCurrentUser();
        if (currentUser) {
            stories = stories.filter(s => s.userId !== currentUser.id);
        }
        stories = stories.filter(s => !s.hidden);
        
        // Enriquecer
        const users = await fetchUsers(stories.map(s => s.userId));
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const enrichedStories = stories.map(story => {
            const owner = userMap[story.userId] || story.userData || story.user || {};
            return {
                ...story,
                userData: {
                    id: owner.id || story.userId,
                    username: owner.username || story.username || 'usuario',
                    fullName: owner.fullName || story.fullName || 'Usuario',
                    avatar: owner.avatar || story.avatar || getAvatar(owner.fullName || 'U'),
                    isVerified: owner.isVerified || false,
                    accountType: owner.accountType || 'personal',
                    country: owner.country || story.country || null,
                    region: owner.region || story.region || 'other'
                },
                hasSubtitles: story.hasSubtitles || false,
                subtitles: story.subtitles || null,
                language: story.language || 'es'
            };
        });
        
        // Solo agregar historias nuevas
        const existingIds = new Set(displayedStories.map(s => s.id));
        const newStories = enrichedStories.filter(s => !existingIds.has(s.id));
        
        if (newStories.length > 0) {
            displayedStories = [...displayedStories, ...newStories];
            
            if (nextCursor) {
                feedCursor = nextCursor;
                saveFeedCursor(feedCursor);
            } else {
                hasMoreStories = false;
            }
            
            if (!preload) {
                renderFeed(displayedStories);
                console.log(`📊 Cargados ${newStories.length} historias más (total: ${displayedStories.length})`);
            } else {
                console.log(`📦 Pre-cargados ${newStories.length} historias (total: ${displayedStories.length})`);
            }
            
            if (hasMoreStories) {
                preloadNextPage();
            }
        } else {
            hasMoreStories = false;
            console.log('📭 No hay más historias nuevas para cargar');
        }
        
    } catch (error) {
        console.error('Error cargando más historias:', error);
    } finally {
        isLoadingMore = false;
    }
}

// ============================================================
// 🔥 REFRESH FEED EN SEGUNDO PLANO
// ============================================================

let refreshTimeout = null;

function refreshFeedInBackground() {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        console.log('🔄 Actualizando feed en segundo plano...');
        // Recargar desde el cursor actual (no perder posición)
        fetchFeedByCursor(currentFilter, feedCursor);
        refreshTimeout = null;
    }, 5000);
}

// ============================================================
// 🔥 APLICAR FILTRO (VERIFICA SESIÓN)
// ============================================================

function applyFilter(filter) {
    const token = getToken();
    
    // 🔥 Sin sesión: redirigir a login
    if (!token) {
        console.log('🔒 Sin sesión - Redirigiendo a login');
        showToast('Inicia sesión para ver historias', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    // 🔥 Con sesión: aplicar filtros normales
    currentFilter = filter;
    displayedStories = [];
    feedCursor = null;
    hasMoreStories = true;
    totalRemaining = 0;
    
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (filter !== 'recent') {
        hideNewStoriesBadge();
    }

    // Intentar restaurar cursor guardado para este filtro
    const savedCursor = restoreFeedCursor();
    if (savedCursor && savedCursor !== 'null') {
        feedCursor = savedCursor;
        console.log(`📍 Usando cursor guardado: ${feedCursor}`);
    }

    fetchFeedByCursor(filter, feedCursor);
}

// ============================================================
// 🔥 FUNCIÓN: REGIONES CERCANAS
// ============================================================

const REGION_NEARBY_MAP = {
    'south_america': ['central_america', 'north_america', 'europe'],
    'central_america': ['south_america', 'north_america', 'europe'],
    'north_america': ['central_america', 'south_america', 'europe'],
    'europe': ['north_america', 'asia', 'africa'],
    'asia': ['europe', 'oceania', 'africa'],
    'africa': ['europe', 'asia', 'south_america'],
    'oceania': ['asia', 'south_america', 'north_america'],
    'antarctica': ['south_america', 'africa', 'oceania'],
    'other': ['north_america', 'europe', 'asia']
};

function isNearbyRegion(region1, region2) {
    if (!region1 || !region2) return false;
    if (region1 === region2) return true;
    return REGION_NEARBY_MAP[region1]?.includes(region2) || false;
}

// ============================================================
// SHOW EMPTY STATE
// ============================================================

function showEmptyState(message) {
    const container = document.getElementById('feedContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-camera"></i>
            <h3>${message}</h3>
            <p>${currentFilter === 'ranked' ? 'Las historias nuevas (menos de 10 minutos) aparecen en RECIENTES' : ''}</p>
        </div>
    `;
}

// ============================================================
// 🔥 RENDER FEED CON DETECCIÓN DE FINAL
// ============================================================

function renderFeed(storiesData) {
    const container = document.getElementById('feedContainer');
    if (!container) return;

    if (!storiesData || storiesData.length === 0) {
        const messages = {
            ranked: 'No hay historias disponibles para ti',
            recent: 'No hay historias recientes en tu región',
            public: 'No hay historias públicas disponibles'
        };
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-camera"></i>
                <h3>${messages[currentFilter] || 'No hay historias'}</h3>
                <p>${currentFilter === 'ranked' ? 'Vuelve más tarde para ver nuevas historias' : currentFilter === 'recent' ? 'Espera a que alguien publique en tu país/región' : currentFilter === 'public' ? 'Inicia sesión para ver más contenido' : ''}</p>
            </div>
        `;
        return;
    }

    const currentUser = getCurrentUser();
    const userId = currentUser?.id;

    let html = '';
    storiesData.forEach((story, index) => {
        const user = story.userData || story.user || {
            fullName: story.fullName || 'Usuario',
            username: story.username || 'usuario',
            avatar: story.avatar || getAvatar(story.fullName || 'U')
        };

        const isLiked = story.likes?.includes(userId) || false;
        const likesCount = story.likes?.length || 0;
        const viewsCount = story.views?.length || 0;
        const commentsCount = story.comments?.length || 0;

        const contentLanguage = story.language || story.originalLanguage || 'es';
        const isDifferentLanguage = contentLanguage !== userLanguage;
        const isTranslated = story.translated || false;

        let langBadge = '';
        if (contentLanguage && contentLanguage !== userLanguage) {
            const langInfo = getLanguageInfo(contentLanguage);
            langBadge = `
                <span class="lang-badge" style="font-size:8px;color:rgba(255,255,255,0.15);margin-left:4px;">
                    ${langInfo?.flag || '🌐'} ${langInfo?.name || contentLanguage}
                </span>
            `;
        }

        let translationBadge = '';
        if (isTranslated && isDifferentLanguage) {
            translationBadge = `
                <span class="translation-badge" style="font-size:9px; color:rgba(192,132,252,0.5); margin-left:4px;">
                    <i class="fas fa-language"></i> Traducido
                </span>
            `;
        }

        let translateBtn = '';
        if (isDifferentLanguage) {
            const btnText = isTranslated ? 'Mostrar original' : 'Traducir';
            const btnIcon = isTranslated ? 'fa-undo' : 'fa-language';
            translateBtn = `
                <button class="btn-translate" data-story-id="${story.id}" 
                        style="background:rgba(192,132,252,0.08);border:none;color:#c084fc;font-size:10px;padding:2px 10px;border-radius:12px;cursor:pointer;transition:all 0.2s;">
                    <i class="fas ${btnIcon}"></i> ${btnText}
                </button>
            `;
        }

        let subtitlesBadge = '';
        if (story.hasSubtitles && story.subtitles) {
            subtitlesBadge = `
                <span class="subtitles-badge" style="font-size:8px;color:rgba(192,132,252,0.3);margin-left:4px;">
                    <i class="fas fa-closed-captioning"></i> CC
                </span>
            `;
        }

        let locationBadge = '';
        if (currentFilter === 'recent') {
            const storyCountry = story.country || null;
            const storyRegion = story.region || 'other';
            let locationText = '';
            if (storyCountry) locationText = `📍 ${storyCountry}`;
            else if (storyRegion !== 'other') locationText = `📍 ${storyRegion}`;
            if (locationText) {
                locationBadge = `
                    <span class="location-badge" style="font-size:8px;color:rgba(255,255,255,0.1);margin-left:4px;">
                        ${locationText}
                    </span>
                `;
            }
        }

        let mediaHtml = '';
        if (story.mediaType === 'image' && story.mediaUrl) {
            mediaHtml = `<img src="${story.mediaUrl}" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/800x800/1a1a2e/c084fc?text=Imagen'" />`;
        } else if (story.mediaType === 'video' && story.mediaUrl) {
            mediaHtml = `<video src="${story.mediaUrl}" muted loop playsinline preload="metadata"></video>`;
        } else if (story.mediaType === 'text' && story.textContent) {
            mediaHtml = `
                <div class="text-placeholder" style="background:${story.textBgColor || '#1a1a2e'}">
                    ${escapeHtml(story.textContent)}
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="text-placeholder" style="background:#1a1a2e;">
                    <i class="fas fa-book-open" style="color:#c084fc;font-size:40px;margin-bottom:12px;display:block;"></i>
                    <span>Historia sin contenido</span>
                </div>
            `;
        }

        const captionHtml = story.caption ? 
            story.caption.replace(/#([a-zA-Z0-9_]+)/g, '<span class="hashtag">#$1</span>') : '';

        html += `
            <div class="story-card" data-index="${index}" data-story-id="${story.id}">
                <div class="card-header">
                    <img class="avatar" src="${user.avatar}" alt="${user.fullName}" onclick="window.goToProfileUser('${user.id}')" loading="lazy" decoding="async" />
                    <div class="info">
                        <div class="name" onclick="window.goToProfileUser('${user.id}')">
                            ${user.fullName}
                            ${user.isVerified ? '<i class="fas fa-check-circle" style="color:#c084fc;font-size:12px;margin-left:2px;"></i>' : ''}
                            ${translationBadge}
                            ${langBadge}
                            ${subtitlesBadge}
                            ${locationBadge}
                        </div>
                        <div class="handle">@${user.username} · ${formatDate(story.createdAt)}</div>
                    </div>
                    <div class="time">${formatDate(story.createdAt)}</div>
                </div>
                <div class="card-media" onclick="window.handleStoryView('${story.id}')">
                    ${mediaHtml}
                </div>
                <div class="card-footer">
                    ${captionHtml ? `<div class="caption">${captionHtml}</div>` : ''}
                    <div class="actions">
                        <div class="stats">
                            <span><i class="fas fa-eye"></i> <span id="view-count-${story.id}">${formatNumber(viewsCount)}</span></span>
                            <span><i class="fas fa-heart" id="heart-icon-${story.id}" style="color:${isLiked ? '#ff6b6b' : 'inherit'}"></i> <span id="like-count-${story.id}">${formatNumber(likesCount)}</span></span>
                            <span><i class="fas fa-comment"></i> <span id="comment-count-${story.id}">${formatNumber(commentsCount)}</span></span>
                            ${translateBtn}
                        </div>
                        <div class="btns">
                            <button class="btn-like ${isLiked ? 'liked' : ''}" data-story-id="${story.id}">
                                <i class="fas fa-heart"></i> ${isLiked ? 'Quitar' : 'Like'}
                            </button>
                            <button class="btn-comment" data-story-id="${story.id}">
                                <i class="fas fa-comment"></i>
                            </button>
                            <button class="btn-share" data-story-id="${story.id}">
                                <i class="fas fa-share-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    // 🔥 Añadir elemento de fin de feed si hay más
    html += `
        <div id="feedEnd" style="height: 20px; display: ${hasMoreStories ? 'block' : 'none'};">
            <div style="text-align:center;padding:10px;color:rgba(255,255,255,0.1);font-size:12px;">
                <i class="fas fa-spinner fa-pulse"></i> Cargando más...
            </div>
        </div>
    `;

    container.innerHTML = html;

    // 🔥 Observador para detectar cuando el usuario llega al final
    setupInfiniteScroll();

    // ============================================================
    // 🔥 REGISTRO AUTOMÁTICO DE VISTAS
    // ============================================================
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const storyId = card.dataset.storyId;
                if (storyId && !isStoryViewed(storyId)) {
                    registerView(storyId);
                }
            }
        });
    }, {
        threshold: 0.3,
        rootMargin: '0px 0px -50px 0px'
    });

    container.querySelectorAll('.story-card').forEach(card => {
        observer.observe(card);
    });

    window._viewObserver = observer;

    // ============================================================
    // EVENTOS
    // ============================================================

    container.querySelectorAll('.btn-like').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const storyId = btn.dataset.storyId;
            handleLike(storyId, btn);
        });
    });

    container.querySelectorAll('.btn-comment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const storyId = btn.dataset.storyId;
            if (storyId) {
                openStoryModal(storyId);
                setTimeout(() => {
                    const commentsSection = document.querySelector('.comments-section');
                    if (commentsSection) {
                        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const input = document.getElementById('commentInput');
                        if (input) input.focus();
                    }
                }, 400);
            }
        });
    });

    container.querySelectorAll('.btn-share').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const storyId = btn.dataset.storyId;
            const url = `${window.location.origin}/story/${storyId}`;
            if (navigator.share) {
                navigator.share({ title: 'Vyin Social', url });
            } else {
                navigator.clipboard?.writeText(url).then(() => {
                    showToast('📋 Enlace copiado');
                });
            }
        });
    });

    container.querySelectorAll('.btn-translate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const storyId = btn.dataset.storyId;
            if (storyId) {
                window.translateStory(storyId);
            }
        });
    });

    container.scrollTop = 0;
}

// ============================================================
// 🔥 SCROLL INFINITO
// ============================================================

let scrollObserver = null;

function setupInfiniteScroll() {
    const feedEnd = document.getElementById('feedEnd');
    if (!feedEnd) return;

    if (scrollObserver) {
        scrollObserver.disconnect();
    }

    scrollObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreStories && !isLoadingMore) {
            console.log('📥 Llegó al final del feed, cargando más...');
            loadMoreStories(false);
        }
    }, {
        root: document.getElementById('feedContainer'),
        rootMargin: '0px 0px 100px 0px',
        threshold: 0.1
    });

    scrollObserver.observe(feedEnd);
}

// ============================================================
// 🔥 REGISTRAR VISTA (actualiza el cursor)
// ============================================================

async function registerView(storyId) {
    if (!storyId) return;
    if (isStoryViewed(storyId)) return;

    const token = getToken();
    if (!token) {
        console.log('🔒 Sin sesión - Redirigiendo a login');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }

    console.log(`👁️ [VIEW] Registrando vista para: ${storyId}`);

    try {
        saveViewedStory(storyId);
        
        if (currentFilter === 'recent') {
            saveViewedInRecent(storyId);
            console.log(`🔄 [VIEW] Historia ${storyId} vista en RECIENTES`);
        } else {
            console.log(`📌 [VIEW] Historia ${storyId} vista en PARA TI`);
        }

        // 🔥 Actualizar el cursor con esta historia
        feedCursor = storyId;
        saveFeedCursor(feedCursor);

        const res = await fetch(`${API_URL}/api/stories/${storyId}/view`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`✅ [VIEW] Vista registrada para ${storyId}`);
            
            const viewCountEl = document.getElementById(`view-count-${storyId}`);
            if (viewCountEl && data.viewsCount !== undefined) {
                viewCountEl.textContent = formatNumber(data.viewsCount);
            }
        }
    } catch (error) {
        console.error('❌ Error registrando vista:', error);
    }
}

// ============================================================
// FUNCIONES DE TRADUCCIÓN
// ============================================================

window.translateStory = async function(storyId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para traducir', true);
        return;
    }

    if (!translationAvailable) {
        showToast('🌐 Servicio de traducción no disponible', true);
        return;
    }

    const idx = allStories.findIndex(s => s.id === storyId);
    if (idx === -1) {
        showToast('Historia no encontrada', true);
        return;
    }

    const story = allStories[idx];
    const isCurrentlyTranslated = story.translated || false;
    const contentLanguage = story.language || story.originalLanguage || 'es';

    if (isCurrentlyTranslated && story.originalText) {
        const restoredStory = {
            ...story,
            caption: story.originalText,
            textContent: story.originalText,
            translated: false,
            showingOriginal: true,
            _translationCache: story._translationCache || null
        };
        allStories[idx] = restoredStory;
        updateStoryCard(storyId, restoredStory);
        showToast('📝 Mostrando original');
        return;
    }

    const cachedTranslation = getCachedTranslation(storyId, userLanguage);
    if (cachedTranslation) {
        const updatedStory = {
            ...allStories[idx],
            caption: cachedTranslation.translated,
            textContent: cachedTranslation.translated,
            originalText: cachedTranslation.original,
            translated: true,
            showingOriginal: false,
            originalLanguage: contentLanguage,
            language: userLanguage,
            _translationCache: cachedTranslation
        };
        allStories[idx] = updatedStory;
        updateStoryCard(storyId, updatedStory);
        showToast(`✅ Traducción cargada (caché)`);
        return;
    }

    const card = document.querySelector(`.story-card[data-story-id="${storyId}"]`);
    if (card) {
        const translateBtn = card.querySelector('.btn-translate');
        if (translateBtn) {
            translateBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
            translateBtn.disabled = true;
        }
    }

    try {
        let textToTranslate = story.caption || story.textContent || story.subtitles || '';
        if (!textToTranslate) {
            showToast('No hay texto para traducir', true);
            return;
        }

        const res = await fetch(`${API_URL}/api/vyin/translate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: textToTranslate,
                targetLanguage: userLanguage,
                sourceLanguage: contentLanguage
            })
        });

        const data = await res.json();

        if (data.success && data.translated && data.translated.trim() !== data.original.trim()) {
            const cacheData = {
                translated: data.translated,
                original: data.original,
                engine: data.engine || 'M2M100',
                license: data.license || 'MIT',
                language: userLanguage
            };
            setCachedTranslation(storyId, userLanguage, cacheData);

            const updatedStory = {
                ...allStories[idx],
                caption: data.translated,
                textContent: data.translated,
                originalText: data.original,
                translated: true,
                showingOriginal: false,
                originalLanguage: contentLanguage,
                language: userLanguage,
                _translationCache: cacheData
            };
            allStories[idx] = updatedStory;
            updateStoryCard(storyId, updatedStory);
            showToast(`✅ Traducido al ${data.languageInfo?.name || userLanguage}`);
        } else {
            showToast('📝 No se pudo traducir', true);
        }
    } catch (error) {
        console.error('❌ Error traduciendo:', error);
        showToast('Error al traducir', true);
    } finally {
        if (card) {
            const translateBtn = card.querySelector('.btn-translate');
            if (translateBtn) {
                const isNowTranslated = allStories[idx]?.translated || false;
                const btnText = isNowTranslated ? 'Mostrar original' : 'Traducir';
                const btnIcon = isNowTranslated ? 'fa-undo' : 'fa-language';
                translateBtn.innerHTML = `<i class="fas ${btnIcon}"></i> ${btnText}`;
                translateBtn.disabled = false;
            }
        }
    }
};

function updateStoryCard(storyId, updatedStory) {
    const card = document.querySelector(`.story-card[data-story-id="${storyId}"]`);
    if (!card) return;
    
    const captionEl = card.querySelector('.caption');
    if (captionEl && updatedStory.caption) {
        const captionHtml = updatedStory.caption.replace(/#([a-zA-Z0-9_]+)/g, '<span class="hashtag">#$1</span>');
        captionEl.innerHTML = captionHtml;
    }
    
    const textPlaceholder = card.querySelector('.text-placeholder');
    if (textPlaceholder && updatedStory.textContent) {
        textPlaceholder.innerHTML = escapeHtml(updatedStory.textContent);
    }
    
    const nameEl = card.querySelector('.info .name');
    if (nameEl) {
        const existingBadge = nameEl.querySelector('.translation-badge');
        if (existingBadge) existingBadge.remove();
        if (updatedStory.translated) {
            const badge = document.createElement('span');
            badge.className = 'translation-badge';
            badge.style.cssText = 'font-size:9px; color:rgba(192,132,252,0.5); margin-left:4px;';
            badge.innerHTML = '<i class="fas fa-language"></i> Traducido';
            nameEl.appendChild(badge);
        }
    }
    
    const translateBtn = card.querySelector('.btn-translate');
    if (translateBtn) {
        const isTranslated = updatedStory.translated || false;
        const btnText = isTranslated ? 'Mostrar original' : 'Traducir';
        const btnIcon = isTranslated ? 'fa-undo' : 'fa-language';
        translateBtn.innerHTML = `<i class="fas ${btnIcon}"></i> ${btnText}`;
        translateBtn.disabled = false;
    }
}

// ============================================================
// HANDLE VIEW
// ============================================================

async function handleStoryView(storyId) {
    if (!storyId) return;
    console.log(`👁️ [VIEW] Abriendo modal para: ${storyId}`);

    if (!isStoryViewed(storyId)) {
        saveViewedStory(storyId);
        if (currentFilter === 'recent') {
            saveViewedInRecent(storyId);
        }
        console.log(`👁️ Historia ${storyId} marcada como vista`);
    }

    await openStoryModal(storyId);
}

// ============================================================
// HANDLE LIKE
// ============================================================

async function handleLike(storyId, btn) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return;
    }

    const isLiked = btn.classList.contains('liked');
    const method = isLiked ? 'DELETE' : 'POST';

    try {
        if (!isStoryViewed(storyId)) {
            await registerView(storyId);
        }

        const res = await fetch(`${API_URL}/api/stories/${storyId}/like`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        if (res.ok) {
            if (data.liked) {
                saveLikedStory(storyId);
            } else {
                likedStories.delete(storyId);
                try {
                    localStorage.setItem(LIKED_STORIES_KEY, JSON.stringify([...likedStories]));
                } catch (e) {}
            }

            updateStoryCounters(storyId, {
                likesCount: data.likesCount || 0,
                liked: data.liked
            });

            const story = allStories.find(s => s.id === storyId);
            if (story && data.likes) {
                story.likes = data.likes;
            }

            showToast(data.liked ? '❤️ Like guardado' : '💔 Like eliminado');
        } else {
            showToast(data.error || 'Error al procesar like', true);
        }
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast('Error al procesar like', true);
    }
}

// ============================================================
// REFRESH FEED
// ============================================================

async function refreshFeed() {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para actualizar', true);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
        return;
    }
    
    console.log(`🔄 Refrescando feed: ${currentFilter}`);
    showToast('🔄 Actualizando feed...');
    
    hideNewStoriesBadge();
    
    const badge = document.getElementById('newBadge');
    if (badge) {
        badge.style.display = 'none';
        const countEl = document.getElementById('newBadgeCount');
        if (countEl) countEl.textContent = '0';
    }
    
    // 🔥 No resetear el cursor, recargar desde donde estábamos
    displayedStories = [];
    await fetchFeedByCursor(currentFilter, feedCursor);
}

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

window.showToast = showToast;
window.goToProfile = goToProfile;
window.handleStoryView = handleStoryView;
window.refreshFeed = refreshFeed;
window.logout = logout;
window.translateStory = window.translateStory || translateStory;
window.getLanguageInfo = getLanguageInfo;
window.getAvailableLanguages = getAvailableLanguages;
window.LANGUAGES = LANGUAGES;

window.openStoryModal = openStoryModal;
window.closeStoryModal = closeStoryModal;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.openCreator = openCreator;
window.closeCreator = closeCreator;
window.openExploreModal = openExploreModal;
window.closeExploreModal = closeExploreModal;
window.openActivityModal = openActivityModal;
window.closeActivityModal = closeActivityModal;

window.loadPendingStories = () => {
    refreshFeed();
};

window.goToProfileUser = (userId) => {
    if (!userId) return;
    closeExploreModal();
    closeActivityModal();
    closeStoryModal();
    closeCreator();
    closeEditProfileModal();
    openProfileModal(userId);
};

// ============================================================
// EVENTOS
// ============================================================

function setupEvents() {
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para configurar', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        const user = getCurrentUser();
        if (user?.id) {
            if (typeof window.openEditProfileModal === 'function') {
                window.openEditProfileModal(user);
            } else {
                showToast('Error al abrir configuración', true);
            }
        } else {
            showToast('Inicia sesión para configurar', true);
        }
    });

    document.getElementById('userBadge')?.addEventListener('click', () => {
        const user = getCurrentUser();
        if (user?.id) {
            closeExploreModal();
            closeActivityModal();
            closeStoryModal();
            closeCreator();
            closeEditProfileModal();
            openProfileModal(user.id);
        } else {
            showToast('Inicia sesión', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
        }
    });

    document.getElementById('navProfile')?.addEventListener('click', () => {
        const user = getCurrentUser();
        if (user?.id) {
            closeExploreModal();
            closeActivityModal();
            closeStoryModal();
            closeCreator();
            closeEditProfileModal();
            
            document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
            document.getElementById('navProfile').classList.add('active');
            
            setTimeout(() => {
                openProfileModal(user.id);
            }, 100);
        } else {
            showToast('Inicia sesión', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
        }
    });

    document.querySelector('.logo')?.addEventListener('dblclick', () => {
        refreshFeed();
    });

    document.getElementById('createBtn')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para crear historias', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        openCreator();
    });

    // 🔥 FILTRO: PARA TI
    document.getElementById('filterRanked')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para ver historias', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        
        hideNewStoriesBadge();
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('filterRanked').classList.add('active');
        applyFilter('ranked');
    });

    // 🔥 FILTRO: RECIENTES
    document.getElementById('filterRecent')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para ver historias', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('filterRecent').classList.add('active');
        if (pendingNewStories > 0) {
            showNewStoriesBadge();
        }
        applyFilter('recent');
    });

    // BOTTOM NAV
    document.getElementById('navFeed')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para ver el feed', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        
        closeExploreModal();
        closeActivityModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('navFeed').classList.add('active');
        
        applyFilter(currentFilter || 'ranked');
    });

    document.getElementById('navExplore')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para explorar', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        
        closeActivityModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('navExplore').classList.add('active');
        
        setTimeout(() => {
            openExploreModal();
        }, 100);
    });

    document.getElementById('navNotifications')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast('Inicia sesión para ver notificaciones', true);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
            return;
        }
        
        closeExploreModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('navNotifications').classList.add('active');
        
        setTimeout(() => {
            openActivityModal();
        }, 100);
    });

    // PULL TO REFRESH
    let touchStartY = 0;
    let isPulling = false;
    const container = document.getElementById('feedContainer');

    container?.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        isPulling = false;
    }, { passive: true });

    container?.addEventListener('touchmove', (e) => {
        if (container.scrollTop === 0 && !isPulling) {
            const touchY = e.touches[0].clientY;
            if (touchY - touchStartY > 60) {
                isPulling = true;
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(10);
                }
            }
        }
    }, { passive: true });

    container?.addEventListener('touchend', (e) => {
        if (isPulling && container.scrollTop === 0) {
            const touchEndY = e.changedTouches[0].clientY;
            if (touchEndY - touchStartY > 80) {
                refreshFeed();
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(15);
                }
            }
        }
        isPulling = false;
    }, { passive: true });

    // TECLADO
    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            refreshFeed();
        }
        
        if (e.key === 'Escape') {
            closeStoryModal();
            closeProfileModal();
            closeEditProfileModal();
            closeCreator();
            closeExploreModal();
            closeActivityModal();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('🔄 App reactivada');
            const lastRefresh = sessionStorage.getItem('lastRefresh');
            if (lastRefresh) {
                const diff = Date.now() - parseInt(lastRefresh);
                if (diff > 300000) {
                    refreshFeed();
                }
            }
            sessionStorage.setItem('lastRefresh', Date.now().toString());
        }
    });
}

// ============================================================
// INICIAR
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}