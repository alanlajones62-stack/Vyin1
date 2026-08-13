// explore-modal.js - BÚSQUEDA HÍBRIDA CON CLASIFICACIÓN POR CATEGORÍAS
// Y SUPERPOSICIÓN DE MODALES - VERSIÓN COMPLETA
// 🔥 CORREGIDO: Persistencia de resultados de búsqueda
// 🔥 NUEVO: Clasificación por categorías (Animales, Música, Deportes, etc.)

import { getToken, getCurrentUser, showToast, getAvatar } from './auth.js';
import { formatNumber } from './utils.js';
import { openStoryModal } from './story-modal.js';

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
// CREAR ELEMENTOS DEL MODAL
// ============================================================

function createExploreModal() {
    if (document.querySelector('.explore-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'explore-overlay';
    overlay.id = 'exploreOverlay';
    
    overlay.innerHTML = `
        <div class="explore-header">
            <h2><i class="fas fa-compass"></i> Explorar</h2>
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
                    placeholder="Buscar en cualquier idioma..."
                    autocomplete="off"
                />
                <span style="font-size:9px;color:rgba(255,255,255,0.1);margin-left:8px;">
                    🔍 Híbrida (literal + semántica + categorías)
                </span>
            </div>
            
            <div class="explore-tabs">
                <button class="active" data-tab="trending">🔥 Tendencias</button>
                <button data-tab="stories">📸 Historias</button>
                <button data-tab="users">👥 Usuarios</button>
            </div>
            
            <div id="exploreContent">
                <div class="explore-empty">
                    <i class="fas fa-spinner fa-pulse"></i>
                    <h3>Cargando...</h3>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    exploreOverlay = overlay;
    
    overlay.querySelector('#closeExplore').addEventListener('click', closeExploreModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeExploreModal();
    });
    
    overlay.querySelectorAll('.explore-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchExploreTab(tab);
        });
    });
    
    const searchInput = overlay.querySelector('#exploreSearchInput');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const query = e.target.value.trim();
            currentSearchQuery = query;
            if (query.length >= 2) {
                performSmartSearch(query);
            } else if (query.length === 0) {
                currentSearchResults = [];
                currentUsers = [];
                currentStories = [];
                currentMeta = {};
                clearSearchMode();
                loadExploreDataWithCache(currentTab);
            }
        }, 400);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query.length >= 2) {
                clearTimeout(searchTimeout);
                performSmartSearch(query);
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
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        const isActive = btn.dataset.tab === currentTab;
        btn.classList.toggle('active', isActive);
    });
}

// ============================================================
// 🔥 ACTIVAR MODO DE BÚSQUEDA
// ============================================================

function activateSearchMode() {
    isSearchMode = true;
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'default';
    });
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
// 🔥 ABRIR MODAL - RESTAURA EL ESTADO GUARDADO
// ============================================================

function openExploreModal(restoreState = true) {
    if (!exploreOverlay) createExploreModal();
    
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
            
            // 🔥 RESTAURAR USUARIOS Y STORIES
            currentUsers = savedState.users || [];
            currentStories = savedState.stories || [];
            currentMeta = savedState.meta || {};
            
            const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
            tabs.forEach(btn => {
                if (isSearchMode) {
                    btn.classList.remove('active');
                    btn.style.opacity = '0.3';
                    btn.style.pointerEvents = 'none';
                    btn.style.cursor = 'default';
                } else {
                    const isActive = btn.dataset.tab === tabToLoad;
                    btn.classList.toggle('active', isActive);
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                    btn.style.cursor = 'pointer';
                }
            });
            
            const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
            if (searchInput) {
                searchInput.value = savedState.query || '';
            }
            
            // 🔥 SI HAY RESULTADOS DE BÚSQUEDA, MOSTRARLOS
            if (isSearchMode && savedState.query && (savedState.results?.length > 0 || savedState.users?.length > 0)) {
                currentSearchResults = savedState.results || [];
                
                // 🔥 COMBINAR USUARIOS Y STORIES PARA RENDERIZAR
                const users = savedState.users || [];
                const stories = savedState.stories || [];
                const meta = savedState.meta || {};
                
                if (users.length > 0 || stories.length > 0) {
                    renderSearchResults(savedState.query, stories, users, meta);
                } else if (savedState.results && savedState.results.length > 0) {
                    // Fallback: usar results si no hay users/stories separados
                    renderSearchResults(savedState.query, savedState.results, [], {});
                }
                
                // 🔥 RESTAURAR SCROLL
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
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        const isActive = btn.dataset.tab === tabToLoad;
        btn.classList.toggle('active', isActive);
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
    });
    
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
        
        const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
        tabs.forEach(btn => {
            if (isSearchMode) {
                btn.classList.remove('active');
                btn.style.opacity = '0.3';
                btn.style.pointerEvents = 'none';
                btn.style.cursor = 'default';
            } else {
                const isActive = btn.dataset.tab === tabToShow;
                btn.classList.toggle('active', isActive);
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
            }
        });
        
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
        
        // 🔥 GUARDAR ESTADO COMPLETO CON USUARIOS Y STORIES
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
        clearSearchMode();
    }
    
    currentTab = tab;
    savedTab = tab;
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
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
                <h3>Error al cargar</h3>
                <p>Intenta de nuevo más tarde</p>
                <button onclick="loadExploreData('${tab}')" style="margin-top:12px;padding:8px 24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;cursor:pointer;">
                    Reintentar
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
        showToast('Inicia sesión para buscar', true);
        return;
    }

    if (searchInProgress) return;
    
    activateSearchMode();
    
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
            <h3>Buscando "${query}"...</h3>
            <p style="font-size:12px;color:rgba(255,255,255,0.2);">
                🔍 Búsqueda híbrida: literal + semántica + categorías
            </p>
        </div>
    `;

    try {
        // 🔥 1. DETECTAR CATEGORÍA DE LA BÚSQUEDA
        let detectedCategory = null;
        let detectedCategoryName = null;
        let detectedCategoryEmoji = null;
        
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
                    detectedCategory = classifyData.categories[0].category;
                    detectedCategoryName = classifyData.categories[0].name;
                    detectedCategoryEmoji = classifyData.categories[0].emoji;
                    console.log(`📂 Categoría detectada: ${detectedCategoryName} (${detectedCategory})`);
                }
            }
        } catch (classifyError) {
            console.warn('⚠️ Error clasificando búsqueda:', classifyError.message);
        }

        // 🔥 2. BUSCAR USUARIOS
        const usersRes = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let users = [];
        if (usersRes.ok) {
            const allUsers = await usersRes.json();
            users = filterPublicUsers(allUsers);
            console.log(`👥 Usuarios encontrados (públicos): ${users.length}`);
        }

        // 🔥 3. BÚSQUEDA HÍBRIDA
        const hybridRes = await fetch(`${API_URL}/api/stories/search/hybrid?q=${encodeURIComponent(query)}&limit=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let stories = [];
        let meta = {};

        if (hybridRes.ok) {
            const result = await hybridRes.json();
            let allStories = result.data || [];
            meta = result.meta || {};
            
            // 🔥 4. FILTRAR POR CATEGORÍA DETECTADA
            if (detectedCategory && allStories.length > 0) {
                console.log(`🔍 Filtrando por categoría: ${detectedCategoryName}`);
                
                // Clasificar cada historia para verificar categoría
                const classifiedStories = [];
                const batchSize = 5;
                
                for (let i = 0; i < allStories.length; i += batchSize) {
                    const batch = allStories.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (story) => {
                        try {
                            const classifyStoryRes = await fetch(`${API_URL}/api/vyin/classify-story`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ 
                                    storyId: story.id,
                                    targetLanguage: 'es'
                                })
                            });
                            
                            if (classifyStoryRes.ok) {
                                const storyClass = await classifyStoryRes.json();
                                const categories = storyClass.categories || [];
                                const hasCategory = categories.some(c => c.category === detectedCategory);
                                
                                if (hasCategory) {
                                    // 🔥 BONUS POR COINCIDENCIA DE CATEGORÍA
                                    story.categoryMatch = true;
                                    story.categoryName = detectedCategoryName;
                                    story.categoryEmoji = detectedCategoryEmoji;
                                    story.relevanceScore = (story.relevanceScore || 0) + 40;
                                    return story;
                                }
                            }
                            // Si falla o no coincide, incluir pero con menor prioridad
                            story.categoryMatch = false;
                            return story;
                        } catch (e) {
                            story.categoryMatch = false;
                            return story;
                        }
                    });
                    
                    const batchResults = await Promise.all(batchPromises);
                    classifiedStories.push(...batchResults);
                }
                
                // Ordenar: primero las que coinciden con categoría
                classifiedStories.sort((a, b) => {
                    if (a.categoryMatch && !b.categoryMatch) return -1;
                    if (!a.categoryMatch && b.categoryMatch) return 1;
                    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
                });
                
                allStories = classifiedStories;
                console.log(`📸 Historias en categoría "${detectedCategoryName}": ${allStories.filter(s => s.categoryMatch).length}`);
            }
            
            // Filtrar por relevancia mínima
            stories = allStories.filter(s => {
                const relevance = s.relevanceScore || 0;
                return relevance > 15;
            });
            
            stories = filterPublicStories(stories);
            console.log(`📸 Historias relevantes (públicas): ${stories.length}`);
        }

        if (stories.length === 0 && users.length === 0) {
            content.innerHTML = `
                <div class="explore-empty">
                    <i class="fas fa-search"></i>
                    <h3>No se encontraron resultados para "${query}"</h3>
                    ${detectedCategory ? `<p>No hay contenido en la categoría "${detectedCategoryName}"</p>` : '<p>Prueba con otras palabras clave</p>'}
                    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                        ${getRelatedSuggestions(query).map(s => `
                            <span class="trending-hashtag" onclick="window.performSmartSearch('${s}')">#${s}</span>
                        `).join('')}
                    </div>
                    ${detectedCategory ? `
                        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                            <span class="trending-hashtag" style="border-color:#c084fc;color:#c084fc;">
                                ${detectedCategoryEmoji || '📂'} ${detectedCategoryName}
                            </span>
                        </div>
                    ` : ''}
                </div>
            `;
            searchInProgress = false;
            return;
        }

        // 🔥 GUARDAR USUARIOS Y STORIES POR SEPARADO
        currentUsers = users;
        currentStories = stories;
        currentMeta = meta;
        currentMeta.detectedCategory = detectedCategory;
        currentMeta.detectedCategoryName = detectedCategoryName;
        currentMeta.detectedCategoryEmoji = detectedCategoryEmoji;
        
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
                <h3>Error al buscar</h3>
                <p>${error.message || 'Intenta de nuevo más tarde'}</p>
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
        showToast('Inicia sesión para ver historias', true);
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
            showToast(`No hay historias públicas con #${tag}`, true);
        }
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/hashtag/${tag}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            showToast('Error al buscar historias', true);
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
            showToast(`No hay historias públicas con #${tag}`, true);
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
        showToast('Error al buscar historias', true);
    }
}

// ============================================================
// RENDERIZAR CONTENIDO
// ============================================================

function renderExploreContent(tab, data) {
    const content = document.getElementById('exploreContent');
    if (!content) return;
    
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
                <h3>Sin hashtags disponibles</h3>
                <p>Los hashtags aparecerán aquí cuando se usen</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="explore-section">
            <div class="section-title">🔥 Hashtags en tendencia <span style="font-size:11px;color:rgba(255,255,255,0.1);">(${data.hashtags.length})</span></div>
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

function renderStoriesGrid(content, stories) {
    const currentUser = getCurrentUser();
    const filteredStories = filterPublicStories(stories || []).filter(story => story.userId !== currentUser?.id);
    
    if (!filteredStories || filteredStories.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-camera"></i>
                <h3>No hay historias públicas</h3>
                <p>Las historias de usuarios públicos aparecerán aquí</p>
            </div>
        `;
        return;
    }
    
    const shuffled = [...filteredStories];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    content.innerHTML = `
        <div class="explore-section">
            <div class="section-title">📸 Historias públicas recientes</div>
            <div class="explore-grid">
                ${shuffled.map(story => `
                    <div class="story-thumb" onclick="window.openStoryFromExplore('${story.id}')">
                        ${story.mediaType === 'image' && story.mediaUrl 
                            ? `<img src="${story.mediaUrl}" loading="lazy" />`
                            : story.mediaType === 'video' && story.mediaUrl
                            ? `<video src="${story.mediaUrl}" muted loop playsinline preload="metadata"></video>`
                            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${story.textBgColor || '#1a1a2e'};color:rgba(255,255,255,0.3);font-size:24px;">
                                ${story.mediaType === 'video' ? '🎬' : story.hasSubtitles ? '💬' : '📝'}
                              </div>`
                        }
                        ${story.hasSubtitles ? '<span class="subtitles-badge">CC</span>' : ''}
                        <div class="overlay">
                            <div class="likes">
                                <i class="fas fa-heart"></i>
                                ${formatNumber(story.likes?.length || 0)}
                            </div>
                            ${story.subtitles ? `<div class="subtitle-preview">💬 ${story.subtitles.substring(0, 40)}...</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderUsersList(content, users) {
    const publicUsers = filterPublicUsers(users || []);
    
    if (!publicUsers || publicUsers.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-users"></i>
                <h3>No hay usuarios públicos populares</h3>
                <p>Los usuarios con perfil público aparecerán aquí</p>
            </div>
        `;
        return;
    }
    
    const currentUser = getCurrentUser();
    
    content.innerHTML = `
        <div class="explore-section">
            <div class="section-title">👑 Usuarios populares (públicos)</div>
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
                                <div class="bio">${user.followersCount || 0} seguidores</div>
                            </div>
                            ${!isOwn ? `
                                <button class="follow-btn ${isFollowing ? 'following' : ''}" 
                                        data-user-id="${user.id}"
                                        onclick="event.stopPropagation(); window.followUserFromExplore('${user.id}', this)">
                                    ${isFollowing ? 'Siguiendo' : 'Seguir'}
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

function renderSearchResults(query, stories, users, meta, detectedCategoryName = null, detectedCategoryEmoji = null) {
    const content = document.getElementById('exploreContent');
    if (!content) return;

    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;

    // 🔥 FILTRAR STORIES VÁLIDAS
    const validStories = (stories || []).filter(s => {
        if (!s || !s.id) return false;
        if (s.userId === currentUserId) return false;
        return true;
    });

    // 🔥 FILTRAR USUARIOS VÁLIDOS
    const validUsers = (users || []).filter(u => {
        if (!u || !u.id) return false;
        if (u.id === currentUserId) return false;
        return u.privacy === 'public' || u.privacy === undefined;
    });

    // Si no hay resultados válidos, mostrar mensaje
    if (validStories.length === 0 && validUsers.length === 0) {
        content.innerHTML = `
            <div class="explore-empty">
                <i class="fas fa-search"></i>
                <h3>No se encontraron resultados para "${query}"</h3>
                ${detectedCategoryName ? `<p>No hay contenido en la categoría "${detectedCategoryName}"</p>` : '<p>Prueba con otras palabras clave</p>'}
                <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                    ${getRelatedSuggestions(query).map(s => `
                        <span class="trending-hashtag" onclick="window.performSmartSearch('${s}')">#${s}</span>
                    `).join('')}
                </div>
            </div>
        `;
        return;
    }

    let html = `
        <div class="explore-section">
            <div class="section-title">
                🔍 Resultados para "${query}"
                ${detectedCategoryName ? `<span style="font-size:11px;color:#c084fc;margin-left:8px;background:rgba(192,132,252,0.1);padding:2px 10px;border-radius:12px;">
                    ${detectedCategoryEmoji || '📂'} ${detectedCategoryName}
                </span>` : ''}
                <span style="font-size:10px;color:rgba(255,255,255,0.1);margin-left:8px;">
                    ${validStories.length} historias · ${validUsers.length} usuarios
                </span>
            </div>
    `;

    if (validUsers.length > 0) {
        html += `
            <div style="margin-bottom:16px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-weight:600;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px;">
                    👥 Usuarios públicos (${validUsers.length})
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
                                    <div class="bio">${user.followersCount || 0} seguidores</div>
                                </div>
                                ${!isOwn ? `
                                    <button class="follow-btn ${isFollowing ? 'following' : ''}" 
                                            data-user-id="${user.id}"
                                            onclick="event.stopPropagation(); window.followUserFromExplore('${user.id}', this)">
                                        ${isFollowing ? 'Siguiendo' : 'Seguir'}
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
                    📸 Historias relacionadas (${validStories.length})
                    ${meta?.algorithm ? `<span style="font-size:9px;color:rgba(255,255,255,0.08);margin-left:8px;font-weight:400;">${meta.algorithm}</span>` : ''}
                    ${detectedCategoryName ? `<span style="font-size:9px;color:#c084fc;margin-left:8px;">📂 ${detectedCategoryName}</span>` : ''}
                </div>
                <div class="explore-grid">
                    ${validStories.slice(0, 30).map(story => {
                        let mediaContent = '';
                        const mediaUrl = story.mediaUrl;
                        
                        if (story.mediaType === 'image' && mediaUrl) {
                            mediaContent = `<img src="${mediaUrl}" loading="lazy" onerror="this.style.display='none'" />`;
                        } else if (story.mediaType === 'video' && mediaUrl) {
                            mediaContent = `
                                <video src="${mediaUrl}" muted loop playsinline preload="metadata" 
                                       onerror="this.style.display='none'"></video>
                            `;
                        } else if (story.mediaType === 'text' && story.textContent) {
                            mediaContent = `
                                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${story.textBgColor || '#1a1a2e'};padding:16px;text-align:center;font-size:14px;color:rgba(255,255,255,0.6);font-weight:500;overflow:hidden;">
                                    ${story.textContent.substring(0, 60)}${story.textContent.length > 60 ? '...' : ''}
                                </div>
                            `;
                        } else {
                            mediaContent = `
                                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:rgba(255,255,255,0.15);font-size:32px;">
                                    ${story.mediaType === 'video' ? '🎬' : story.hasSubtitles ? '💬' : '📝'}
                                </div>
                            `;
                        }

                        const subtitleText = story.subtitles || story.caption || story.textContent || '';
                        const subtitlePreview = subtitleText.length > 60 ? subtitleText.substring(0, 60) + '...' : subtitleText;

                        let relevanceBadge = '';
                        const relevance = story.relevanceScore || 0;
                        if (relevance > 70) {
                            relevanceBadge = `<span class="relevance-badge" style="position:absolute;top:8px;left:8px;z-index:5;background:rgba(34,197,94,0.2);padding:2px 8px;border-radius:10px;font-size:7px;color:#22c55e;border:1px solid rgba(34,197,94,0.1);">⭐ ${relevance}%</span>`;
                        } else if (relevance > 50) {
                            relevanceBadge = `<span class="relevance-badge" style="position:absolute;top:8px;left:8px;z-index:5;background:rgba(192,132,252,0.15);padding:2px 8px;border-radius:10px;font-size:7px;color:#c084fc;border:1px solid rgba(192,132,252,0.05);">🔍 ${relevance}%</span>`;
                        }

                        // 🔥 MOSTRAR BADGE DE CATEGORÍA SI COINCIDE
                        let categoryBadge = '';
                        if (story.categoryMatch && detectedCategoryName) {
                            categoryBadge = `
                                <span class="category-match-badge" style="position:absolute;top:8px;right:8px;z-index:5;background:rgba(192,132,252,0.2);padding:2px 8px;border-radius:10px;font-size:7px;color:#c084fc;border:1px solid rgba(192,132,252,0.1);">
                                    ${detectedCategoryEmoji || '📂'} ${detectedCategoryName}
                                </span>
                            `;
                        }

                        const sources = story.sources || [];
                        const sourceBadges = sources.slice(0, 3).map(source => {
                            let label = source;
                            if (source.includes('Semántico')) label = '🔍 Semántico';
                            if (source.includes('Subtítulos')) label = '🎤 Subtítulos';
                            if (source.includes('Descripción')) label = '📝 Descripción';
                            if (source.includes('Hashtag')) label = '# Hashtag';
                            if (source.includes('Texto')) label = '📄 Texto';
                            return `<span class="source-badge" style="font-size:7px;background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:8px;margin-right:2px;color:rgba(255,255,255,0.3);">${label}</span>`;
                        }).join('');

                        const langBadge = story.language && story.language !== 'es' ?
                            `<span class="lang-badge" style="position:absolute;bottom:8px;right:8px;z-index:5;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:10px;font-size:7px;color:rgba(255,255,255,0.15);">
                                ${story.language.toUpperCase()}
                            </span>` : '';

                        return `
                            <div class="story-thumb" onclick="window.openStoryFromExplore('${story.id}')">
                                ${mediaContent}
                                ${story.hasSubtitles ? '<span class="subtitles-badge" style="position:absolute;top:8px;right:8px;z-index:5;background:rgba(192,132,252,0.15);padding:2px 6px;border-radius:4px;font-size:7px;color:#c084fc;">CC</span>' : ''}
                                ${relevanceBadge}
                                ${categoryBadge}
                                ${langBadge}
                                <div class="overlay">
                                    <div class="likes">
                                        <i class="fas fa-heart"></i>
                                        ${formatNumber(story.likes?.length || 0)}
                                    </div>
                                    ${subtitlePreview ? `<div class="subtitle-preview">💬 ${subtitlePreview}</div>` : ''}
                                    ${sourceBadges ? `<div class="source-badges" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:2px;">${sourceBadges}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    content.innerHTML = html;
}

// ============================================================
// 🔥 SEGUIR USUARIO DESDE EXPLORE
// ============================================================

async function followUserFromExplore(userId, btn) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para seguir', true);
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
            btn.textContent = isFollowing ? 'Seguir' : 'Siguiendo';
            showToast(isFollowing ? 'Dejaste de seguir' : 'Ahora sigues a este usuario');
        } else {
            showToast(data.error || 'Error', true);
        }
    } catch (error) {
        console.error('Error en follow:', error);
        showToast('Error al procesar', true);
    }
}

// ============================================================
// 🔥 ACCIONES GLOBALES - SUPERPONER MODALES
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
        
        // 🔥 GUARDAR ESTADO COMPLETO ANTES DE ABRIR PERFIL
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
            showToast('Error al abrir perfil', true);
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
    openHashtagStories
};