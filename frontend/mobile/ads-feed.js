// ============================================================
// ads-feed.js - Carga y muestra publicidades en el feed
// ============================================================

import { getToken, showToast, getAvatar, formatDate, escapeHtml } from './auth.js';
import { formatNumber } from './utils.js';

const API_URL = window.location.origin;

let cachedAds = [];
let isLoadingAds = false;

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
        const res = await fetch(`${API_URL}/api/ads/active?limit=10`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error('Error cargando publicidades');
        }

        const data = await res.json();
        cachedAds = data.ads || [];
        console.log(`📢 Cargadas ${cachedAds.length} publicidades activas`);
        return cachedAds;
    } catch (error) {
        console.error('Error cargando publicidades:', error);
        return [];
    } finally {
        isLoadingAds = false;
    }
}

// ============================================================
// REGISTRAR VISTA DE PUBLICIDAD (SOLO UNA VEZ POR USUARIO)
// ============================================================

const viewedAds = new Set();

export async function registerAdView(adId) {
    const token = getToken();
    if (!token) return;

    // 🔥 PREVENIR VISTAS MÚLTIPLES DEL MISMO USUARIO
    const key = `${adId}_${token}`;
    if (viewedAds.has(key)) {
        console.log(`👁️ Vista de publicidad ${adId} ya registrada para este usuario`);
        return;
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
            viewedAds.add(key);
            console.log(`✅ Vista registrada para publicidad ${adId}`);
        }
    } catch (error) {
        console.error('Error registrando vista de publicidad:', error);
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
// RENDER PUBLICIDADES EN EL FEED
// ============================================================

export function renderAds(ads, container) {
    if (!ads || ads.length === 0) {
        return '';
    }

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = currentUser?.id;

    let html = '';

    // Mostrar máximo 3 publicidades por carga
    const adsToShow = ads.slice(0, 3);

    adsToShow.forEach((ad, index) => {
        const isLiked = ad.likes?.includes(userId) || false;
        const likesCount = ad.likes?.length || 0;
        const viewsCount = ad.views || 0;

        html += `
            <div class="story-card ad-card" data-ad-id="${ad.id}" data-index="ad-${index}">
                <div class="card-header ad-header">
                    <div class="ad-badge">
                        <i class="fas fa-bullhorn" style="color:#fbbf24;"></i>
                        <span style="color:#fbbf24;font-weight:600;font-size:11px;">PUBLICIDAD</span>
                    </div>
                    <div class="ad-business-info">
                        <span class="ad-business-name">${escapeHtml(ad.businessName || 'Empresa')}</span>
                        <span class="ad-sponsored">Patrocinado</span>
                    </div>
                </div>
                
                <div class="card-media ad-media" onclick="window.handleAdClick('${ad.id}')">
                    ${ad.imageUrl ? `<img src="${ad.imageUrl}" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/800x800/1a1a2e/fbbf24?text=Publicidad'" />` : `
                        <div class="text-placeholder" style="background:#1a1a2e;">
                            <i class="fas fa-bullhorn" style="color:#fbbf24;font-size:40px;margin-bottom:12px;display:block;"></i>
                            <span>${escapeHtml(ad.title)}</span>
                        </div>
                    `}
                </div>
                
                <div class="card-actions-center ad-actions-center">
                    <div class="caption ad-title">${escapeHtml(ad.title)}</div>
                    <div class="ad-description">${escapeHtml(ad.description)}</div>
                    <div class="actions-box">
                        <div class="actions">
                            <div class="stats">
                                <span><i class="fas fa-eye"></i> ${formatNumber(viewsCount)}</span>
                                <span><i class="fas fa-heart" style="color:${isLiked ? '#ff6b6b' : 'inherit'}"></i> ${formatNumber(likesCount)}</span>
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
    });

    return html;
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
            
            // Actualizar contador de likes
            const statsSpan = btn.closest('.actions').querySelector('.stats');
            if (statsSpan) {
                const likeSpan = statsSpan.querySelector('span:nth-child(2)');
                if (likeSpan) {
                    likeSpan.innerHTML = `<i class="fas fa-heart" style="color:${data.liked ? '#ff6b6b' : 'inherit'}"></i> ${formatNumber(data.likesCount || 0)}`;
                }
            }
            
            showToast(data.liked ? '❤️ Like guardado' : '💔 Like eliminado');
        }
    } catch (error) {
        console.error('Error dando like a publicidad:', error);
        showToast('Error al procesar like', true);
    }
};