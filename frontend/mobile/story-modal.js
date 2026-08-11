// story-modal.js - VERSIÓN CORREGIDA CON LIMPIEZA DE ESTADO Y MEJOR RENDIMIENTO
// 🔥 CORREGIDO: Limpieza de estado anterior, mejora de renderizado, scroll en móvil

import {
    getToken, getCurrentUser, showToast,
    getAvatar, formatDate, escapeHtml, goToProfile, getUserLanguage
} from './auth.js';

import { formatNumber } from './utils.js';
import { initComments, clearCommentsCache } from './story-comments.js';

const API_URL = window.location.origin;
let currentStoryId = null;
let currentStoryData = null;
let isModalOpen = false;
let currentStoriesList = [];
let currentStoryIndex = 0;
let isNavigating = false;
let userLanguage = 'es';
let isLoading = false;
let pendingStoryId = null;

// Caché de traducciones
let translationCache = {};

// ============================================================
// 🔥 ABRIR MODAL CON LIMPIEZA PREVIA
// ============================================================

async function openStoryModal(storyId, storiesList = null, fromProfile = false, profileUserId = null) {
    if (!storyId) {
        showToast('Historia no encontrada', true);
        return;
    }

    console.log('📱 [STORY-MODAL] Abriendo historia:', storyId);

    // 🔥 LIMPIAR ESTADO ANTERIOR INMEDIATAMENTE
    if (isModalOpen) {
        console.log('📱 [STORY-MODAL] Cerrando modal anterior...');
        await forceCloseAndCleanup();
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    const currentUser = getCurrentUser();
    userLanguage = currentUser?.language || 'es';

    // Guardar contexto
    if (fromProfile && profileUserId) {
        window._fromProfileModal = true;
        window._profileContextUserId = profileUserId;
    } else {
        window._fromProfileModal = false;
        window._profileContextUserId = null;
    }

    // Guardar lista de historias para carrusel
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
    isLoading = true;
    pendingStoryId = storyId;

    // Crear o mostrar overlay
    const overlay = document.getElementById('storyModalOverlay');
    if (!overlay) {
        createModalHTML();
    }

    const storyOverlay = document.getElementById('storyModalOverlay');
    if (storyOverlay) {
        storyOverlay.style.display = 'flex';
        storyOverlay.classList.add('active');
        
        // 🔥 Z-INDEX PARA MÓVIL
        const zIndex = window._fromExploreModal ? '10002' : 
                       window._fromActivityModal ? '10001' : '10001';
        storyOverlay.style.zIndex = zIndex;
    }
    
    document.body.style.overflow = 'hidden';

    // 🔥 MOSTRAR SKELETON INMEDIATAMENTE
    showSkeletonLoader();

    // 🔥 CARGAR DATOS CON LIMPIEZA PREVIA DE CACHÉ
    await loadStoryData(storyId);
}

// ============================================================
// 🔥 FUNCIÓN DE LIMPIEZA FORZADA
// ============================================================

async function forceCloseAndCleanup() {
    console.log('🧹 [STORY-MODAL] Limpieza forzada...');
    
    // Limpiar estado
    isModalOpen = false;
    isLoading = false;
    
    // Limpiar video
    const video = document.getElementById('storyVideo');
    if (video) {
        video.pause();
        video.src = '';
        video.load();
    }

    // Limpiar VTT
    if (window._vttUrl) {
        URL.revokeObjectURL(window._vttUrl);
        window._vttUrl = null;
    }

    // 🔥 LIMPIAR CACHÉ DE COMENTARIOS PARA ESTA HISTORIA
    if (currentStoryId) {
        clearCommentsCache(currentStoryId);
    }

    // Limpiar contenedor de comentarios
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando comentarios...</span>
            </div>
        `;
    }

    // Ocultar overlay
    const overlay = document.getElementById('storyModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
    }
    
    // Resetear variables
    currentStoryId = null;
    currentStoryData = null;
    currentStoriesList = [];
    currentStoryIndex = 0;
    pendingStoryId = null;
    
    // Limpiar input de comentarios
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

    // Restaurar scroll
    if (!window._fromProfileModal && !window._fromExploreModal && !window._fromActivityModal) {
        document.body.style.overflow = '';
    }

    // Limpiar contexto
    setTimeout(() => {
        window._fromProfileModal = false;
        window._fromExploreModal = false;
        window._fromActivityModal = false;
        window._activityCommentId = null;
        window._profileContextUserId = null;
    }, 100);
}

// ============================================================
// 🔥 MOSTRAR SKELETON
// ============================================================

function showSkeletonLoader() {
    const mediaContainer = document.getElementById('modalMedia');
    if (mediaContainer) {
        mediaContainer.innerHTML = `
            <div class="skeleton-media" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.02);">
                <div style="text-align:center;">
                    <div class="skeleton-spinner" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.05);border-top-color:#c084fc;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div>
                    <p style="color:rgba(255,255,255,0.15);font-size:13px;margin-top:12px;">Cargando historia...</p>
                </div>
            </div>
        `;
    }

    // Mostrar skeleton en comentarios
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-spinner fa-pulse"></i>
                <span>Cargando comentarios...</span>
            </div>
        `;
    }
}

// ============================================================
// 🔥 CERRAR MODAL
// ============================================================

function closeStoryModal() {
    console.log('📱 [STORY-MODAL] Cerrando modal...');
    forceCloseAndCleanup();
}

// ============================================================
// 🔥 NAVEGAR ENTRE HISTORIAS
// ============================================================

async function navigateStory(direction) {
    if (isNavigating || isLoading) return;
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
    isLoading = true;
    currentStoryIndex = newIndex;
    const newStory = currentStoriesList[newIndex];
    
    if (newStory) {
        console.log(`🔄 Navegando a historia ${newIndex + 1}/${currentStoriesList.length}: ${newStory.id}`);
        
        // 🔥 LIMPIAR CACHÉ DE LA HISTORIA ANTERIOR
        if (currentStoryId) {
            clearCommentsCache(currentStoryId);
        }
        
        // 🔥 LIMPIAR ESTADO DE COMENTARIOS INMEDIATAMENTE
        const commentsList = document.getElementById('commentsList');
        if (commentsList) {
            commentsList.innerHTML = `
                <div class="no-comments">
                    <i class="fas fa-spinner fa-pulse"></i>
                    <span>Cargando comentarios...</span>
                </div>
            `;
        }
        
        currentStoryId = newStory.id;
        pendingStoryId = newStory.id;
        
        showSkeletonLoader();
        await loadStoryData(newStory.id, true);
    }
    
    isNavigating = false;
    isLoading = false;
}

// ============================================================
// 🔥 CREAR HTML DEL MODAL (VERSIÓN MEJORADA)
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
                            <button class="btn-profile-modal" id="modalProfileBtn">
                                <i class="fas fa-user"></i> Perfil
                            </button>
                            <button class="btn-translate-modal" id="modalTranslateBtn" style="display:none;">
                                <i class="fas fa-language"></i> Traducir
                            </button>
                            <button class="btn-delete-modal" id="modalDeleteBtn" style="display:none;">
                                <i class="fas fa-trash-alt"></i> Eliminar
                            </button>
                        </div>
                        
                        <button class="nav-arrow" id="navNextArrow" onclick="window.navigateStory(1)">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>

                    <!-- 🔥 SECCIÓN DE COMENTARIOS MEJORADA PARA MÓVIL -->
                    <div class="comments-section" id="commentsSection">
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
                        <!-- 🔥 INPUT DE COMENTARIOS SIEMPRE VISIBLE -->
                        <div class="comment-input-wrapper" id="commentInputWrapper">
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

    // Eventos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalOpen) {
            closeStoryModal();
        }
        if (e.key === 'ArrowLeft' && isModalOpen && currentStoriesList.length > 1 && !isLoading) {
            navigateStory(-1);
        }
        if (e.key === 'ArrowRight' && isModalOpen && currentStoriesList.length > 1 && !isLoading) {
            navigateStory(1);
        }
    });

    setupModalEvents();
}

// ============================================================
// 🔥 CONFIGURAR EVENTOS
// ============================================================

function setupModalEvents() {
    console.log('📱 [STORY-MODAL] Configurando eventos...');
    
    document.getElementById('modalLikeBtn')?.addEventListener('click', async () => {
        if (!currentStoryId || isLoading) return;
        await handleModalLike();
    });

    document.getElementById('modalCommentBtn')?.addEventListener('click', () => {
        const input = document.getElementById('commentInput');
        if (input) {
            input.focus();
            // 🔥 SCROLL AL INPUT EN MÓVIL
            setTimeout(() => {
                const wrapper = document.getElementById('commentInputWrapper');
                if (wrapper) {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
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

    document.getElementById('modalProfileBtn')?.addEventListener('click', () => {
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
    });

    // BOTÓN DE TRADUCCIÓN
    document.getElementById('modalTranslateBtn')?.addEventListener('click', async () => {
        if (!currentStoryId || isLoading) return;
        await toggleTranslation();
    });

    // BOTÓN DE ELIMINAR
    document.getElementById('modalDeleteBtn')?.addEventListener('click', async () => {
        if (!currentStoryId || isLoading) return;
        await deleteStory(currentStoryId);
    });

    // TOUCH PARA NAVEGACIÓN
    let touchStartX = 0;
    let touchStartY = 0;
    const modalContent = document.querySelector('.modal-content');
    
    modalContent?.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    });
    
    modalContent?.addEventListener('touchend', (e) => {
        if (isLoading || isNavigating) return;
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
// 🔥 CARGAR DATOS DE LA HISTORIA - CON LIMPIEZA DE CACHÉ
// ============================================================

async function loadStoryData(storyId, isNavigation = false) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para ver historias', true);
        closeStoryModal();
        return;
    }

    try {
        console.log(`📡 [STORY-MODAL] Cargando historia ${storyId}...`);

        const res = await fetch(`${API_URL}/api/stories/${storyId}/details`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 304) {
            console.log('📦 [STORY-MODAL] Historia no modificada (304)');
            if (currentStoryData && currentStoryData.id === storyId) {
                updateModalUI(currentStoryData);
                updateProgress();
                const highlightCommentId = window._activityCommentId || null;
                await initComments(storyId, 'commentsList', highlightCommentId);
                isLoading = false;
                return;
            }
            if (currentStoriesList.length > 0) {
                const cachedStory = currentStoriesList.find(s => s.id === storyId);
                if (cachedStory) {
                    currentStoryData = cachedStory;
                    updateModalUI(currentStoryData);
                    updateProgress();
                    const highlightCommentId = window._activityCommentId || null;
                    await initComments(storyId, 'commentsList', highlightCommentId);
                    isLoading = false;
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
            isLoading = false;
            return;
        }

        const story = await res.json();
        currentStoryData = story;
        currentStoryId = story.id;

        // Aplicar traducción en caché
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

        // 🔥 ACTUALIZAR UI
        updateModalUI(currentStoryData);
        updateProgress();
        
        // 🔥 CARGAR COMENTARIOS CON LIMPIEZA PREVIA
        const highlightCommentId = window._activityCommentId || null;
        console.log('📌 Highlight comment ID:', highlightCommentId);
        
        // Limpiar caché de comentarios para esta historia antes de cargar
        clearCommentsCache(storyId);
        
        await initComments(storyId, 'commentsList', highlightCommentId);
        
        // Registrar vista
        await registerView(storyId);
        
        isLoading = false;

    } catch (error) {
        console.error('Error loading story:', error);
        showToast('Error al cargar la historia', true);
        if (!isNavigation) closeStoryModal();
        isLoading = false;
    }
}

// ============================================================
// 🔥 ACTUALIZAR UI DEL MODAL
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

    // Botón eliminar
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (deleteBtn) {
        const currentUser = getCurrentUser();
        const isOwner = currentUser && user.id && currentUser.id === user.id;
        if (isOwner) {
            deleteBtn.style.display = 'inline-flex';
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Eliminar';
            deleteBtn.title = 'Eliminar esta historia';
        } else {
            deleteBtn.style.display = 'none';
        }
    }

    // Botón traducción
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

    // 🔥 MEDIA
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

    // Caption
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

    // Subtítulos
    const subtitlesIndicator = document.getElementById('subtitlesIndicator');
    if (subtitlesIndicator) {
        if (story.hasSubtitles && story.segments && story.segments.length > 0) {
            subtitlesIndicator.style.display = 'inline-flex';
            subtitlesIndicator.innerHTML = '<i class="fas fa-closed-captioning"></i> CC';
        } else {
            subtitlesIndicator.style.display = 'none';
        }
    }

    // Estadísticas
    const views = story.views?.length || 0;
    const likes = story.likes?.length || 0;
    const comments = story.comments?.length || 0;

    document.getElementById('modalViews').textContent = formatNumber(views);
    document.getElementById('modalLikes').textContent = formatNumber(likes);
    document.getElementById('modalComments').textContent = formatNumber(comments);
    document.getElementById('commentsCount').textContent = formatNumber(comments);

    // Like button
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
// 🔥 FUNCIONES GLOBALES PARA WINDOW
// ============================================================

window.openStoryModal = openStoryModal;
window.closeStoryModal = closeStoryModal;
window.navigateStory = navigateStory;

// ============================================================
// ✅ EXPORTACIONES
// ============================================================

export { 
    openStoryModal, 
    closeStoryModal, 
    navigateStory, 
    loadStoryData,
    forceCloseAndCleanup
};