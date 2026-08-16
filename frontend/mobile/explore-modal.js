// explore-modal.js - BÚSQUEDA HÍBRIDA CON CLASIFICACIÓN POR CATEGORÍAS
// Y SUPERPOSICIÓN DE MODALES - VERSIÓN COMPLETA ACTUALIZADA
// 🔥 CORREGIDO: Tabs siempre clickeables, se limpia búsqueda al cambiar de tab
// 🔥 NUEVO: Clasificación por categorías usando ContentClassifier
// 🔥 NUEVO: Soporte para /api/vyin/classify y /api/vyin/classify-story
// 🔥 NUEVO: Soporte para i18n (traducción de interfaz)
// 🔥 CORREGIDO: Miniaturas de historias con URLs correctas

import { getToken, getCurrentUser, showToast, getAvatar } from './auth.js';
import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';
import { t, translateAll, onLocaleChange } from './i18n.js';

const API_URL = window.location.origin;

let exploreOverlay = null;
let isOpen = false;
let currentTab = 'trending';
let searchTimeout = null;
let hashtagStoriesCache = new Map();
let currentSearchResults = [];
let currentSearchQuery = '';
let searchInProgress = false;
let savedTab = 'trending';
let lastLoadedData = null;
let savedScrollPosition = 0;
let isSearchMode = false;
let currentUsers = [];
let currentStories = [];
let currentMeta = {};
let localeUnsubscribe = null;

// ============================================================
// 🔥 CACHÉ EN localStorage PARA USUARIOS POPULARES
// ============================================================

const CACHE_KEYS = {
    POPULAR_USERS: 'explore_popular_users',
    TRENDING_HASHTAGS: 'explore_trending_hashtags',
    RECENT_STORIES: 'explore_recent_stories',
    SEARCH_RESULTS: 'explore_search_results',
    STATE: 'explore_state'
};

const CACHE_TTL = 5 * 60 * 1000;

function saveToCache(key, data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Error guardando en caché:', e);
    }
}

function getFromCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        
        const cached = JSON.parse(raw);
        if (Date.now() - cached.timestamp > CACHE_TTL) {
            localStorage.removeItem(key);
            return null;
        }
        return cached.data;
    } catch (e) {
        console.warn('Error leyendo caché:', e);
        return null;
    }
}

function saveExploreState(tab, query = '', results = [], scrollPos = 0, isSearch = false, users = [], stories = [], meta = {}) {
    try {
        const state = {
            tab: tab,
            query: query,
            results: results.slice(0, 50),
            scrollPosition: scrollPos,
            isSearchMode: isSearch,
            users: users.slice(0, 50),
            stories: stories.slice(0, 50),
            meta: meta,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEYS.STATE, JSON.stringify(state));
    } catch (e) {
        console.warn('Error guardando estado:', e);
    }
}

function getExploreState() {
    try {
        const raw = localStorage.getItem(CACHE_KEYS.STATE);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (Date.now() - state.timestamp > CACHE_TTL) {
            localStorage.removeItem(CACHE_KEYS.STATE);
            return null;
        }
        return state;
    } catch (e) {
        return null;
    }
}

function clearExploreCache() {
    Object.values(CACHE_KEYS).forEach(key => {
        try {
            localStorage.removeItem(key);
        } catch (e) {}
    });
    hashtagStoriesCache.clear();
    lastLoadedData = null;
}

// ============================================================
// 🔥 ESCUCHAR CAMBIOS DE IDIOMA
// ============================================================

function initI18nForExplore() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    
    localeUnsubscribe = onLocaleChange(() => {
        if (isOpen) {
            translateExploreUI();
        }
    });
}

// ============================================================
// 🔥 TRADUCIR UI DEL EXPLORE
// ============================================================

function translateExploreUI() {
    const overlay = document.getElementById('exploreOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    
    console.log('🌐 Traduciendo UI de explorar...');
    
    // Traducir título
    const title = overlay.querySelector('.explore-header h2');
    if (title) {
        const icon = title.querySelector('i');
        const text = t('explore.title');
        if (text && text !== 'explore.title') {
            title.innerHTML = '';
            if (icon) title.appendChild(icon);
            title.appendChild(document.createTextNode(' ' + text));
        }
    }
    
    // Traducir placeholder de búsqueda
    const searchInput = overlay.querySelector('#exploreSearchInput');
    if (searchInput) {
        const placeholder = t('explore.searchPlaceholder');
        if (placeholder && placeholder !== 'explore.searchPlaceholder') {
            searchInput.placeholder = placeholder;
        }
    }
    
    // Traducir tabs
    const tabs = overlay.querySelectorAll('.explore-tabs button');
    const tabKeys = ['trending', 'stories', 'users'];
    const tabLabels = [
        t('explore.trending') || '🔥 Tendencias',
        t('explore.stories') || '📸 Historias',
        t('explore.users') || '👥 Usuarios'
    ];
    
    tabs.forEach((btn, index) => {
        if (index < tabKeys.length && tabLabels[index]) {
            const icon = btn.textContent.match(/^[^\s]+/)?.[0] || '';
            btn.textContent = tabLabels[index];
            if (icon && !btn.textContent.startsWith(icon)) {
                btn.textContent = icon + ' ' + tabLabels[index];
            }
        }
    });
    
    // Traducir texto de carga
    const loadingTexts = overlay.querySelectorAll('.explore-empty h3, .explore-empty p');
    loadingTexts.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    console.log('✅ UI de explorar traducida');
}

// ============================================================
// CREAR ELEMENTOS DEL MODAL
// ============================================================

function createExploreModal() {
    if (document.querySelector('.explore-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'explore-overlay';
    overlay.id = 'exploreOverlay';
    
    overlay.innerHTML = `
        <div class="explore-header">
            <h2><i class="fas fa-compass"></i> ${t('explore.title') || 'Explorar'}</h2>
            <button class="close-btn" id="closeExplore">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="explore-body" id="exploreBody">
            <div class="explore-search">
                <i class="fas fa-search search-icon"></i>
                <input 
                    type="text" 
                    id="exploreSearchInput" 
                    placeholder="${t('explore.searchPlaceholder') || 'Buscar en cualquier idioma...'}"
                    autocomplete="off"
                />
                <span style="font-size:9px;color:rgba(255,255,255,0.1);margin-left:8px;">
                    🔍 ${t('explore.hybrid') || 'Híbrida (literal + semántica + categorías)'}
                </span>
            </div>
            
            <div class="explore-tabs">
                <button class="active" data-tab="trending">🔥 ${t('explore.trending') || 'Tendencias'}</button>
                <button data-tab="stories">📸 ${t('explore.stories') || 'Historias'}</button>
                <button data-tab="users">👥 ${t('explore.users') || 'Usuarios'}</button>
            </div>
            
            <div id="exploreContent">
                <div class="explore-empty">
                    <i class="fas fa-spinner fa-pulse"></i>
                    <h3 data-i18n="modal.loading">${t('modal.loading') || 'Cargando...'}</h3>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    exploreOverlay = overlay;
    
    initI18nForExplore();
    
    overlay.querySelector('#closeExplore').addEventListener('click', closeExploreModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeExploreModal();
    });
    
    // TABS SIEMPRE CLICKEABLES
    overlay.querySelectorAll('.explore-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            const searchInput = overlay.querySelector('#exploreSearchInput');
            if (searchInput && searchInput.value.trim().length > 0) {
                console.log('🧹 Limpiando búsqueda al cambiar de tab');
                searchInput.value = '';
                currentSearchQuery = '';
                currentSearchResults = [];
                currentUsers = [];
                currentStories = [];
                currentMeta = {};
                isSearchMode = false;
                updateTabsVisualState(false);
            }
            
            switchExploreTab(tab);
        });
    });
    
    const searchInput = overlay.querySelector('#exploreSearchInput');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        currentSearchQuery = query;
        
        if (query.length >= 2) {
            isSearchMode = true;
            updateTabsVisualState(true);
            performSmartSearch(query);
        } else if (query.length === 0) {
            console.log('🧹 Campo de búsqueda vacío, volviendo a modo normal');
            currentSearchResults = [];
            currentUsers = [];
            currentStories = [];
            currentMeta = {};
            isSearchMode = false;
            updateTabsVisualState(false);
            loadExploreDataWithCache(currentTab);
        }
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query.length >= 2) {
                clearTimeout(searchTimeout);
                isSearchMode = true;
                updateTabsVisualState(true);
                performSmartSearch(query);
            } else if (query.length === 0) {
                isSearchMode = false;
                updateTabsVisualState(false);
                loadExploreDataWithCache(currentTab);
            }
        }
    });
    
    const content = document.getElementById('exploreContent');
    if (content) {
        content.addEventListener('scroll', () => {
            if (isOpen && isSearchMode) {
                savedScrollPosition = content.scrollTop;
            }
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeExploreModal();
        }
    });
}

// ============================================================
// 🔥 ACTUALIZAR ESTADO VISUAL DE TABS (sin bloquear)
// ============================================================

function updateTabsVisualState(isSearchActive) {
    const tabs = exploreOverlay?.querySelectorAll('.explore-tabs button');
    if (!tabs) return;
    
    tabs.forEach(btn => {
        const tab = btn.dataset.tab;
        const isActive = tab === currentTab;
        
        if (isSearchActive) {
            btn.classList.remove('active');
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
        } else {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

// ============================================================
// 🔥 LIMPIAR MODO DE BÚSQUEDA
// ============================================================

function clearSearchMode() {
    isSearchMode = false;
    currentSearchQuery = '';
    currentSearchResults = [];
    currentUsers = [];
    currentStories = [];
    currentMeta = {};
    savedScrollPosition = 0;
    updateTabsVisualState(false);
}

// ============================================================
// 🔥 ACTIVAR MODO DE BÚSQUEDA
// ============================================================

function activateSearchMode() {
    isSearchMode = true;
    updateTabsVisualState(true);
}

// ============================================================
// 🔥 FILTRAR USUARIOS PÚBLICOS
// ============================================================

function filterPublicUsers(users) {
    if (!users || !Array.isArray(users)) return [];
    
    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;
    
    return users.filter(user => {
        if (user.id === currentUserId) return true;
        return user.privacy === 'public' || user.privacy === undefined;
    });
}

function filterPublicStories(stories) {
    if (!stories || !Array.isArray(stories)) return [];
    
    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;
    
    return stories.filter(story => {
        if (story.userId === currentUserId) return true;
        if (story.user?.privacy === 'private' || story.user?.privacy === 'followers') {
            return false;
        }
        return true;
    });
}

// ============================================================
// 🔥 ESCAPE HTML
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 🔥 CREAR MINIATURA DE HISTORIA (CORREGIDO)
// ============================================================

function createStoryThumbnail(story) {
    // 🔥 Determinar el contenido de la miniatura
    let mediaContent = '';
    const mediaUrl = story.mediaUrl || story.cloudinaryUrl || story.url || '';
    const mediaType = story.mediaType || 'image';
    
    // 🔥 OBTENER URL CORRECTA
    let displayUrl = mediaUrl;
    if (displayUrl && displayUrl.startsWith('/uploads/')) {
        displayUrl = window.location.origin + displayUrl;
    }
    
    if (mediaType === 'image' && displayUrl) {
        // 🔥 IMAGEN - Usar la URL correcta
        mediaContent = `
            <img src="${displayUrl}" loading="lazy" 
                 onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(255,255,255,0.15);font-size:32px;\\'>📸</div>'"
                 style="width:100%;height:100%;object-fit:cover;"
            />
        `;
    } else if (mediaType === 'video' && displayUrl) {
        // 🔥 VIDEO - Usar la URL correcta
        mediaContent = `
            <video src="${displayUrl}" muted loop playsinline preload="metadata" 
                   style="width:100%;height:100%;object-fit:cover;"
                   onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(255,255,255,0.15);font-size:32px;\\'>🎬</div>'"></video>
        `;
    } else if (mediaType === 'text' && story.textContent) {
        // 🔥 TEXTO - Mostrar el contenido del texto
        const textPreview = story.textContent.substring(0, 80) + (story.textContent.length > 80 ? '...' : '');
        mediaContent = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${story.textBgColor || '#1a1a2e'};padding:12px;text-align:center;font-size:13px;color:rgba(255,255,255,0.6);font-weight:500;overflow:hidden;line-height:1.4;">
                ${escapeHtml(textPreview)}
            </div>
        `;
    } else if (mediaType === 'survey') {
        // 🔥 ENCUESTA - Mostrar icono de encuesta
        const question = story.surveyData?.question || 'Encuesta';
        mediaContent = `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(192,132,252,0.3);font-size:24px;padding:12px;text-align:center;">
                <i class="fas fa-chart-pie" style="font-size:28px;margin-bottom:4px;"></i>
                <span style="font-size:10px;color:rgba(255,255,255,0.15);line-height:1.2;max-width:90%;">${escapeHtml(question.substring(0, 30))}</span>
            </div>
        `;
    } else if (mediaType === 'audio') {
        // 🔥 AUDIO - Mostrar icono de audio
        mediaContent = `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(192,132,252,0.3);font-size:24px;">
                <i class="fas fa-music" style="font-size:32px;"></i>
                <span style="font-size:10px;color:rgba(255,255,255,0.15);margin-top:4px;">🎵 Audio</span>
            </div>
        `;
    } else {
        // 🔥 FALLBACK - Si no hay URL válida
        const icon = mediaType === 'video' ? '🎬' : story.hasSubtitles ? '💬' : '📝';
        mediaContent = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(255,255,255,0.15);font-size:32px;">
                ${icon}
            </div>
        `;
    }

    // 🔥 Badge de subtítulos
    const subtitlesBadge = story.hasSubtitles ? 
        `<span class="subtitles-badge" style="position:absolute;top:6px;right:6px;z-index:5;background:rgba(192,132,252,0.2);padding:2px 6px;border-radius:4px;font-size:7px;color:#c084fc;backdrop-filter:blur(4px);border:1px solid rgba(192,132,252,0.1);">CC</span>` : '';

    // 🔥 Badge de idioma
    const langBadge = story.language && story.language !== 'es' ?
        `<span class="lang-badge" style="position:absolute;bottom:6px;right:6px;z-index:5;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;font-size:7px;color:rgba(255,255,255,0.15);">
            ${story.language.toUpperCase()}
        </span>` : '';

    // 🔥 Badge de relevancia (para búsquedas)
    let relevanceBadge = '';
    const relevance = story.relevanceScore || 0;
    if (relevance > 70) {
        relevanceBadge = `<span class="relevance-badge" style="position:absolute;top:6px;left:6px;z-index:5;background:rgba(34,197,94,0.2);padding:2px 6px;border-radius:4px;font-size:7px;color:#22c55e;backdrop-filter:blur(4px);border:1px solid rgba(34,197,94,0.1);">⭐ ${relevance}%</span>`;
    } else if (relevance > 40) {
        relevanceBadge = `<span class="relevance-badge" style="position:absolute;top:6px;left:6px;z-index:5;background:rgba(192,132,252,0.15);padding:2px 6px;border-radius:4px;font-size:7px;color:#c084fc;backdrop-filter:blur(4px);border:1px solid rgba(192,132,252,0.05);">🔍 ${relevance}%</span>`;
    }

    // 🔥 Badge de coincidencia de categoría
    let categoryBadge = '';
    if (story.categoryMatch && story.categoryName) {
        categoryBadge = `
            <span class="category-match-badge" style="position:absolute;bottom:6px;left:6px;z-index:5;background:rgba(192,132,252,0.2);padding:2px 6px;border-radius:4px;font-size:7px;color:#c084fc;backdrop-filter:blur(4px);border:1px solid rgba(192,132,252,0.1);">
                📂 ${story.categoryName}
            </span>
        `;
    }

    // 🔥 Badge de coincidencia de intereses
    let interestBadge = '';
    if (story.interestMatch) {
        interestBadge = `
            <span class="interest-match-badge" style="position:absolute;bottom:30px;left:6px;z-index:5;background:rgba(251,191,36,0.15);padding:2px 6px;border-radius:4px;font-size:7px;color:#fbbf24;backdrop-filter:blur(4px);border:1px solid rgba(251,191,36,0.1);">
                ⭐ Interés
            </span>
        `;
    }

    // 🔥 Texto de vista previa (subtítulos o caption)
    const previewText = story.subtitles || story.caption || story.textContent || '';
    const previewLabel = story.subtitles ? '💬' : (story.caption ? '📝' : '');

    return `
        <div class="story-thumb" onclick="window.openStoryFromExplore('${story.id}')" style="position:relative;cursor:pointer;border-radius:8px;overflow:hidden;aspect-ratio:1;background:rgba(255,255,255,0.02);">
            ${mediaContent}
            ${subtitlesBadge}
            ${langBadge}
            ${relevanceBadge}
            ${categoryBadge}
            ${interestBadge}
            <div class="overlay" style="position:absolute;bottom:0;left:0;right:0;padding:6px 8px;background:linear-gradient(0deg,rgba(0,0,0,0.7) 0%,transparent 100%);pointer-events:none;">
                <div class="likes" style="font-size:11px;color:#fff;font-weight:500;display:flex;align-items:center;gap:4px;text-shadow:0 1px 8px rgba(0,0,0,0.3);">
                    <i class="fas fa-heart" style="font-size:11px;color:#ff6b6b;"></i>
                    ${formatNumber(story.likes?.length || 0)}
                </div>
                ${previewText ? `<div class="subtitle-preview" style="font-size:9px;color:rgba(255,255,255,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;margin-top:2px;text-shadow:0 1px 4px rgba(0,0,0,0.5);">${previewLabel} ${escapeHtml(previewText.substring(0, 50))}${previewText.length > 50 ? '...' : ''}</div>` : ''}
            </div>
        </div>
    `;
}

// ============================================================
// ABRIR MODAL - RESTAURA EL ESTADO GUARDADO
// ============================================================

function openExploreModal(restoreState = true) {
    if (!exploreOverlay) createExploreModal();
    
    setTimeout(translateExploreUI, 100);
    
    if (restoreState) {
        const savedState = getExploreState();
        if (savedState) {
            console.log('📌 Restaurando estado guardado:', savedState);
            
            const tabToLoad = savedState.tab || 'trending';
            currentTab = tabToLoad;
            savedTab = tabToLoad;
            currentSearchQuery = savedState.query || '';
            savedScrollPosition = savedState.scrollPosition || 0;
            isSearchMode = savedState.isSearchMode || false;
            
            currentUsers = savedState.users || [];
            currentStories = savedState.stories || [];
            currentMeta = savedState.meta || {};
            
            updateTabsVisualState(isSearchMode);
            
            const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
            if (searchInput) {
                searchInput.value = savedState.query || '';
            }
            
            if (isSearchMode && savedState.query && (savedState.results?.length > 0 || savedState.users?.length > 0)) {
                currentSearchResults = savedState.results || [];
                
                const users = savedState.users || [];
                const stories = savedState.stories || [];
                const meta = savedState.meta || {};
                
                if (users.length > 0 || stories.length > 0) {
                    renderSearchResults(savedState.query, stories, users, meta);
                } else if (savedState.results && savedState.results.length > 0) {
                    renderSearchResults(savedState.query, savedState.results, [], {});
                }
                
                setTimeout(() => {
                    const content = document.getElementById('exploreContent');
                    if (content && savedState.scrollPosition) {
                        content.scrollTop = savedState.scrollPosition;
                    }
                }, 150);
                
                isOpen = true;
                exploreOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
                return;
            }
            
            isOpen = true;
            exploreOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            loadExploreDataWithCache(tabToLoad);
            return;
        }
    }
    
    const tabToLoad = savedTab || 'trending';
    currentTab = tabToLoad;
    currentSearchResults = [];
    currentSearchQuery = '';
    currentUsers = [];
    currentStories = [];
    currentMeta = {};
    searchInProgress = false;
    savedScrollPosition = 0;
    isSearchMode = false;
    
    updateTabsVisualState(false);
    
    const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
    if (searchInput) searchInput.value = '';
    
    isOpen = true;
    exploreOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    loadExploreDataWithCache(tabToLoad);
}

// ============================================================
// 🔥 MOSTRAR MODAL CON CACHÉ
// ============================================================

function showExploreModal() {
    if (!exploreOverlay) {
        createExploreModal();
        openExploreModal(true);
        return;
    }
    
    setTimeout(translateExploreUI, 100);
    
    console.log(`📌 Mostrando explore-modal (pestaña: ${savedTab || currentTab})`);
    
    const savedState = getExploreState();
    if (savedState) {
        const tabToShow = savedState.tab || currentTab || 'trending';
        currentTab = tabToShow;
        savedTab = tabToShow;
        savedScrollPosition = savedState.scrollPosition || 0;
        isSearchMode = savedState.isSearchMode || false;
        currentUsers = savedState.users || [];
        currentStories = savedState.stories || [];
        currentMeta = savedState.meta || {};
        
        updateTabsVisualState(isSearchMode);
        
        const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
        if (searchInput) {
            searchInput.value = savedState.query || '';
        }
        
        if (isSearchMode && savedState.query && (savedState.results?.length > 0 || savedState.users?.length > 0)) {
            currentSearchResults = savedState.results || [];
            currentSearchQuery = savedState.query;
            
            const users = savedState.users || [];
            const stories = savedState.stories || [];
            const meta = savedState.meta || {};
            
            if (users.length > 0 || stories.length > 0) {
                renderSearchResults(savedState.query, stories, users, meta);
            } else if (savedState.results && savedState.results.length > 0) {
                renderSearchResults(savedState.query, savedState.results, [], {});
            }
            
            setTimeout(() => {
                const content = document.getElementById('exploreContent');
                if (content && savedState.scrollPosition) {
                    content.scrollTop = savedState.scrollPosition;
                }
            }, 150);
        } else {
            const cacheKey = `explore_${tabToShow}_data`;
            const cachedData = getFromCache(cacheKey);
            if (cachedData && cachedData.tab === tabToShow) {
                console.log(`📦 Usando caché para ${tabToShow}`);
                renderExploreContent(tabToShow, cachedData.data);
            } else {
                setTimeout(() => loadExploreDataWithCache(tabToShow), 100);
            }
        }
    } else {
        setTimeout(() => loadExploreDataWithCache(currentTab || 'trending'), 100);
    }
    
    isOpen = true;
    exploreOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ============================================================
// CERRAR - GUARDA EL ESTADO
// ============================================================

function closeExploreModal() {
    if (isOpen && exploreOverlay) {
        const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
        const query = searchInput ? searchInput.value.trim() : '';
        
        const content = document.getElementById('exploreContent');
        const scrollPos = content ? content.scrollTop : 0;
        
        saveExploreState(
            currentTab, 
            query, 
            currentSearchResults, 
            scrollPos, 
            isSearchMode,
            currentUsers,
            currentStories,
            currentMeta
        );
        console.log('💾 Estado guardado:', { 
            tab: currentTab, 
            query, 
            results: currentSearchResults.length,
            users: currentUsers.length,
            stories: currentStories.length,
            scrollPosition: scrollPos,
            isSearchMode: isSearchMode
        });
    }
    
    isOpen = false;
    if (exploreOverlay) {
        exploreOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (typeof window.restoreNavToHome === 'function') {
        window.restoreNavToHome();
    }
}

// ============================================================
// CAMBIAR TAB - GUARDA LA PESTAÑA
// ============================================================

function switchExploreTab(tab) {
    if (isSearchMode) {
        const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        currentSearchQuery = '';
        currentSearchResults = [];
        currentUsers = [];
        currentStories = [];
        currentMeta = {};
        savedScrollPosition = 0;
        isSearchMode = false;
        updateTabsVisualState(false);
    }
    
    currentTab = tab;
    savedTab = tab;
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
    });
    
    const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
    if (searchInput) {
        searchInput.value = '';
        currentSearchQuery = '';
    }
    currentSearchResults = [];
    searchInProgress = false;
    isSearchMode = false;
    
    saveExploreState(tab, '', [], 0, false, [], [], {});
    loadExploreDataWithCache(tab);
}

// ============================================================
// 🔥 CARGAR DATOS CON CACHÉ
// ============================================================

async function loadExploreDataWithCache(tab) {
    const content = document.getElementById('exploreContent');
    if (!content) return;
    
    const cacheKey = `explore_${tab}_data`;
    const cachedData = getFromCache(cacheKey);
    
    if (cachedData && cachedData.tab === tab) {
        console.log(`📦 Cargando ${tab} desde caché local`);
        renderExploreContent(tab, cachedData.data);
        return;
    }
    
    await loadExploreData(tab);
}

// ============================================================
// 🔥 CARGAR DATOS DE EXPLORACIÓN CON GUARDADO EN CACHÉ
// ============================================================

async function loadExploreData(tab) {
    const content = document.getElementById('exploreContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="explore-skeleton">
            ${Array(9).fill('<div class="skeleton-item"></div>').join('')}
        </div>
    `;
    
    try {
        const token = getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const currentUser = getCurrentUser();
        const currentUserId = currentUser?.id || null;
        
        let data = { stories: [], users: [], hashtags: [] };
        
        if (tab === 'stories') {
            const url = `${API_URL}/api/stories/feed?sort=recent&limit=30`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const result = await res.json();
                const allStories = (result.data || []).filter(story => story.userId !== currentUser?.id);
                data.stories = filterPublicStories(allStories);
                console.log(`📸 Historias públicas: ${data.stories.length}`);
                saveToCache('explore_stories_data', { tab: 'stories', data: data });
            }
        }
        
        if (tab === 'users') {
            const cachedUsers = getFromCache(CACHE_KEYS.POPULAR_USERS);
            if (cachedUsers && cachedUsers.length > 0) {
                console.log(`👥 Usuarios populares desde caché local: ${cachedUsers.length}`);
                data.users = cachedUsers;
            } else {
                const url = `${API_URL}/api/users/popular${currentUserId ? '?userId=' + currentUserId : ''}`;
                const res = await fetch(url, { headers });
                if (res.ok) {
                    const allUsers = await res.json();
                    data.users = filterPublicUsers(allUsers).slice(0, 10);
                    console.log(`👥 Usuarios populares (públicos): ${data.users.length}`);
                    saveToCache(CACHE_KEYS.POPULAR_USERS, data.users);
                    saveToCache('explore_users_data', { tab: 'users', data: data });
                }
            }
        }
        
        if (tab === 'trending') {
            const cachedHashtags = getFromCache(CACHE_KEYS.TRENDING_HASHTAGS);
            if (cachedHashtags && cachedHashtags.length > 0) {
                console.log(`🔥 Hashtags desde caché local: ${cachedHashtags.length}`);
                data.hashtags = cachedHashtags;
            } else {
                const res = await fetch(`${API_URL}/api/hashtags/trending/public`);
                if (res.ok) {
                    let hashtags = await res.json();
                    hashtags = hashtags
                        .filter(h => h.count > 0)
                        .sort((a, b) => (b.count || 0) - (a.count || 0));
                    
                    if (hashtags.length > 20) {
                        hashtags = hashtags.slice(0, 20);
                    }
                    
                    data.hashtags = hashtags;
                    console.log(`🔥 Hashtags en tendencia: ${data.hashtags.length}`);
                    saveToCache(CACHE_KEYS.TRENDING_HASHTAGS, data.hashtags);
                    saveToCache('explore_trending_data', { tab: 'trending', data: data });
                }
            }
        }
        
        lastLoadedData = {
            tab: tab,
            data: data,
            timestamp: Date.now()
        };
        
        renderExploreContent(tab, data);
        
    } catch (error) {
        console.error('Error cargando exploración:', error);
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-exclamation-triangle" style="color:#ff6b6b;"></i>
                <h3 data-i18n="error.general">${t('error.general') || 'Error al cargar'}</h3>
                <p>${t('error.retry') || 'Intenta de nuevo más tarde'}</p>
                <button onclick="loadExploreData('${tab}')" style="margin-top:12px;padding:8px 24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;cursor:pointer;">
                    ${t('action.retry') || 'Reintentar'}
                </button>
            </div>
        `;
    }
}

// ============================================================
// 🔥 BÚSQUEDA HÍBRIDA CON CLASIFICACIÓN POR CATEGORÍAS
// ============================================================

async function performSmartSearch(query) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para buscar', true);
        return;
    }

    if (searchInProgress) return;
    
    isSearchMode = true;
    updateTabsVisualState(true);
    
    const cacheKey = `search_${query.toLowerCase().trim()}`;
    const cachedResults = getFromCache(cacheKey);
    
    if (cachedResults && cachedResults.length > 0) {
        console.log(`🔍 Resultados de búsqueda desde caché: "${query}"`);
        currentSearchResults = cachedResults;
        renderSearchResults(query, cachedResults, [], {});
        saveExploreState(currentTab, query, cachedResults, 0, true, [], [], {});
        return;
    }
    
    searchInProgress = true;

    const content = document.getElementById('exploreContent');
    if (!content) return;

    content.innerHTML = `
        <div class="explore-empty">
            <i class="fas fa-spinner fa-pulse"></i>
            <h3>${t('explore.searching') || 'Buscando'} "${query}"...</h3>
            <p style="font-size:12px;color:rgba(255,255,255,0.2);">
                🔍 ${t('explore.hybrid') || 'Búsqueda híbrida: literal + semántica + categorías'}
            </p>
        </div>
    `;

    try {
        // DETECTAR CATEGORÍA DE LA BÚSQUEDA
        let detectedCategory = null;
        let detectedCategoryName = null;
        let detectedCategoryEmoji = null;
        let detectedCategoryScore = 0;
        
        try {
            const classifyRes = await fetch(`${API_URL}/api/vyin/classify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    text: query,
                    targetLanguage: 'es' 
                })
            });
            
            if (classifyRes.ok) {
                const classifyData = await classifyRes.json();
                if (classifyData.categories && classifyData.categories.length > 0) {
                    const topCategory = classifyData.categories[0];
                    detectedCategory = topCategory.category;
                    detectedCategoryName = topCategory.name;
                    detectedCategoryEmoji = topCategory.emoji || '📌';
                    detectedCategoryScore = topCategory.score || 0;
                    console.log(`📂 Categoría detectada: ${detectedCategoryName} (${detectedCategory}) con ${Math.round(detectedCategoryScore * 100)}%`);
                }
            }
        } catch (classifyError) {
            console.warn('⚠️ Error clasificando búsqueda:', classifyError.message);
        }

        // BUSCAR USUARIOS
        const usersRes = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let users = [];
        if (usersRes.ok) {
            const allUsers = await usersRes.json();
            users = filterPublicUsers(allUsers);
            console.log(`👥 Usuarios encontrados (públicos): ${users.length}`);
        }

        // BÚSQUEDA HÍBRIDA
        const hybridRes = await fetch(`${API_URL}/api/stories/search/hybrid?q=${encodeURIComponent(query)}&limit=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let stories = [];
        let meta = {};

        if (hybridRes.ok) {
            const result = await hybridRes.json();
            let allStories = result.data || [];
            meta = result.meta || {};
            
            console.log(`📊 Búsqueda híbrida: ${allStories.length} historias encontradas`);
            
            stories = allStories.filter(s => {
                const relevance = s.relevanceScore || 0;
                return relevance > 15;
            });
            
            const currentUser = getCurrentUser();
            const userInterests = currentUser?.interests || [];
            
            if (userInterests.length > 0 && stories.length > 0) {
                stories = stories.map(story => {
                    const storyCategories = story.storyCategories || [];
                    const matches = userInterests.filter(interest => 
                        storyCategories.includes(interest)
                    );
                    if (matches.length > 0) {
                        story.interestMatch = true;
                        story.interestMatchCount = matches.length;
                        story.relevanceScore = (story.relevanceScore || 0) + (matches.length * 10);
                    }
                    return story;
                });
                
                stories.sort((a, b) => {
                    if (a.interestMatch && !b.interestMatch) return -1;
                    if (!a.interestMatch && b.interestMatch) return 1;
                    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
                });
            }
            
            stories = filterPublicStories(stories);
            console.log(`📸 Historias relevantes (públicas): ${stories.length}`);
        }

        if (stories.length === 0 && users.length === 0) {
            content.innerHTML = `
                <div class="explore-empty">
                    <i class="fas fa-search"></i>
                    <h3>${t('explore.noResults') || 'No se encontraron resultados para'} "${query}"</h3>
                    ${detectedCategoryName ? `<p>${t('explore.noCategoryContent') || 'No hay contenido en la categoría'} "${detectedCategoryName}"</p>` : `<p>${t('explore.tryDifferent') || 'Prueba con otras palabras clave'}</p>`}
                    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                        ${getRelatedSuggestions(query).map(s => `
                            <span class="trending-hashtag" onclick="window.performSmartSearch('${s}')">#${s}</span>
                        `).join('')}
                    </div>
                </div>
            `;
            searchInProgress = false;
            return;
        }

        currentUsers = users;
        currentStories = stories;
        currentMeta = meta;
        currentMeta.detectedCategory = detectedCategory;
        currentMeta.detectedCategoryName = detectedCategoryName;
        currentMeta.detectedCategoryEmoji = detectedCategoryEmoji;
        currentMeta.detectedCategoryScore = Math.round(detectedCategoryScore * 100);
        
        const combinedResults = [...stories, ...users.map(u => ({ ...u, type: 'user' }))];
        currentSearchResults = combinedResults;
        saveToCache(cacheKey, combinedResults);
        saveExploreState(currentTab, query, combinedResults, 0, true, users, stories, meta);
        
        renderSearchResults(query, stories, users, meta, detectedCategoryName, detectedCategoryEmoji);

    } catch (error) {
        console.error('Error en búsqueda:', error);
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-exclamation-triangle" style="color:#ff6b6b;"></i>
                <h3 data-i18n="error.general">${t('error.general') || 'Error al buscar'}</h3>
                <p>${error.message || t('error.retry') || 'Intenta de nuevo más tarde'}</p>
            </div>
        `;
    }

    searchInProgress = false;
}

// ============================================================
// 🔥 BUSCAR HISTORIAS POR HASHTAG
// ============================================================

async function openHashtagStories(tag) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para ver historias', true);
        return;
    }

    if (hashtagStoriesCache.has(tag)) {
        const cached = hashtagStoriesCache.get(tag);
        if (cached.length > 0) {
            window._fromExploreModal = true;
            window.openStoryModal(cached[0].id, cached, false, null);
            setTimeout(() => {
                const storyOverlay = document.getElementById('storyModalOverlay');
                if (storyOverlay) {
                    storyOverlay.style.zIndex = '10002';
                }
            }, 50);
        } else {
            showToast(`${t('explore.noStoriesWithHashtag') || 'No hay historias públicas con'} #${tag}`, true);
        }
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/hashtag/${tag}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            showToast(t('error.general') || 'Error al buscar historias', true);
            return;
        }

        const data = await res.json();
        let stories = [];
        
        if (Array.isArray(data)) {
            data.forEach(group => {
                if (group.stories && Array.isArray(group.stories)) {
                    stories.push(...group.stories);
                }
            });
        } else if (data.data && Array.isArray(data.data)) {
            stories.push(...data.data);
        }

        stories = filterPublicStories(stories);

        if (stories.length === 0) {
            showToast(`${t('explore.noStoriesWithHashtag') || 'No hay historias públicas con'} #${tag}`, true);
            return;
        }

        hashtagStoriesCache.set(tag, stories);
        
        window._fromExploreModal = true;
        window.openStoryModal(stories[0].id, stories, false, null);
        
        setTimeout(() => {
            const storyOverlay = document.getElementById('storyModalOverlay');
            if (storyOverlay) {
                storyOverlay.style.zIndex = '10002';
            }
        }, 50);
        
    } catch (error) {
        console.error('Error buscando historias por hashtag:', error);
        showToast(t('error.general') || 'Error al buscar historias', true);
    }
}

// ============================================================
// RENDERIZAR CONTENIDO
// ============================================================

function renderExploreContent(tab, data) {
    const content = document.getElementById('exploreContent');
    if (!content) return;
    
    setTimeout(translateExploreUI, 50);
    
    if (tab === 'trending') {
        renderHashtags(content, data);
    } else if (tab === 'stories') {
        renderStoriesGrid(content, data.stories);
    } else if (tab === 'users') {
        renderUsersList(content, data.users);
    }
}

function renderHashtags(content, data) {
    if (!data.hashtags || data.hashtags.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-hashtag"></i>
                <h3 data-i18n="explore.noHashtags">${t('explore.noHashtags') || 'Sin hashtags disponibles'}</h3>
                <p data-i18n="explore.hashtagsWillAppear">${t('explore.hashtagsWillAppear') || 'Los hashtags aparecerán aquí cuando se usen'}</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="explore-section">
            <div class="section-title">🔥 ${t('explore.trending') || 'Hashtags en tendencia'} <span style="font-size:11px;color:rgba(255,255,255,0.1);">(${data.hashtags.length})</span></div>
            <div class="trending-hashtags">
                ${data.hashtags.map(h => `
                    <span class="trending-hashtag" onclick="window.openHashtagStories('${h.tag}')">
                        #${h.tag}
                        <span class="count">${h.count || 0}</span>
                    </span>
                `).join('')}
            </div>
        </div>
    `;
    
    content.innerHTML = html;
}

// ============================================================
// 🔥 RENDERIZAR GRID DE HISTORIAS (CORREGIDO)
// ============================================================

function renderStoriesGrid(content, stories) {
    const currentUser = getCurrentUser();
    const filteredStories = filterPublicStories(stories || []).filter(story => story.userId !== currentUser?.id);
    
    if (!filteredStories || filteredStories.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-camera"></i>
                <h3 data-i18n="explore.noPublicStories">${t('explore.noPublicStories') || 'No hay historias públicas'}</h3>
                <p data-i18n="explore.publicStoriesWillAppear">${t('explore.publicStoriesWillAppear') || 'Las historias de usuarios públicos aparecerán aquí'}</p>
            </div>
        `;
        return;
    }
    
    // Mezclar para variedad
    const shuffled = [...filteredStories];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    content.innerHTML = `
        <div class="explore-section">
            <div class="section-title">📸 ${t('explore.recentPublicStories') || 'Historias públicas recientes'}</div>
            <div class="explore-grid">
                ${shuffled.map(story => createStoryThumbnail(story)).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// RENDERIZAR USUARIOS
// ============================================================

function renderUsersList(content, users) {
    const publicUsers = filterPublicUsers(users || []);
    
    if (!publicUsers || publicUsers.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-users"></i>
                <h3 data-i18n="explore.noPublicUsers">${t('explore.noPublicUsers') || 'No hay usuarios públicos populares'}</h3>
                <p data-i18n="explore.publicUsersWillAppear">${t('explore.publicUsersWillAppear') || 'Los usuarios con perfil público aparecerán aquí'}</p>
            </div>
        `;
        return;
    }
    
    const currentUser = getCurrentUser();
    
    content.innerHTML = `
        <div class="explore-section">
            <div class="section-title">👑 ${t('explore.popularUsers') || 'Usuarios populares (públicos)'}</div>
            <div class="explore-users">
                ${publicUsers.map(user => {
                    const isOwn = currentUser?.id === user.id;
                    const isFollowing = user.isFollowing || false;
                    return `
                        <div class="explore-user-item" onclick="window.openProfileFromExplore('${user.id}')">
                            <img class="avatar" src="${user.avatar || getAvatar(user.fullName)}" />
                            <div class="info">
                                <div class="name">${user.fullName} ${isOwn ? '👤' : ''}</div>
                                <div class="username">@${user.username}</div>
                                <div class="bio">${user.followersCount || 0} ${t('profile.followers') || 'seguidores'}</div>
                            </div>
                            ${!isOwn ? `
                                <button class="follow-btn ${isFollowing ? 'following' : ''}" 
                                        data-user-id="${user.id}"
                                        onclick="event.stopPropagation(); window.followUserFromExplore('${user.id}', this)">
                                    ${isFollowing ? t('profile.unfollow') || 'Siguiendo' : t('profile.follow') || 'Seguir'}
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function getRelatedSuggestions(query) {
    const relatedMap = {
        'comida': ['recetas', 'cocina', 'restaurante', 'chef', 'gourmet', 'postres', 'vegano', 'comida rapida'],
        'futbol': ['goles', 'partidos', 'liga', 'campeones', 'equipos', 'estadio', 'mundial', 'fútbol'],
        'amor': ['relaciones', 'romance', 'pareja', 'sentimientos', 'corazón', 'citas', 'enamorado'],
        'politica': ['gobierno', 'elecciones', 'voto', 'presidente', 'democracia', 'debate', 'congreso'],
        'tecnologia': ['software', 'apps', 'programacion', 'inteligencia', 'artificial', 'startup', 'innovacion'],
        'musica': ['canciones', 'artistas', 'conciertos', 'bandas', 'instrumentos', 'ritmo', 'melodia'],
        'cine': ['peliculas', 'actores', 'directores', 'estrenos', 'series', 'streaming', 'netflix'],
        'deportes': ['competencia', 'entrenamiento', 'atletas', 'olimpicos', 'records', 'medallas'],
        'salud': ['ejercicio', 'dieta', 'bienestar', 'meditacion', 'fitness', 'yoga', 'nutricion'],
        'viajes': ['vacaciones', 'playa', 'montaña', 'aventura', 'turismo', 'destinos', 'hoteles'],
        'moda': ['ropa', 'estilo', 'tendencias', 'diseñadores', 'looks', 'outfits', 'zapatos'],
        'arte': ['pintura', 'dibujo', 'escultura', 'museos', 'creatividad', 'exposiciones', 'galerias'],
        'animales': ['perro', 'gato', 'mascota', 'veterinario', 'fauna', 'naturaleza', 'animal', 'salvaje']
    };

    const queryLower = query.toLowerCase();
    for (const [key, values] of Object.entries(relatedMap)) {
        if (queryLower.includes(key) || key.includes(queryLower)) {
            return values.slice(0, 6);
        }
        for (const val of values) {
            if (queryLower.includes(val) || val.includes(queryLower)) {
                return values.slice(0, 6);
            }
        }
    }
    
    return ['contenido', 'popular', 'interesante', 'actual', 'tendencias', 'viral'];
}

// ============================================================
// 🔥 RENDERIZAR RESULTADOS DE BÚSQUEDA (CORREGIDO)
// ============================================================

function renderSearchResults(query, stories, users, meta, detectedCategoryName = null, detectedCategoryEmoji = null) {
    const content = document.getElementById('exploreContent');
    if (!content) return;

    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;

    const validStories = (stories || []).filter(s => {
        if (!s || !s.id) return false;
        if (s.userId === currentUserId) return false;
        return true;
    });

    const validUsers = (users || []).filter(u => {
        if (!u || !u.id) return false;
        if (u.id === currentUserId) return false;
        return u.privacy === 'public' || u.privacy === undefined;
    });

    if (validStories.length === 0 && validUsers.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-search"></i>
                <h3>${t('explore.noResults') || 'No se encontraron resultados para'} "${query}"</h3>
                ${detectedCategoryName ? `<p>${t('explore.noCategoryContent') || 'No hay contenido en la categoría'} "${detectedCategoryName}"</p>` : `<p>${t('explore.tryDifferent') || 'Prueba con otras palabras clave'}</p>`}
                <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                    ${getRelatedSuggestions(query).map(s => `
                        <span class="trending-hashtag" onclick="window.performSmartSearch('${s}')">#${s}</span>
                    `).join('')}
                </div>
            </div>
        `;
        return;
    }

    const classificationInfo = meta?.detectedCategory ? 
        `🔍 ${t('explore.classifiedAs') || 'Clasificado como'}: ${meta.detectedCategoryName || detectedCategoryName || 'N/A'}` : '';
    const classificationScore = meta?.detectedCategoryScore ? 
        ` (${meta.detectedCategoryScore}%)` : '';
    const categoryApplied = meta?.categoryFilterApplied ? 
        ' ✅ Filtrado por categoría' : '';

    let html = `
        <div class="explore-section">
            <div class="section-title">
                🔍 ${t('explore.results') || 'Resultados para'} "${query}"
                ${detectedCategoryName ? `<span style="font-size:11px;color:#c084fc;margin-left:8px;background:rgba(192,132,252,0.1);padding:2px 10px;border-radius:12px;">
                    ${detectedCategoryEmoji || '📂'} ${detectedCategoryName}${classificationScore}
                </span>` : ''}
                <span style="font-size:10px;color:rgba(255,255,255,0.1);margin-left:8px;">
                    ${validStories.length} ${t('explore.stories') || 'historias'} · ${validUsers.length} ${t('explore.users') || 'usuarios'}
                    ${classificationInfo ? `<span style="margin-left:8px;font-size:9px;color:rgba(255,255,255,0.08);">${classificationInfo}${categoryApplied}</span>` : ''}
                </span>
            </div>
    `;

    if (validUsers.length > 0) {
        html += `
            <div style="margin-bottom:16px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-weight:600;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px;">
                    👥 ${t('explore.publicUsers') || 'Usuarios públicos'} (${validUsers.length})
                </div>
                <div class="explore-users">
                    ${validUsers.map(user => {
                        const isOwn = currentUserId === user.id;
                        const isFollowing = user.isFollowing || false;
                        return `
                            <div class="explore-user-item" onclick="window.openProfileFromExplore('${user.id}')">
                                <img class="avatar" src="${user.avatar || getAvatar(user.fullName)}" />
                                <div class="info">
                                    <div class="name">${user.fullName} ${user.isVerified ? '✅' : ''} ${isOwn ? '👤' : ''}</div>
                                    <div class="username">@${user.username}</div>
                                    <div class="bio">${user.followersCount || 0} ${t('profile.followers') || 'seguidores'}</div>
                                </div>
                                ${!isOwn ? `
                                    <button class="follow-btn ${isFollowing ? 'following' : ''}" 
                                            data-user-id="${user.id}"
                                            onclick="event.stopPropagation(); window.followUserFromExplore('${user.id}', this)">
                                        ${isFollowing ? t('profile.unfollow') || 'Siguiendo' : t('profile.follow') || 'Seguir'}
                                    </button>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    if (validStories.length > 0) {
        html += `
            <div>
                <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-weight:600;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px;">
                    📸 ${t('explore.relatedStories') || 'Historias relacionadas'} (${validStories.length})
                    ${meta?.algorithm ? `<span style="font-size:9px;color:rgba(255,255,255,0.08);margin-left:8px;font-weight:400;">${meta.algorithm}</span>` : ''}
                    ${meta?.classifierVersion ? `<span style="font-size:9px;color:rgba(255,255,255,0.06);margin-left:8px;">${meta.classifierVersion}</span>` : ''}
                    ${detectedCategoryName ? `<span style="font-size:9px;color:#c084fc;margin-left:8px;">📂 ${detectedCategoryName}</span>` : ''}
                </div>
                <div class="explore-grid">
                    ${validStories.slice(0, 30).map(story => createStoryThumbnail(story)).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    content.innerHTML = html;
    
    setTimeout(translateExploreUI, 50);
}

// ============================================================
// 🔥 SEGUIR USUARIO DESDE EXPLORE
// ============================================================

async function followUserFromExplore(userId, btn) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para seguir', true);
        return;
    }
    
    const isFollowing = btn.classList.contains('following');
    const action = isFollowing ? 'unfollow' : 'follow';
    
    try {
        const res = await fetch(`${API_URL}/api/follows/${action}`, {
            method: isFollowing ? 'DELETE' : 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId })
        });
        
        const data = await res.json();
        if (res.ok) {
            btn.classList.toggle('following');
            btn.textContent = isFollowing ? (t('profile.follow') || 'Seguir') : (t('profile.unfollow') || 'Siguiendo');
            showToast(isFollowing ? (t('profile.unfollowed') || 'Dejaste de seguir') : (t('profile.followed') || 'Ahora sigues a este usuario'));
        } else {
            showToast(data.error || t('error.general') || 'Error', true);
        }
    } catch (error) {
        console.error('Error en follow:', error);
        showToast(t('error.general') || 'Error al procesar', true);
    }
}

// ============================================================
// 🔥 ACCIONES GLOBALES
// ============================================================

window.openStoryFromExplore = (storyId) => {
    if (storyId) {
        window._fromExploreModal = true;
        window.openStoryModal(storyId, null, false, null);
        setTimeout(() => {
            const storyOverlay = document.getElementById('storyModalOverlay');
            if (storyOverlay) {
                storyOverlay.style.zIndex = '10002';
            }
        }, 50);
    }
};

window.openProfileFromExplore = (userId) => {
    if (userId) {
        window._fromExploreModal = true;
        
        const searchInput = exploreOverlay?.querySelector('#exploreSearchInput');
        const query = searchInput ? searchInput.value.trim() : currentSearchQuery;
        const content = document.getElementById('exploreContent');
        const scrollPos = content ? content.scrollTop : 0;
        
        saveExploreState(
            currentTab, 
            query, 
            currentSearchResults, 
            scrollPos, 
            isSearchMode,
            currentUsers,
            currentStories,
            currentMeta
        );
        console.log('💾 Estado guardado antes de abrir perfil:', { 
            tab: currentTab, 
            query, 
            results: currentSearchResults.length,
            users: currentUsers.length,
            stories: currentStories.length,
            scrollPosition: scrollPos,
            isSearchMode: isSearchMode
        });
        
        if (typeof window.openProfileModal === 'function') {
            window.openProfileModal(userId, false, { 
                fromExplore: true,
                returnToExplore: true,
                savedTab: savedTab
            });
        } else {
            showToast(t('error.general') || 'Error al abrir perfil', true);
            closeExploreModal();
            setTimeout(() => {
                import('./profile-modal.js').then(({ openProfileModal }) => {
                    openProfileModal(userId);
                }).catch(() => {
                    if (typeof window.openProfileModal === 'function') {
                        window.openProfileModal(userId);
                    }
                });
            }, 300);
        }
    }
};

window.openHashtagStories = openHashtagStories;
window.performSmartSearch = performSmartSearch;
window.followUserFromExplore = followUserFromExplore;

// ============================================================
// EXPORTAR
// ============================================================

export { 
    openExploreModal, 
    showExploreModal,
    closeExploreModal,
    clearExploreCache,
    saveExploreState,
    getExploreState,
    openHashtagStories,
    translateExploreUI,
    initI18nForExplore
};