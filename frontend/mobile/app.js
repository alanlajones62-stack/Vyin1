// app.js - VERSIÓN COMPLETA CON FILTRO PUBLICIDAD, LOGIN MODULAR, PREFERENCIAS Y TRADUCCIÓN (i18n)
// 🔥 CORREGIDO: Race condition en registro de vistas (debounce + pending views)
// 🔥 NUEVO: Integración con IndexedDB para caché de feed e historias individuales
// 🔥 NUEVO: Contador de notificaciones en tiempo real al iniciar sesión
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

// 🔥 IMPORTAR SISTEMA i18n
import { t, setLocale, initI18n, translateAll, onLocaleChange } from './i18n.js';

// 🔥🔥🔥 NUEVO: IMPORTAR CLIENT CACHE (IndexedDB)
import clientCache from '../js/clientCache.js';

// Importar modales
import { openStoryModal, closeStoryModal } from './story-modal.js';
import { openProfileModal, closeProfileModal, preloadCurrentUserProfile } from './profile-modal.js';
import { openEditProfileModal, closeEditProfileModal } from './edit-profile-modal.js';
import { openCreator, closeCreator } from './story-creator-modal.js';
import { openExploreModal, closeExploreModal } from './explore-modal.js';
import { openActivityModal, closeActivityModal, updateBadge, refreshNotificationCount } from './activity-modal.js';

// 🔥 IMPORTAR CREADOR DE PUBLICIDAD
import { openAdCreator, closeAdCreator } from './ad-creator-modal.js';

// 🔥 IMPORTAR PUBLICIDADES PARA EL FEED
import { loadActiveAds, renderAds, registerAdView, registerAdClick } from './ads-feed.js';

// 🔥 IMPORTAR PERFIL NATIVO
import { showProfileNative, hideProfileNative } from './profile-native.js';

// 🔥 IMPORTAR MÓDULO DE LOGIN
import { 
    showLoginScreen, 
    checkSessionAndLoad, 
    updateHeaderUI, 
    initLoginModule,
    openLoginModal
} from './login-module.js';

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

// 🔥 CLAVE PARA GUARDAR EL FILTRO ACTUAL
const FILTER_STATE_KEY = 'vyn_current_filter';

// ============================================================
// 🔥 PREFERENCIAS - PRIMER LOGIN
// ============================================================

const PREFERENCES_KEY = 'vygorax_preferences_done';
const SELECTED_INTERESTS_KEY = 'vygorax_selected_interests';

// Verificar si ya se seleccionaron preferencias
function hasPreferencesDone() {
    try {
        return localStorage.getItem(PREFERENCES_KEY) === 'true';
    } catch {
        return false;
    }
}

// Marcar preferencias como completadas
function markPreferencesDone() {
    try {
        localStorage.setItem(PREFERENCES_KEY, 'true');
        console.log('✅ Preferencias marcadas como completadas');
    } catch (e) {
        console.warn('Error guardando preferencias:', e);
    }
}

// 🔥 VERIFICAR ESTADO DE TRADUCCIÓN
async function checkTranslationStatus() {
    const token = getToken();
    if (!token) return null;

    try {
        const res = await fetch(`${API_URL}/api/vyin/translate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: 'Hola', targetLanguage: 'en' })
        });

        if (res.ok) {
            const data = await res.json();
            return {
                available: true,
                engine: data.engine || 'NLLB/M2M100',
                license: data.license || 'MIT'
            };
        }
        return { available: false };
    } catch (error) {
        console.warn('⚠️ Servicio de traducción no disponible:', error.message);
        return { available: false };
    }
}

// Cargar categorías desde el servidor
async function loadCategoriesFromServer() {
    const token = getToken();
    if (!token) return [];

    try {
        // Intentar con /api/categories
        let res = await fetch(`${API_URL}/api/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            res = await fetch(`${API_URL}/api/users/categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        if (res.ok) {
            const data = await res.json();
            
            // 🔥 LOG DEL ESTADO DE TRADUCCIÓN
            if (data.translation) {
                console.log(`🌐 Estado de traducción: ${data.translation.message}`);
                console.log(`   Idiomas: ${data.translation.languages}`);
                console.log(`   Motor: ${data.translation.engine}`);
            }
            
            // 🔥 CONTAR CATEGORÍAS TRADUCIDAS
            const categories = data.categories || [];
            const translatedCount = categories.filter(c => c.isTranslated).length;
            console.log(`📂 Categorías cargadas: ${categories.length} (${translatedCount} traducidas)`);
            
            return categories;
        }
        return [];
    } catch (error) {
        console.error('Error cargando categorías:', error);
        return [];
    }
}

// Mostrar pantalla de preferencias
async function showPreferencesScreen() {
    const screen = document.getElementById('preferencesScreen');
    if (!screen) return;

    // Cargar categorías
    const categories = await loadCategoriesFromServer();
    const grid = document.getElementById('prefGrid');

    // 🔥 MOSTRAR INDICADOR DE IDIOMA Y TRADUCCIÓN
    const headerSub = screen.querySelector('.pref-sub');
    if (headerSub) {
        const user = getCurrentUser();
        const lang = user?.language || 'es';
        const langInfo = getLanguageInfo(lang);
        
        // Verificar si hay categorías traducidas
        const hasTranslation = categories.some(c => c.isTranslated === true);
        const translationEnabled = categories.some(c => c.translationAvailable === true);
        
        if (hasTranslation && translationEnabled) {
            headerSub.textContent = `🌐 Categorías en ${langInfo?.name || lang} · ${categories.length} temas disponibles`;
            headerSub.style.color = 'rgba(34,197,94,0.6)';
        } else if (translationEnabled && !hasTranslation && lang !== 'es') {
            headerSub.textContent = `📌 Categorías en español · ${categories.length} temas disponibles (traducción disponible pero no aplicada)`;
            headerSub.style.color = 'rgba(255,255,255,0.15)';
        } else {
            headerSub.textContent = `📌 Categorías en español · ${categories.length} temas disponibles`;
            headerSub.style.color = 'rgba(255,255,255,0.15)';
        }
    }

    if (!categories || categories.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.2);padding:20px 0;">
                <i class="fas fa-exclamation-circle" style="font-size:24px;color:#ff6b6b;"></i>
                <p style="margin-top:8px;">${t('error.general') || 'No se pudieron cargar las categorías'}</p>
                <button onclick="location.reload()" style="margin-top:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 20px;border-radius:50px;cursor:pointer;">
                    <i class="fas fa-redo"></i> ${t('action.retry') || 'Reintentar'}
                </button>
            </div>
        `;
        return;
    }

    // 🔥 MOSTRAR INDICADOR DE TRADUCCIÓN EN CADA CATEGORÍA
    const displayCategories = categories.slice(0, 12);
    grid.innerHTML = displayCategories.map(cat => {
        const isTranslated = cat.isTranslated || false;
        const translationBadge = isTranslated ? ' 🌐' : '';
        return `
            <div class="pref-option" data-category="${cat.id || cat.name}" data-emoji="${cat.emoji || '📌'}">
                <span class="pref-emoji">${cat.emoji || '📌'}</span>
                <span class="pref-label">${cat.name || cat.displayName || cat.id}${translationBadge}</span>
                <span class="pref-check"><i class="fas fa-check"></i></span>
            </div>
        `;
    }).join('');

    let selected = [];

    grid.querySelectorAll('.pref-option').forEach(el => {
        el.addEventListener('click', () => {
            const category = el.dataset.category;
            if (el.classList.contains('selected')) {
                el.classList.remove('selected');
                selected = selected.filter(c => c !== category);
            } else {
                if (selected.length >= 6) {
                    showToast(t('profile.maxInterests') || 'Máximo 6 temas', true);
                    return;
                }
                el.classList.add('selected');
                selected.push(category);
            }
            updatePrefCounter(selected);
        });
    });

    screen.style.display = 'flex';
    screen.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Configurar botón de guardar
    const submitBtn = document.getElementById('prefSubmitBtn');
    if (submitBtn) {
        const newBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newBtn, submitBtn);
        newBtn.addEventListener('click', async () => {
            if (selected.length === 0) {
                showToast(t('profile.selectAtLeastOne') || 'Selecciona al menos 1 tema', true);
                return;
            }

            const user = getCurrentUser();
            if (!user) {
                showToast(t('error.unauthorized') || 'Inicia sesión primero', true);
                return;
            }

            newBtn.disabled = true;
            newBtn.innerHTML = '<span class="pref-btn-spinner"></span> ' + (t('action.saving') || 'Guardando...');

            try {
                const res = await fetch(`${API_URL}/api/users/${user.id}/interests`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ interests: selected })
                });

                const data = await res.json();

                if (res.ok) {
                    user.interests = data.interests;
                    user.interestPercentage = data.percentage || 0;
                    user.firstLogin = false;
                    setCurrentUser(user);

                    markPreferencesDone();
                    localStorage.setItem(SELECTED_INTERESTS_KEY, JSON.stringify(selected));

                    showToast(`✅ ${data.percentage || 0}% ${t('profile.feedWillBe') || 'de tu feed será de tus temas'}`);

                    closePreferencesScreen();
                    if (typeof refreshFeed === 'function') {
                        setTimeout(refreshFeed, 500);
                    }
                } else {
                    showToast(data.error || t('error.general') || 'Error guardando preferencias', true);
                }
            } catch (error) {
                console.error('Error:', error);
                showToast(t('error.network') || 'Error de conexión', true);
            } finally {
                newBtn.disabled = false;
                newBtn.innerHTML = (t('action.continue') || 'Continuar') + ' <i class="fas fa-arrow-right" style="margin-left:8px;"></i>';
            }
        });
    }

    // Configurar botón de omitir
    const skipBtn = document.getElementById('prefSkipBtn');
    if (skipBtn) {
        const newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.addEventListener('click', () => {
            markPreferencesDone();
            closePreferencesScreen();
            showToast(t('profile.interestsLater') || 'Puedes configurar tus intereses después en ajustes');
            if (typeof refreshFeed === 'function') {
                setTimeout(refreshFeed, 500);
            }
        });
    }

    updatePrefCounter(selected);
}

function updatePrefCounter(selected) {
    const countEl = document.getElementById('prefCount');
    const submitBtn = document.getElementById('prefSubmitBtn');
    if (countEl) countEl.textContent = selected.length;
    if (submitBtn) {
        submitBtn.disabled = selected.length === 0;
        if (selected.length === 0) {
            submitBtn.textContent = t('profile.selectAtLeastOne') || 'Selecciona al menos 1 tema';
        } else {
            submitBtn.innerHTML = (t('action.continue') || 'Continuar') + ' <i class="fas fa-arrow-right" style="margin-left:8px;"></i>';
        }
    }
}

function closePreferencesScreen() {
    const screen = document.getElementById('preferencesScreen');
    if (screen) {
        screen.classList.remove('active');
        screen.style.display = 'none';
    }
    document.body.style.overflow = '';
}

// Exportar funciones de preferencias
export { showPreferencesScreen, closePreferencesScreen, hasPreferencesDone, markPreferencesDone, checkTranslationStatus };

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

// 🔥 Publicidades
let activeAds = [];
let isAdsLoaded = false;

// ============================================================
// CONSTANTES DE TIEMPO
// ============================================================

const TEN_MINUTES = 10 * 60 * 1000; // 10 minutos en milisegundos

// ============================================================
// 🔥 FUNCIONES PARA GUARDAR/RESTAURAR FILTRO
// ============================================================

function saveFilterState(filter) {
    try {
        localStorage.setItem(FILTER_STATE_KEY, filter);
        console.log(`💾 Filtro guardado: ${filter}`);
    } catch (e) {
        console.warn('Error guardando filtro:', e);
    }
}

function restoreFilterState() {
    try {
        const saved = localStorage.getItem(FILTER_STATE_KEY);
        if (saved) {
            console.log(`📂 Filtro restaurado: ${saved}`);
            return saved;
        }
    } catch (e) {
        console.warn('Error restaurando filtro:', e);
    }
    return 'ranked';
}

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
    const currentUser = getCurrentUser();
    const userId = currentUser?.id;
    
    const viewCountEl = document.getElementById(`view-count-${storyId}`);
    const likeCountEl = document.getElementById(`like-count-${storyId}`);
    const commentCountEl = document.getElementById(`comment-count-${storyId}`);
    const heartIcon = document.getElementById(`heart-icon-${storyId}`);
    const likeBtn = document.querySelector(`.btn-like[data-story-id="${storyId}"]`);
    
    if (data.viewsCount !== undefined && viewCountEl) {
        viewCountEl.textContent = formatNumber(data.viewsCount);
    }
    
    if (data.likesCount !== undefined && likeCountEl) {
        likeCountEl.textContent = formatNumber(data.likesCount);
    }
    
    if (data.commentsCount !== undefined && commentCountEl) {
        commentCountEl.textContent = formatNumber(data.commentsCount);
    }
    
    if (data.likes !== undefined && userId) {
        const isLikedByMe = data.likes.includes(userId);
        
        if (likeBtn) {
            if (isLikedByMe) {
                likeBtn.classList.add('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> ' + (t('action.remove') || 'Quitar');
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> ' + (t('feed.like') || 'Like');
            }
        }
        
        if (heartIcon) {
            heartIcon.style.color = isLikedByMe ? '#ff6b6b' : 'inherit';
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
    
    const section = document.getElementById('sectionProfile');
    if (section && !section.classList.contains('hidden')) {
        hideProfileNative();
    }
    
    if (typeof window.closeProfileModal === 'function') {
        if (!window._fromFollowers) {
            window.closeProfileModal();
        }
    }
}

window.restoreNavToHome = restoreNavToHome;

// ============================================================
// 🔥 CARGAR CONTADOR DE NOTIFICACIONES
// ============================================================

async function loadNotificationCount() {
    const token = getToken();
    if (!token) {
        console.log('🔒 Sin token, no se puede cargar contador de notificaciones');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            const unreadCount = data.unreadCount || 0;
            
            // Actualizar badge en navegación
            const navBadge = document.getElementById('navNotifBadge');
            if (navBadge) {
                if (unreadCount > 0) {
                    navBadge.style.display = 'flex';
                    navBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    console.log(`🔔 ${unreadCount} notificaciones no leídas`);
                } else {
                    navBadge.style.display = 'none';
                    console.log('🔔 No hay notificaciones no leídas');
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
        }
    } catch (error) {
        console.warn('⚠️ Error cargando contador de notificaciones:', error);
    }
}

// ============================================================
// INICIALIZAR - USANDO LOGIN MODULE CON PREFERENCIAS
// ============================================================

async function init() {
    console.log('📱 Iniciando Vygorax...');

    // 🔥 INICIALIZAR i18n
    initI18n();
    
    // 🔥 ESCUCHAR CAMBIOS DE IDIOMA PARA ACTUALIZAR UI
    onLocaleChange(() => {
        console.log('🌐 Idioma cambiado, actualizando UI...');
        translateAll();
        translateFeedUI();
    });

    loadPersistedData();

    // 🔥 RESTAURAR FILTRO GUARDADO
    const savedFilter = restoreFilterState();
    if (savedFilter && savedFilter !== 'ranked') {
        currentFilter = savedFilter;
        console.log(`📂 Filtro restaurado: ${savedFilter}`);
    }

    // 🔥 INICIALIZAR MÓDULO DE LOGIN CON PREFERENCIAS
    initLoginModule({
        onSuccess: async (user) => {
            console.log(`✅ Usuario autenticado: ${user?.fullName || user?.username}`);
            
            userLanguage = user?.language || 'es';
            userRegion = user?.region || 'other';
            userCountry = user?.country || null;
            console.log(`🌐 Idioma: ${userLanguage}, Región: ${userRegion}, País: ${userCountry}`);
            
            // 🔥 ACTUALIZAR IDIOMA EN i18n
            if (user?.language) {
                setLocale(user.language);
            }
            
            initSocket();
            updateHeaderUI(user);
            
            // 🔥 VERIFICAR PREFERENCIAS
            const preferencesDone = hasPreferencesDone();
            const hasInterests = user?.interests && user.interests.length > 0;
            
            if (!preferencesDone && !hasInterests) {
                console.log('🎯 Primera vez - Mostrando preferencias');
                await showPreferencesScreen();
                // Esperar a que el usuario complete o omita
                await new Promise(resolve => {
                    const check = () => {
                        if (hasPreferencesDone()) {
                            resolve();
                        } else {
                            setTimeout(check, 500);
                        }
                    };
                    // Si el usuario cierra la pantalla manualmente
                    const observer = new MutationObserver(() => {
                        const screen = document.getElementById('preferencesScreen');
                        if (!screen || !screen.classList.contains('active')) {
                            observer.disconnect();
                            resolve();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    // Timeout de seguridad
                    setTimeout(() => { observer.disconnect(); resolve(); }, 30000);
                });
                console.log('✅ Preferencias procesadas');
            }
            
            // 🔥🔥🔥 CARGAR CONTADOR DE NOTIFICACIONES
            setTimeout(() => {
                loadNotificationCount();
                refreshNotificationCount();
            }, 1500);
            
            feedCursor = restoreFeedCursor();
            
            // 🔥 ACTIVAR EL FILTRO GUARDADO EN LA UI
            const filterToApply = savedFilter || 'ranked';
            applyFilter(filterToApply);
            
            // 🔥 TRADUCIR UI DESPUÉS DE CARGAR
            setTimeout(() => {
                translateAll();
                translateFeedUI();
            }, 500);
            
            loadAdsInBackground();
            
            if (!isPreloadDone) {
                setTimeout(() => {
                    console.log('🔄 Pre-cargando perfil...');
                    preloadCurrentUserProfile();
                    isPreloadDone = true;
                }, 1500);
            }
            
            setupEvents();
            setupIOSOptimizations();
            console.log('✅ App lista con sesión');
        },
        onFail: () => {
            console.log('🔒 Sin sesión, mostrando login');
            showLoginScreen('feedContainer');
            setupEvents();
            setupIOSOptimizations();
            console.log('✅ App lista sin sesión');
        },
        containerId: 'feedContainer',
        autoCheck: true
    });
}

// ============================================================
// 🔥 TRADUCIR UI DEL FEED
// ============================================================

function translateFeedUI() {
    // Traducir textos del feed
    const emptyStates = document.querySelectorAll('.empty-state h3, .empty-state p');
    emptyStates.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // Traducir botones de filtros
    const filterBtns = document.querySelectorAll('.filter-btn');
    const filterKeys = ['feed.forYou', 'feed.recent', 'feed.ads'];
    filterBtns.forEach((btn, index) => {
        if (index < filterKeys.length) {
            const text = t(filterKeys[index]);
            if (text && text !== filterKeys[index]) {
                const icon = btn.querySelector('i');
                const existingText = btn.textContent.replace(/[^\w\s]/g, '').trim();
                btn.innerHTML = '';
                if (icon) btn.appendChild(icon);
                btn.appendChild(document.createTextNode(' ' + text));
            }
        }
    });
    
    // Traducir badges
    const badgeTexts = document.querySelectorAll('.new-badge-text');
    badgeTexts.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
}

// ============================================================
// 🔥 CARGAR PUBLICIDADES EN SEGUNDO PLANO
// ============================================================

async function loadAdsInBackground() {
    if (isAdsLoaded) return;
    try {
        activeAds = await loadActiveAds();
        isAdsLoaded = true;
        console.log(`📢 ${activeAds.length} publicidades cargadas en segundo plano`);
    } catch (error) {
        console.error('Error cargando publicidades:', error);
    }
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
                likes: data.likes,
                senderId: data.userId,
                liked: data.liked
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

    // 🔥🔥🔥 EVENTOS DE NOTIFICACIONES EN TIEMPO REAL
    socket.on('new_notification', (notification) => {
        console.log('🔔 Nueva notificación recibida en tiempo real');
        
        // Actualizar contador automáticamente
        setTimeout(() => {
            loadNotificationCount();
            refreshNotificationCount();
        }, 500);
    });

    socket.on('notification_count_updated', (data) => {
        console.log(`🔔 Contador actualizado vía socket: ${data.unreadCount}`);
        
        const navBadge = document.getElementById('navNotifBadge');
        if (navBadge) {
            if (data.unreadCount > 0) {
                navBadge.style.display = 'flex';
                navBadge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
            } else {
                navBadge.style.display = 'none';
            }
        }
        
        const headerBadge = document.querySelector('.icon-btn .badge');
        if (headerBadge) {
            if (data.unreadCount > 0) {
                headerBadge.style.display = 'flex';
                headerBadge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
            } else {
                headerBadge.style.display = 'none';
            }
        }
    });

    socket.on('notification_read', (data) => {
        console.log(`🔔 Notificación ${data.notificationId} marcada como leída`);
        setTimeout(() => {
            loadNotificationCount();
            refreshNotificationCount();
        }, 300);
    });

    socket.on('all_notifications_read', () => {
        console.log('🔔 Todas las notificaciones marcadas como leídas');
        setTimeout(() => {
            loadNotificationCount();
            refreshNotificationCount();
        }, 300);
    });

    socket.on('notification_deleted', (data) => {
        console.log(`🔔 Notificación ${data.notificationId} eliminada`);
        setTimeout(() => {
            loadNotificationCount();
            refreshNotificationCount();
        }, 300);
    });

    socket.on('all_notifications_cleared', () => {
        console.log('🔔 Todas las notificaciones eliminadas');
        setTimeout(() => {
            loadNotificationCount();
            refreshNotificationCount();
        }, 300);
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
        textEl.textContent = pendingNewStories === 1 ? (t('feed.newStory') || 'Nueva historia') : (t('feed.newStories') || 'Nuevas historias');
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
// 🔥 FETCH FEED POR CURSOR - CON GUARDADO EN INDEXEDDB
// ============================================================

async function fetchFeedByCursor(filter, cursor = null) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para ver historias', true);
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

        const now = Date.now();

        if (filter === 'recent') {
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age < TEN_MINUTES;
            });
            console.log(`📊 [RECIENTES] ${stories.length} historias con menos de 10 minutos`);
            stories = stories.filter(s => !isViewedInRecent(s.id));
            
        } else if (filter === 'ranked') {
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age >= TEN_MINUTES;
            });
            console.log(`📊 [PARA TI] ${stories.length} historias con más de 10 minutos`);
            stories = stories.filter(s => !isStoryViewed(s.id));
        } else if (filter === 'ads') {
            stories = [];
        }

        const currentUser = getCurrentUser();
        if (currentUser && filter !== 'ads') {
            stories = stories.filter(s => s.userId !== currentUser.id);
        }

        if (filter !== 'ads') {
            stories = stories.filter(s => !s.hidden);
        }

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

        if (cursor === null || cursor === 'null') {
            displayedStories = enrichedStories;
        } else {
            const existingIds = new Set(displayedStories.map(s => s.id));
            const newStories = enrichedStories.filter(s => !existingIds.has(s.id));
            displayedStories = [...displayedStories, ...newStories];
        }

        if (nextCursor) {
            feedCursor = nextCursor;
            saveFeedCursor(feedCursor);
        } else {
            hasMoreStories = false;
        }

        console.log(`📊 ${filter} - Mostrando ${displayedStories.length} historias`);

        // 🔥🔥🔥 NUEVO: GUARDAR FEED EN INDEXEDDB (solo si hay historias y no es ads)
        if (displayedStories.length > 0 && filter !== 'ads') {
            try {
                const user = getCurrentUser();
                if (user) {
                    const cacheKey = `feed_${filter}_${user.id}`;
                    await clientCache.set(cacheKey, {
                        stories: displayedStories,
                        pagination: pagination,
                        filter: filter,
                        cursor: feedCursor,
                        hasMore: hasMoreStories,
                        timestamp: Date.now()
                    }, filter === 'recent' ? 120000 : 300000); // 2 min para recientes, 5 min para ranked
                    console.log(`📦 Feed ${filter} guardado en IndexedDB (${displayedStories.length} historias)`);
                }
            } catch (e) {
                console.warn('⚠️ Error guardando feed en IndexedDB:', e);
            }
        }

        // 🔥 GUARDAR HISTORIAS INDIVIDUALES EN INDEXEDDB
        for (const story of displayedStories) {
            if (story.expiresAt) {
                const ttl = Math.max(0, new Date(story.expiresAt).getTime() - Date.now());
                if (ttl > 0) {
                    try {
                        await clientCache.set(`story_${story.id}`, story, ttl);
                    } catch (e) {
                        // Silencioso para no saturar consola
                    }
                }
            }
        }

        // 🔥 Si es el filtro de publicidad, mostrar anuncios
        if (filter === 'ads') {
            renderAdsFeed(activeAds);
        } else {
            renderFeed(displayedStories);
        }
        isLoading = false;

        if (hasMoreStories && displayedStories.length > 0 && filter !== 'ads') {
            preloadNextPage();
        }

    } catch (error) {
        console.error('Error cargando feed por cursor:', error);
        if (displayedStories.length === 0 && allStories.length === 0) {
            showToast(t('error.general') || 'Error al cargar el feed', true);
        }
        isLoading = false;
    }
}

// ============================================================
// 🔥 RENDER PUBLICIDADES EN EL FEED
// ============================================================

function renderAdsFeed(ads) {
    const container = document.getElementById('feedContainer');
    if (!container) return;

    if (!ads || ads.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bullhorn" style="color:#fbbf24;"></i>
                <h3>${t('feed.noAds') || 'No hay publicidades disponibles'}</h3>
                <p>${t('feed.noAdsDesc') || 'Las empresas aún no han publicado anuncios'}</p>
            </div>
        `;
        return;
    }

    const adsHtml = renderAds(ads, container);
    container.innerHTML = adsHtml;

    // Event listeners para publicidades
    container.querySelectorAll('.ad-like-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const adId = btn.dataset.adId;
            window.handleAdLike(adId, btn);
        });
    });

    container.querySelectorAll('.ad-share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const adId = btn.dataset.adId;
            const url = `${window.location.origin}/ad/${adId}`;
            if (navigator.share) {
                navigator.share({ title: t('ads.share') || 'Vygorax - Publicidad', url });
            } else {
                navigator.clipboard?.writeText(url).then(() => {
                    showToast(t('action.copied') || '📋 Enlace copiado');
                });
            }
        });
    });

    // Registrar vistas de publicidades
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const adId = card.dataset.adId;
                if (adId) {
                    registerAdView(adId);
                }
            }
        });
    }, { threshold: 0.3 });

    container.querySelectorAll('.ad-card').forEach(card => {
        observer.observe(card);
    });
}

// ============================================================
// 🔥 FETCH USERS
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
    if (!hasMoreStories || isLoadingMore || currentFilter === 'ads') return;
    
    preloadTimeout = setTimeout(() => {
        console.log(`🔄 Pre-cargando siguiente página (cursor: ${feedCursor})...`);
        loadMoreStories(true);
    }, 1500);
}

// ============================================================
// 🔥 LOAD MORE STORIES - CON GUARDADO EN INDEXEDDB
// ============================================================

async function loadMoreStories(preload = false) {
    if (isLoadingMore || !hasMoreStories || currentFilter === 'ads') return;
    
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
        
        const now = Date.now();

        if (currentFilter === 'recent') {
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age < TEN_MINUTES;
            });
            stories = stories.filter(s => !isViewedInRecent(s.id));
            
        } else if (currentFilter === 'ranked') {
            stories = stories.filter(s => {
                const createdAt = new Date(s.createdAt).getTime();
                const age = now - createdAt;
                return age >= TEN_MINUTES;
            });
            stories = stories.filter(s => !isStoryViewed(s.id));
        }
        
        const currentUser = getCurrentUser();
        if (currentUser) {
            stories = stories.filter(s => s.userId !== currentUser.id);
        }
        stories = stories.filter(s => !s.hidden);
        
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
            
            // 🔥 ACTUALIZAR CACHÉ CON NUEVAS HISTORIAS
            if (displayedStories.length > 0 && currentFilter !== 'ads') {
                try {
                    const user = getCurrentUser();
                    if (user) {
                        const cacheKey = `feed_${currentFilter}_${user.id}`;
                        await clientCache.set(cacheKey, {
                            stories: displayedStories,
                            pagination: pagination,
                            filter: currentFilter,
                            cursor: feedCursor,
                            hasMore: hasMoreStories,
                            timestamp: Date.now()
                        }, currentFilter === 'recent' ? 120000 : 300000);
                    }
                } catch (e) {
                    console.warn('⚠️ Error actualizando feed en caché:', e);
                }
            }
            
            // 🔥 GUARDAR NUEVAS HISTORIAS INDIVIDUALES
            for (const story of newStories) {
                if (story.expiresAt) {
                    const ttl = Math.max(0, new Date(story.expiresAt).getTime() - Date.now());
                    if (ttl > 0) {
                        try {
                            await clientCache.set(`story_${story.id}`, story, ttl);
                        } catch (e) {
                            // Silencioso
                        }
                    }
                }
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
        fetchFeedByCursor(currentFilter, feedCursor);
        refreshTimeout = null;
    }, 5000);
}

// ============================================================
// 🔥 APLICAR FILTRO - CON SELECCIÓN VISUAL CORREGIDA
// ============================================================

function applyFilter(filter) {
    const token = getToken();
    
    if (!token) {
        console.log('🔒 Sin sesión - Abriendo modal de login');
        showToast(t('error.unauthorized') || 'Inicia sesión para ver historias', true);
        openLoginModal();
        return;
    }

    console.log(`📂 Aplicando filtro: ${filter}`);
    
    saveFilterState(filter);
    currentFilter = filter;
    
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    
    let activeBtn = null;
    if (filter === 'ranked') {
        activeBtn = document.getElementById('filterRanked');
    } else if (filter === 'recent') {
        activeBtn = document.getElementById('filterRecent');
    } else if (filter === 'ads') {
        activeBtn = document.getElementById('filterTrending');
    }
    
    if (activeBtn) {
        activeBtn.classList.add('active');
        console.log(`✅ Filtro activado en UI: ${filter}`);
    }

    if (filter !== 'recent') {
        hideNewStoriesBadge();
    }

    displayedStories = [];
    feedCursor = null;
    hasMoreStories = true;
    totalRemaining = 0;

    if (filter === 'ads') {
        if (activeAds.length === 0) {
            loadAdsInBackground().then(() => {
                renderAdsFeed(activeAds);
            });
        } else {
            renderAdsFeed(activeAds);
        }
        return;
    }

    // 🔥🔥🔥 NUEVO: INTENTAR CARGAR DESDE INDEXEDDB PRIMERO
    (async () => {
        try {
            const user = getCurrentUser();
            if (user) {
                const cacheKey = `feed_${filter}_${user.id}`;
                const cachedData = await clientCache.get(cacheKey);
                
                if (cachedData && cachedData.stories && cachedData.stories.length > 0) {
                    console.log(`📦 Cargando feed ${filter} desde IndexedDB (${cachedData.stories.length} historias)`);
                    displayedStories = cachedData.stories;
                    feedCursor = cachedData.cursor || null;
                    hasMoreStories = cachedData.hasMore || true;
                    renderFeed(displayedStories);
                    // Actualizar en segundo plano
                    setTimeout(() => {
                        fetchFeedByCursor(filter, feedCursor);
                    }, 500);
                    return;
                }
            }
        } catch (e) {
            console.warn('⚠️ Error cargando feed desde IndexedDB:', e);
        }
        
        // Si no hay caché, cargar normal
        const savedCursor = restoreFeedCursor();
        if (savedCursor && savedCursor !== 'null') {
            feedCursor = savedCursor;
            console.log(`📍 Usando cursor guardado: ${feedCursor}`);
        }
        fetchFeedByCursor(filter, feedCursor);
    })();
}

// ============================================================
// REGIONES CERCANAS
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
            <p>${currentFilter === 'ranked' ? (t('feed.newStoriesInRecent') || 'Las historias nuevas (menos de 10 minutos) aparecen en RECIENTES') : ''}</p>
        </div>
    `;
}

// ============================================================
// 🔥 RENDER FEED - CON SOPORTE PARA ENCUESTAS (SURVEY)
// 🔥 CORREGIDO: Race condition en registro de vistas con debounce
// ============================================================

function renderFeed(storiesData) {
    const container = document.getElementById('feedContainer');
    if (!container) return;

    if (!storiesData || storiesData.length === 0) {
        const messages = {
            ranked: t('feed.noStoriesRanked') || 'No hay historias disponibles para ti',
            recent: t('feed.noStoriesRecent') || 'No hay historias recientes en tu región',
            public: t('feed.noStoriesPublic') || 'No hay historias públicas disponibles'
        };
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-camera"></i>
                <h3>${messages[currentFilter] || t('feed.noStories') || 'No hay historias'}</h3>
                <p>${currentFilter === 'ranked' ? (t('feed.rankedDesc') || 'Vuelve más tarde para ver nuevas historias') : currentFilter === 'recent' ? (t('feed.recentDesc') || 'Espera a que alguien publique en tu país/región') : currentFilter === 'public' ? (t('feed.publicDesc') || 'Inicia sesión para ver más contenido') : ''}</p>
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
                <span class="lang-badge">
                    ${langInfo?.flag || '🌐'} ${langInfo?.name || contentLanguage}
                </span>
            `;
        }

        let translationBadge = '';
        if (isTranslated && isDifferentLanguage) {
            translationBadge = `
                <span class="translation-badge">
                    <i class="fas fa-language"></i> ${t('story.translated') || 'Traducido'}
                </span>
            `;
        }

        let translateBtn = '';
        if (isDifferentLanguage) {
            const btnText = isTranslated ? (t('story.showOriginal') || 'Mostrar original') : (t('story.translate') || 'Traducir');
            const btnIcon = isTranslated ? 'fa-undo' : 'fa-language';
            translateBtn = `
                <button class="btn-translate" data-story-id="${story.id}">
                    <i class="fas ${btnIcon}"></i> ${btnText}
                </button>
            `;
        }

        let subtitlesBadge = '';
        if (story.hasSubtitles && story.subtitles) {
            subtitlesBadge = `
                <span class="subtitles-badge">
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
                    <span class="location-badge">
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
        } else if (story.mediaType === 'survey' && story.surveyData) {
            const survey = story.surveyData;
            const surveyType = survey.surveyType || 'poll';
            const question = survey.question || 'Encuesta';
            
            let surveyContent = '';
            
            if (surveyType === 'poll') {
                const options = survey.options || [];
                const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0);
                
                surveyContent = `
                    <div class="survey-poll">
                        <div class="survey-question">${escapeHtml(question)}</div>
                        <div class="survey-options">
                            ${options.map(opt => {
                                const percentage = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                                const color = opt.color || '#c084fc';
                                return `
                                    <div class="survey-option">
                                        <div class="survey-option-label">${escapeHtml(opt.label)}</div>
                                        <div class="survey-option-bar">
                                            <div class="survey-option-fill" style="width:${percentage}%;background:${color}"></div>
                                        </div>
                                        <div class="survey-option-stats">${percentage}% (${opt.votes || 0})</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="survey-total">${totalVotes} ${t('survey.votes') || 'votos'}</div>
                    </div>
                `;
            } else if (surveyType === 'stats') {
                const statsData = survey.statsData || [];
                const maxValue = Math.max(...statsData.map(d => d.value || 0), 1);
                
                surveyContent = `
                    <div class="survey-stats">
                        <div class="survey-question">${escapeHtml(question)}</div>
                        <div class="survey-stats-bars">
                            ${statsData.map(stat => {
                                const percentage = Math.round((stat.value || 0) / maxValue * 100);
                                const color = stat.color || '#c084fc';
                                return `
                                    <div class="survey-stat-item">
                                        <div class="survey-stat-label">${escapeHtml(stat.label)}</div>
                                        <div class="survey-stat-bar">
                                            <div class="survey-stat-fill" style="width:${percentage}%;background:${color}"></div>
                                        </div>
                                        <div class="survey-stat-value">${stat.value || 0}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else if (surveyType === 'calculation') {
                const calc = survey.calculation || {};
                surveyContent = `
                    <div class="survey-calculation">
                        <div class="survey-question">${escapeHtml(question)}</div>
                        <div class="survey-calc-result">
                            <span class="survey-calc-label">${escapeHtml(calc.operation || 'Resultado')}</span>
                            <span class="survey-calc-value">${escapeHtml(calc.result || '0')}</span>
                            ${calc.formula ? `<div class="survey-calc-formula">${escapeHtml(calc.formula)}</div>` : ''}
                        </div>
                    </div>
                `;
            }
            
            mediaHtml = `
                <div class="survey-container" onclick="window.handleStoryView('${story.id}')">
                    ${surveyContent}
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="text-placeholder" style="background:#1a1a2e;">
                    <i class="fas fa-book-open" style="color:#c084fc;font-size:40px;margin-bottom:12px;display:block;"></i>
                    <span>${t('story.noContent') || 'Historia sin contenido'}</span>
                </div>
            `;
        }

        const captionHtml = story.caption ? 
            story.caption.replace(/#([a-zA-Z0-9_]+)/g, '<span class="hashtag">#$1</span>') : '';

        html += `
            <div class="story-card" data-index="${index}" data-story-id="${story.id}" data-viewed="false">
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
                
                <div class="card-actions-center">
                    ${captionHtml ? `<div class="caption">${captionHtml}</div>` : ''}
                    <div class="actions-box">
                        <div class="actions">
                            <div class="stats">
                                <span><i class="fas fa-eye"></i> <span id="view-count-${story.id}">${formatNumber(viewsCount)}</span></span>
                                <span><i class="fas fa-heart" id="heart-icon-${story.id}" style="color:${isLiked ? '#ff6b6b' : 'inherit'}"></i> <span id="like-count-${story.id}">${formatNumber(likesCount)}</span></span>
                                <span><i class="fas fa-comment"></i> <span id="comment-count-${story.id}">${formatNumber(commentsCount)}</span></span>
                            </div>
                            <div class="btns">
                                <button class="btn-like ${isLiked ? 'liked' : ''}" data-story-id="${story.id}">
                                    <i class="fas fa-heart"></i> ${isLiked ? (t('action.remove') || 'Quitar') : (t('feed.like') || 'Like')}
                                </button>
                                <button class="btn-comment" data-story-id="${story.id}">
                                    <i class="fas fa-comment"></i>
                                </button>
                                <button class="btn-share" data-story-id="${story.id}">
                                    <i class="fas fa-share-alt"></i>
                                </button>
                            </div>
                        </div>
                        ${translateBtn ? `<div style="text-align:center;margin-top:4px;">${translateBtn}</div>` : ''}
                    </div>
                </div>
                
                <div class="card-footer"></div>
            </div>
        `;
    });

    html += `
        <div id="feedEnd" style="height: 20px; display: ${hasMoreStories ? 'block' : 'none'};">
            <div style="text-align:center;padding:10px;color:rgba(255,255,255,0.1);font-size:12px;">
                <i class="fas fa-spinner fa-pulse"></i> ${t('feed.loading') || 'Cargando más...'}
            </div>
        </div>
    `;

    container.innerHTML = html;

    setupInfiniteScroll();

    // ============================================================
    // 🔥 CORREGIDO: Observer con debounce para evitar race condition
    // ============================================================
    
    let viewTimeout = null;
    let pendingViews = new Set();

    const observer = new IntersectionObserver((entries) => {
        if (viewTimeout) {
            clearTimeout(viewTimeout);
            viewTimeout = null;
        }

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const storyId = card.dataset.storyId;
                const isViewed = card.dataset.viewed === 'true';
                
                if (storyId && !isViewed && !isStoryViewed(storyId)) {
                    pendingViews.add(storyId);
                    card.dataset.viewed = 'true';
                }
            }
        });

        if (pendingViews.size > 0) {
            viewTimeout = setTimeout(() => {
                const viewsToRegister = Array.from(pendingViews);
                pendingViews.clear();
                
                viewsToRegister.forEach((storyId, index) => {
                    setTimeout(() => {
                        registerView(storyId);
                    }, index * 100);
                });
                
                viewTimeout = null;
            }, 300);
        }
    }, {
        threshold: 0.3,
        rootMargin: '0px 0px -50px 0px'
    });

    container.querySelectorAll('.story-card').forEach(card => {
        observer.observe(card);
    });

    window._viewObserver = observer;

    // ============================================================
    // 🔥 EVENTOS
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
                navigator.share({ title: t('story.share') || 'Vygorax - Historia', url });
            } else {
                navigator.clipboard?.writeText(url).then(() => {
                    showToast(t('action.copied') || '📋 Enlace copiado');
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
        if (entry.isIntersecting && hasMoreStories && !isLoadingMore && currentFilter !== 'ads') {
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
// 🔥 REGISTRAR VISTA
// ============================================================

async function registerView(storyId) {
    if (!storyId) return;
    if (isStoryViewed(storyId)) return;

    const token = getToken();
    if (!token) {
        console.log('🔒 Sin sesión - Abriendo modal de login');
        openLoginModal();
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
            
            const story = allStories.find(s => s.id === storyId);
            if (story && data.viewsCount !== undefined) {
                story.views = story.views || [];
            }
        }
    } catch (error) {
        console.error('❌ Error registrando vista:', error);
    }
}

// ============================================================
// TRADUCCIÓN
// ============================================================

window.translateStory = async function(storyId) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para traducir', true);
        openLoginModal();
        return;
    }

    if (!translationAvailable) {
        showToast(t('story.translateUnavailable') || '🌐 Servicio de traducción no disponible', true);
        return;
    }

    const idx = allStories.findIndex(s => s.id === storyId);
    if (idx === -1) {
        showToast(t('story.notFound') || 'Historia no encontrada', true);
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
        showToast(t('story.showingOriginal') || '📝 Mostrando original');
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
        showToast(`✅ ${t('story.translatedFromCache') || 'Traducción cargada (caché)'}`);
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
            showToast(t('story.noTextToTranslate') || 'No hay texto para traducir', true);
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
            showToast(`✅ ${t('story.translatedTo') || 'Traducido al'} ${data.languageInfo?.name || userLanguage}`);
        } else {
            showToast(t('story.translateFailed') || '📝 No se pudo traducir', true);
        }
    } catch (error) {
        console.error('❌ Error traduciendo:', error);
        showToast(t('error.general') || 'Error al traducir', true);
    } finally {
        if (card) {
            const translateBtn = card.querySelector('.btn-translate');
            if (translateBtn) {
                const isNowTranslated = allStories[idx]?.translated || false;
                const btnText = isNowTranslated ? (t('story.showOriginal') || 'Mostrar original') : (t('story.translate') || 'Traducir');
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
    
    const captionEl = card.querySelector('.card-actions-center .caption');
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
            badge.innerHTML = `<i class="fas fa-language"></i> ${t('story.translated') || 'Traducido'}`;
            nameEl.appendChild(badge);
        }
    }
    
    const translateBtn = card.querySelector('.btn-translate');
    if (translateBtn) {
        const isTranslated = updatedStory.translated || false;
        const btnText = isTranslated ? (t('story.showOriginal') || 'Mostrar original') : (t('story.translate') || 'Traducir');
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
        showToast(t('error.unauthorized') || 'Inicia sesión para dar like', true);
        openLoginModal();
        return;
    }

    const isLiked = btn.classList.contains('liked');
    const method = isLiked ? 'DELETE' : 'POST';

    try {
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
                liked: data.liked,
                likes: data.likes || [],
                senderId: (await getCurrentUser())?.id
            });

            const story = allStories.find(s => s.id === storyId);
            if (story && data.likes) {
                story.likes = data.likes;
            }

            showToast(data.liked ? '❤️ ' + (t('story.liked') || 'Like guardado') : '💔 ' + (t('story.unliked') || 'Like eliminado'));
        } else {
            showToast(data.error || t('error.general') || 'Error al procesar like', true);
        }
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast(t('error.general') || 'Error al procesar like', true);
    }
}

// ============================================================
// REFRESH FEED
// ============================================================

async function refreshFeed() {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para actualizar', true);
        openLoginModal();
        return;
    }
    
    console.log(`🔄 Refrescando feed: ${currentFilter}`);
    showToast('🔄 ' + (t('feed.updating') || 'Actualizando feed...'));
    
    hideNewStoriesBadge();
    
    const badge = document.getElementById('newBadge');
    if (badge) {
        badge.style.display = 'none';
        const countEl = document.getElementById('newBadgeCount');
        if (countEl) countEl.textContent = '0';
    }
    
    displayedStories = [];
    
    if (currentFilter === 'ads') {
        activeAds = await loadActiveAds();
        renderAdsFeed(activeAds);
    } else {
        await fetchFeedByCursor(currentFilter, feedCursor);
    }
}

// ============================================================
// 🔥 LIMPIAR CACHÉ DEL CLIENTE (al hacer logout)
// ============================================================

async function clearClientCache() {
    try {
        await clientCache.clear();
        console.log('🧹 Caché de IndexedDB limpiado');
    } catch (e) {
        console.warn('⚠️ Error limpiando caché:', e);
    }
}

// ============================================================
// 🔥🔥🔥 FUNCIONES GLOBALES
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
window.clearClientCache = clearClientCache;

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

window.openAdCreator = openAdCreator;
window.closeAdCreator = closeAdCreator;

window.showProfileNative = showProfileNative;
window.hideProfileNative = hideProfileNative;

window.loadPendingStories = () => {
    refreshFeed();
};

window.handleAdClick = async function(adId) {
    await registerAdClick(adId);
};

window.handleAdLike = async function(adId, btn) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para dar like', true);
        openLoginModal();
        return;
    }

    const isLiked = btn.classList.contains('liked');
    const method = isLiked ? 'DELETE' : 'POST';

    try {
        const res = await fetch(`${API_URL}/api/ads/${adId}/like`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            btn.classList.toggle('liked');
            btn.innerHTML = data.liked ? '<i class="fas fa-heart"></i> ' + (t('action.remove') || 'Quitar') : '<i class="fas fa-heart"></i> ' + (t('feed.like') || 'Like');
            showToast(data.liked ? '❤️ ' + (t('story.liked') || 'Like guardado') : '💔 ' + (t('story.unliked') || 'Like eliminado'));
        }
    } catch (error) {
        console.error('Error dando like a publicidad:', error);
        showToast(t('error.general') || 'Error al procesar like', true);
    }
};

// ============================================================
// goToProfileUser
// ============================================================

window.goToProfileUser = (userId) => {
    if (!userId) {
        console.warn('⚠️ goToProfileUser: userId no proporcionado');
        return;
    }
    
    const currentUser = getCurrentUser();
    
    console.log(`👤 goToProfileUser: ${userId}, usuario actual: ${currentUser?.id}`);
    
    closeExploreModal();
    closeActivityModal();
    closeStoryModal();
    closeCreator();
    closeEditProfileModal();
    closeAdCreator();
    
    if (typeof openProfileModal === 'function') {
        openProfileModal(userId);
    } else {
        import('./profile-modal.js').then(({ openProfileModal: openModal }) => {
            openModal(userId);
        }).catch(err => {
            console.error('❌ Error abriendo perfil:', err);
            showToast(t('error.general') || 'Error al abrir perfil', true);
        });
    }
};

// ============================================================
// EVENTOS
// ============================================================

function setupEvents() {
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para configurar', true);
            openLoginModal();
            return;
        }
        const user = getCurrentUser();
        if (user?.id) {
            if (typeof window.openEditProfileModal === 'function') {
                window.openEditProfileModal(user);
            } else {
                showToast(t('error.general') || 'Error al abrir configuración', true);
            }
        } else {
            showToast(t('error.unauthorized') || 'Inicia sesión para configurar', true);
            openLoginModal();
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
            closeProfileModal();
            closeAdCreator();
            
            showProfileNative(user.id);
        } else {
            showToast(t('error.unauthorized') || 'Inicia sesión', true);
            openLoginModal();
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
            closeProfileModal();
            closeAdCreator();
            
            document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
            document.getElementById('navProfile').classList.add('active');
            
            showProfileNative(user.id);
        } else {
            showToast(t('error.unauthorized') || 'Inicia sesión', true);
            openLoginModal();
        }
    });

    document.querySelector('.logo')?.addEventListener('dblclick', () => {
        refreshFeed();
    });

    document.getElementById('createBtn')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para crear contenido', true);
            openLoginModal();
            return;
        }
        
        const user = getCurrentUser();
        const isBusiness = user?.accountType === 'business' || user?.accountType === 'business_verified';
        
        if (isBusiness) {
            openAdCreator();
        } else {
            openCreator();
        }
    });

    // 🔥 FILTROS - CORREGIDO
    document.getElementById('filterRanked')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para ver historias', true);
            openLoginModal();
            return;
        }
        
        hideNewStoriesBadge();
        applyFilter('ranked');
    });

    document.getElementById('filterRecent')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para ver historias', true);
            openLoginModal();
            return;
        }
        
        if (pendingNewStories > 0) {
            showNewStoriesBadge();
        }
        applyFilter('recent');
    });

    document.getElementById('filterTrending')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para ver publicidades', true);
            openLoginModal();
            return;
        }
        
        hideNewStoriesBadge();
        applyFilter('ads');
    });

    // BOTTOM NAV
    document.getElementById('navFeed')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para ver el feed', true);
            openLoginModal();
            return;
        }
        
        closeExploreModal();
        closeActivityModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        closeAdCreator();
        
        const section = document.getElementById('sectionProfile');
        if (section && !section.classList.contains('hidden')) {
            hideProfileNative();
        }
        
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('navFeed').classList.add('active');
        
        const savedFilter = restoreFilterState();
        if (savedFilter) {
            applyFilter(savedFilter);
        } else {
            applyFilter('ranked');
        }
    });

    document.getElementById('navExplore')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para explorar', true);
            openLoginModal();
            return;
        }
        
        closeActivityModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        closeAdCreator();
        
        const section = document.getElementById('sectionProfile');
        if (section && !section.classList.contains('hidden')) {
            hideProfileNative();
        }
        
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('navExplore').classList.add('active');
        
        setTimeout(() => {
            openExploreModal();
        }, 100);
    });

    document.getElementById('navNotifications')?.addEventListener('click', () => {
        const token = getToken();
        if (!token) {
            showToast(t('error.unauthorized') || 'Inicia sesión para ver notificaciones', true);
            openLoginModal();
            return;
        }
        
        closeExploreModal();
        closeStoryModal();
        closeCreator();
        closeEditProfileModal();
        closeProfileModal();
        closeAdCreator();
        
        const section = document.getElementById('sectionProfile');
        if (section && !section.classList.contains('hidden')) {
            hideProfileNative();
        }
        
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
            closeAdCreator();
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