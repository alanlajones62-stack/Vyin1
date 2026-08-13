// ============================================================
// ads-feed.js - Sistema de publicidad mejorado
// CON TEMPORIZADOR DE 15 SEGUNDOS Y LÍMITE POR PUBLICIDAD
// ============================================================

import { getToken, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

let cachedAds = [];
let isLoadingAds = false;
let socket = null;
let adTimers = {};
let adQueue = [];
let currentAdIndex = 0;
let isAdPlaying = false;

// ============================================================
// CLAVES PARA LOCALSTORAGE
// ============================================================

const ADS_HISTORY_KEY = 'vyin_ads_history';
const ADS_DATE_KEY = 'vyin_ads_date';
const ADS_TOTAL_KEY = 'vyin_ads_total_today';

// ============================================================
// ESTRUCTURA DE DATOS PARA HISTORIAL DE PUBLICIDADES
// ============================================================

/*
{
  "adId_123": {
    "views": 3,           // Veces que se ha mostrado hoy
    "lastView": "2024-01-15T14:30:00.000Z",
    "cooldownUntil": "2024-01-15T14:45:00.000Z"
  },
  "adId_456": {
    "views": 1,
    "lastView": "2024-01-15T14:25:00.000Z",
    "cooldownUntil": null
  }
}
*/

// ============================================================
// INICIALIZAR SOCKET
// ============================================================

export function initAdsSocket(socketInstance) {
    socket = socketInstance;
    
    if (!socket) return;

    socket.on('ad_liked', (data) => {
        console.log('📢 Like en publicidad:', data);
        updateAdStats(data.adId, {
            likes: data.likes,
            likesCount: data.likesCount
        });
    });

    socket.on('ad_viewed', (data) => {
        console.log('👁️ Vista en publicidad:', data);
        updateAdStats(data.adId, {
            views: data.views
        });
    });

    socket.on('ad_approved', (data) => {
        console.log('✅ Publicidad aprobada:', data);
        loadActiveAds().then(() => {
            if (window._renderAdsCallback) {
                window._renderAdsCallback(cachedAds);
            }
        });
    });
}

// ============================================================
// 🔥 GESTIÓN DE HISTORIAL DE PUBLICIDADES
// ============================================================

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function loadAdHistory() {
    const today = getTodayDate();
    const savedDate = localStorage.getItem(ADS_DATE_KEY);
    
    // Si es un nuevo día, resetear todo
    if (savedDate !== today) {
        localStorage.setItem(ADS_DATE_KEY, today);
        localStorage.setItem(ADS_HISTORY_KEY, JSON.stringify({}));
        localStorage.setItem(ADS_TOTAL_KEY, '0');
        return {};
    }
    
    try {
        const history = JSON.parse(localStorage.getItem(ADS_HISTORY_KEY) || '{}');
        const total = parseInt(localStorage.getItem(ADS_TOTAL_KEY) || '0');
        console.log(`📊 Publicidades vistas hoy: ${total}`);
        return history;
    } catch (e) {
        return {};
    }
}

function saveAdHistory(history) {
    try {
        localStorage.setItem(ADS_HISTORY_KEY, JSON.stringify(history));
        const total = Object.values(history).reduce((sum, h) => sum + (h.views || 0), 0);
        localStorage.setItem(ADS_TOTAL_KEY, String(total));
    } catch (e) {}
}

function canShowAd(adId, history) {
    const today = getTodayDate();
    const savedDate = localStorage.getItem(ADS_DATE_KEY);
    
    // Si es un nuevo día, resetear
    if (savedDate !== today) {
        localStorage.setItem(ADS_DATE_KEY, today);
        localStorage.setItem(ADS_HISTORY_KEY, JSON.stringify({}));
        localStorage.setItem(ADS_TOTAL_KEY, '0');
        return true;
    }
    
    const adHistory = history[adId];
    
    // Si no hay historial, se puede mostrar
    if (!adHistory) {
        return true;
    }
    
    // 🔥 LÍMITE: Máximo 3 veces por día por publicidad
    if (adHistory.views >= 3) {
        console.log(`⛔ Publicidad ${adId} ya vista 3 veces hoy`);
        return false;
    }
    
    // 🔥 COOLDOWN: No repetir inmediatamente (5 minutos entre misma publicidad)
    if (adHistory.cooldownUntil) {
        const cooldownTime = new Date(adHistory.cooldownUntil);
        if (new Date() < cooldownTime) {
            console.log(`⏳ Publicidad ${adId} en cooldown hasta ${adHistory.cooldownUntil}`);
            return false;
        }
    }
    
    // 🔥 LÍMITE TOTAL: Máximo 40 publicidades por día
    const totalViews = Object.values(history).reduce((sum, h) => sum + (h.views || 0), 0);
    if (totalViews >= 40) {
        console.log(`⛔ Límite de 40 publicidades por día alcanzado`);
        return false;
    }
    
    return true;
}

function registerAdViewToday(adId, history) {
    const today = getTodayDate();
    
    if (!history[adId]) {
        history[adId] = {
            views: 0,
            lastView: null,
            cooldownUntil: null
        };
    }
    
    history[adId].views = (history[adId].views || 0) + 1;
    history[adId].lastView = new Date().toISOString();
    
    // 🔥 COOLDOWN: 5 minutos antes de poder mostrar la misma publicidad
    const cooldownMinutes = 5;
    const cooldownTime = new Date(Date.now() + cooldownMinutes * 60 * 1000);
    history[adId].cooldownUntil = cooldownTime.toISOString();
    
    saveAdHistory(history);
    
    const totalViews = Object.values(history).reduce((sum, h) => sum + (h.views || 0), 0);
    console.log(`👁️ Publicidad ${adId} registrada (${history[adId].views}/3, total: ${totalViews}/40)`);
    
    return history;
}

// ============================================================
// CARGAR PUBLICIDADES ACTIVAS
// ============================================================

export async function loadActiveAds() {
    const token = getToken();
    if (!token) {
        console.log('🔒 Sin sesión, no se pueden cargar publicidades');
        return [];
    }

    if (isLoadingAds) return cachedAds;
    isLoadingAds = true;

    try {
        const res = await fetch(`${API_URL}/api/ads/active?limit=50`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error('Error cargando publicidades');
        }

        const data = await res.json();
        cachedAds = data.ads || [];
        
        // 🔥 MEZCLAR PUBLICIDADES (DESORDENADAS)
        cachedAds = shuffleArray(cachedAds);
        
        // 🔥 FILTRAR PUBLICIDADES QUE YA NO SE PUEDEN MOSTRAR
        const history = loadAdHistory();
        const availableAds = cachedAds.filter(ad => canShowAd(ad.id, history));
        
        console.log(`📢 ${cachedAds.length} publicidades cargadas, ${availableAds.length} disponibles`);
        return availableAds;
    } catch (error) {
        console.error('Error cargando publicidades:', error);
        return [];
    } finally {
        isLoadingAds = false;
    }
}

// ============================================================
// 🔥 FUNCIÓN PARA MEZCLAR ARRAY
// ============================================================

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ============================================================
// 🔥 OBTENER SIGUIENTE PUBLICIDAD (CON COOLDOWN)
// ============================================================

export function getNextAd() {
    const history = loadAdHistory();
    
    // Filtrar publicidades disponibles
    const availableAds = cachedAds.filter(ad => canShowAd(ad.id, history));
    
    if (availableAds.length === 0) {
        console.log('📭 No hay publicidades disponibles');
        return null;
    }
    
    // 🔥 PRIORIZAR PUBLICIDADES CON MENOS VISTAS
    availableAds.sort((a, b) => {
        const aViews = history[a.id]?.views || 0;
        const bViews = history[b.id]?.views || 0;
        return aViews - bViews;
    });
    
    // Tomar la primera (la que menos veces se ha visto)
    const ad = availableAds[0];
    
    // Registrar vista
    registerAdViewToday(ad.id, history);
    
    return ad;
}

// ============================================================
// REGISTRAR VISTA DE PUBLICIDAD
// ============================================================

export async function registerAdView(adId) {
    const token = getToken();
    if (!token) return;

    const history = loadAdHistory();
    
    // 🔥 VERIFICAR SI SE PUEDE MOSTRAR
    if (!canShowAd(adId, history)) {
        console.log(`⛔ No se puede mostrar publicidad ${adId}`);
        return false;
    }

    try {
        const res = await fetch(`${API_URL}/api/ads/${adId}/view`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            
            // 🔥 REGISTRAR VISTA EN EL HISTORIAL
            registerAdViewToday(adId, history);
            
            console.log(`✅ Vista registrada para publicidad ${adId}`);
            
            // Actualizar vista localmente
            updateAdStats(adId, { views: data.views });
            
            // 🔥 INICIAR TEMPORIZADOR DE 15 SEGUNDOS
            startAdTimer(adId);
            
            return true;
        }
    } catch (error) {
        console.error('Error registrando vista de publicidad:', error);
    }
    return false;
}

// ============================================================
// 🔥 TEMPORIZADOR DE 15 SEGUNDOS PARA PUBLICIDAD
// ============================================================

function startAdTimer(adId) {
    // Limpiar temporizador anterior si existe
    if (adTimers[adId]) {
        clearInterval(adTimers[adId].interval);
        clearTimeout(adTimers[adId].timeout);
        delete adTimers[adId];
    }
    
    // Buscar el elemento de la publicidad
    const card = document.querySelector(`.ad-card[data-ad-id="${adId}"]`);
    if (!card) return;
    
    // Crear o actualizar indicador de tiempo
    let timerIndicator = card.querySelector('.ad-timer');
    if (!timerIndicator) {
        timerIndicator = document.createElement('div');
        timerIndicator.className = 'ad-timer';
        timerIndicator.innerHTML = `
            <div class="ad-timer-ring">
                <svg viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="17" fill="none" class="ad-timer-bg"/>
                    <circle cx="20" cy="20" r="17" fill="none" class="ad-timer-progress" stroke-dasharray="106.8" stroke-dashoffset="0"/>
                </svg>
                <span class="ad-timer-text">15</span>
            </div>
            <span class="ad-timer-label">segundos</span>
        `;
        const actionsBox = card.querySelector('.actions-box');
        if (actionsBox) {
            actionsBox.parentNode.insertBefore(timerIndicator, actionsBox);
        }
    }
    
    const progressCircle = timerIndicator.querySelector('.ad-timer-progress');
    const textSpan = timerIndicator.querySelector('.ad-timer-text');
    const labelSpan = timerIndicator.querySelector('.ad-timer-label');
    let seconds = 15;
    const circumference = 106.8; // 2 * PI * 17
    
    // Mostrar indicador
    timerIndicator.style.display = 'block';
    timerIndicator.classList.add('active');
    
    // Animar
    const interval = setInterval(() => {
        seconds--;
        const progress = ((15 - seconds) / 15) * 100;
        const offset = circumference - (progress / 100) * circumference;
        
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = offset;
        }
        if (textSpan) {
            textSpan.textContent = seconds;
        }
        
        if (seconds <= 0) {
            clearInterval(interval);
            timerIndicator.classList.remove('active');
            timerIndicator.style.display = 'none';
            
            // 🔥 EMITIR EVENTO DE PUBLICIDAD VISTA COMPLETA
            if (socket && socket.connected) {
                socket.emit('ad_watched', { adId });
            }
            
            // 🔥 CARGAR SIGUIENTE PUBLICIDAD
            setTimeout(() => {
                loadNextAd();
            }, 1000);
            
            delete adTimers[adId];
        }
    }, 1000);
    
    // Guardar referencia
    adTimers[adId] = {
        interval: interval,
        timeout: setTimeout(() => {
            clearInterval(interval);
        }, 16000)
    };
}

// ============================================================
// 🔥 CARGAR SIGUIENTE PUBLICIDAD
// ============================================================

function loadNextAd() {
    if (isAdPlaying) return;
    isAdPlaying = true;
    
    const nextAd = getNextAd();
    
    if (!nextAd) {
        // No hay más publicidades disponibles
        const container = document.getElementById('feedContainer');
        if (container) {
            const adContainer = container.querySelector('.ad-container');
            if (adContainer) {
                adContainer.innerHTML = `
                    <div class="ad-limit-message">
                        <i class="fas fa-check-circle" style="color:#22c55e;font-size:32px;"></i>
                        <span style="font-size:16px;font-weight:600;margin-top:8px;">¡Has visto todas las publicidades!</span>
                        <p style="font-size:13px;color:rgba(255,255,255,0.2);margin-top:4px;">
                            Has visto ${Object.values(loadAdHistory()).reduce((sum, h) => sum + (h.views || 0), 0)} de 40 publicidades hoy
                        </p>
                        <p style="font-size:11px;color:rgba(255,255,255,0.1);margin-top:2px;">Vuelve mañana para ver más</p>
                    </div>
                `;
            }
        }
        isAdPlaying = false;
        return;
    }
    
    // Renderizar la siguiente publicidad
    renderSingleAd(nextAd);
    
    setTimeout(() => {
        isAdPlaying = false;
    }, 100);
}

// ============================================================
// 🔥 RENDERIZAR UNA SOLA PUBLICIDAD
// ============================================================

function renderSingleAd(ad) {
    const container = document.getElementById('feedContainer');
    if (!container) return;
    
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = currentUser?.id;
    const isLiked = ad.likes?.includes(userId) || false;
    const likesCount = ad.likes?.length || 0;
    const viewsCount = ad.views || 0;
    const history = loadAdHistory();
    const adViews = history[ad.id]?.views || 0;
    const totalViews = Object.values(history).reduce((sum, h) => sum + (h.views || 0), 0);
    
    // Buscar o crear contenedor de publicidad
    let adContainer = container.querySelector('.ad-container');
    if (!adContainer) {
        adContainer = document.createElement('div');
        adContainer.className = 'ad-container';
        container.prepend(adContainer);
    }
    
    adContainer.innerHTML = `
        <div class="ad-progress-info">
            <span class="ad-progress-text">
                Publicidad ${adViews + 1}/3 · Total ${totalViews + 1}/40 hoy
            </span>
            <div class="ad-progress-bar">
                <div class="ad-progress-fill" style="width: ${((adViews + 1) / 3) * 100}%"></div>
            </div>
        </div>
        
        <div class="story-card ad-card" data-ad-id="${ad.id}" data-index="ad-current">
            <div class="card-header ad-header">
                <div class="ad-badge">
                    <i class="fas fa-bullhorn" style="color:#fbbf24;"></i>
                    <span style="color:#fbbf24;font-weight:600;font-size:11px;">PUBLICIDAD</span>
                    <span class="ad-sponsored">Patrocinado</span>
                </div>
                <div class="ad-business-info">
                    <span class="ad-business-name">${escapeHtml(ad.businessName || 'Empresa')}</span>
                    ${ad.isVerified ? '<i class="fas fa-check-circle" style="color:#c084fc;font-size:12px;"></i>' : ''}
                </div>
            </div>
            
            <div class="card-media ad-media" onclick="window.handleAdClick('${ad.id}')">
                ${ad.imageUrl ? `<img src="${ad.imageUrl}" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/800x800/1a1a2e/fbbf24?text=Publicidad'" />` : `
                    <div class="text-placeholder" style="background:linear-gradient(135deg,#1a1a2e,#2d1b3d);">
                        <i class="fas fa-bullhorn" style="color:#fbbf24;font-size:48px;margin-bottom:16px;display:block;opacity:0.6;"></i>
                        <span style="font-size:22px;font-weight:600;color:#fff;text-shadow:0 2px 20px rgba(0,0,0,0.5);">${escapeHtml(ad.title)}</span>
                    </div>
                `}
                <div class="ad-click-overlay">
                    <span class="ad-click-text"><i class="fas fa-external-link-alt"></i> Ver más</span>
                </div>
            </div>
            
            <div class="card-actions-center ad-actions-center">
                <div class="ad-title">${escapeHtml(ad.title)}</div>
                <div class="ad-description">${escapeHtml(ad.description)}</div>
                
                <div class="actions-box">
                    <div class="actions">
                        <div class="ad-stats">
                            <span class="stat-views"><i class="fas fa-eye"></i> ${formatNumber(viewsCount)}</span>
                            <span class="stat-likes"><i class="fas fa-heart" style="color:${isLiked ? '#ff6b6b' : 'inherit'}"></i> ${formatNumber(likesCount)}</span>
                        </div>
                        <div class="btns">
                            <button class="btn-like ad-like-btn ${isLiked ? 'liked' : ''}" data-ad-id="${ad.id}">
                                <i class="fas fa-heart"></i> ${isLiked ? 'Quitar' : 'Like'}
                            </button>
                            <button class="btn-share ad-share-btn" data-ad-id="${ad.id}">
                                <i class="fas fa-share-alt"></i>
                            </button>
                        </div>
                    </div>
                    ${ad.linkUrl ? `
                        <button class="btn-ad-link" onclick="window.handleAdClick('${ad.id}')">
                            <i class="fas fa-external-link-alt"></i> Ver más
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <div class="card-footer"></div>
        </div>
    `;
    
    // 🔥 INICIAR TEMPORIZADOR
    setTimeout(() => {
        registerAdView(ad.id);
    }, 500);
    
    // Configurar eventos
    setTimeout(() => {
        const card = adContainer.querySelector('.ad-card');
        if (!card) return;
        const adId = card.dataset.adId;
        
        const likeBtn = card.querySelector('.ad-like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.handleAdLike(adId, likeBtn);
            });
        }
        
        const shareBtn = card.querySelector('.ad-share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = `${window.location.origin}/ad/${adId}`;
                if (navigator.share) {
                    navigator.share({ title: 'Vyin Social - Publicidad', url });
                } else {
                    navigator.clipboard?.writeText(url).then(() => {
                        showToast('📋 Enlace copiado');
                    });
                }
            });
        }
    }, 200);
}

// ============================================================
// ACTUALIZAR ESTADÍSTICAS DE PUBLICIDAD EN EL DOM
// ============================================================

function updateAdStats(adId, data) {
    // Actualizar en caché
    const ad = cachedAds.find(a => a.id === adId);
    if (ad) {
        if (data.likes !== undefined) ad.likes = data.likes;
        if (data.likesCount !== undefined) ad.likesCount = data.likesCount;
        if (data.views !== undefined) ad.views = data.views;
    }

    // Actualizar en el DOM
    const card = document.querySelector(`.ad-card[data-ad-id="${adId}"]`);
    if (!card) return;

    if (data.views !== undefined) {
        const viewSpan = card.querySelector('.stat-views');
        if (viewSpan) {
            viewSpan.innerHTML = `<i class="fas fa-eye"></i> ${formatNumber(data.views)}`;
        }
    }

    if (data.likesCount !== undefined) {
        const likeSpan = card.querySelector('.stat-likes');
        if (likeSpan) {
            const userId = JSON.parse(localStorage.getItem('user') || '{}')?.id;
            const isLiked = data.likes?.includes(userId) || false;
            likeSpan.innerHTML = `<i class="fas fa-heart" style="color:${isLiked ? '#ff6b6b' : 'inherit'}"></i> ${formatNumber(data.likesCount)}`;
        }
    }

    if (data.likes !== undefined) {
        const userId = JSON.parse(localStorage.getItem('user') || '{}')?.id;
        const isLiked = data.likes.includes(userId) || false;
        const likeBtn = card.querySelector('.ad-like-btn');
        if (likeBtn) {
            likeBtn.classList.toggle('liked', isLiked);
            likeBtn.innerHTML = isLiked ? '<i class="fas fa-heart"></i> Quitar' : '<i class="fas fa-heart"></i> Like';
        }
    }
}

// ============================================================
// REGISTRAR CLICK EN PUBLICIDAD
// ============================================================

export async function registerAdClick(adId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/ads/${adId}/click`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data.linkUrl) {
                window.open(data.linkUrl, '_blank');
            }
        }
    } catch (error) {
        console.error('Error registrando click en publicidad:', error);
    }
}

// ============================================================
// 🔥 RENDER PUBLICIDADES EN EL FEED - PUNTO DE ENTRADA
// ============================================================

export function renderAds(ads, container) {
    if (!ads || ads.length === 0) {
        return '';
    }

    // Guardar callback para actualizar
    window._renderAdsCallback = renderAds;
    
    // 🔥 CARGAR HISTORIAL
    const history = loadAdHistory();
    const totalViews = Object.values(history).reduce((sum, h) => sum + (h.views || 0), 0);
    
    // 🔥 VERIFICAR SI YA SE ALCANZÓ EL LÍMITE
    if (totalViews >= 40) {
        return `
            <div class="ad-limit-message">
                <i class="fas fa-check-circle" style="color:#22c55e;font-size:36px;"></i>
                <span style="font-size:18px;font-weight:600;margin-top:8px;">¡Has visto todas las publicidades!</span>
                <p style="font-size:13px;color:rgba(255,255,255,0.2);margin-top:4px;">
                    Has visto ${totalViews} de 40 publicidades hoy
                </p>
                <p style="font-size:11px;color:rgba(255,255,255,0.1);margin-top:2px;">Vuelve mañana para ver más</p>
            </div>
        `;
    }
    
    // 🔥 ACTUALIZAR CACHÉ
    cachedAds = ads;
    
    // 🔥 INICIAR COLA DE PUBLICIDADES
    adQueue = [];
    isAdPlaying = false;
    
    // 🔥 CARGAR PRIMERA PUBLICIDAD
    setTimeout(() => {
        const nextAd = getNextAd();
        if (nextAd) {
            renderSingleAd(nextAd);
        } else {
            // Mostrar mensaje de no disponibles
            const containerEl = document.getElementById('feedContainer');
            if (containerEl) {
                let adContainer = containerEl.querySelector('.ad-container');
                if (!adContainer) {
                    adContainer = document.createElement('div');
                    adContainer.className = 'ad-container';
                    containerEl.prepend(adContainer);
                }
                adContainer.innerHTML = `
                    <div class="ad-limit-message">
                        <i class="fas fa-clock" style="color:#c084fc;font-size:36px;"></i>
                        <span style="font-size:18px;font-weight:600;margin-top:8px;">Publicidades disponibles</span>
                        <p style="font-size:13px;color:rgba(255,255,255,0.2);margin-top:4px;">
                            No hay publicidades disponibles en este momento
                        </p>
                        <p style="font-size:11px;color:rgba(255,255,255,0.1);margin-top:2px;">Vuelve más tarde</p>
                    </div>
                `;
            }
        }
    }, 300);
    
    return '';
}

// ============================================================
// FUNCIONES GLOBALES PARA WINDOW
// ============================================================

window.handleAdClick = async function(adId) {
    await registerAdClick(adId);
};

window.handleAdLike = async function(adId, btn) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
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
            btn.innerHTML = data.liked ? '<i class="fas fa-heart"></i> Quitar' : '<i class="fas fa-heart"></i> Like';
            
            const card = btn.closest('.ad-card');
            if (card) {
                const likeSpan = card.querySelector('.stat-likes');
                if (likeSpan) {
                    likeSpan.innerHTML = `<i class="fas fa-heart" style="color:${data.liked ? '#ff6b6b' : 'inherit'}"></i> ${formatNumber(data.likesCount || 0)}`;
                }
            }

            const ad = cachedAds.find(a => a.id === adId);
            if (ad) {
                ad.likes = data.likes;
                ad.likesCount = data.likesCount;
            }
            
            showToast(data.liked ? '❤️ Like guardado' : '💔 Like eliminado');
        }
    } catch (error) {
        console.error('Error dando like a publicidad:', error);
        showToast('Error al procesar like', true);
    }
};

// ============================================================
// INICIALIZAR
// ============================================================

loadAdHistory();
console.log('📢 Sistema de publicidad inicializado (40 por día, 3 por anuncio, 15 segundos)');

// ============================================================
// EXPORTAR
// ============================================================

export { loadAdHistory, canShowAd, registerAdViewToday, getNextAd };