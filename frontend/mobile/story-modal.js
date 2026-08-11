// ============================================================
// story-modal.js - Modal para ver historias (VERSIÓN CORREGIDA)
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile, getUserLanguage
} from './auth.js';

import { formatNumber } from './utils.js';
import { loadComments, initComments, getTotalCommentsCount, addCommentToCache, getCachedComments } from './story-comments.js';

const API_URL = window.location.origin;
let currentStoryId = null;
let currentStoryData = null;
let isModalOpen = false;
let currentStoriesList = [];
let currentStoryIndex = 0;
let isNavigating = false;
let userLanguage = 'es';
let isFirstLoad = true;
let isCommenting = false; // 🔥 Prevenir envíos duplicados

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

    // 🔥 CERRAR MODAL ANTERIOR COMPLETAMENTE
    if (isModalOpen) {
        console.log('📱 [STORY-MODAL] Cerrando modal anterior...');
        await closeStoryModal(true); // Forzar limpieza
        await new Promise(resolve => setTimeout(resolve, 200));
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
    isFirstLoad = true;
    isCommenting = false;

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
// CERRAR MODAL - CON LIMPIEZA COMPLETA
// ============================================================

export function closeStoryModal(skipCleanup = false) {
    console.log('📱 [STORY-MODAL] Cerrando modal...');
    
    // 🔥 LIMPIAR ESTADO
    isModalOpen = false;
    isCommenting = false;
    
    // Limpiar video
    const video = document.getElementById('storyVideo');
    if (video) {
        video.pause();
        video.src = '';
        video.load();
    }

    // Limpiar subtítulos
    if (window._vttUrl) {
        URL.revokeObjectURL(window._vttUrl);
        window._vttUrl = null;
    }

    // 🔥 LIMPIAR INPUT DE COMENTARIO
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.value = '';
        commentInput.disabled = false;
        commentInput.blur();
    }

    // 🔥 LIMPIAR BOTÓN DE ENVÍO
    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
    }

    // 🔥 LIMPIAR CONTENEDOR DE COMENTARIOS
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        // Guardar referencia al storyId actual para limpiar caché
        const storyId = currentStoryId;
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando comentarios...</span>
            </div>
        `;
        commentsList.dataset.storyId = '';
    }

    // Limpiar contadores
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) commentsCountEl.textContent = '0';
    const modalCommentsEl = document.getElementById('modalComments');
    if (modalCommentsEl) modalCommentsEl.textContent = '0';

    const likesEl = document.getElementById('modalLikes');
    if (likesEl) likesEl.textContent = '0';
    const viewsEl = document.getElementById('modalViews');
    if (viewsEl) viewsEl.textContent = '0';

    // 🔥 LIMPIAR ESTADO DE RESPUESTAS
    document.querySelectorAll('.reply-input-container').forEach(el => {
        el.style.display = 'none';
        const input = el.querySelector('input');
        if (input) input.value = '';
    });

    // Ocultar overlay
    const overlay = document.getElementById('storyModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }
    
    if (!window._fromProfileModal && !window._fromExploreModal && !window._fromActivityModal) {
        document.body.style.overflow = '';
    }

    // 🔥 LIMPIAR variables después de un tiempo
    setTimeout(() => {
        if (!isModalOpen) {
            currentStoryId = null;
            currentStoryData = null;
            currentStoriesList = [];
            currentStoryIndex = 0;
            isNavigating = false;
            isFirstLoad = true;
        }
        window._fromProfileModal = false;
        window._fromExploreModal = false;
        window._fromActivityModal = false;
        window._activityCommentId = null;
        window._profileContextUserId = null;
    }, 300);
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
        isFirstLoad = true;
        await loadStoryData(newStory.id, true);
    }
    
    isNavigating = false;
}

// ============================================================
// CREAR HTML DEL MODAL
// ============================================================

function createModalHTML() {
    console.log('📱 [STORY-MODAL] createModalHTML() ejecutado');
    
    // 🔥 ELIMINAR MODAL EXISTENTE PRIMERO
    const existingOverlay = document.getElementById('storyModalOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
        console.log('📱 [STORY-MODAL] Modal existente eliminado');
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

    // 🔥 EVENTOS GLOBALES
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

    // 🔥 BOTÓN DE COMENTARIO - ENFOCAR INPUT Y ABRIR TECLADO
    document.getElementById('modalCommentBtn')?.addEventListener('click', () => {
        const input = document.getElementById('commentInput');
        if (input) {
            input.focus();
            // 🔥 Forzar que el teclado se abra en móvil
            if ('ontouchstart' in window) {
                input.click();
                // Algunos navegadores necesitan esto
                setTimeout(() => input.focus(), 100);
            }
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

    document.getElementById('modalTranslateBtn')?.addEventListener('click', async () => {
        if (!currentStoryId) return;
        await toggleTranslation();
    });

    // 🔥 ENVIAR COMENTARIO - CON PREVENCIÓN DE DUPLICADOS
    document.getElementById('sendCommentBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleSendComment();
    });

    document.getElementById('commentInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendComment();
        }
    });

    // 🔥 LIKES DE COMENTARIOS
    document.getElementById('commentsList')?.addEventListener('click', async (e) => {
        const likeBtn = e.target.closest('.btn-like-comment');
        if (likeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const commentId = likeBtn.dataset.commentId;
            if (commentId && currentStoryId) {
                await window.handleCommentLike(currentStoryId, commentId);
            }
        }
    });

    // 🔥 RESPONDER - CON ENFOQUE AUTOMÁTICO Y TECLADO
    document.getElementById('commentsList')?.addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.btn-reply-comment');
        if (replyBtn) {
            e.preventDefault();
            e.stopPropagation();
            const commentId = replyBtn.dataset.commentId;
            if (commentId && currentStoryId) {
                // 🔥 PASAR EL STORY ID PARA EL CONTEXTO
                window.toggleReplyInput(currentStoryId, commentId);
            }
        }
    });

    // Touch para navegación
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
// 🔥 ENVIAR COMENTARIO - VERSIÓN CORREGIDA (CON PREVENCIÓN DE DUPLICADOS)
// ============================================================

async function handleSendComment() {
    // 🔥 PREVENIR ENVÍOS DUPLICADOS
    if (isCommenting) {
        console.log('⚠️ Ya hay un comentario en proceso, ignorando...');
        return;
    }

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

    // 🔥 BLOQUEAR PARA PREVENIR DUPLICADOS
    isCommenting = true;
    input.disabled = true;
    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }

    // 🔥 CREAR COMENTARIO LOCAL PARA RESPUESTA RÁPIDA
    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');
    
    const tempComment = {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        userId: currentUser?.id || 'temp',
        username: currentUser?.username || 'usuario',
        fullName: currentUser?.fullName || 'Usuario',
        avatar: userAvatar,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        replies: [],
        likes: [],
        _isTemp: true
    };

    // 🔥 1. AGREGAR LOCALMENTE (RESPUESTA INMEDIATA)
    input.value = '';
    addCommentToUI(tempComment);
    
    // 🔥 2. ACTUALIZAR CONTADOR LOCAL
    const currentTotal = getTotalCommentsCount(currentStoryId);
    updateCommentCount(currentTotal + 1);
    
    // 🔥 3. ACTUALIZAR currentStoryData LOCALMENTE
    if (currentStoryData) {
        if (!currentStoryData.comments) currentStoryData.comments = [];
        currentStoryData.comments.unshift(tempComment);
    }
    
    if (currentStoriesList && currentStoriesList.length > 0) {
        const idx = currentStoriesList.findIndex(s => s.id === currentStoryId);
        if (idx !== -1 && currentStoriesList[idx]) {
            if (!currentStoriesList[idx].comments) currentStoriesList[idx].comments = [];
            currentStoriesList[idx].comments.unshift(tempComment);
        }
    }

    // 🔥 4. AGREGAR AL CACHÉ
    addCommentToCache(currentStoryId, tempComment);

    try {
        // 🔥 5. ENVIAR AL SERVIDOR
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
            // 🔥 6. REEMPLAZAR COMENTARIO TEMPORAL CON EL REAL
            await replaceTempCommentWithReal(currentStoryId, tempComment.id, data);
            showToast('💬 Comentario enviado');
        } else {
            // 🔥 7. SI FALLA, REVERTIR
            revertTempComment(currentStoryId, tempComment.id);
            showToast(data.error || 'Error al enviar comentario', true);
        }
    } catch (error) {
        console.error('Error enviando comentario:', error);
        revertTempComment(currentStoryId, tempComment.id);
        showToast('Error al enviar comentario', true);
    } finally {
        // 🔥 DESBLOQUEAR
        isCommenting = false;
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        input.focus();
    }
}

// ============================================================
// REEMPLAZAR COMENTARIO TEMPORAL CON REAL
// ============================================================

async function replaceTempCommentWithReal(storyId, tempId, realComment) {
    // 🔥 1. Buscar y reemplazar en la UI
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        const tempElement = commentsList.querySelector(`[data-temp-id="${tempId}"]`);
        if (tempElement) {
            const realElement = createCommentElement(realComment);
            tempElement.replaceWith(realElement);
        }
    }

    // 🔥 2. Actualizar caché de comentarios
    const cached = getCachedComments(storyId);
    if (cached) {
        const idx = cached.findIndex(c => c.id === tempId);
        if (idx !== -1) {
            cached[idx] = realComment;
        }
    }

    // 🔥 3. Actualizar currentStoryData
    if (currentStoryData && currentStoryData.comments) {
        const idx = currentStoryData.comments.findIndex(c => c.id === tempId);
        if (idx !== -1) {
            currentStoryData.comments[idx] = realComment;
        }
    }

    // 🔥 4. Actualizar currentStoriesList
    if (currentStoriesList && currentStoriesList.length > 0) {
        const storyIdx = currentStoriesList.findIndex(s => s.id === storyId);
        if (storyIdx !== -1 && currentStoriesList[storyIdx].comments) {
            const idx = currentStoriesList[storyIdx].comments.findIndex(c => c.id === tempId);
            if (idx !== -1) {
                currentStoriesList[storyIdx].comments[idx] = realComment;
            }
        }
    }

    console.log('✅ Comentario reemplazado:', tempId, '→', realComment.id);
}

// ============================================================
// REVERTIR COMENTARIO TEMPORAL
// ============================================================

function revertTempComment(storyId, tempId) {
    // 🔥 1. Eliminar de la UI
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        const tempElement = commentsList.querySelector(`[data-temp-id="${tempId}"]`);
        if (tempElement) {
            tempElement.remove();
        }
    }

    // 🔥 2. Eliminar del caché
    const cached = getCachedComments(storyId);
    if (cached) {
        const idx = cached.findIndex(c => c.id === tempId);
        if (idx !== -1) {
            cached.splice(idx, 1);
        }
    }

    // 🔥 3. Eliminar de currentStoryData
    if (currentStoryData && currentStoryData.comments) {
        currentStoryData.comments = currentStoryData.comments.filter(c => c.id !== tempId);
    }

    // 🔥 4. Eliminar de currentStoriesList
    if (currentStoriesList && currentStoriesList.length > 0) {
        const storyIdx = currentStoriesList.findIndex(s => s.id === storyId);
        if (storyIdx !== -1 && currentStoriesList[storyIdx].comments) {
            currentStoriesList[storyIdx].comments = currentStoriesList[storyIdx].comments.filter(c => c.id !== tempId);
        }
    }

    // 🔥 5. Actualizar contador
    const total = getTotalCommentsCount(storyId);
    updateCommentCount(total);

    console.log('🗑️ Comentario temporal revertido:', tempId);
}

// ============================================================
// CREAR ELEMENTO DE COMENTARIO PARA LA UI
// ============================================================

function createCommentElement(comment) {
    const isTemp = comment._isTemp || false;
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.setAttribute('data-comment-id', comment.id);
    if (isTemp) {
        div.setAttribute('data-temp-id', comment.id);
        div.style.opacity = '0.6';
        div.style.borderLeft = '2px solid rgba(192,132,252,0.3)';
    }
    
    const currentUser = getCurrentUser();
    const userAvatar = currentUser?.avatar || getAvatar(currentUser?.fullName || 'U');

    div.innerHTML = `
        <img class="avatar" src="${comment.avatar || userAvatar}" alt="${comment.fullName}" onclick="window.goToProfileUser('${comment.userId}')" />
        <div class="comment-body">
            <div class="comment-user" onclick="window.goToProfileUser('${comment.userId}')">
                ${escapeHtml(comment.fullName)}
                <span class="handle">@${comment.username || 'usuario'}</span>
                <span class="time">${formatDate(comment.createdAt)}</span>
                ${isTemp ? '<span style="font-size:10px;color:rgba(192,132,252,0.5);margin-left:8px;">⏳ Enviando...</span>' : ''}
            </div>
            <div class="comment-text">${escapeHtml(comment.content)}</div>
            <div class="comment-meta">
                <button class="btn-like-comment" data-comment-id="${comment.id}">
                    <i class="fas fa-heart"></i> <span class="like-count">0</span>
                </button>
                <button class="btn-reply-comment" data-comment-id="${comment.id}">
                    <i class="fas fa-reply"></i> Responder
                </button>
            </div>
            <div class="replies" id="replies-${comment.id}"></div>
            <div class="reply-input-container" id="reply-input-${comment.id}" style="display:none;">
                <input type="text" class="reply-input" id="replyInput-${comment.id}" placeholder="Escribe una respuesta..." maxlength="500" />
                <button class="reply-send-btn" data-comment-id="${comment.id}">Enviar</button>
            </div>
        </div>
    `;
    
    return div;
}

// ============================================================
// AÑADIR COMENTARIO A LA UI
// ============================================================

function addCommentToUI(comment) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;

    // Verificar si ya existe
    const existingComment = commentsList.querySelector(`[data-comment-id="${comment.id}"]`);
    if (existingComment) {
        console.log('⚠️ Comentario ya existe en la UI, omitiendo duplicado');
        return;
    }

    // Eliminar mensaje "No hay comentarios"
    const noComments = commentsList.querySelector('.no-comments');
    if (noComments) {
        noComments.remove();
    }

    // Crear y agregar el elemento
    const commentElement = createCommentElement(comment);
    commentsList.insertBefore(commentElement, commentsList.firstChild);
    
    console.log('✅ Comentario añadido a la UI');
}

// ============================================================
// ACTUALIZAR CONTADOR DE COMENTARIOS
// ============================================================

function updateCommentCount(total) {
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) {
        commentsEl.textContent = formatNumber(total);
    }
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) {
        commentsCountEl.textContent = formatNumber(total);
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
// ALTERNAR TRADUCCIÓN
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
// ACTUALIZAR SOLO textContent
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
// CARGAR DATOS DE LA HISTORIA - CON CACHÉ PERSISTENTE
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
                await initComments(storyId, 'commentsList', highlightCommentId, false);
                isFirstLoad = false;
                const totalComments = getTotalCommentsCount(storyId);
                updateCommentCount(totalComments);
                return;
            }
            if (currentStoriesList.length > 0) {
                const cachedStory = currentStoriesList.find(s => s.id === storyId);
                if (cachedStory) {
                    currentStoryData = cachedStory;
                    updateModalUI(currentStoryData);
                    updateProgress();
                    const highlightCommentId = window._activityCommentId || null;
                    await initComments(storyId, 'commentsList', highlightCommentId, false);
                    isFirstLoad = false;
                    const totalComments = getTotalCommentsCount(storyId);
                    updateCommentCount(totalComments);
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
        
        // 🔥 NO forzar recarga si ya tenemos caché
        const forceReload = isFirstLoad && !getCachedComments(storyId);
        await initComments(storyId, 'commentsList', highlightCommentId, forceReload);
        isFirstLoad = false;
        
        const totalComments = getTotalCommentsCount(storyId);
        updateCommentCount(totalComments);
        
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

    const avatar = document.getElementById('modalAvatar');
    if (avatar) {
        avatar.src = user.avatar || getAvatar(user.fullName);
        avatar.onerror = function() {
            this.src = getAvatar(user.fullName || 'U');
        };
    }

    document.getElementById('modalUserName').textContent = user.fullName || 'Usuario';
    document.getElementById('modalUserHandle').textContent = `@${user.username || 'usuario'}`;
    window._modalUserId = user.id;

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

    document.getElementById('modalViews').textContent = formatNumber(views);
    document.getElementById('modalLikes').textContent = formatNumber(likes);
    document.getElementById('modalComments').textContent = formatNumber(comments);
    document.getElementById('commentsCount').textContent = formatNumber(comments);

    const currentUser = getCurrentUser();
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
    let currentLikes = parseInt(likesEl?.textContent.replace(/[^0-9]/g, '')) || 0;
    
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

// 🔥 FUNCIÓN PARA ABRIR PERFIL DE USUARIO DESDE COMENTARIO
window.goToProfileUser = function(userId) {
    if (!userId) return;
    closeStoryModal();
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
    }, 100);
};

export { loadStoryData, handleModalLike };