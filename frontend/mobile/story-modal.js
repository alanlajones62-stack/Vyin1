// ============================================================
// story-modal.js - Modal para ver historias con navegación 
// (VERSIÓN CORREGIDA - CON ACTUALIZACIÓN PARCIAL DE COMENTARIOS)
// 🔥 NUEVO: SOPORTE PARA SUBIR ARCHIVOS EN COMENTARIOS (SOLO DUEÑO)
// 🔥 CORREGIDO: Re-renderización completa, parpadeo y pérdida de foco
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile, getUserLanguage
} from './auth.js';

import { formatNumber } from './utils.js';
import { 
    loadComments, initComments, addCommentToCache, addReplyToCache, 
    updateCommentLikes, updateCommentsUIWithoutReload,
    uploadCommentFile, addComment,
    renderComments,
    // 🔥 NUEVAS FUNCIONES DE ACTUALIZACIÓN PARCIAL
    addCommentToUI,
    addReplyToUI,
    updateCommentLikeUI,
    removeCommentFromUI,
    updateCommentCounters,
    commentsCache,
    findCommentById
} from './story-comments.js';

const API_URL = window.location.origin;
let currentStoryId = null;
let currentStoryData = null;
let isModalOpen = false;
let currentStoriesList = [];
let currentStoryIndex = 0;
let isNavigating = false;
let userLanguage = 'es';
let isTranslating = false;

// Caché de traducciones en memoria
let translationCache = {};

// 🔥 CLAVE PARA localStorage
const TRANSLATION_STORAGE_KEY = 'vyin_translations';

// ============================================================
// 🔥 FUNCIONES DE PERSISTENCIA EN localStorage
// ============================================================

function loadTranslationsFromStorage() {
    try {
        const stored = localStorage.getItem(TRANSLATION_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const now = Date.now();
            const valid = {};
            let count = 0;
            for (const [key, value] of Object.entries(parsed)) {
                if (value.timestamp && now - value.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    valid[key] = value;
                    count++;
                }
            }
            translationCache = valid;
            console.log(`📦 [STORAGE] ${count} traducciones cargadas de localStorage`);
            return valid;
        }
    } catch (error) {
        console.warn('⚠️ Error cargando traducciones de localStorage:', error);
    }
    return {};
}

function saveTranslationsToStorage() {
    try {
        const serializable = {};
        const now = Date.now();
        let count = 0;
        for (const [key, value] of Object.entries(translationCache)) {
            if (value.timestamp && now - value.timestamp < 7 * 24 * 60 * 60 * 1000) {
                serializable[key] = {
                    translated: value.translated,
                    original: value.original,
                    engine: value.engine || 'M2M100',
                    license: value.license || 'MIT',
                    language: value.language || 'es',
                    timestamp: value.timestamp || now
                };
                count++;
            }
        }
        localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(serializable));
        console.log(`💾 [STORAGE] ${count} traducciones guardadas`);
    } catch (error) {
        console.warn('⚠️ Error guardando traducciones:', error);
    }
}

function getTranslationFromCache(storyId, language) {
    const cacheKey = `${storyId}_${language}`;
    const cached = translationCache[cacheKey];
    if (cached && cached.translated) {
        if (cached.timestamp && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
            return cached;
        }
        delete translationCache[cacheKey];
        saveTranslationsToStorage();
    }
    return null;
}

function saveTranslationToCache(storyId, language, translated, original, engine = 'M2M100') {
    const cacheKey = `${storyId}_${language}`;
    translationCache[cacheKey] = {
        translated: translated,
        original: original,
        engine: engine,
        license: 'MIT',
        language: language,
        timestamp: Date.now()
    };
    saveTranslationsToStorage();
    console.log(`💾 [CACHE] Traducción guardada para ${storyId} (${language})`);
}

// ============================================================
// 🔥 FUNCIÓN PARA ACTUALIZAR EL BOTÓN DE TRADUCCIÓN
// ============================================================

function updateTranslateButton() {
    const translateBtn = document.getElementById('modalTranslateBtn');
    if (!translateBtn) {
        console.warn('⚠️ [TRANSLATE] Botón no encontrado');
        return;
    }

    if (!currentStoryData || !currentStoryId) {
        translateBtn.style.display = 'none';
        translateBtn.innerHTML = '<i class="fas fa-language"></i> Traducir';
        translateBtn.disabled = false;
        return;
    }

    if (isTranslating) {
        translateBtn.style.display = 'inline-flex';
        translateBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Traduciendo...';
        translateBtn.disabled = true;
        return;
    }

    let contentLanguage = currentStoryData.language || currentStoryData.originalLanguage || 'es';
    
    if (currentStoryData.translated === true && currentStoryData._originalLanguage) {
        contentLanguage = currentStoryData._originalLanguage;
    }
    
    if (currentStoryData.showingOriginal === true && currentStoryData._originalLanguage) {
        contentLanguage = currentStoryData._originalLanguage;
    }

    const isDifferentLanguage = contentLanguage !== userLanguage;
    const hasText = currentStoryData.textContent && currentStoryData.textContent.trim().length > 0;
    const isTranslated = currentStoryData.translated === true;
    const isShowingOriginal = currentStoryData.showingOriginal === true;

    if (!isDifferentLanguage || !hasText || currentStoryData.mediaType === 'survey') {
        translateBtn.style.display = 'none';
        const userNameEl = document.getElementById('modalUserName');
        if (userNameEl) {
            const existingBadge = userNameEl.querySelector('.translation-badge-modal');
            if (existingBadge) existingBadge.remove();
        }
        return;
    }

    translateBtn.style.display = 'inline-flex';
    translateBtn.disabled = false;

    let btnText, btnIcon;
    
    if (isTranslated && !isShowingOriginal) {
        btnText = 'Mostrar original';
        btnIcon = 'fa-undo';
    } else {
        btnText = 'Traducir';
        btnIcon = 'fa-language';
    }
    
    translateBtn.innerHTML = `<i class="fas ${btnIcon}"></i> ${btnText}`;
    
    const userNameEl = document.getElementById('modalUserName');
    if (userNameEl) {
        let existingBadge = userNameEl.querySelector('.translation-badge-modal');
        
        if (isTranslated && !isShowingOriginal) {
            if (!existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'translation-badge-modal';
                badge.style.cssText = 'font-size:9px;color:rgba(192,132,252,0.7);margin-left:6px;';
                const engine = currentStoryData._translationCache?.engine || 'M2M100';
                badge.innerHTML = `<i class="fas fa-language"></i> Traducido (${engine})`;
                userNameEl.appendChild(badge);
            }
        } else {
            if (existingBadge) existingBadge.remove();
        }
    }
}

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

    if (isModalOpen && currentStoryId === storyId) {
        const overlay = document.getElementById('storyModalOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.add('active');
        }
        setTimeout(() => updateTranslateButton(), 50);
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
        // Mantener contexto
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
    isTranslating = false;

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
// CERRAR MODAL
// ============================================================

export function closeStoryModal() {
    console.log('📱 [STORY-MODAL] Cerrando modal...');
    
    isModalOpen = false;
    currentStoryId = null;
    currentStoryData = null;
    currentStoriesList = [];
    currentStoryIndex = 0;
    isNavigating = false;
    isTranslating = false;

    // Limpiar archivo pendiente
    window._pendingCommentFile = null;

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
    
    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer) {
        mediaContainer.innerHTML = `
            <div style="color:rgba(255,255,255,0.15);padding:40px;text-align:center;">
                <i class="fas fa-spinner fa-pulse" style="font-size:28px;"></i>
                <p style="margin-top:8px;font-size:13px;">Cargando historia...</p>
            </div>
        `;
    }
    
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando comentarios...</span>
            </div>
        `;
    }
    
    const viewsEl = document.getElementById('modalViews');
    if (viewsEl) viewsEl.textContent = '0';
    
    const likesEl = document.getElementById('modalLikes');
    if (likesEl) likesEl.textContent = '0';
    
    const commentsEl = document.getElementById('modalComments');
    if (commentsEl) commentsEl.textContent = '0';
    
    const commentsCountEl = document.getElementById('commentsCount');
    if (commentsCountEl) commentsCountEl.textContent = '0';
    
    const caption = document.getElementById('modalCaption');
    if (caption) {
        caption.innerHTML = '';
        caption.style.display = 'none';
    }
    
    const userNameEl = document.getElementById('modalUserName');
    if (userNameEl) {
        userNameEl.textContent = 'Cargando...';
        const badge = userNameEl.querySelector('.translation-badge-modal');
        if (badge) badge.remove();
    }
    
    const userHandleEl = document.getElementById('modalUserHandle');
    if (userHandleEl) userHandleEl.textContent = '@usuario';
    
    const avatarEl = document.getElementById('modalAvatar');
    if (avatarEl) avatarEl.src = '';
    
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
        translateBtn.innerHTML = '<i class="fas fa-language"></i> Traducir';
        translateBtn.disabled = false;
    }
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.value = '';
        commentInput.disabled = false;
        commentInput.placeholder = 'Escribe un comentario...';
    }
    
    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
    }
    
    const progressContainer = document.getElementById('storyProgress');
    if (progressContainer) {
        progressContainer.innerHTML = '';
        progressContainer.style.display = 'none';
    }
    
    const prevArrow = document.getElementById('navPrevArrow');
    const nextArrow = document.getElementById('navNextArrow');
    if (prevArrow) prevArrow.style.display = 'none';
    if (nextArrow) nextArrow.style.display = 'none';
    
    const subtitlesIndicator = document.getElementById('subtitlesIndicator');
    if (subtitlesIndicator) {
        subtitlesIndicator.style.display = 'none';
    }
    
    // 🔥 OCULTAR BOTÓN DE ARCHIVO
    const attachBtn = document.getElementById('commentAttachBtn');
    if (attachBtn) {
        attachBtn.style.display = 'none';
    }
    
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
        isTranslating = false;
        // Limpiar archivo pendiente al navegar
        window._pendingCommentFile = null;
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
                            <button class="comment-attach-btn" id="commentAttachBtn" style="display:none;" title="Adjuntar archivo">
                                <i class="fas fa-paperclip"></i>
                            </button>
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

    // 🔥 INPUT OCULTO PARA SUBIR ARCHIVOS
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'commentFileInput';
    fileInput.className = 'file-input-hidden';
    fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt';
    fileInput.multiple = false;
    document.body.appendChild(fileInput);

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
            navigator.share({ title: 'Vygora - Historia', url });
        } else {
            navigator.clipboard?.writeText(url).then(() => {
                showToast('📋 Enlace copiado');
            });
        }
    });

    document.getElementById('modalDeleteBtn')?.addEventListener('click', async () => {
        if (!currentStoryId) return;
        await handleDeleteStory();
    });

    const translateBtn = document.getElementById('modalTranslateBtn');
    if (translateBtn) {
        translateBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentStoryId || !currentStoryData) {
                showToast('Error: historia no cargada', true);
                return;
            }
            if (isTranslating) {
                console.log('⏳ Ya está traduciendo...');
                return;
            }
            await toggleTranslation();
        });
    }

    const sendBtn = document.getElementById('sendCommentBtn');
    if (sendBtn) {
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

    // 🔥 CONFIGURAR SUBIDA DE ARCHIVO
    setupCommentFileUpload();

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
// 🔥 CONFIGURAR SUBIDA DE ARCHIVO EN COMENTARIOS
// ============================================================

function setupCommentFileUpload() {
    const attachBtn = document.getElementById('commentAttachBtn');
    const fileInput = document.getElementById('commentFileInput');
    
    if (!attachBtn || !fileInput) return;
    
    // Determinar si el usuario actual es el dueño de la historia
    const currentUser = getCurrentUser();
    const isStoryOwner = currentUser?.id === currentStoryData?.userId;
    
    // Solo mostrar botón si es dueño de la historia
    if (isStoryOwner && currentStoryData) {
        attachBtn.style.display = 'flex';
    } else {
        attachBtn.style.display = 'none';
        return;
    }
    
    // Remover listeners antiguos
    const newAttachBtn = attachBtn.cloneNode(true);
    attachBtn.parentNode.replaceChild(newAttachBtn, attachBtn);
    
    newAttachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    
    // Manejar selección de archivo
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    newFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validar tamaño (máx 20MB)
        if (file.size > 20 * 1024 * 1024) {
            showToast('El archivo no puede superar los 20MB', true);
            newFileInput.value = '';
            return;
        }
        
        showToast('📤 Subiendo archivo...');
        
        const result = await uploadCommentFile(currentStoryId, file);
        
        if (result && result.success) {
            // Guardar datos del archivo para enviar con el comentario
            window._pendingCommentFile = {
                fileUrl: result.fileUrl,
                filename: result.filename,
                originalName: result.originalName,
                size: result.size,
                mimetype: result.mimetype
            };
            
            // Mostrar indicador de archivo adjunto
            showToast(`📎 ${result.originalName} adjuntado`);
            
            // Actualizar placeholder del input
            const commentInput = document.getElementById('commentInput');
            if (commentInput) {
                commentInput.placeholder = `📎 ${result.originalName} - Escribe un comentario...`;
            }
        }
        
        newFileInput.value = '';
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
            
            if (currentStoriesList && currentStoriesList.length > 0) {
                const index = currentStoriesList.findIndex(s => s.id === currentStoryId);
                if (index !== -1) {
                    currentStoriesList.splice(index, 1);
                    
                    if (currentStoriesList.length > 0) {
                        const nextIndex = Math.min(index, currentStoriesList.length - 1);
                        const nextStory = currentStoriesList[nextIndex];
                        if (nextStory) {
                            currentStoryIndex = nextIndex;
                            isTranslating = false;
                            await loadStoryData(nextStory.id, true);
                            return;
                        }
                    }
                }
            }
            
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
// 🔥 ENVIAR COMENTARIO (CON ACTUALIZACIÓN PARCIAL)
// ============================================================

async function handleSendComment() {
    const input = document.getElementById('commentInput');
    if (!input) return;
    
    const content = input.value.trim();
    const fileData = window._pendingCommentFile || null;
    
    if (!content && !fileData) {
        showToast('Escribe un comentario o adjunta un archivo', true);
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
    
    input.disabled = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }

    try {
        // Usar addComment con fileData
        const newComment = await addComment(currentStoryId, content, null, fileData);
        
        if (newComment) {
            input.value = '';
            // Limpiar archivo pendiente
            window._pendingCommentFile = null;
            // Restaurar placeholder
            input.placeholder = 'Escribe un comentario...';
            
            // 🔥 ACTUALIZACIÓN PARCIAL - Sin re-renderizar toda la lista
            addCommentToUI(currentStoryId, newComment);
            
            showToast(fileData ? '📎 Comentario con archivo adjunto' : '💬 Comentario enviado');
        }
    } catch (error) {
        console.error('Error enviando comentario:', error);
        showToast('Error al enviar comentario', true);
    } finally {
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        input.focus();
    }
}

// ============================================================
// 🔥 ENVIAR RESPUESTA (CON ACTUALIZACIÓN PARCIAL)
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
            
            // 🔥 ACTUALIZACIÓN PARCIAL - Sin re-renderizar toda la lista
            addReplyToUI(storyId, commentId, data);
            
            showToast('💬 Respuesta enviada');
        } else {
            showToast(data.error || 'Error al enviar respuesta', true);
        }
    } catch (error) {
        console.error('Error enviando respuesta:', error);
        showToast('Error al enviar respuesta', true);
    } finally {
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        input.focus();
    }
}

// ============================================================
// 🔥 ACTUALIZAR CONTADOR DE COMENTARIOS (DEPRECADO - USAR updateCommentCounters)
// ============================================================

function updateCommentCount(increment) {
    // Delegar a la función importada
    updateCommentCounters(currentStoryId, increment);
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
    if (!currentStoryId || !currentStoryData) {
        showToast('Error: historia no cargada', true);
        return;
    }
    
    if (isTranslating) {
        console.log('⏳ Ya está traduciendo...');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para traducir', true);
        return;
    }

    const translateBtn = document.getElementById('modalTranslateBtn');
    if (!translateBtn) return;
    
    const originalLanguage = currentStoryData._originalLanguage || currentStoryData.language || currentStoryData.originalLanguage || 'es';
    const isDifferentLanguage = originalLanguage !== userLanguage;
    
    if (!isDifferentLanguage) {
        showToast('📝 El contenido ya está en tu idioma');
        translateBtn.style.display = 'none';
        return;
    }
    
    if (currentStoryData.translated === true && currentStoryData._originalTextContent) {
        console.log('📝 Mostrando original');
        
        const originalData = {
            ...currentStoryData,
            textContent: currentStoryData._originalTextContent,
            caption: currentStoryData._originalCaption || currentStoryData.caption,
            translated: false,
            showingOriginal: true,
            language: originalLanguage,
            _originalLanguage: originalLanguage,
            _translationCache: currentStoryData._translationCache || null
        };
        
        currentStoryData = originalData;
        
        updateTextContentOnly(originalData);
        updateModalStats(originalData);
        updateTranslateButton();
        
        showToast('📝 Mostrando original');
        return;
    }

    const cached = getTranslationFromCache(currentStoryId, userLanguage);
    
    if (cached) {
        console.log('📦 Usando traducción desde caché (persistente)');
        const translatedData = {
            ...currentStoryData,
            textContent: cached.translated,
            _originalTextContent: cached.original || currentStoryData.textContent,
            _originalCaption: currentStoryData.caption,
            translated: true,
            showingOriginal: false,
            _originalLanguage: originalLanguage,
            language: userLanguage,
            originalLanguage: originalLanguage,
            _translationCache: cached
        };
        
        currentStoryData = translatedData;
        
        updateTextContentOnly(translatedData);
        updateModalStats(translatedData);
        updateTranslateButton();
        
        showToast('✅ Traducción cargada (caché)');
        return;
    }

    isTranslating = true;
    
    translateBtn.style.display = 'inline-flex';
    translateBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Traduciendo...';
    translateBtn.disabled = true;

    try {
        let textToTranslate = currentStoryData.textContent || currentStoryData.caption || '';
        
        if (!textToTranslate || textToTranslate.trim().length === 0) {
            showToast('No hay texto para traducir', true);
            translateBtn.style.display = 'none';
            translateBtn.disabled = false;
            isTranslating = false;
            return;
        }

        console.log('🌐 Traduciendo texto:', textToTranslate.substring(0, 50) + '...');
        console.log(`🌐 Al idioma: ${userLanguage}`);
        console.log(`📝 Idioma original: ${originalLanguage}`);

        const res = await fetch(`${API_URL}/api/vyin/translate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text: textToTranslate,
                targetLanguage: userLanguage,
                sourceLanguage: originalLanguage
            })
        });

        const data = await res.json();
        console.log('📥 Respuesta de traducción:', data);
        
        const isDifferent = data.success && 
                           data.translated && 
                           data.translated !== data.original &&
                           data.translated.trim() !== data.original.trim();
        
        isTranslating = false;
        translateBtn.disabled = false;
        
        if (isDifferent) {
            saveTranslationToCache(
                currentStoryId,
                userLanguage,
                data.translated,
                data.original || textToTranslate,
                data.engine || 'M2M100'
            );
            
            const translatedData = {
                ...currentStoryData,
                textContent: data.translated,
                _originalTextContent: data.original || textToTranslate,
                _originalCaption: currentStoryData.caption,
                translated: true,
                showingOriginal: false,
                _originalLanguage: originalLanguage,
                language: userLanguage,
                originalLanguage: originalLanguage,
                translationEngine: data.engine || 'M2M100',
                _translationCache: {
                    translated: data.translated,
                    original: data.original || textToTranslate,
                    engine: data.engine || 'M2M100',
                    license: 'MIT',
                    language: userLanguage,
                    timestamp: Date.now()
                }
            };
            
            currentStoryData = translatedData;
            
            updateTextContentOnly(translatedData);
            updateModalStats(translatedData);
            updateTranslateButton();
            
            showToast(`✅ Traducido al ${data.languageInfo?.name || userLanguage}`);
        } else {
            console.warn('⚠️ La traducción no cambió el texto');
            showToast('📝 El texto ya está en el idioma seleccionado');
            translateBtn.style.display = 'none';
            updateTranslateButton();
        }
    } catch (error) {
        console.error('❌ Error traduciendo:', error);
        showToast('Error al traducir', true);
        isTranslating = false;
        translateBtn.disabled = false;
        updateTranslateButton();
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
        } else if (!mediaContainer.querySelector('img') && !mediaContainer.querySelector('video') && !mediaContainer.querySelector('.survey-container-modal')) {
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
// 🔥 ACTUALIZAR ESTADÍSTICAS DEL MODAL
// ============================================================

function updateModalStats(story) {
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
}

// ============================================================
// 🔥 RENDERIZAR ENCUESTA EN EL MODAL
// ============================================================

function renderSurveyInModal(story) {
    const mediaContainer = document.getElementById('modalMedia');
    if (!mediaContainer) return;

    const survey = story.surveyData || {};
    const surveyType = survey.surveyType || 'poll';
    const question = survey.question || 'Encuesta';
    
    let surveyContent = '';
    
    if (surveyType === 'poll') {
        const options = survey.options || [];
        const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0);
        const currentUser = getCurrentUser();
        const hasVoted = survey.voters?.includes(currentUser?.id) || false;
        
        surveyContent = `
            <div class="survey-container-modal">
                <div class="survey-question-modal">${escapeHtml(question)}</div>
                <div class="survey-options-modal">
                    ${options.map(opt => {
                        const percentage = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                        const color = opt.color || '#c084fc';
                        const isVoted = hasVoted;
                        return `
                            <div class="survey-option-modal ${isVoted ? 'voted' : ''}" 
                                 data-option-id="${opt.id}" 
                                 onclick="${isVoted ? '' : `window.voteSurvey('${story.id}', '${opt.id}')`}"
                                 style="${isVoted ? 'cursor:default;' : 'cursor:pointer;'}">
                                <div class="survey-option-label-modal">${escapeHtml(opt.label)}</div>
                                <div class="survey-option-bar-modal">
                                    <div class="survey-option-fill-modal" style="width:${percentage}%;background:${color}"></div>
                                </div>
                                <div class="survey-option-stats-modal">${percentage}% (${opt.votes || 0})</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="survey-total-modal">
                    ${hasVoted ? '✅ Ya votaste' : '🔘 Haz clic en una opción para votar'} · ${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'}
                </div>
            </div>
        `;
    } else if (surveyType === 'stats') {
        const statsData = survey.statsData || [];
        const maxValue = Math.max(...statsData.map(d => d.value || 0), 1);
        
        surveyContent = `
            <div class="survey-container-modal survey-stats-modal">
                <div class="survey-question-modal">${escapeHtml(question)}</div>
                <div class="survey-stats-bars-modal">
                    ${statsData.map(stat => {
                        const percentage = Math.round((stat.value || 0) / maxValue * 100);
                        const color = stat.color || '#c084fc';
                        return `
                            <div class="survey-stat-item-modal">
                                <div class="survey-stat-label-modal">${escapeHtml(stat.label)}</div>
                                <div class="survey-stat-bar-modal">
                                    <div class="survey-stat-fill-modal" style="width:${percentage}%;background:${color}"></div>
                                </div>
                                <div class="survey-stat-value-modal">${stat.value || 0}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    } else if (surveyType === 'calculation') {
        const calc = survey.calculation || {};
        surveyContent = `
            <div class="survey-container-modal survey-calculation-modal">
                <div class="survey-question-modal">${escapeHtml(question)}</div>
                <div class="survey-calc-result-modal">
                    <span class="survey-calc-label-modal">${escapeHtml(calc.operation || 'Resultado')}</span>
                    <span class="survey-calc-value-modal">${escapeHtml(calc.result || '0')}</span>
                    ${calc.formula ? `<div class="survey-calc-formula-modal">${escapeHtml(calc.formula)}</div>` : ''}
                </div>
            </div>
        `;
    }

    mediaContainer.innerHTML = surveyContent;
    
    // Registrar la función de voto globalmente
    window.voteSurvey = async function(storyId, optionId) {
        await handleSurveyVote(storyId, optionId);
    };
}

// ============================================================
// 🔥 MANEJAR VOTO EN ENCUESTA
// ============================================================

async function handleSurveyVote(storyId, optionId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para votar', true);
        return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
        showToast('Inicia sesión para votar', true);
        return;
    }

    // Verificar si ya votó
    if (currentStoryData?.surveyData?.voters?.includes(currentUser.id)) {
        showToast('Ya votaste en esta encuesta', true);
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/stories/${storyId}/survey/vote`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ optionId })
        });

        const data = await res.json();

        if (res.ok) {
            showToast('✅ Voto registrado');
            // Actualizar los datos de la encuesta
            if (currentStoryData) {
                currentStoryData.surveyData = data.surveyData;
                // Re-renderizar la encuesta
                renderSurveyInModal(currentStoryData);
            }
        } else {
            showToast(data.error || 'Error al votar', true);
        }
    } catch (error) {
        console.error('Error votando:', error);
        showToast('Error al votar', true);
    }
}

// ============================================================
// CARGAR DATOS DE LA HISTORIA
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
                await initComments(storyId, 'commentsList', highlightCommentId, true);
                setTimeout(() => updateTranslateButton(), 50);
                return;
            }
            if (currentStoriesList.length > 0) {
                const cachedStory = currentStoriesList.find(s => s.id === storyId);
                if (cachedStory) {
                    currentStoryData = cachedStory;
                    updateModalUI(currentStoryData);
                    updateProgress();
                    const highlightCommentId = window._activityCommentId || null;
                    await initComments(storyId, 'commentsList', highlightCommentId, true);
                    setTimeout(() => updateTranslateButton(), 50);
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
        
        const originalLanguage = story.language || story.originalLanguage || 'es';
        
        currentStoryData = {
            ...story,
            _originalLanguage: originalLanguage,
            originalLanguage: originalLanguage
        };
        currentStoryId = story.id;
        isTranslating = false;
        
        window._storyOwnerId = story.userId;

        // Verificar si hay traducción en caché persistente
        const cachedTranslation = getTranslationFromCache(storyId, userLanguage);
        if (cachedTranslation && !story.translated && story.mediaType !== 'survey') {
            console.log('📦 Aplicando traducción desde caché persistente');
            currentStoryData = {
                ...currentStoryData,
                textContent: cachedTranslation.translated,
                _originalTextContent: cachedTranslation.original || currentStoryData.textContent,
                _originalCaption: currentStoryData.caption,
                translated: true,
                showingOriginal: false,
                _originalLanguage: originalLanguage,
                originalLanguage: originalLanguage,
                language: userLanguage,
                _translationCache: cachedTranslation
            };
        }

        console.log('📝 Datos de la historia:', {
            id: story.id,
            mediaType: story.mediaType,
            language: story.language || 'es',
            originalLanguage: originalLanguage,
            hasTextContent: !!story.textContent,
            hasCaption: !!story.caption,
            hasTranslation: !!cachedTranslation,
            isSurvey: story.mediaType === 'survey'
        });

        updateModalUI(currentStoryData);
        updateProgress();
        
        const highlightCommentId = window._activityCommentId || null;
        await initComments(storyId, 'commentsList', highlightCommentId, true);
        
        setTimeout(() => updateTranslateButton(), 100);
        
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

    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (deleteBtn) {
        deleteBtn.style.display = isOwner ? 'inline-flex' : 'none';
    }

    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer) {
        // 🔥 Si es encuesta, renderizar encuesta
        if (story.mediaType === 'survey' && story.surveyData) {
            renderSurveyInModal(story);
            return;
        }
        
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

    updateModalStats(story);

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
    
    // 🔥 CONFIGURAR BOTÓN DE ARCHIVO SEGÚN DUEÑO
    setupCommentFileUpload();
    
    setTimeout(() => updateTranslateButton(), 50);
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
// 🔥 MANEJAR LIKE EN MODAL - CON ACTUALIZACIÓN DE CACHÉ
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
    
    // 🔥 ACTUALIZACIÓN OPTIMISTA
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
            // Actualizar con el valor real del servidor
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

            // Actualizar caché local
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
            // Revertir cambios en caso de error
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
// 🔥 FUNCIÓN GLOBAL PARA MANEJAR LIKE DE COMENTARIOS
// ============================================================

// Esta función se expone globalmente para que los comentarios puedan usarla
window.handleCommentLike = async function(storyId, commentId) {
    const { likeComment, commentsCache, findCommentById } = await import('./story-comments.js');
    const liked = await likeComment(storyId, commentId);
    if (liked !== false) {
        // Obtener el comentario actualizado del caché
        const comments = commentsCache.get(storyId);
        const comment = findCommentById(comments, commentId);
        if (comment) {
            const likesCount = comment.likes?.length || 0;
            // 🔥 ACTUALIZACIÓN PARCIAL - Sin re-renderizar toda la lista
            const { updateCommentLikeUI } = await import('./story-comments.js');
            updateCommentLikeUI(commentId, liked, likesCount);
        }
    }
};

// ============================================================
// 🔥 INICIALIZAR CACHÉ
// ============================================================

loadTranslationsFromStorage();

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

window.openStoryModal = openStoryModal;
window.closeStoryModal = closeStoryModal;
window.navigateStory = navigateStory;
window.handleSendReply = handleSendReply;
window.handleSendComment = handleSendComment;
window.voteSurvey = async function(storyId, optionId) {
    await handleSurveyVote(storyId, optionId);
};

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

// ============================================================
// EXPORTACIONES
// ============================================================

export { 
    loadStoryData, 
    handleModalLike, 
    handleSendComment, 
    updateTranslateButton,
    toggleTranslation,
    getTranslationFromCache,
    saveTranslationToCache,
    loadTranslationsFromStorage,
    saveTranslationsToStorage,
    handleSurveyVote,
    renderSurveyInModal,
    setupCommentFileUpload
};