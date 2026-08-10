// explore-modal.js - BÚSQUEDA HÍBRIDA CON RESULTADOS PRIORIZADOS
// Y SUPERPOSICIÓN DE MODALES
// 🔥 FILTRO DE PRIVACIDAD: Solo usuarios públicos aparecen
// 🔥 MANTIENE LA PESTAÑA ACTIVA AL VOLVER

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
let savedTab = 'trending'; // 🔥 Guardar la pestaña activa
let lastLoadedData = null; // 🔥 CACHÉ DE DATOS CARGADOS

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
                    🔍 Híbrida (literal + semántica)
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
    
    // Eventos
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
                loadExploreData(currentTab);
            }
        }, 400);
    });
    
    // Búsqueda con Enter
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query.length >= 2) {
                clearTimeout(searchTimeout);
                performSmartSearch(query);
            }
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeExploreModal();
        }
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

// ============================================================
// 🔥 FILTRAR HISTORIAS POR PRIVACIDAD
// ============================================================

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
// 🔥 ABRIR MODAL - SIEMPRE RECARGA DATOS
// ============================================================

function openExploreModal() {
    if (!exploreOverlay) createExploreModal();
    
    // 🔥 Usar la pestaña guardada, o 'trending' si es la primera vez
    const tabToLoad = savedTab || 'trending';
    currentTab = tabToLoad;
    currentSearchResults = [];
    currentSearchQuery = '';
    searchInProgress = false;
    
    // 🔥 Actualizar tabs visualmente
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        const isActive = btn.dataset.tab === tabToLoad;
        btn.classList.toggle('active', isActive);
    });
    
    const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
    if (searchInput) searchInput.value = '';
    
    isOpen = true;
    exploreOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // 🔥 CARGAR DATOS FRESCOS
    loadExploreData(tabToLoad);
}

// ============================================================
// 🔥 MOSTRAR MODAL SIN RECARGAR (PARA VOLVER DE PERFIL)
// ============================================================

function showExploreModal() {
    if (!exploreOverlay) {
        createExploreModal();
        openExploreModal();
        return;
    }
    
    console.log(`📌 Mostrando explore-modal sin recargar (pestaña: ${savedTab || currentTab})`);
    
    // 🔥 Restaurar la pestaña activa visualmente
    const tabToShow = savedTab || currentTab || 'trending';
    currentTab = tabToShow;
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        const isActive = btn.dataset.tab === tabToShow;
        btn.classList.toggle('active', isActive);
    });
    
    // 🔥 Si hay datos en caché, no recargar
    const content = document.getElementById('exploreContent');
    if (content && lastLoadedData && lastLoadedData.tab === tabToShow) {
        console.log(`📦 Usando datos en caché para ${tabToShow}`);
        // No recargar, solo mostrar
    } else {
        console.log(`📡 No hay caché para ${tabToShow}, cargando...`);
        // Si no hay caché, cargar datos
        setTimeout(() => loadExploreData(tabToShow), 100);
    }
    
    isOpen = true;
    exploreOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ============================================================
// CERRAR
// ============================================================

function closeExploreModal() {
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
    currentTab = tab;
    savedTab = tab; // 🔥 Guardar la pestaña activa
    
    const tabs = exploreOverlay.querySelectorAll('.explore-tabs button');
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    const searchInput = exploreOverlay.querySelector('#exploreSearchInput');
    if (searchInput) searchInput.value = '';
    currentSearchQuery = '';
    currentSearchResults = [];
    searchInProgress = false;
    
    loadExploreData(tab);
}

// ============================================================
// 🔥 BÚSQUEDA HÍBRIDA CON PRIORIDAD DE USUARIOS Y FILTRO DE PRIVACIDAD
// ============================================================

async function performSmartSearch(query) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para buscar', true);
        return;
    }

    if (searchInProgress) return;
    searchInProgress = true;

    const content = document.getElementById('exploreContent');
    if (!content) return;

    content.innerHTML = `
        <div class="explore-empty">
            <i class="fas fa-spinner fa-pulse"></i>
            <h3>Buscando "${query}"...</h3>
            <p style="font-size:12px;color:rgba(255,255,255,0.2);">
                🔍 Búsqueda híbrida: literal + semántica (100+ idiomas)
            </p>
        </div>
    `;

    try {
        const usersRes = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let users = [];
        if (usersRes.ok) {
            const allUsers = await usersRes.json();
            users = filterPublicUsers(allUsers);
            console.log(`👥 Usuarios encontrados (públicos): ${users.length} de ${allUsers.length} totales`);
        }

        const hybridRes = await fetch(`${API_URL}/api/stories/search/hybrid?q=${encodeURIComponent(query)}&limit=30`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let stories = [];
        let meta = {};

        if (hybridRes.ok) {
            const result = await hybridRes.json();
            const allStories = (result.data || []).filter(s => {
                const relevance = s.relevanceScore || 0;
                return relevance > 30;
            });
            stories = filterPublicStories(allStories);
            meta = result.meta || {};
            console.log(`📸 Historias relevantes (públicas): ${stories.length} de ${allStories.length} totales`);
        }

        if (stories.length === 0 && users.length === 0) {
            content.innerHTML = `
                <div class="explore-empty">
                    <i class="fas fa-search"></i>
                    <h3>No se encontraron resultados para "${query}"</h3>
                    <p>Prueba con otras palabras clave</p>
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

        currentSearchResults = stories;
        renderSearchResults(query, stories, users, meta);

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
// 🔥 RENDERIZAR RESULTADOS CON USUARIOS ARRIBA
// ============================================================

function renderSearchResults(query, stories, users, meta) {
    const content = document.getElementById('exploreContent');
    if (!content) return;

    const currentUser = getCurrentUser();
    const currentUserId = currentUser?.id;

    const filteredStories = stories.filter(s => s.userId !== currentUserId);

    let html = `
        <div class="explore-section">
            <div class="section-title">
                🔍 Resultados para "${query}"
                <span style="font-size:10px;color:rgba(255,255,255,0.1);margin-left:8px;">
                    ${filteredStories.length} historias · ${users.length} usuarios públicos
                </span>
            </div>
    `;

    if (users.length > 0) {
        html += `
            <div style="margin-bottom:16px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-weight:600;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px;">
                    👥 Usuarios públicos (${users.length})
                </div>
                <div class="explore-users">
                    ${users.map(user => {
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

    if (filteredStories.length > 0) {
        html += `
            <div>
                <div style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-weight:600;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.04);padding-bottom:6px;">
                    📸 Historias relacionadas (${filteredStories.length})
                    ${meta?.algorithm ? `<span style="font-size:9px;color:rgba(255,255,255,0.08);margin-left:8px;font-weight:400;">${meta.algorithm}</span>` : ''}
                </div>
                <div class="explore-grid">
                    ${filteredStories.slice(0, 30).map(story => {
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

    if (filteredStories.length < 5 && users.length < 3) {
        html += `
            <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.03);">
                <div style="font-size:11px;color:rgba(255,255,255,0.2);margin-bottom:8px;">💡 Prueba con estas palabras clave:</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${getRelatedSuggestions(query).map(s => `
                        <span class="trending-hashtag" onclick="window.performSmartSearch('${s}')" style="font-size:11px;padding:4px 12px;background:rgba(255,255,255,0.03);border-radius:16px;cursor:pointer;color:rgba(255,255,255,0.2);">#${s}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    content.innerHTML = html;
}

// ============================================================
// 🔥 SUGERENCIAS RELACIONADAS
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
        'arte': ['pintura', 'dibujo', 'escultura', 'museos', 'creatividad', 'exposiciones', 'galerias']
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
// CARGAR DATOS DE EXPLORACIÓN
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
                console.log(`📸 Historias públicas: ${data.stories.length} de ${allStories.length} totales`);
            }
        }
        
        if (tab === 'users') {
            const url = `${API_URL}/api/users/popular${currentUserId ? '?userId=' + currentUserId : ''}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const allUsers = await res.json();
                data.users = filterPublicUsers(allUsers).slice(0, 10);
                console.log(`👥 Usuarios populares (públicos): ${data.users.length} de ${allUsers.length} totales`);
            }
        }
        
        if (tab === 'trending') {
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
            }
        }
        
        // 🔥 GUARDAR EN CACHÉ PARA MOSTRAR DESPUÉS SIN RECARGAR
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
            </div>
        `;
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
// BUSCAR HISTORIAS POR HASHTAG
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

// 🔥 ABRIR PERFIL DESDE EXPLORE - CORREGIDO
window.openProfileFromExplore = (userId) => {
    if (userId) {
        window._fromExploreModal = true;
        
        if (typeof window.openProfileModal === 'function') {
            window.openProfileModal(userId, false, { 
                fromExplore: true,
                returnToExplore: true,
                savedTab: savedTab // 🔥 Pasar la pestaña guardada
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

// 🔥 SEGUIR USUARIO DESDE EXPLORE
window.followUserFromExplore = async (userId, btn) => {
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
};

// ============================================================
// EXPORTAR
// ============================================================

export { 
    openExploreModal, 
    showExploreModal, // 🔥 NUEVA FUNCIÓN EXPORTADA
    closeExploreModal 
};