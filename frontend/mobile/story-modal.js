// ============================================================
// story-modal.js - Modal para ver historias con navegación 
// (VERSIÓN CORREGIDA - CON BOTÓN ELIMINAR Y LIMPIEZA SEGURA)
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile, getUserLanguage
} from './auth.js';

import { formatNumber } from './utils.js';
import { loadComments, initComments, addCommentToCache, addReplyToCache, updateCommentLikes, updateCommentsUIWithoutReload } from './story-comments.js';

const API_URL = window.location.origin;
let currentStoryId = null;
let currentStoryData = null;
let isModalOpen = false;
let currentStoriesList = [];
let currentStoryIndex = 0;
let isNavigating = false;
let userLanguage = 'es';

// Caché de traducciones
let translationCache = {};

// ============================================================
// ABRIR MODAL
// ============================================================

export async function openStoryModal(storyId, storiesList = null, fromProfile = false, profileUserId = null) {
    if (!storyId) {
        showToast('Historia no encontrada', true);
        return;
    }

    console.log('📱 [STORY-MODAL] Abriendo historia:', storyId);

    const currentUser = getCurrentUser();
    userLanguage = currentUser?.language || 'es';

    // 🔥 AÑADIDO: Si el modal ya está abierto con la misma historia, solo mostrarlo
    if (isModalOpen && currentStoryId === storyId) {
        const overlay = document.getElementById('storyModalOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.add('active');
        }
        return;
    }

    if (isModalOpen) {
        console.log('📱 [STORY-MODAL] Cerrando modal anterior...');
        closeStoryModal();
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (fromProfile && profileUserId) {
        window._fromProfileModal = true;
        window._profileContextUserId = profileUserId;
    } else if (window._fromExploreModal) {
        // Mantener contexto de explorador
    } else if (window._fromActivityModal) {
        console.log('📱 [STORY-MODAL] Abriendo desde actividad');
    } else {
        window._fromProfileModal = false;
        window._profileContextUserId = null;
    }

    if (storiesList && Array.isArray(storiesList) && storiesList.length > 0) {
        currentStoriesList = storiesList;
        const index = currentStoriesList.findIndex(s => s.id === storyId);
        currentStoryIndex = index !== -1 ? index : 0;
        console.log(`📚 Carrusel activado: ${currentStoriesList.length} historias, índice: ${currentStoryIndex}`);
    } else {
        currentStoriesList = [];
        currentStoryIndex = 0;
        console.log('📚 Sin lista de historias, modo simple');
    }

    currentStoryId = storyId;
    isModalOpen = true;

    const overlay = document.getElementById('storyModalOverlay');
    if (!overlay) {
        createModalHTML();
    }

    const storyOverlay = document.getElementById('storyModalOverlay');
    if (storyOverlay) {
        storyOverlay.style.display = 'flex';
        storyOverlay.classList.add('active');
        
        if (window._fromExploreModal) {
            storyOverlay.style.zIndex = '10002';
        } else if (window._fromActivityModal) {
            storyOverlay.style.zIndex = '10001';
        } else {
            storyOverlay.style.zIndex = '10001';
        }
    }
    
    document.body.style.overflow = 'hidden';

    await loadStoryData(storyId);
}

// ============================================================
// CERRAR MODAL - CON LIMPIEZA DE CONTENIDO Y VERIFICACIONES
// ============================================================

export function closeStoryModal() {
    console.log('📱 [STORY-MODAL] Cerrando modal...');
    
    isModalOpen = false;
    currentStoryId = null;
    currentStoryData = null;
    currentStoriesList = [];
    currentStoryIndex = 0;
    isNavigating = false;

    const video = document.getElementById('storyVideo');
    if (video) {
        video.pause();
        video.src = '';
        video.load();
    }

    if (window._vttUrl) {
        URL.revokeObjectURL(window._vttUrl);
        window._vttUrl = null;
    }

    const overlay = document.getElementById('storyModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }
    
    // 🔥 LIMPIAR CONTENIDO DEL MODAL CON VERIFICACIONES DE SEGURIDAD
    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer) {
        mediaContainer.innerHTML = `
            <div style="color:rgba(255,255,255,0.15);padding:40px;text-align:center;">
                <i class="fas fa-spinner fa-pulse" style="font-size:28px;"></i>
                <p style="margin-top:8px;font-size:13px;">Cargando historia...</p>
            </div>
        `;
    }
    
    // Limpiar comentarios
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando comentarios...</span>
            </div>
        `;
    }
    
    // 🔥 Limpiar estadísticas - CON VERIFICACIONES
    const viewsEl = document.getElementById('modalViews');
    if (viewsEl) viewsEl.textContent = '0';
    
    const likesEl = document.getElementById('modalLikes');
    if (likesEl) likesEl.textContent = '0';
    
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) commentsEl.textContent = '0';
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) commentsCountEl.textContent = '0';
    
    // Limpiar caption
    const caption = document.getElementById('modalCaption');
    if (caption) {
        caption.innerHTML = '';
        caption.style.display = 'none';
    }
    
    // 🔥 Limpiar info de usuario - CON VERIFICACIONES
    const userNameEl = document.getElementById('modalUserName');
    if (userNameEl) {
        userNameEl.textContent = 'Cargando...';
        // Limpiar badge de traducción
        const badge = userNameEl.querySelector('.translation-badge-modal');
        if (badge) badge.remove();
    }
    
    const userHandleEl = document.getElementById('modalUserHandle');
    if (userHandleEl) userHandleEl.textContent = '@usuario';
    
    const avatarEl = document.getElementById('modalAvatar');
    if (avatarEl) avatarEl.src = '';
    
    // 🔥 Limpiar botones - CON VERIFICACIONES
    const likeBtn = document.getElementById('modalLikeBtn');
    if (likeBtn) {
        likeBtn.classList.remove('liked');
        likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';
    }
    
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }
    
    const translateBtn = document.getElementById('modalTranslateBtn');
    if (translateBtn) {
        translateBtn.style.display = 'none';
    }
    
    // Limpiar input de comentario
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.value = '';
        commentInput.disabled = false;
    }
    
    // Limpiar botón de enviar
    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
    }
    
    // Limpiar progreso
    const progressContainer = document.getElementById('storyProgress');
    if (progressContainer) {
        progressContainer.innerHTML = '';
        progressContainer.style.display = 'none';
    }
    
    // Limpiar flechas de navegación
    const prevArrow = document.getElementById('navPrevArrow');
    const nextArrow = document.getElementById('navNextArrow');
    if (prevArrow) prevArrow.style.display = 'none';
    if (nextArrow) nextArrow.style.display = 'none';
    
    // 🔥 Limpiar subtitles indicator
    const subtitlesIndicator = document.getElementById('subtitlesIndicator');
    if (subtitlesIndicator) {
        subtitlesIndicator.style.display = 'none';
    }
    
    // Limpiar variables globales
    window._storyOwnerId = null;
    window._modalUserId = null;
    
    if (!window._fromProfileModal && !window._fromExploreModal && !window._fromActivityModal) {
        document.body.style.overflow = '';
    }

    setTimeout(() => {
        window._fromProfileModal = false;
        window._fromExploreModal = false;
        window._fromActivityModal = false;
        window._activityCommentId = null;
        window._profileContextUserId = null;
    }, 100);
}

// ============================================================
// NAVEGAR ENTRE HISTORIAS
// ============================================================

export async function navigateStory(direction) {
    if (isNavigating) return;
    if (!currentStoriesList || currentStoriesList.length <= 1) {
        showToast('Solo hay una historia disponible');
        return;
    }

    const newIndex = currentStoryIndex + direction;
    if (newIndex < 0 || newIndex >= currentStoriesList.length) {
        showToast(direction === -1 ? 'Primera historia' : 'Última historia');
        return;
    }

    isNavigating = true;
    currentStoryIndex = newIndex;
    const newStory = currentStoriesList[newIndex];
    
    if (newStory) {
        console.log(`🔄 Navegando a historia ${newIndex + 1}/${currentStoriesList.length}: ${newStory.id}`);
        await loadStoryData(newStory.id, true);
    }
    
    isNavigating = false;
}

// ============================================================
// CREAR HTML DEL MODAL
// ============================================================

function createModalHTML() {
    console.log('📱 [STORY-MODAL] createModalHTML() ejecutado');
    
    if (document.getElementById('storyModalOverlay')) {
        console.log('📱 [STORY-MODAL] El overlay ya existe');
        return;
    }

    const html = `
        <div id="storyModalOverlay" class="modal-overlay" onclick="window.closeStoryModal()" style="display:none;">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="story-progress" id="storyProgress"></div>

                <div class="modal-header">
                    <div class="user-info" onclick="window.openProfileFromModal()">
                        <img class="avatar" id="modalAvatar" src="" alt="" />
                        <div class="info-text">
                            <div class="name" id="modalUserName">Cargando...</div>
                            <div class="handle" id="modalUserHandle">@usuario</div>
                        </div>
                    </div>
                    <div class="header-actions">
                        <span class="subtitles-indicator" id="subtitlesIndicator" style="display:none;">
                            <i class="fas fa-closed-captioning"></i> CC
                        </span>
                        <button class="close-btn" onclick="window.closeStoryModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div class="modal-body" id="modalBody">
                    <div class="modal-media" id="modalMedia">
                        <div style="color:rgba(255,255,255,0.15);padding:40px;text-align:center;">
                            <i class="fas fa-spinner fa-pulse" style="font-size:28px;"></i>
                            <p style="margin-top:8px;font-size:13px;">Cargando historia...</p>
                        </div>
                    </div>

                    <div class="modal-caption" id="modalCaption"></div>

                    <div class="modal-stats" id="modalStats">
                        <span class="stat"><i class="fas fa-eye"></i> <strong id="modalViews">0</strong></span>
                        <span class="stat"><i class="fas fa-heart"></i> <strong id="modalLikes">0</strong></span>
                        <span class="stat"><i class="fas fa-comment"></i> <strong id="modalComments">0</strong></span>
                    </div>

                    <div class="modal-actions-wrapper">
                        <button class="nav-arrow" id="navPrevArrow" onclick="window.navigateStory(-1)">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        
                        <div class="modal-actions" id="modalActions">
                            <button class="btn-like-modal" id="modalLikeBtn">
                                <i class="fas fa-heart"></i> Like
                            </button>
                            <button class="btn-comment-modal" id="modalCommentBtn">
                                <i class="fas fa-comment"></i>
                            </button>
                            <button class="btn-share-modal" id="modalShareBtn">
                                <i class="fas fa-share-alt"></i>
                            </button>
                            <button class="btn-delete-story-modal" id="modalDeleteBtn" style="display:none;">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                            <button class="btn-translate-modal" id="modalTranslateBtn" style="display:none;">
                                <i class="fas fa-language"></i> Traducir
                            </button>
                        </div>
                        
                        <button class="nav-arrow" id="navNextArrow" onclick="window.navigateStory(1)">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>

                    <div class="comments-section">
                        <div class="comments-title">
                            <span><i class="fas fa-comment-dots"></i> Comentarios</span>
                            <span id="commentsCount">0</span>
                        </div>
                        <div class="comments-list" id="commentsList">
                            <div class="no-comments">
                                <i class="fas fa-spinner fa-pulse"></i>
                                <span>Cargando comentarios...</span>
                            </div>
                        </div>
                        <div class="comment-input-wrapper">
                            <input type="text" id="commentInput" placeholder="Escribe un comentario..." maxlength="500" />
                            <button id="sendCommentBtn">Enviar</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
    console.log('📱 [STORY-MODAL] HTML creado e insertado');

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalOpen) {
            closeStoryModal();
        }
        if (e.key === 'ArrowLeft' && isModalOpen && currentStoriesList.length > 1) {
            navigateStory(-1);
        }
        if (e.key === 'ArrowRight' && isModalOpen && currentStoriesList.length > 1) {
            navigateStory(1);
        }
    });

    setupModalEvents();
}

// ============================================================
// CONFIGURAR EVENTOS DEL MODAL
// ============================================================

function setupModalEvents() {
    console.log('📱 [STORY-MODAL] Configurando eventos...');
    
    document.getElementById('modalLikeBtn')?.addEventListener('click', async () => {
        if (!currentStoryId) return;
        await handleModalLike();
    });

    document.getElementById('modalCommentBtn')?.addEventListener('click', () => {
        const input = document.getElementById('commentInput');
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    document.getElementById('modalShareBtn')?.addEventListener('click', () => {
        if (!currentStoryId) return;
        const url = `${window.location.origin}/story/${currentStoryId}`;
        if (navigator.share) {
            navigator.share({ title: 'Vyin Social', url });
        } else {
            navigator.clipboard?.writeText(url).then(() => {
                showToast('📋 Enlace copiado');
            });
        }
    });

    // 🔥 BOTÓN ELIMINAR HISTORIA
    document.getElementById('modalDeleteBtn')?.addEventListener('click', async () => {
        if (!currentStoryId) return;
        await handleDeleteStory();
    });

    // BOTÓN DE TRADUCCIÓN
    document.getElementById('modalTranslateBtn')?.addEventListener('click', async () => {
        if (!currentStoryId) return;
        await toggleTranslation();
    });

    // 🔥 CONFIGURAR ENVÍO DE COMENTARIO - Evento directo al botón
    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
        // Remover listeners anteriores clonando
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        newSendBtn.addEventListener('click', handleSendComment);
    }

    const input = document.getElementById('commentInput');
    if (input) {
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendComment();
            }
        });
    }

    let touchStartX = 0;
    let touchStartY = 0;
    const modalContent = document.querySelector('.modal-content');
    
    modalContent?.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    });
    
    modalContent?.addEventListener('touchend', (e) => {
        if (currentStoriesList.length <= 1) return;
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchStartX - touchEndX;
        const diffY = Math.abs(touchStartY - touchEndY);
        
        if (Math.abs(diffX) > 50 && diffY < 50) {
            if (diffX > 0) {
                navigateStory(1);
            } else {
                navigateStory(-1);
            }
        }
    });
}

// ============================================================
// 🔥 ELIMINAR HISTORIA
// ============================================================

async function handleDeleteStory() {
    if (!currentStoryId) return;

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para eliminar', true);
        return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.id !== currentStoryData?.userId) {
        showToast('No tienes permiso para eliminar esta historia', true);
        return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar esta historia? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${currentStoryId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            showToast('🗑️ Historia eliminada');
            
            // Eliminar la historia de la lista actual
            if (currentStoriesList && currentStoriesList.length > 0) {
                const index = currentStoriesList.findIndex(s => s.id === currentStoryId);
                if (index !== -1) {
                    currentStoriesList.splice(index, 1);
                    
                    // Si hay más historias, navegar a la siguiente
                    if (currentStoriesList.length > 0) {
                        const nextIndex = Math.min(index, currentStoriesList.length - 1);
                        const nextStory = currentStoriesList[nextIndex];
                        if (nextStory) {
                            currentStoryIndex = nextIndex;
                            await loadStoryData(nextStory.id, true);
                            return;
                        }
                    }
                }
            }
            
            // Si no hay más historias, cerrar el modal
            closeStoryModal();
        } else {
            const data = await res.json();
            showToast(data.error || 'Error al eliminar historia', true);
        }
    } catch (error) {
        console.error('Error eliminando historia:', error);
        showToast('Error al eliminar historia', true);
    }
}

// ============================================================
// 🔥 ENVIAR COMENTARIO - CORREGIDO DEFINITIVO
// ============================================================

async function handleSendComment() {
    const input = document.getElementById('commentInput');
    if (!input) return;
    
    const content = input.value.trim();
    if (!content) {
        showToast('Escribe un comentario', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para comentar', true);
        return;
    }

    if (!currentStoryId) {
        showToast('Error: historia no cargada', true);
        return;
    }

    const sendBtn = document.getElementById('sendCommentBtn');
    
    // 🔥 DESHABILITAR INPUT Y BOTÓN
    input.disabled = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${currentStoryId}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        const data = await res.json();

        if (res.ok) {
            input.value = '';
            
            // Actualizar contador
            updateCommentCount(1);
            
            // ACTUALIZAR EL CACHÉ DE COMENTARIOS
            addCommentToCache(currentStoryId, data);
            
            // 🔥 ACTUALIZAR UI SIN RECARGAR EL BOTÓN
            updateCommentsUIWithoutReload(currentStoryId);
            
            showToast('💬 Comentario enviado');
        } else {
            showToast(data.error || 'Error al enviar comentario', true);
        }
    } catch (error) {
        console.error('Error enviando comentario:', error);
        showToast('Error al enviar comentario', true);
    } finally {
        // 🔥 REHABILITAR INPUT Y BOTÓN
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        input.focus();
    }
}

// ============================================================
// 🔥 ENVIAR RESPUESTA - CORREGIDO
// ============================================================

async function handleSendReply(storyId, commentId) {
    const wrapper = document.getElementById(`reply-input-${commentId}`);
    if (!wrapper) return;

    const input = wrapper.querySelector('.reply-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) {
        showToast('Escribe una respuesta', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para responder', true);
        return;
    }

    const sendBtn = wrapper.querySelector('.reply-send-btn');
    
    input.disabled = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/comments/${commentId}/replies`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        const data = await res.json();

        if (res.ok) {
            input.value = '';
            wrapper.style.display = 'none';

            // Actualizar contador
            updateCommentCount(1);

            // ACTUALIZAR EL CACHÉ DE COMENTARIOS
            addReplyToCache(storyId, commentId, data);
            
            // ACTUALIZAR UI SIN RECARGAR EL BOTÓN
            updateCommentsUIWithoutReload(storyId);
            
            showToast('💬 Respuesta enviada');
        } else {
            showToast(data.error || 'Error al enviar respuesta', true);
        }
    } catch (error) {
        console.error('Error enviando respuesta:', error);
        showToast('Error al enviar respuesta', true);
    } finally {
        // 🔥 REHABILITAR INPUT Y BOTÓN
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        input.focus();
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADOR DE COMENTARIOS
// ============================================================

function updateCommentCount(increment) {
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) {
        const current = parseInt(commentsEl.textContent.replace(/[^0-9]/g, '')) || 0;
        commentsEl.textContent = formatNumber(current + increment);
    }
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) {
        const current = parseInt(commentsCountEl.textContent.replace(/[^0-9]/g, '')) || 0;
        commentsCountEl.textContent = formatNumber(current + increment);
    }
}

// ============================================================
// ACTUALIZAR INDICADOR DE PROGRESO Y FLECHAS
// ============================================================

function updateProgress() {
    const progressContainer = document.getElementById('storyProgress');
    const prevArrow = document.getElementById('navPrevArrow');
    const nextArrow = document.getElementById('navNextArrow');
    
    if (!progressContainer) return;

    const hasMultiple = currentStoriesList && currentStoriesList.length > 1;

    if (!hasMultiple) {
        progressContainer.style.display = 'none';
        if (prevArrow) prevArrow.style.display = 'none';
        if (nextArrow) nextArrow.style.display = 'none';
    } else {
        progressContainer.style.display = 'flex';
        
        const total = currentStoriesList.length;
        let dots = '';
        for (let i = 0; i < total; i++) {
            const isActive = i === currentStoryIndex;
            dots += `<span class="progress-dot ${isActive ? 'active' : ''}"></span>`;
        }
        progressContainer.innerHTML = dots;

        if (prevArrow) {
            prevArrow.style.display = (currentStoryIndex > 0) ? 'flex' : 'none';
        }
        if (nextArrow) {
            nextArrow.style.display = (currentStoryIndex < total - 1) ? 'flex' : 'none';
        }
        
        console.log(`📊 Progreso: ${currentStoryIndex + 1}/${total}`);
    }
}

// ============================================================
// GENERAR VTT DESDE SEGMENTOS
// ============================================================

function generateVTTFromSegments(segments) {
    if (!segments || segments.length === 0) {
        return 'WEBVTT\n\n';
    }
    
    let vtt = 'WEBVTT\n\n';
    
    segments.forEach((seg, index) => {
        const start = formatVTTTime(seg.start || 0);
        const end = formatVTTTime(seg.end || (seg.start || 0) + 2);
        const text = seg.text || '';
        vtt += `${index + 1}\n${start} --> ${end}\n${text}\n\n`;
    });
    
    return vtt;
}

function formatVTTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// ============================================================
// 🔥 ALTERNAR TRADUCCIÓN/ORIGINAL
// ============================================================

async function toggleTranslation() {
    if (!currentStoryId || !currentStoryData) return;
    
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para traducir', true);
        return;
    }

    const translateBtn = document.getElementById('modalTranslateBtn');
    
    const contentLanguage = currentStoryData.language || currentStoryData.originalLanguage || 'es';
    const isDifferentLanguage = contentLanguage !== userLanguage;
    
    if (!isDifferentLanguage) {
        showToast('📝 El contenido ya está en tu idioma');
        if (translateBtn) {
            translateBtn.style.display = 'none';
        }
        return;
    }
    
    // Si ya está traducida, mostrar original
    if (currentStoryData.translated && currentStoryData._originalTextContent) {
        console.log('📝 Mostrando original');
        
        const originalData = {
            ...currentStoryData,
            textContent: currentStoryData._originalTextContent,
            caption: currentStoryData._originalCaption || currentStoryData.caption,
            translated: false,
            showingOriginal: true
        };
        
        currentStoryData = originalData;
        translationCache[currentStoryId] = originalData;
        
        updateTextContentOnly(originalData);
        
        if (translateBtn) {
            translateBtn.innerHTML = '<i class="fas fa-language"></i> Traducir';
            translateBtn.style.display = 'inline-flex';
            translateBtn.disabled = false;
        }
        
        const userNameEl = document.getElementById('modalUserName');
        if (userNameEl) {
            const existingBadge = userNameEl.querySelector('.translation-badge-modal');
            if (existingBadge) existingBadge.remove();
        }
        
        showToast('📝 Mostrando original');
        return;
    }

    // Verificar caché en memoria
    const cacheKey = `${currentStoryId}_${userLanguage}`;
    if (translationCache[cacheKey] && translationCache[cacheKey].translated) {
        console.log('📦 Usando traducción desde caché');
        const cached = translationCache[cacheKey];
        const translatedData = {
            ...currentStoryData,
            textContent: cached.translated,
            _originalTextContent: cached.original,
            _originalCaption: currentStoryData.caption,
            translated: true,
            showingOriginal: false,
            originalLanguage: contentLanguage,
            language: userLanguage,
            _translationCache: cached
        };
        
        currentStoryData = translatedData;
        translationCache[currentStoryId] = translatedData;
        
        updateTextContentOnly(translatedData);
        
        if (translateBtn) {
            translateBtn.innerHTML = '<i class="fas fa-undo"></i> Mostrar original';
            translateBtn.style.display = 'inline-flex';
            translateBtn.disabled = false;
        }
        
        const userNameEl = document.getElementById('modalUserName');
        if (userNameEl) {
            const existingBadge = userNameEl.querySelector('.translation-badge-modal');
            if (existingBadge) existingBadge.remove();
            
            const badge = document.createElement('span');
            badge.className = 'translation-badge-modal';
            badge.style.cssText = 'font-size:9px;color:rgba(192,132,252,0.7);margin-left:6px;';
            badge.innerHTML = `<i class="fas fa-language"></i> Traducido (caché)`;
            userNameEl.appendChild(badge);
        }
        
        showToast('✅ Traducción cargada (caché)');
        return;
    }

    // Si no está en caché, traducir
    if (translateBtn) {
        translateBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Traduciendo...';
        translateBtn.disabled = true;
    }

    try {
        let textToTranslate = currentStoryData.textContent || currentStoryData.caption || '';
        
        if (!textToTranslate) {
            showToast('No hay texto para traducir', true);
            if (translateBtn) {
                translateBtn.style.display = 'none';
            }
            return;
        }

        console.log('🌐 Traduciendo texto:', textToTranslate.substring(0, 50) + '...');
        console.log(`🌐 Al idioma: ${userLanguage}`);
        console.log(`📝 Idioma del contenido: ${contentLanguage}`);

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
        console.log('📥 Respuesta de traducción:', data);
        
        const isDifferent = data.success && 
                           data.translated && 
                           data.translated !== data.original &&
                           data.translated.trim() !== data.original.trim();
        
        if (isDifferent) {
            const cacheData = {
                translated: data.translated,
                original: data.original,
                engine: data.engine || 'M2M100',
                license: data.license || 'MIT',
                language: userLanguage
            };
            translationCache[cacheKey] = cacheData;
            
            const translatedData = {
                ...currentStoryData,
                textContent: data.translated,
                _originalTextContent: data.original,
                _originalCaption: currentStoryData.caption,
                translated: true,
                showingOriginal: false,
                originalLanguage: contentLanguage,
                language: userLanguage,
                translationEngine: data.engine || 'M2M100',
                _translationCache: cacheData
            };
            
            translationCache[currentStoryId] = translatedData;
            currentStoryData = translatedData;
            
            updateTextContentOnly(translatedData);
            
            if (translateBtn) {
                translateBtn.innerHTML = '<i class="fas fa-undo"></i> Mostrar original';
                translateBtn.style.display = 'inline-flex';
                translateBtn.disabled = false;
            }
            
            const userNameEl = document.getElementById('modalUserName');
            if (userNameEl) {
                const existingBadge = userNameEl.querySelector('.translation-badge-modal');
                if (existingBadge) existingBadge.remove();
                
                const badge = document.createElement('span');
                badge.className = 'translation-badge-modal';
                badge.style.cssText = 'font-size:9px;color:rgba(192,132,252,0.7);margin-left:6px;';
                const engine = data.engine || 'M2M100';
                badge.innerHTML = `<i class="fas fa-language"></i> Traducido (${engine})`;
                userNameEl.appendChild(badge);
            }
            
            showToast(`✅ Traducido al ${data.languageInfo?.name || userLanguage}`);
        } else {
            console.warn('⚠️ La traducción no cambió el texto');
            showToast('📝 El texto ya está en el idioma seleccionado');
        }
    } catch (error) {
        console.error('❌ Error traduciendo:', error);
        showToast('Error al traducir', true);
    } finally {
        if (translateBtn) {
            translateBtn.disabled = false;
        }
    }
}

// ============================================================
// 🔥 ACTUALIZAR SOLO textContent
// ============================================================

function updateTextContentOnly(updatedData) {
    console.log('🔥 Actualizando textContent...');
    
    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer && updatedData.textContent) {
        const textContentDiv = mediaContainer.querySelector('.text-content');
        if (textContentDiv) {
            textContentDiv.innerHTML = escapeHtml(updatedData.textContent);
            console.log('✅ textContent actualizado');
        } else if (!mediaContainer.querySelector('img') && !mediaContainer.querySelector('video')) {
            const bgColor = updatedData.textBgColor || '#1a1a2e';
            mediaContainer.innerHTML = `
                <div class="text-content" style="background:${bgColor}">
                    ${escapeHtml(updatedData.textContent)}
                </div>
            `;
            console.log('✅ textContent aplicado al contenedor de medios');
        }
    }
}

// ============================================================
// CARGAR DATOS DE LA HISTORIA - VERSIÓN CORREGIDA
// ============================================================

async function loadStoryData(storyId, isNavigation = false) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver historias', true);
        closeStoryModal();
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/details`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 304) {
            console.log('📦 [STORY-MODAL] Historia no modificada (304)');
            if (currentStoryData && currentStoryData.id === storyId) {
                updateModalUI(currentStoryData);
                updateProgress();
                const highlightCommentId = window._activityCommentId || null;
                // 🔥 FORZAR RECARGA DE COMENTARIOS AL ABRIR EL MODAL
                await initComments(storyId, 'commentsList', highlightCommentId, true);
                return;
            }
            if (currentStoriesList.length > 0) {
                const cachedStory = currentStoriesList.find(s => s.id === storyId);
                if (cachedStory) {
                    currentStoryData = cachedStory;
                    updateModalUI(currentStoryData);
                    updateProgress();
                    const highlightCommentId = window._activityCommentId || null;
                    // 🔥 FORZAR RECARGA DE COMENTARIOS AL ABRIR EL MODAL
                    await initComments(storyId, 'commentsList', highlightCommentId, true);
                    return;
                }
            }
            showToast('Recargando historia...');
            await loadStoryData(storyId, true);
            return;
        }

        if (!res.ok) {
            if (res.status === 404) {
                showToast('Historia no encontrada', true);
            } else if (res.status === 403) {
                showToast('No tienes permiso para ver esta historia', true);
            } else {
                showToast('Error al cargar la historia', true);
            }
            if (!isNavigation) closeStoryModal();
            return;
        }

        const story = await res.json();
        currentStoryData = story;
        currentStoryId = story.id;
        
        // 🔥 GUARDAR DUEÑO DE LA HISTORIA PARA story-comments
        window._storyOwnerId = story.userId;

        // Verificar si hay traducción en caché
        const cacheKey = `${storyId}_${userLanguage}`;
        if (translationCache[cacheKey] && !story.translated) {
            console.log('📦 Aplicando traducción desde caché');
            currentStoryData = {
                ...currentStoryData,
                textContent: translationCache[cacheKey].translated,
                _originalTextContent: translationCache[cacheKey].original,
                _originalCaption: currentStoryData.caption,
                translated: true,
                _translationCache: translationCache[cacheKey]
            };
        }

        console.log('📝 Datos de la historia:', {
            id: story.id,
            language: story.language || 'es',
            hasTextContent: !!story.textContent,
            hasCaption: !!story.caption,
            hasTranslation: !!translationCache[cacheKey]
        });

        updateModalUI(currentStoryData);
        updateProgress();
        
        const highlightCommentId = window._activityCommentId || null;
        // 🔥 FORZAR RECARGA DE COMENTARIOS SIEMPRE QUE SE ABRE EL MODAL
        await initComments(storyId, 'commentsList', highlightCommentId, true);
        
        await registerView(storyId);

    } catch (error) {
        console.error('Error loading story:', error);
        showToast('Error al cargar la historia', true);
        if (!isNavigation) closeStoryModal();
    }
}

// ============================================================
// ACTUALIZAR UI DEL MODAL
// ============================================================

function updateModalUI(story) {
    const user = story.userData || {};
    const currentUser = getCurrentUser();
    const isOwner = currentUser && currentUser.id === story.userId;

    const avatar = document.getElementById('modalAvatar');
    if (avatar) {
        avatar.src = user.avatar || getAvatar(user.fullName);
        avatar.onerror = function() {
            this.src = getAvatar(user.fullName || 'U');
        };
    }

    const userNameEl = document.getElementById('modalUserName');
    if (userNameEl) userNameEl.textContent = user.fullName || 'Usuario';
    
    const userHandleEl = document.getElementById('modalUserHandle');
    if (userHandleEl) userHandleEl.textContent = `@${user.username || 'usuario'}`;
    
    window._modalUserId = user.id;

    // 🔥 MOSTRAR/OCULTAR BOTÓN ELIMINAR SEGÚN PROPIETARIO
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (deleteBtn) {
        if (isOwner) {
            deleteBtn.style.display = 'inline-flex';
        } else {
            deleteBtn.style.display = 'none';
        }
    }

    // Botón de traducción - siempre visible
    const contentLanguage = story.language || story.originalLanguage || 'es';
    const isDifferentLanguage = contentLanguage !== userLanguage;
    const isTranslated = story.translated || false;
    
    const translateBtn = document.getElementById('modalTranslateBtn');
    if (translateBtn) {
        const hasText = story.textContent && story.textContent.trim().length > 0;
        
        if (isDifferentLanguage && hasText) {
            const btnText = isTranslated ? 'Mostrar original' : 'Traducir';
            const btnIcon = isTranslated ? 'fa-undo' : 'fa-language';
            translateBtn.style.display = 'inline-flex';
            translateBtn.innerHTML = `<i class="fas ${btnIcon}"></i> ${btnText}`;
            translateBtn.disabled = false;
        } else {
            translateBtn.style.display = 'none';
        }
    }

    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer) {
        if (story.mediaType === 'image' && story.mediaUrl) {
            mediaContainer.innerHTML = `<img src="${story.mediaUrl}" alt="Historia" loading="lazy" />`;
        } else if (story.mediaType === 'video' && story.mediaUrl) {
            const hasSubtitles = story.hasSubtitles && story.subtitles;
            const isSubtitled = story.mediaUrl.includes('subtitled_');
            const useSegments = story.segments && story.segments.length > 0;
            
            if (isSubtitled) {
                mediaContainer.innerHTML = `
                    <video id="storyVideo" src="${story.mediaUrl}" controls autoplay muted playsinline>
                        Tu navegador no soporta videos.
                    </video>
                `;
            } else if (hasSubtitles && useSegments) {
                const vttContent = generateVTTFromSegments(story.segments);
                const blob = new Blob([vttContent], { type: 'text/vtt' });
                const vttUrl = URL.createObjectURL(blob);
                
                const label = story.language === 'es' ? 'Español' : (story.language || 'es');
                
                mediaContainer.innerHTML = `
                    <video id="storyVideo" src="${story.mediaUrl}" controls autoplay muted playsinline crossorigin="anonymous">
                        <track kind="subtitles" src="${vttUrl}" srclang="${story.language || 'es'}" label="${label}" default>
                        Tu navegador no soporta videos con subtítulos.
                    </video>
                `;
                
                if (window._vttUrl) {
                    URL.revokeObjectURL(window._vttUrl);
                }
                window._vttUrl = vttUrl;
                
                setTimeout(() => {
                    if (window._vttUrl) {
                        URL.revokeObjectURL(window._vttUrl);
                        window._vttUrl = null;
                    }
                }, 60000);
            } else {
                mediaContainer.innerHTML = `
                    <video id="storyVideo" src="${story.mediaUrl}" controls autoplay muted playsinline>
                        Tu navegador no soporta videos.
                    </video>
                `;
            }
            
            setTimeout(() => {
                const video = document.getElementById('storyVideo');
                if (video) {
                    video.play().catch(() => {});
                    document.addEventListener('visibilitychange', () => {
                        if (document.hidden) {
                            video.pause();
                        } else {
                            video.play().catch(() => {});
                        }
                    });
                }
            }, 100);
            
        } else if (story.mediaType === 'text' && story.textContent) {
            mediaContainer.innerHTML = `
                <div class="text-content" style="background:${story.textBgColor || '#1a1a2e'}">
                    ${escapeHtml(story.textContent)}
                </div>
            `;
        } else {
            mediaContainer.innerHTML = `
                <div style="padding:40px;text-align:center;color:rgba(255,255,255,0.15);">
                    <i class="fas fa-book-open" style="font-size:32px;"></i>
                    <p style="margin-top:8px;">Sin contenido</p>
                </div>
            `;
        }
    }

    const caption = document.getElementById('modalCaption');
    if (caption) {
        let captionHtml = '';
        if (story.caption) {
            captionHtml = story.caption.replace(/#([a-zA-Z0-9_]+)/g, '<span class="hashtag">#$1</span>');
        }
        if (captionHtml) {
            caption.innerHTML = captionHtml;
            caption.style.display = 'block';
        } else {
            caption.style.display = 'none';
        }
    }

    const subtitlesIndicator = document.getElementById('subtitlesIndicator');
    if (subtitlesIndicator) {
        if (story.hasSubtitles && story.segments && story.segments.length > 0) {
            subtitlesIndicator.style.display = 'inline-flex';
            subtitlesIndicator.innerHTML = '<i class="fas fa-closed-captioning"></i> CC';
        } else {
            subtitlesIndicator.style.display = 'none';
        }
    }

    const views = story.views?.length || 0;
    const likes = story.likes?.length || 0;
    const comments = story.comments?.length || 0;

    const viewsEl = document.getElementById('modalViews');
    if (viewsEl) viewsEl.textContent = formatNumber(views);
    
    const likesEl = document.getElementById('modalLikes');
    if (likesEl) likesEl.textContent = formatNumber(likes);
    
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) commentsEl.textContent = formatNumber(comments);
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) commentsCountEl.textContent = formatNumber(comments);

    const isLiked = story.likes?.includes(currentUser?.id) || false;
    const likeBtn = document.getElementById('modalLikeBtn');
    if (likeBtn) {
        if (isLiked) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> Quitar';
        } else {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';
        }
    }
}

// ============================================================
// REGISTRAR VISTA
// ============================================================

async function registerView(storyId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/view`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            const viewsEl = document.getElementById('modalViews');
            if (viewsEl && data.viewsCount !== undefined) {
                viewsEl.textContent = formatNumber(data.viewsCount);
            }
        }
    } catch (error) {
        console.error('Error registering view:', error);
    }
}

// ============================================================
// MANEJAR LIKE EN MODAL
// ============================================================

async function handleModalLike() {
    if (!currentStoryId) return;

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para dar like', true);
        return;
    }

    const likeBtn = document.getElementById('modalLikeBtn');
    const isLiked = likeBtn?.classList.contains('liked') || false;
    const method = isLiked ? 'DELETE' : 'POST';

    const likesEl = document.getElementById('modalLikes');
    let currentLikes = 0;
    if (likesEl) {
        currentLikes = parseInt(likesEl.textContent.replace(/[^0-9]/g, '')) || 0;
    }
    
    if (isLiked) {
        currentLikes = Math.max(0, currentLikes - 1);
        if (likeBtn) {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';
        }
    } else {
        currentLikes = currentLikes + 1;
        if (likeBtn) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> Quitar';
        }
    }
    if (likesEl) {
        likesEl.textContent = formatNumber(currentLikes);
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${currentStoryId}/like`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        if (res.ok) {
            if (likesEl) {
                likesEl.textContent = formatNumber(data.likesCount || 0);
            }

            if (data.liked) {
                if (likeBtn) {
                    likeBtn.classList.add('liked');
                    likeBtn.innerHTML = '<i class="fas fa-heart"></i> Quitar';
                }
            } else {
                if (likeBtn) {
                    likeBtn.classList.remove('liked');
                    likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';
                }
            }

            if (currentStoryData) {
                currentStoryData.likes = data.likes || [];
            }
            
            if (currentStoriesList && currentStoriesList.length > 0) {
                const idx = currentStoriesList.findIndex(s => s.id === currentStoryId);
                if (idx !== -1 && currentStoriesList[idx]) {
                    currentStoriesList[idx].likes = data.likes || [];
                }
            }

            showToast(data.liked ? '❤️ Like' : '💔 Quitado');
        } else {
            showToast(data.error || 'Error al procesar like', true);
            await loadStoryData(currentStoryId, true);
        }
    } catch (error) {
        console.error('Error en like:', error);
        showToast('Error al procesar like', true);
        await loadStoryData(currentStoryId, true);
    }
}

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

window.openStoryModal = openStoryModal;
window.closeStoryModal = closeStoryModal;
window.navigateStory = navigateStory;
window.handleSendReply = handleSendReply;
window.handleSendComment = handleSendComment;

window.openProfileFromModal = function() {
    const userId = window._modalUserId;
    if (userId) {
        closeStoryModal();
        window._fromProfileModal = false;
        window._profileContextUserId = null;
        
        setTimeout(() => {
            import('./profile-modal.js').then(({ openProfileModal }) => {
                openProfileModal(userId);
            }).catch(() => {
                if (typeof window.openProfileModal === 'function') {
                    window.openProfileModal(userId);
                } else {
                    showToast('Error al abrir perfil', true);
                }
            });
        }, 50);
    }
};

export { loadStoryData, handleModalLike, handleSendComment };