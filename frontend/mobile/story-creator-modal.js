// ============================================================
// story-creator-modal.js - VERSIÓN COMPLETA CORREGIDA
// 🔥 DISEÑO MEJORADO: Sin duplicación, limpio y moderno
// 🔥 INTEGRADO CON i18n PARA TRADUCCIÓN DE INTERFAZ
// 🔥 MEJORADO: Calidad de cámara, zoom, flash
// 🔥 NUEVO: Soporte para encuestas (survey-modal superpuesto)
// 🔥 CORREGIDO: Flujo de texto (editar en lugar de volver a cámara)
// 🔥 CORREGIDO: Zoom estable sin bugs al cambiar de modo
// 🔥 CORREGIDO: Zoom oculto en modos texto/encuesta
// 🔥 MEJORADO: UI profesional con animaciones suaves
// 🔥 ELIMINADO: Paleta de colores (innecesaria para historias de texto)
// ============================================================

import { getToken, getCurrentUser, showToast } from './auth.js';
import { t, onLocaleChange, translateAll } from './i18n.js';
import { openSurveyModal, closeSurveyModal } from './survey-modal.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO GLOBAL
// ============================================================

let isCreatorOpen = false;
let mediaFile = null;
let mediaType = null;
let previewUrl = null;
let cameraStream = null;
let cameraVideo = null;
let facingMode = 'user';
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let timerInterval = null;
let recordingSeconds = 0;
let processedVideoData = null;
let isPublishing = false;
let currentStep = 'camera';
let audioStreamForRecording = null;
let localeUnsubscribe = null;
let zoomLevel = 1;
let flashEnabled = false;
let torchSupported = false;
let savedTextContent = '';
let isZoomActive = false;
let zoomTimeout = null;

// 🔥🔥🔥 AGREGAR ESTA LÍNEA 🔥🔥🔥
let captureMode = 'video';
// ============================================================
// FUNCIÓN SEGURA
// ============================================================

function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`⚠️ Elemento no encontrado: #${id}`);
    return el;
}

// ============================================================
// 🔥 ESCUCHAR CAMBIOS DE IDIOMA
// ============================================================

function initI18nForCreator() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    localeUnsubscribe = onLocaleChange(() => {
        if (isCreatorOpen) translateCreatorUI();
    });
}

// ============================================================
// 🔥 TRADUCIR UI DEL CREADOR
// ============================================================

function translateCreatorUI() {
    const overlay = document.getElementById('creatorOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    
    console.log('🌐 Traduciendo UI del creador...');
    
    // Modo selector - SOLO Video y Foto
    const modeBtns = overlay.querySelectorAll('.mode-btn span');
    const modeLabels = [
        t('story.video') || 'Video',
        t('story.photo') || 'Foto'
    ];
    modeBtns.forEach((btn, index) => {
        if (index < modeLabels.length) btn.textContent = modeLabels[index];
    });
    
    // Botones barra inferior
    const btnMap = {
        '.btn-retake span': t('action.retake') || 'Rehacer',
        '.btn-use span': t('action.use') || 'Usar',
        '.btn-edit span': t('action.edit') || 'Editar',
        '.btn-next-preview span': t('action.confirm') || 'Confirmar',
        '.btn-gallery span': t('story.gallery') || 'Galería',
        '.btn-text span': t('story.text') || 'Texto',
        '.btn-survey span': t('survey.poll') || 'Encuesta'
    };
    Object.entries(btnMap).forEach(([selector, text]) => {
        const el = overlay.querySelector(selector);
        if (el) el.textContent = text;
    });
    
    // Placeholders
    const captionInput = overlay.querySelector('#creatorCaption');
    if (captionInput) captionInput.placeholder = t('story.captionPlaceholder') || 'Escribe una descripción...';
    
    const textInput = overlay.querySelector('#textContent');
    if (textInput) textInput.placeholder = t('story.textPlaceholder') || 'Escribe algo...';
    
    // Botón publicar
    const publishBtn = overlay.querySelector('#publishBtn span');
    if (publishBtn) publishBtn.textContent = t('action.publish') || 'Publicar';
    
    // Subtítulos
    const subtitlesText = overlay.querySelector('#subtitlesText');
    if (subtitlesText) {
        const current = subtitlesText.textContent;
        if (current.includes('Generando') || current.includes('generando')) {
            subtitlesText.textContent = t('story.generatingSubtitles') || 'Generando subtítulos...';
        } else if (current.includes('generados')) {
            subtitlesText.textContent = t('story.subtitlesGenerated') || '✅ Subtítulos generados correctamente';
        }
    }
    
    console.log('✅ UI del creador traducida');
}

// ============================================================
// ABRIR / CERRAR
// ============================================================

export async function openCreator() {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para publicar', true);
        return;
    }

    if (isCreatorOpen) {
        closeCreator();
        return;
    }

    isCreatorOpen = true;
    processedVideoData = null;
    captureMode = 'video';
    isPublishing = false;
    currentStep = 'camera';
    zoomLevel = 1;
    flashEnabled = false;
    savedTextContent = '';
    isZoomActive = false;

    const overlay = safeGetElement('creatorOverlay');
    if (!overlay) createCreatorHTML();

    const overlayEl = safeGetElement('creatorOverlay');
    if (overlayEl) overlayEl.classList.add('active');
    
    document.body.style.overflow = 'hidden';
    resetCreatorState();
    
    initI18nForCreator();
    setTimeout(translateCreatorUI, 100);
    
    await startCamera();
}

export function closeCreator() {
    isCreatorOpen = false;
    isPublishing = false;
    currentStep = 'camera';
    resetCreatorState();

    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    if (timerInterval) clearInterval(timerInterval);

    if (audioStreamForRecording) {
        audioStreamForRecording.getTracks().forEach(track => track.stop());
        audioStreamForRecording = null;
    }

    const overlay = safeGetElement('creatorOverlay');
    if (overlay) overlay.classList.remove('active');
    
    document.body.style.overflow = '';
    stopCamera();
    
    if (localeUnsubscribe) {
        localeUnsubscribe();
        localeUnsubscribe = null;
    }
    
    if (zoomTimeout) {
        clearTimeout(zoomTimeout);
        zoomTimeout = null;
    }
}

// ============================================================
// RESETEAR ESTADO
// ============================================================

function resetCreatorState() {
    mediaFile = null;
    mediaType = null;
    previewUrl = null;
    processedVideoData = null;
    isRecording = false;
    recordingSeconds = 0;
    zoomLevel = 1;
    flashEnabled = false;
    savedTextContent = '';
    isZoomActive = false;

    if (zoomTimeout) {
        clearTimeout(zoomTimeout);
        zoomTimeout = null;
    }

    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }

    ['inputArea', 'captureActions', 'textTools', 'subtitlesStatus', 'previewActions', 'textEditorContainer'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });

    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'flex';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
    }

    const caption = safeGetElement('creatorCaption');
    if (caption) caption.value = '';
    
    const flashBtn = safeGetElement('flashBtn');
    if (flashBtn) {
        flashBtn.classList.remove('active');
        flashBtn.innerHTML = '<i class="fas fa-bolt"></i>';
    }

    const zoomIndicator = safeGetElement('zoomIndicator');
    if (zoomIndicator) {
        zoomIndicator.style.display = 'none';
    }
    
    const flashBtnEl = safeGetElement('flashBtn');
    if (flashBtnEl) {
        flashBtnEl.style.display = torchSupported ? 'flex' : 'none';
    }
}

// ============================================================
// CREAR HTML - DISEÑO MEJORADO SIN PALETA DE COLORES
// ============================================================

function createCreatorHTML() {
    if (safeGetElement('creatorOverlay')) return;

    const html = `
        <div id="creatorOverlay" class="creator-overlay">
            
            <!-- PREVIEW -->
            <div class="creator-preview" id="creatorPreview">
                <div class="camera-placeholder">
                    <i class="fas fa-camera"></i>
                    <span>${t('story.startingCamera') || 'Iniciando cámara...'}</span>
                </div>
            </div>

            <!-- TOP CONTROLS -->
            <div class="top-controls" id="topControls">
                <button class="btn-close" onclick="window.closeCreator()">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="top-controls-center">
                    <span class="quality-indicator" id="qualityIndicator">
                        <i class="fas fa-hdmi"></i> HD
                    </span>
                </div>
                <button class="btn-next" id="publishBtn" disabled onclick="window.publishStory()">
                    <span>${t('action.publish') || 'Publicar'}</span>
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>

            <!-- MODE SELECTOR - SOLO Video y Foto -->
            <div class="mode-selector" id="modeSelector">
                <button class="mode-btn active" data-mode="video">
                    <i class="fas fa-video"></i>
                    <span>${t('story.video') || 'Video'}</span>
                </button>
                <button class="mode-btn" data-mode="photo">
                    <i class="fas fa-camera"></i>
                    <span>${t('story.photo') || 'Foto'}</span>
                </button>
            </div>

            <!-- FLIP CAMERA -->
            <button class="btn-flip-camera" id="flipCameraBtn" title="${t('story.flipCamera') || 'Girar cámara'}">
                <i class="fas fa-sync-alt"></i>
            </button>

            <!-- FLASH BUTTON -->
            <button class="btn-flash" id="flashBtn" title="${t('story.flash') || 'Flash'}">
                <i class="fas fa-bolt"></i>
            </button>

            <!-- ZOOM INDICATOR -->
            <div class="zoom-indicator" id="zoomIndicator">
                <span class="zoom-icon"><i class="fas fa-search-plus"></i></span>
                <span id="zoomLevel">1.0x</span>
            </div>

            <!-- RECORDING INDICATOR -->
            <div class="recording-indicator" id="recordingIndicator">
                <div class="recording-dot"></div>
                <span id="recordTimer">00:00</span>
            </div>

            <!-- CAPTURE ACTIONS -->
            <div class="capture-actions" id="captureActions">
                <button class="btn-retake" onclick="window.retakeMedia()">
                    <i class="fas fa-undo"></i>
                    <span>${t('action.retake') || 'Rehacer'}</span>
                </button>
                <button class="btn-use" onclick="window.useMedia()">
                    <i class="fas fa-check"></i>
                    <span>${t('action.use') || 'Usar'}</span>
                </button>
            </div>

            <!-- PREVIEW ACTIONS -->
            <div class="preview-actions" id="previewActions">
                <button class="btn-edit" onclick="window.editMedia()">
                    <i class="fas fa-pen"></i>
                    <span>${t('action.edit') || 'Editar'}</span>
                </button>
                <button class="btn-next-preview" onclick="window.confirmMedia()">
                    <i class="fas fa-check"></i>
                    <span>${t('action.confirm') || 'Confirmar'}</span>
                </button>
            </div>

            <!-- SUBTITLES STATUS -->
            <div class="subtitles-status" id="subtitlesStatus">
                <div class="subtitles-icon">
                    <i class="fas fa-closed-captioning"></i>
                </div>
                <div class="subtitles-text">
                    <span id="subtitlesText">${t('story.generatingSubtitles') || 'Generando subtítulos...'}</span>
                </div>
                <button class="subtitles-close" onclick="window.closeSubtitlesStatus()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- TEXT EDITOR -->
            <div class="text-editor-container" id="textEditorContainer">
                <textarea id="textContent" placeholder="${t('story.textPlaceholder') || 'Escribe algo...'}" maxlength="1000"></textarea>
                <div class="text-editor-tools">
                    <button class="btn-back-camera" onclick="window.backToCamera()">
                        <i class="fas fa-arrow-left"></i>
                        ${t('action.back') || 'Volver'}
                    </button>
                    <button class="btn-confirm-text" onclick="window.confirmText()">
                        <i class="fas fa-check"></i>
                        ${t('action.confirm') || 'Confirmar'}
                    </button>
                </div>
            </div>

            <!-- INPUT AREA - DESCRIPCIÓN -->
            <div class="input-area" id="inputArea">
                <div class="input-wrapper">
                    <i class="fas fa-pencil-alt"></i>
                    <input type="text" id="creatorCaption" placeholder="${t('story.captionPlaceholder') || 'Escribe una descripción...'}" maxlength="220" />
                    <span class="char-counter" id="charCounter">0/220</span>
                </div>
            </div>

            <!-- BOTTOM CONTROLS - GALERÍA | GRABAR | TEXTO | ENCUESTA -->
            <div class="bottom-controls" id="bottomControls">
                <button class="btn-gallery" onclick="window.openGallery()">
                    <i class="fas fa-image"></i>
                    <span>${t('story.gallery') || 'Galería'}</span>
                </button>

                <button class="btn-capture" id="captureBtn">
                    <div class="capture-outer">
                        <div class="capture-inner"></div>
                    </div>
                </button>

                <button class="btn-text" onclick="window.createTextStory()">
                    <i class="fas fa-font"></i>
                    <span>${t('story.text') || 'Texto'}</span>
                </button>

                <button class="btn-survey" onclick="window.openSurveyModeFromCreator()">
                    <i class="fas fa-chart-pie"></i>
                    <span>${t('survey.poll') || 'Encuesta'}</span>
                </button>
            </div>

        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
    setupCreatorEvents();
    injectStyles();
}

// ============================================================
// CONFIGURAR EVENTOS
// ============================================================

function setupCreatorEvents() {
    const captureBtn = safeGetElement('captureBtn');
    captureBtn?.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else if (captureMode === 'photo') {
            capturePhoto();
        } else {
            startRecording();
        }
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mediaType === 'image' || mediaType === 'video') {
                showToast(t('story.alreadyCaptured') || 'Ya tienes un medio capturado', true);
                return;
            }
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            captureMode = btn.dataset.mode;
            if (isRecording) stopRecording();
            updateQualityIndicator();
            showCamera();
        });
    });

    const flipBtn = safeGetElement('flipCameraBtn');
    flipBtn?.addEventListener('click', () => {
        if (cameraStream && !mediaType) {
            flipCamera();
        } else {
            showToast(t('story.noCamera') || 'No hay cámara activa', true);
        }
    });

    const flashBtn = safeGetElement('flashBtn');
    flashBtn?.addEventListener('click', toggleFlash);

    const preview = safeGetElement('creatorPreview');
    preview?.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && cameraStream && !mediaType && currentStep === 'camera') {
            e.preventDefault();
            handlePinchZoom(e);
        }
    }, { passive: false });

    preview?.addEventListener('dblclick', () => {
        if (cameraStream && !mediaType && currentStep === 'camera') resetZoom();
    });

    const captionInput = safeGetElement('creatorCaption');
    captionInput?.addEventListener('input', (e) => {
        const counter = safeGetElement('charCounter');
        if (counter) counter.textContent = `${e.target.value.length}/220`;
    });

    const textInput = safeGetElement('textContent');
    textInput?.addEventListener('input', () => {
        const hasText = textInput.value.trim().length > 0;
        const confirmBtn = document.querySelector('.btn-confirm-text');
        if (confirmBtn) {
            confirmBtn.style.opacity = hasText ? '1' : '0.3';
            confirmBtn.style.pointerEvents = hasText ? 'auto' : 'none';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isCreatorOpen) closeCreator();
    });
}

// ============================================================
// 🔥 ABRIR ENCUESTA DESDE BOTÓN INFERIOR (MODAL SUPERPUESTO)
// ============================================================

window.openSurveyModeFromCreator = function() {
    if (mediaType === 'image' || mediaType === 'video') {
        showToast(t('story.alreadyCaptured') || 'Ya tienes un medio capturado', true);
        return;
    }
    
    const zoomIndicator = safeGetElement('zoomIndicator');
    if (zoomIndicator) {
        zoomIndicator.style.display = 'none';
    }
    
    openSurveyModal(() => {
        console.log('📊 Encuesta publicada');
        closeCreator();
    });
};

// ============================================================
// ACTUALIZAR INDICADOR DE CALIDAD
// ============================================================

function updateQualityIndicator() {
    const indicator = safeGetElement('qualityIndicator');
    if (!indicator) return;
    const isBackCamera = facingMode === 'environment';
    const quality = isBackCamera ? 'HD' : 'HD';
    indicator.innerHTML = `<i class="fas fa-camera"></i> ${quality}`;
}

// ============================================================
// 🔥 MANEJAR ZOOM CON PINCH - CORREGIDO
// ============================================================

let initialPinchDistance = 0;
let initialZoom = 1;
let pinchTimeout = null;

function handlePinchZoom(e) {
    if (mediaType || currentStep !== 'camera') return;
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (initialPinchDistance === 0) {
        initialPinchDistance = distance;
        initialZoom = zoomLevel;
        return;
    }
    
    const scale = distance / initialPinchDistance;
    let newZoom = initialZoom * scale;
    newZoom = Math.max(1, Math.min(6, newZoom));
    applyZoom(newZoom);
    
    const zoomIndicator = safeGetElement('zoomIndicator');
    if (zoomIndicator && newZoom > 1.05) {
        zoomIndicator.style.display = 'flex';
        isZoomActive = true;
    }
}

function applyZoom(level) {
    zoomLevel = Math.round(level * 10) / 10;
    
    if (cameraStream && currentStep === 'camera' && !mediaType) {
        const track = cameraStream.getVideoTracks()[0];
        if (track && track.getCapabilities && track.getCapabilities().zoom) {
            const capabilities = track.getCapabilities();
            const maxZoom = capabilities.zoom.max || 6;
            const minZoom = capabilities.zoom.min || 1;
            const zoomValue = Math.min(maxZoom, Math.max(minZoom, zoomLevel));
            try {
                track.applyConstraints({
                    advanced: [{ zoom: zoomValue }]
                });
            } catch (e) {
                console.warn('Zoom no soportado:', e);
            }
        }
    }
    
    const zoomLevelEl = safeGetElement('zoomLevel');
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${zoomLevel.toFixed(1)}x`;
    }
    
    if (zoomTimeout) {
        clearTimeout(zoomTimeout);
        zoomTimeout = null;
    }
    
    if (zoomLevel > 1.05) {
        const zoomIndicator = safeGetElement('zoomIndicator');
        if (zoomIndicator) {
            zoomIndicator.style.display = 'flex';
            isZoomActive = true;
        }
        
        zoomTimeout = setTimeout(() => {
            const indicator = safeGetElement('zoomIndicator');
            if (indicator && zoomLevel <= 1.05) {
                indicator.style.display = 'none';
                isZoomActive = false;
            } else if (indicator) {
                isZoomActive = true;
            }
            zoomTimeout = null;
        }, 2500);
    } else {
        const zoomIndicator = safeGetElement('zoomIndicator');
        if (zoomIndicator) {
            zoomTimeout = setTimeout(() => {
                zoomIndicator.style.display = 'none';
                isZoomActive = false;
                zoomTimeout = null;
            }, 500);
        }
    }
}

function resetZoom() {
    applyZoom(1);
    initialPinchDistance = 0;
    const zoomIndicator = safeGetElement('zoomIndicator');
    if (zoomIndicator) {
        zoomIndicator.style.display = 'none';
        isZoomActive = false;
    }
    if (zoomTimeout) {
        clearTimeout(zoomTimeout);
        zoomTimeout = null;
    }
}

function hideZoomIndicator() {
    const zoomIndicator = safeGetElement('zoomIndicator');
    if (zoomIndicator) {
        zoomIndicator.style.display = 'none';
        isZoomActive = false;
    }
    if (zoomTimeout) {
        clearTimeout(zoomTimeout);
        zoomTimeout = null;
    }
}

// ============================================================
// 🔥 MANEJAR FLASH
// ============================================================

async function toggleFlash() {
    if (!cameraStream || currentStep !== 'camera') {
        showToast(t('story.noCamera') || 'No hay cámara activa', true);
        return;
    }

    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;

    try {
        const capabilities = track.getCapabilities();
        if (!capabilities.torch) {
            showToast(t('story.flashNotSupported') || 'Flash no soportado', true);
            return;
        }

        flashEnabled = !flashEnabled;
        
        await track.applyConstraints({
            advanced: [{ torch: flashEnabled }]
        });

        const flashBtn = safeGetElement('flashBtn');
        if (flashBtn) {
            flashBtn.classList.toggle('active', flashEnabled);
            flashBtn.innerHTML = flashEnabled ? 
                '<i class="fas fa-bolt" style="color:#ffdd00;"></i>' : 
                '<i class="fas fa-bolt"></i>';
        }

        showToast(flashEnabled ? 
            t('story.flashOn') || '🔦 Flash encendido' : 
            t('story.flashOff') || '🔦 Flash apagado'
        );

    } catch (error) {
        console.error('Error toggling flash:', error);
        showToast(t('story.flashError') || 'Error al controlar el flash', true);
    }
}

// ============================================================
// CERRAR ESTADO DE SUBTÍTULOS
// ============================================================

window.closeSubtitlesStatus = function() {
    const status = safeGetElement('subtitlesStatus');
    if (status) {
        status.style.display = 'none';
    }
};

// ============================================================
// CÁMARA - CON CALIDAD MEJORADA
// ============================================================

async function startCamera() {
    try {
        const preview = safeGetElement('creatorPreview');
        if (!preview) return;

        preview.innerHTML = '';

        const video = document.createElement('video');
        video.id = 'cameraVideo';
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        preview.appendChild(video);
        cameraVideo = video;

        const constraints = {
            video: { 
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
                zoom: { ideal: 1 }
            }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 3840 },
                    height: { ideal: 2160 },
                    frameRate: { ideal: 30 }
                }
            });
            cameraStream = stream;
        } catch (highQualityError) {
            console.warn('⚠️ No se pudo obtener alta calidad, usando estándar');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    }
                });
                cameraStream = stream;
            } catch (stdError) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode }
                });
                cameraStream = stream;
            }
        }

        video.srcObject = cameraStream;

        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        const track = cameraStream.getVideoTracks()[0];
        if (track) {
            const capabilities = track.getCapabilities();
            torchSupported = !!capabilities.torch;
            const flashBtn = safeGetElement('flashBtn');
            if (flashBtn) {
                flashBtn.style.display = torchSupported ? 'flex' : 'none';
            }
        }

        if (track) {
            const capabilities = track.getCapabilities();
            if (!capabilities.zoom) {
                const zoomIndicator = safeGetElement('zoomIndicator');
                if (zoomIndicator) zoomIndicator.style.display = 'none';
            }
        }

        document.querySelectorAll('.mode-selector, .bottom-controls, .top-controls').forEach(el => {
            if (el) el.style.display = 'flex';
        });
        
        const flipBtn = safeGetElement('flipCameraBtn');
        if (flipBtn) flipBtn.style.display = 'flex';

        ['inputArea', 'captureActions', 'previewActions', 'textTools', 'subtitlesStatus', 'textEditorContainer'].forEach(id => {
            const el = safeGetElement(id);
            if (el) el.style.display = 'none';
        });

        updateQualityIndicator();
        resetZoom();

    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        showToast(t('story.cameraError') || 'No se pudo acceder a la cámara', true);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    if (audioStreamForRecording) {
        audioStreamForRecording.getTracks().forEach(track => track.stop());
        audioStreamForRecording = null;
    }
    cameraVideo = null;
    flashEnabled = false;
    torchSupported = false;
}

function showCamera() {
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }
    resetZoom();
    startCamera();
}

// ============================================================
// GIRAR CÁMARA
// ============================================================

async function flipCamera() {
    if (!cameraStream || currentStep !== 'camera') {
        showToast(t('story.noCamera') || 'No hay cámara activa', true);
        return;
    }

    facingMode = facingMode === 'user' ? 'environment' : 'user';
    showToast(facingMode === 'user' ? 
        t('story.frontCamera') || '📸 Cámara frontal' : 
        t('story.backCamera') || '📸 Cámara trasera'
    );

    stopCamera();
    await new Promise(resolve => setTimeout(resolve, 300));
    await startCamera();
    resetZoom();
}

// ============================================================
// CAPTURAR FOTO - CON MEJOR CALIDAD
// ============================================================

function capturePhoto() {
    if (!cameraVideo || isRecording || currentStep !== 'camera') return;

    const video = cameraVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    
    if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const preview = safeGetElement('creatorPreview');
    if (preview) {
        const flash = document.createElement('div');
        flash.className = 'flash-effect';
        preview.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    canvas.toBlob((blob) => {
        if (blob) {
            mediaFile = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            mediaType = 'image';
            previewUrl = URL.createObjectURL(blob);

            if (preview) {
                preview.innerHTML = `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:contain;" />`;
                const img = preview.querySelector('img');
                if (img) img.style.transform = 'scaleX(1)';
            }

            hideZoomIndicator();
            showPreviewActions();
            stopCamera();
        }
    }, 'image/jpeg', 0.95);
}

// ============================================================
// GRABAR VIDEO - CON MEJOR CALIDAD
// ============================================================

function startRecording() {
    if (!cameraStream || currentStep !== 'camera') {
        showToast(t('story.waitCamera') || 'Espera a que la cámara se active', true);
        return;
    }

    if (mediaType === 'image') {
        showToast(t('story.switchToVideo') || 'Cambia a modo Video para grabar', true);
        return;
    }

    isRecording = true;
    recordedChunks = [];
    recordingSeconds = 0;

    const indicator = safeGetElement('recordingIndicator');
    if (indicator) {
        indicator.style.display = 'flex';
        indicator.classList.add('active');
    }
    
    const timer = safeGetElement('recordTimer');
    if (timer) timer.textContent = '00:00';
    
    const captureBtn = safeGetElement('captureBtn');
    if (captureBtn) captureBtn.classList.add('recording');
    
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';

    async function startRecordingWithAudio() {
        try {
            const videoTrack = cameraStream.getVideoTracks()[0];
            if (!videoTrack) {
                throw new Error('No hay video track');
            }

            const combinedStream = new MediaStream([videoTrack]);

            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                
                const audioTrack = audioStream.getAudioTracks()[0];
                if (audioTrack) {
                    combinedStream.addTrack(audioTrack);
                    audioStreamForRecording = audioStream;
                }
            } catch (audioError) {
                console.warn('⚠️ Sin audio:', audioError);
            }

            const options = {
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 5000000,
                audioBitsPerSecond: 256000
            };

            try {
                mediaRecorder = new MediaRecorder(combinedStream, options);
            } catch (e) {
                mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
            }

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordedChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                if (audioStreamForRecording) {
                    audioStreamForRecording.getTracks().forEach(track => track.stop());
                    audioStreamForRecording = null;
                }

                if (recordedChunks.length === 0 || recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0) === 0) {
                    showToast(t('story.recordingError') || 'Error: no se grabó nada', true);
                    isRecording = false;
                    if (captureBtn) captureBtn.classList.remove('recording');
                    if (indicator) {
                        indicator.style.display = 'none';
                        indicator.classList.remove('active');
                    }
                    clearInterval(timerInterval);
                    return;
                }

                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
                handleVideoFile(file);
                isRecording = false;
                if (captureBtn) captureBtn.classList.remove('recording');
                if (indicator) {
                    indicator.style.display = 'none';
                    indicator.classList.remove('active');
                }
                clearInterval(timerInterval);
            };

            mediaRecorder.start(1000);
            
            timerInterval = setInterval(() => {
                recordingSeconds++;
                const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
                const secs = String(recordingSeconds % 60).padStart(2, '0');
                const timerEl = safeGetElement('recordTimer');
                if (timerEl) timerEl.textContent = `${mins}:${secs}`;
                
                if (recordingSeconds >= 60) {
                    stopRecording();
                    showToast(t('story.maxRecording') || '⏱️ Límite de 60 segundos alcanzado');
                }
            }, 1000);

        } catch (error) {
            console.error('❌ Error iniciando grabación:', error);
            showToast(t('story.recordingStartError') || 'Error al iniciar la grabación', true);
            isRecording = false;
            if (captureBtn) captureBtn.classList.remove('recording');
            if (indicator) {
                indicator.style.display = 'none';
                indicator.classList.remove('active');
            }
        }
    }

    startRecordingWithAudio();
}

function stopRecording() {
    if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
    }
}

// ============================================================
// MOSTRAR ACCIONES DE PREVIEW
// ============================================================

function showPreviewActions() {
    const captureActions = safeGetElement('captureActions');
    if (captureActions) {
        captureActions.style.display = 'flex';
    }
    
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'none';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';

    const inputArea = safeGetElement('inputArea');
    if (inputArea) {
        inputArea.style.display = 'block';
    }

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
    }

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';
    
    const flashBtn = safeGetElement('flashBtn');
    if (flashBtn) flashBtn.style.display = 'none';
    
    hideZoomIndicator();
}

// ============================================================
// RETOMAR / USAR MEDIA
// ============================================================

window.retakeMedia = function() {
    mediaFile = null;
    mediaType = null;
    previewUrl = null;
    processedVideoData = null;
    currentStep = 'camera';
    zoomLevel = 1;
    
    if (savedTextContent && mediaType === 'text') {
        const textarea = safeGetElement('textContent');
        if (textarea) {
            textarea.value = savedTextContent;
            setTimeout(() => textarea.focus(), 100);
        }
        
        const editor = safeGetElement('textEditorContainer');
        if (editor) editor.style.display = 'flex';
        
        const preview = safeGetElement('creatorPreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.background = '#1a1a2e';
        }
        
        const inputArea = safeGetElement('inputArea');
        if (inputArea) inputArea.style.display = 'none';
        
        const captureActions = safeGetElement('captureActions');
        if (captureActions) captureActions.style.display = 'none';
        
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) publishBtn.disabled = true;
        
        document.querySelectorAll('.mode-selector, .bottom-controls').forEach(el => {
            if (el) el.style.display = 'none';
        });
        
        const topControls = safeGetElement('topControls');
        if (topControls) topControls.style.display = 'flex';
        
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        const textBtn = document.querySelector('.mode-btn[data-mode="text"]');
        if (textBtn) textBtn.classList.add('active');
        
        hideZoomIndicator();
        
        return;
    }
    
    ['captureActions', 'previewActions', 'inputArea', 'subtitlesStatus', 'textEditorContainer'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
    }

    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'flex';
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }
    
    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'flex';
    
    const flashBtn = safeGetElement('flashBtn');
    if (flashBtn) {
        flashBtn.style.display = torchSupported ? 'flex' : 'none';
        flashBtn.classList.remove('active');
        flashBtn.innerHTML = '<i class="fas fa-bolt"></i>';
    }
    
    savedTextContent = '';
    
    resetZoom();
    startCamera();
};

window.useMedia = function() {
    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'none';
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'block';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = false;
    
    const subtitlesStatus = safeGetElement('subtitlesStatus');
    if (subtitlesStatus) subtitlesStatus.style.display = 'none';
    
    hideZoomIndicator();
};

// ============================================================
// TEXTO - CORREGIDO
// ============================================================

window.createTextStory = function() {
    const textarea = safeGetElement('textContent');
    if (textarea && savedTextContent) {
        textarea.value = savedTextContent;
    }
    
    resetCreatorState();
    currentStep = 'text';
    mediaType = 'text';
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#1a1a2e';
    }

    const editor = safeGetElement('textEditorContainer');
    if (editor) {
        editor.style.display = 'flex';
        if (textarea) {
            if (!savedTextContent) textarea.value = '';
            setTimeout(() => textarea.focus(), 100);
        }
    }

    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'none';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
    }
    
    ['captureActions', 'inputArea', 'subtitlesStatus', 'previewActions'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });
    
    stopCamera();

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';
    const flashBtn = safeGetElement('flashBtn');
    if (flashBtn) flashBtn.style.display = 'none';
    
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const textBtn = document.querySelector('.mode-btn[data-mode="text"]');
    if (textBtn) textBtn.classList.add('active');
    
    hideZoomIndicator();
};

// ============================================================
// CONFIRMAR TEXTO - CORREGIDO
// ============================================================

window.confirmText = function() {
    const textarea = safeGetElement('textContent');
    if (!textarea) return;
    
    const text = textarea.value.trim();
    if (!text) {
        showToast(t('story.writeSomething') || 'Escribe algo', true);
        return;
    }
    
    savedTextContent = text;
    
    mediaType = 'text';
    mediaFile = null;
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = `
            <div class="text-preview" style="background:#1a1a2e;color:#fff;font-size:28px;font-weight:500;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center;width:100%;height:100%;">
                ${text}
            </div>
        `;
    }
    
    const editor = safeGetElement('textEditorContainer');
    if (editor) editor.style.display = 'none';
    
    const captureActions = safeGetElement('captureActions');
    if (captureActions) {
        captureActions.style.display = 'flex';
        const retakeBtn = captureActions.querySelector('.btn-retake span');
        if (retakeBtn) {
            retakeBtn.textContent = t('action.edit') || 'Editar';
        }
        const retakeBtnEl = captureActions.querySelector('.btn-retake');
        if (retakeBtnEl) {
            retakeBtnEl.onclick = function() {
                const textareaEl = safeGetElement('textContent');
                if (textareaEl) {
                    textareaEl.value = savedTextContent;
                }
                const editorEl = safeGetElement('textEditorContainer');
                if (editorEl) editorEl.style.display = 'flex';
                const captureActionsEl = safeGetElement('captureActions');
                if (captureActionsEl) captureActionsEl.style.display = 'none';
                const previewEl = safeGetElement('creatorPreview');
                if (previewEl) {
                    previewEl.innerHTML = '';
                    previewEl.style.background = '#1a1a2e';
                }
                const inputAreaEl = safeGetElement('inputArea');
                if (inputAreaEl) inputAreaEl.style.display = 'none';
                const publishBtnEl = safeGetElement('publishBtn');
                if (publishBtnEl) publishBtnEl.disabled = true;
                document.querySelectorAll('.mode-selector, .bottom-controls').forEach(el => {
                    if (el) el.style.display = 'none';
                });
                const topControlsEl = safeGetElement('topControls');
                if (topControlsEl) topControlsEl.style.display = 'flex';
                setTimeout(() => textareaEl?.focus(), 100);
            };
        }
        const useBtn = captureActions.querySelector('.btn-use span');
        if (useBtn) {
            useBtn.textContent = t('action.confirm') || 'Confirmar';
        }
        const useBtnEl = captureActions.querySelector('.btn-use');
        if (useBtnEl) {
            useBtnEl.onclick = function() {
                const captureActionsEl = safeGetElement('captureActions');
                if (captureActionsEl) captureActionsEl.style.display = 'none';
                const inputAreaEl = safeGetElement('inputArea');
                if (inputAreaEl) inputAreaEl.style.display = 'block';
                const publishBtnEl = safeGetElement('publishBtn');
                if (publishBtnEl) publishBtnEl.disabled = false;
                const previewActionsEl = safeGetElement('previewActions');
                if (previewActionsEl) previewActionsEl.style.display = 'none';
            };
        }
    }
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'none';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
    }
    
    hideZoomIndicator();
    
    showToast('✅ ' + (t('story.textReady') || 'Texto listo'));
};

window.backToCamera = function() {
    resetCreatorState();
    currentStep = 'camera';
    savedTextContent = '';
    
    const editor = safeGetElement('textEditorContainer');
    if (editor) editor.style.display = 'none';
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'none';
    
    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'none';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = true;
    
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'flex';
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }
    
    mediaType = null;
    
    resetZoom();
    startCamera();
};

// ============================================================
// GALERÍA
// ============================================================

window.openGallery = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        resetCreatorState();
        
        if (file.type.startsWith('video/')) {
            handleVideoFile(file);
        } else {
            mediaFile = file;
            mediaType = 'image';
            previewUrl = URL.createObjectURL(file);
            const preview = safeGetElement('creatorPreview');
            if (preview) {
                preview.innerHTML = `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:contain;" />`;
            }
            showPreviewActions();
            stopCamera();
            hideZoomIndicator();
            showToast('✅ ' + (t('story.imageSelected') || 'Imagen seleccionada'));
        }
        document.body.removeChild(input);
    };
    input.click();
};

// ============================================================
// MANEJAR VIDEO
// ============================================================

async function handleVideoFile(file) {
    mediaFile = file;
    mediaType = 'video';
    previewUrl = URL.createObjectURL(file);
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = `
            <video src="${previewUrl}" controls autoplay muted 
                   style="width:100%;height:100%;object-fit:contain;"></video>
        `;
    }

    showPreviewActions();
    stopCamera();
    hideZoomIndicator();

    const addSubtitles = confirm('🎬 ¿Agregar subtítulos al video?');
    if (addSubtitles) {
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.innerHTML = `<span>⏳ ${t('story.processing') || 'Procesando...'}</span> <i class="fas fa-spinner fa-spin"></i>`;
        }
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) {
            subtitlesStatus.style.display = 'flex';
            const textEl = safeGetElement('subtitlesText');
            if (textEl) textEl.textContent = t('story.generatingSubtitles') || '⏳ Generando subtítulos...';
        }
        await processVideoWithSubtitles(file);
    } else {
        const inputArea = safeGetElement('inputArea');
        if (inputArea) inputArea.style.display = 'block';
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
        }
        processedVideoData = null;
    }
}

// ============================================================
// PROCESAR VIDEO CON SUBTÍTULOS
// ============================================================

async function processVideoWithSubtitles(file) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión', true);
        return;
    }

    try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('addSubtitles', 'true');

        const response = await fetch(`${API_URL}/api/stories/upload-video`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error procesando video');
        }

        const result = await response.json();
        
        if (result.success) {
            processedVideoData = {
                mediaUrl: result.videoUrl,
                subtitles: result.subtitles,
                hasSubtitles: result.hasSubtitles,
                segments: result.segments
            };

            const publishBtn = safeGetElement('publishBtn');
            if (publishBtn) {
                publishBtn.disabled = false;
                publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
            }
            
            const inputArea = safeGetElement('inputArea');
            if (inputArea) inputArea.style.display = 'block';
            
            const statusEl = safeGetElement('subtitlesStatus');
            const textEl = safeGetElement('subtitlesText');
            if (statusEl) {
                statusEl.style.display = 'flex';
                const icon = statusEl.querySelector('.subtitles-icon i');
                
                if (result.hasSubtitles) {
                    if (textEl) {
                        textEl.textContent = t('story.subtitlesGenerated') || '✅ Subtítulos generados correctamente';
                        textEl.style.color = '#34d399';
                    }
                    if (icon) {
                        icon.style.color = '#34d399';
                    }
                    showToast('✅ ' + (t('story.subtitlesReady') || 'Subtítulos generados'));
                } else {
                    if (textEl) {
                        textEl.textContent = t('story.subtitlesFailed') || '⚠️ No se pudieron generar subtítulos';
                        textEl.style.color = '#fbbf24';
                    }
                    if (icon) {
                        icon.style.color = '#fbbf24';
                    }
                }
            }
            
            if (result.videoUrl) {
                const preview = safeGetElement('creatorPreview');
                if (preview) {
                    preview.innerHTML = `
                        <video src="${result.videoUrl}" controls autoplay muted 
                               style="width:100%;height:100%;object-fit:contain;"></video>
                    `;
                }
                mediaFile = result.videoUrl;
            }
        }

    } catch (error) {
        console.error('❌ Error procesando video:', error);
        showToast(error.message || t('story.videoProcessingError') || 'Error procesando video', true);
        
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
        }
        
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) {
            subtitlesStatus.style.display = 'none';
        }
        
        processedVideoData = null;
    }
}

// ============================================================
// PUBLICAR
// ============================================================

window.publishStory = async function() {
    if (isPublishing) {
        console.log('⏳ Ya se está publicando...');
        return;
    }

    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para publicar', true);
        return;
    }

    const publishBtn = safeGetElement('publishBtn');
    const caption = safeGetElement('creatorCaption');

    isPublishing = true;
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span>⏳ ${t('action.publishing') || 'Publicando...'}</span> <i class="fas fa-spinner fa-spin"></i>`;
    }

    try {
        let mediaUrl = null;
        let hasSubtitles = false;
        let subtitlesText = null;
        let textContent = null;
        let segments = null;

        if (mediaType === 'text') {
            textContent = savedTextContent;
            if (!textContent) {
                const textPreview = document.querySelector('.text-preview');
                if (textPreview) {
                    textContent = textPreview.textContent.trim();
                }
            }
            if (!textContent) {
                const textInput = safeGetElement('textContent');
                textContent = textInput?.value.trim();
            }
            if (!textContent) throw new Error(t('story.writeSomething') || 'Escribe algo');
        } else if (mediaType === 'video') {
            if (processedVideoData?.mediaUrl) {
                mediaUrl = processedVideoData.mediaUrl;
                hasSubtitles = processedVideoData.hasSubtitles || false;
                subtitlesText = processedVideoData.subtitles || null;
                segments = processedVideoData.segments || null;
            } else if (mediaFile) {
                const formData = new FormData();
                formData.append('video', mediaFile);
                formData.append('addSubtitles', 'false');

                const uploadRes = await fetch(`${API_URL}/api/stories/upload-video`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (!uploadRes.ok) {
                    const error = await uploadRes.json();
                    throw new Error(error.error || 'Error al subir el video');
                }

                const uploadData = await uploadRes.json();
                mediaUrl = uploadData.videoUrl;
                hasSubtitles = uploadData.hasSubtitles || false;
                subtitlesText = uploadData.subtitles || null;
                segments = uploadData.segments || null;
            }
        } else if (mediaType === 'image' && mediaFile) {
            const formData = new FormData();
            formData.append('image', mediaFile);

            const uploadRes = await fetch(`${API_URL}/api/stories/upload-image`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!uploadRes.ok) {
                const error = await uploadRes.json();
                throw new Error(error.error || 'Error al subir la imagen');
            }

            const uploadData = await uploadRes.json();
            mediaUrl = uploadData.imageUrl;

            if (uploadData.classification?.is_nsfw && uploadData.classification?.percentage > 80) {
                showToast(t('story.inappropriateContent') || '⚠️ Contenido inapropiado', true);
                isPublishing = false;
                if (publishBtn) {
                    publishBtn.disabled = false;
                    publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
                }
                return;
            }
        }

        if (!mediaUrl && mediaType !== 'text') {
            throw new Error(t('story.noMediaUrl') || 'No se pudo obtener la URL del medio');
        }

        const storyData = {
            mediaType: mediaType,
            mediaUrl: mediaUrl,
            caption: caption?.value?.trim() || '',
            textContent: textContent || null,
            hasSubtitles: hasSubtitles || false,
            subtitles: subtitlesText || null,
            segments: segments || null
        };

        const storyRes = await fetch(`${API_URL}/api/stories`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(storyData)
        });

        if (!storyRes.ok) {
            const error = await storyRes.json();
            throw new Error(error.error || 'Error al publicar');
        }

        const story = await storyRes.json();
        showToast(hasSubtitles ? 
            t('story.publishedWithSubtitles') || '📸 Publicada con subtítulos ✅' : 
            t('story.published') || '📸 Publicada'
        );

        const socket = window.socket;
        if (socket) {
            socket.emit('user_published_story', { storyId: story.id });
        }

        processedVideoData = null;
        isPublishing = false;
        closeCreator();
        
        if (window.refreshFeed) {
            setTimeout(() => window.refreshFeed(), 500);
        }

    } catch (error) {
        console.error('❌ Error publicando:', error);
        showToast(error.message || t('error.general') || 'Error al publicar', true);
        isPublishing = false;
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<span>${t('action.publish') || 'Publicar'}</span> <i class="fas fa-arrow-right"></i>`;
        }
    }
};

// ============================================================
// FUNCIONES GLOBALES
// ============================================================

window.openCreator = openCreator;
window.closeCreator = closeCreator;
window.publishStory = publishStory;
window.retakeMedia = retakeMedia;
window.useMedia = useMedia;
window.backToCamera = backToCamera;
window.flipCamera = flipCamera;
window.createTextStory = createTextStory;
window.confirmText = confirmText;
window.openGallery = openGallery;
window.closeSubtitlesStatus = closeSubtitlesStatus;
window.openSurveyModeFromCreator = openSurveyModeFromCreator;
window.editMedia = function() {
    showToast('✏️ ' + (t('story.editSoon') || 'Editar próximo en actualización'));
};
window.confirmMedia = function() {
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'block';
    const previewActions = safeGetElement('previewActions');
    if (previewActions) previewActions.style.display = 'none';
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = false;
};

// ============================================================
// ESTILOS MEJORADOS - DISEÑO MODERNO CON ANIMACIONES
// ============================================================

function injectStyles() {
    if (document.getElementById('creatorStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'creatorStyles';
    styles.textContent = `
        /* ============================================================
           OVERLAY PRINCIPAL
        ============================================================ */
        .creator-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: #000;
            z-index: 10002;
            display: none;
            flex-direction: column;
            overflow: hidden;
            animation: overlayIn 0.3s ease;
        }
        .creator-overlay.active { display: flex; }

        @keyframes overlayIn {
            from { opacity: 0; transform: scale(1.02); }
            to { opacity: 1; transform: scale(1); }
        }

        /* ============================================================
           CAMERA PLACEHOLDER
        ============================================================ */
        .camera-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: rgba(255,255,255,0.15);
            gap: 12px;
            width: 100%;
            height: 100%;
            animation: pulseGlow 2s ease-in-out infinite;
        }
        .camera-placeholder i { 
            font-size: 48px; 
            opacity: 0.5;
        }
        .camera-placeholder span { 
            font-size: 14px;
            letter-spacing: 0.5px;
        }

        @keyframes pulseGlow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }

        /* ============================================================
           PREVIEW
        ============================================================ */
        .creator-preview {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            position: relative;
            overflow: hidden;
        }
        .creator-preview video,
        .creator-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover !important;
        }
        .creator-preview .text-preview {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
            font-size: 28px;
            font-weight: 500;
            line-height: 1.6;
            word-wrap: break-word;
            overflow-y: auto;
            animation: textReveal 0.5s ease;
        }

        @keyframes textReveal {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        /* ============================================================
           FLASH EFFECT
        ============================================================ */
        .flash-effect {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: white;
            z-index: 10;
            animation: flashEffect 0.3s ease;
        }
        @keyframes flashEffect {
            0% { opacity: 1; }
            100% { opacity: 0; }
        }

        /* ============================================================
           TOP CONTROLS
        ============================================================ */
        .top-controls {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            z-index: 20;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px;
            background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%);
        }
        .top-controls .btn-close {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 50%;
            width: 38px;
            height: 38px;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .top-controls .btn-close:hover {
            background: rgba(255,255,255,0.15);
            transform: scale(1.05);
        }
        .top-controls .btn-close:active { transform: scale(0.9); }

        .top-controls .btn-next {
            background: linear-gradient(135deg, #fff, #f0f0f0);
            border: none;
            border-radius: 50px;
            padding: 10px 24px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: #000;
            box-shadow: 0 4px 20px rgba(255,255,255,0.1);
        }
        .top-controls .btn-next:not(:disabled):hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 30px rgba(255,255,255,0.2);
        }
        .top-controls .btn-next:disabled { 
            opacity: 0.3; 
            cursor: not-allowed;
            transform: none !important;
        }
        .top-controls .btn-next:active:not(:disabled) { transform: scale(0.95); }
        .top-controls .btn-next i { font-size: 12px; }

        .top-controls-center {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .quality-indicator {
            font-size: 11px;
            color: rgba(255,255,255,0.5);
            background: rgba(0,0,0,0.5);
            padding: 5px 14px;
            border-radius: 50px;
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.05);
            letter-spacing: 0.3px;
            font-weight: 500;
        }
        .quality-indicator i {
            margin-right: 4px;
            font-size: 10px;
        }

        /* ============================================================
           MODE SELECTOR
        ============================================================ */
        .mode-selector {
            position: absolute;
            top: 64px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 20;
            display: flex;
            gap: 4px;
            background: rgba(0,0,0,0.7);
            border-radius: 50px;
            padding: 5px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .mode-selector .mode-btn {
            background: none;
            border: none;
            color: rgba(255,255,255,0.4);
            font-size: 12px;
            padding: 7px 18px;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            position: relative;
        }
        .mode-selector .mode-btn i { 
            font-size: 14px; 
            transition: transform 0.3s ease;
        }
        .mode-selector .mode-btn:hover {
            color: rgba(255,255,255,0.7);
        }
        .mode-selector .mode-btn.active {
            background: #fff;
            color: #000;
            box-shadow: 0 4px 15px rgba(255,255,255,0.15);
        }
        .mode-selector .mode-btn.active i {
            transform: scale(1.1);
        }
        .mode-selector .mode-btn:active { transform: scale(0.92); }

        /* ============================================================
           BOTONES FLOTANTES
        ============================================================ */
        .btn-flip-camera {
            position: absolute;
            top: 72px;
            right: 20px;
            z-index: 21;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 50%;
            width: 42px;
            height: 42px;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .btn-flip-camera:hover {
            background: rgba(255,255,255,0.15);
            transform: scale(1.05);
        }
        .btn-flip-camera:active { 
            transform: scale(0.9) rotate(180deg); 
        }

        .btn-flash {
            position: absolute;
            top: 120px;
            right: 20px;
            z-index: 21;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 50%;
            width: 42px;
            height: 42px;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            backdrop-filter: blur(12px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .btn-flash:hover {
            background: rgba(255,255,255,0.15);
            transform: scale(1.05);
        }
        .btn-flash.active {
            background: rgba(255,215,0,0.2);
            border-color: rgba(255,215,0,0.3);
            box-shadow: 0 0 30px rgba(255,215,0,0.1);
        }
        .btn-flash:active { 
            transform: scale(0.9); 
        }

        /* ============================================================
           ZOOM INDICATOR
        ============================================================ */
        .zoom-indicator {
            position: absolute;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 21;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(16px);
            border-radius: 50px;
            padding: 6px 18px;
            border: 1px solid rgba(255,255,255,0.06);
            display: none;
            align-items: center;
            justify-content: center;
            gap: 8px;
            animation: zoomPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 4px 24px rgba(0,0,0,0.4);
            pointer-events: none;
        }
        @keyframes zoomPop {
            from { opacity: 0; transform: translateX(-50%) scale(0.8); }
            to { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        .zoom-indicator .zoom-icon {
            font-size: 12px;
            color: rgba(255,255,255,0.3);
        }
        .zoom-indicator span {
            color: rgba(255,255,255,0.9);
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.3px;
            font-variant-numeric: tabular-nums;
        }

        /* ============================================================
           RECORDING INDICATOR
        ============================================================ */
        .recording-indicator {
            position: absolute;
            top: 68px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 18;
            display: none;
            align-items: center;
            gap: 10px;
            background: rgba(0,0,0,0.8);
            padding: 6px 18px;
            border-radius: 50px;
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,0,0,0.2);
            animation: slideDown 0.3s ease;
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .recording-indicator.active { display: flex; }
        .recording-indicator .recording-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ff0000;
            animation: pulseDot 1s infinite;
            box-shadow: 0 0 20px rgba(255,0,0,0.3);
        }
        .recording-indicator span {
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
        }
        @keyframes pulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(0.8); }
        }

        /* ============================================================
           BOTTOM CONTROLS
        ============================================================ */
        .bottom-controls {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 20;
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 16px 20px 34px;
            background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%);
        }
        .bottom-controls .btn-gallery,
        .bottom-controls .btn-text,
        .bottom-controls .btn-survey {
            background: none;
            border: none;
            color: rgba(255,255,255,0.6);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            padding: 4px 12px;
            position: relative;
        }
        .bottom-controls .btn-gallery i,
        .bottom-controls .btn-text i,
        .bottom-controls .btn-survey i { 
            font-size: 24px;
            transition: transform 0.3s ease;
        }
        .bottom-controls .btn-gallery:hover,
        .bottom-controls .btn-text:hover,
        .bottom-controls .btn-survey:hover {
            color: #fff;
            transform: translateY(-2px);
        }
        .bottom-controls .btn-gallery:hover i,
        .bottom-controls .btn-text:hover i,
        .bottom-controls .btn-survey:hover i {
            transform: scale(1.1);
        }
        .bottom-controls .btn-gallery:active,
        .bottom-controls .btn-text:active,
        .bottom-controls .btn-survey:active { 
            transform: scale(0.9); 
            color: #fff;
        }

        /* ============================================================
           BOTÓN CAPTURA
        ============================================================ */
        .bottom-controls .btn-capture {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            transition: transform 0.2s ease;
        }
        .bottom-controls .btn-capture:active {
            transform: scale(0.92);
        }
        .bottom-controls .btn-capture .capture-outer {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.15);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 0 40px rgba(255,255,255,0.02);
        }
        .bottom-controls .btn-capture .capture-inner {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: #fff;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 20px rgba(255,255,255,0.1);
        }
        .bottom-controls .btn-capture.recording .capture-outer {
            border-color: #ff0000;
            border-width: 3px;
            box-shadow: 0 0 40px rgba(255,0,0,0.15);
        }
        .bottom-controls .btn-capture.recording .capture-inner {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            background: #ff0000;
            box-shadow: 0 0 30px rgba(255,0,0,0.2);
        }

        /* ============================================================
           INPUT AREA
        ============================================================ */
        .input-area {
            position: absolute;
            bottom: 100px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 6px 0;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .input-area .input-wrapper {
            position: relative;
            background: transparent;
        }
        .input-area .input-wrapper i {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(255,255,255,0.3);
            font-size: 14px;
        }
        .input-area .input-wrapper input {
            width: 100%;
            background: transparent;
            border: none;
            padding: 12px 14px;
            padding-left: 40px;
            padding-right: 60px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.3s ease;
        }
        .input-area .input-wrapper input::placeholder {
            color: rgba(255,255,255,0.3);
        }
        .input-area .input-wrapper input:focus {
            color: #fff;
        }
        .input-area .char-counter {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 10px;
            color: rgba(255,255,255,0.2);
            font-weight: 500;
        }

        /* ============================================================
           CAPTURE ACTIONS
        ============================================================ */
        .capture-actions {
            position: absolute;
            bottom: 200px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            justify-content: center;
            gap: 40px;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 14px 20px;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        }
        .capture-actions .btn-retake,
        .capture-actions .btn-use {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            background: none;
            border: none;
            color: #fff;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0.9;
            flex: 1;
            padding: 4px 0;
        }
        .capture-actions .btn-retake:hover,
        .capture-actions .btn-use:hover {
            opacity: 1;
            transform: translateY(-2px);
        }
        .capture-actions .btn-retake i,
        .capture-actions .btn-use i {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.3s ease;
        }
        .capture-actions .btn-retake i {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.05);
        }
        .capture-actions .btn-retake:hover i {
            background: rgba(255,255,255,0.15);
            transform: scale(1.05);
        }
        .capture-actions .btn-use i {
            background: linear-gradient(135deg, #fff, #f0f0f0);
            color: #000;
            box-shadow: 0 4px 20px rgba(255,255,255,0.1);
        }
        .capture-actions .btn-use:hover i {
            transform: scale(1.05);
            box-shadow: 0 6px 30px rgba(255,255,255,0.2);
        }
        .capture-actions .btn-retake:active,
        .capture-actions .btn-use:active {
            transform: scale(0.92);
            opacity: 1;
        }

        /* ============================================================
           PREVIEW ACTIONS
        ============================================================ */
        .preview-actions {
            position: absolute;
            bottom: 200px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            justify-content: center;
            gap: 16px;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(20px);
            border-radius: 16px;
            padding: 14px 20px;
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        }
        .preview-actions .btn-edit,
        .preview-actions .btn-next-preview {
            padding: 10px 20px;
            border: none;
            border-radius: 50px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: center;
        }
        .preview-actions .btn-edit {
            background: rgba(255,255,255,0.08);
            color: #fff;
            border: 1px solid rgba(255,255,255,0.06);
        }
        .preview-actions .btn-edit:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-2px);
        }
        .preview-actions .btn-next-preview {
            background: linear-gradient(135deg, #fff, #f0f0f0);
            color: #000;
            box-shadow: 0 4px 20px rgba(255,255,255,0.1);
        }
        .preview-actions .btn-next-preview:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 30px rgba(255,255,255,0.2);
        }
        .preview-actions .btn-edit:active,
        .preview-actions .btn-next-preview:active {
            transform: scale(0.95);
        }

        /* ============================================================
           SUBTITLES STATUS
        ============================================================ */
        .subtitles-status {
            position: absolute;
            bottom: 270px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            align-items: center;
            gap: 12px;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(20px);
            border-radius: 14px;
            padding: 12px 16px;
            border: 1px solid rgba(255,255,255,0.06);
            animation: slideUp 0.4s ease;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .subtitles-status .subtitles-icon {
            flex-shrink: 0;
        }
        .subtitles-status .subtitles-icon i {
            color: #34d399;
            font-size: 18px;
            animation: spinGlow 2s ease-in-out infinite;
        }
        @keyframes spinGlow {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(0.9); }
        }
        .subtitles-status .subtitles-text {
            flex: 1;
            min-width: 0;
        }
        .subtitles-status .subtitles-text span {
            color: rgba(255,255,255,0.85);
            font-size: 13px;
            font-weight: 500;
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .subtitles-status .subtitles-close {
            background: none;
            border: none;
            color: rgba(255,255,255,0.2);
            cursor: pointer;
            font-size: 14px;
            padding: 4px;
            flex-shrink: 0;
            transition: all 0.3s ease;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .subtitles-status .subtitles-close:hover {
            color: rgba(255,255,255,0.6);
            background: rgba(255,255,255,0.05);
        }
        .subtitles-status .subtitles-close:active {
            transform: scale(0.9);
        }

        /* ============================================================
           TEXT EDITOR
        ============================================================ */
        .text-editor-container {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 15;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 30px 100px;
            background: #1a1a2e;
            animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .text-editor-container textarea {
            width: 100%;
            max-width: 500px;
            height: 60%;
            background: transparent;
            border: none;
            color: #fff;
            font-size: 28px;
            resize: none;
            outline: none;
            text-align: center;
            padding: 20px;
            font-weight: 500;
            font-family: inherit;
            line-height: 1.6;
            transition: background 0.3s ease;
        }
        .text-editor-container textarea::placeholder {
            color: rgba(255,255,255,0.15);
        }
        .text-editor-tools {
            position: absolute;
            bottom: 60px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            padding: 0 20px;
            gap: 12px;
            max-width: 500px;
            margin: 0 auto;
        }
        .text-editor-tools .btn-back-camera,
        .text-editor-tools .btn-confirm-text {
            padding: 12px 28px;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: center;
        }
        .text-editor-tools .btn-back-camera {
            background: rgba(255,255,255,0.08);
            color: #fff;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.06);
        }
        .text-editor-tools .btn-back-camera:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-2px);
        }
        .text-editor-tools .btn-confirm-text {
            background: linear-gradient(135deg, #fff, #f0f0f0);
            color: #000;
            box-shadow: 0 4px 20px rgba(255,255,255,0.1);
        }
        .text-editor-tools .btn-confirm-text:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 30px rgba(255,255,255,0.2);
        }
        .text-editor-tools .btn-back-camera:active,
        .text-editor-tools .btn-confirm-text:active {
            transform: scale(0.95);
        }

        /* ============================================================
           RESPONSIVE - MÓVIL
        ============================================================ */
        @media (max-width: 480px) {
            .bottom-controls { padding: 12px 16px 28px; }
            .bottom-controls .btn-capture .capture-outer { width: 64px; height: 64px; }
            .bottom-controls .btn-capture .capture-inner { width: 48px; height: 48px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 24px; height: 24px; }
            
            .top-controls { padding: 10px 16px; }
            .top-controls .btn-close { width: 34px; height: 34px; font-size: 14px; }
            .top-controls .btn-next { font-size: 12px; padding: 8px 18px; }
            
            .mode-selector { top: 58px; padding: 4px; }
            .mode-selector .mode-btn { font-size: 11px; padding: 6px 14px; }
            .mode-selector .mode-btn i { font-size: 12px; }
            
            .btn-flip-camera { top: 66px; right: 12px; width: 36px; height: 36px; font-size: 14px; }
            .btn-flash { top: 110px; right: 12px; width: 36px; height: 36px; font-size: 14px; }
            .zoom-indicator { bottom: 100px; padding: 4px 14px; }
            .zoom-indicator span { font-size: 12px; }
            
            .input-area { bottom: 90px; left: 16px; right: 16px; padding: 4px 0; }
            .input-area .input-wrapper input { font-size: 13px; padding: 10px 12px; padding-left: 36px; padding-right: 50px; }
            
            .capture-actions { bottom: 180px; left: 16px; right: 16px; padding: 12px 16px; gap: 20px; }
            .capture-actions .btn-retake i,
            .capture-actions .btn-use i { width: 40px; height: 40px; font-size: 16px; }
            
            .preview-actions { bottom: 180px; left: 16px; right: 16px; padding: 12px 16px; gap: 12px; }
            .preview-actions .btn-edit,
            .preview-actions .btn-next-preview { font-size: 12px; padding: 8px 16px; }
            
            .subtitles-status { bottom: 250px; left: 16px; right: 16px; padding: 10px 14px; gap: 10px; }
            .subtitles-status .subtitles-text span { font-size: 12px; }
            
            .text-editor-container textarea { font-size: 20px; padding: 10px; }
            .text-editor-tools { bottom: 40px; padding: 0 16px; }
            .text-editor-tools .btn-back-camera,
            .text-editor-tools .btn-confirm-text { font-size: 12px; padding: 10px 18px; }
            
            .recording-indicator { top: 62px; padding: 4px 14px; }
            .recording-indicator span { font-size: 12px; }
            
            .creator-preview .text-preview { font-size: 22px; padding: 30px; }
        }

        /* ============================================================
           RESPONSIVE - PANTALLA BAJA
        ============================================================ */
        @media (max-height: 600px) {
            .top-controls { padding: 8px 16px; }
            .bottom-controls { padding: 10px 16px 20px; }
            .bottom-controls .btn-capture .capture-outer { width: 56px; height: 56px; }
            .bottom-controls .btn-capture .capture-inner { width: 40px; height: 40px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 20px; height: 20px; }
            
            .mode-selector { top: 52px; }
            .mode-selector .mode-btn { font-size: 10px; padding: 5px 12px; }
            .mode-selector .mode-btn i { font-size: 11px; }
            
            .btn-flip-camera { top: 60px; right: 10px; width: 32px; height: 32px; font-size: 12px; }
            .btn-flash { top: 100px; right: 10px; width: 32px; height: 32px; font-size: 12px; }
            .zoom-indicator { bottom: 80px; padding: 4px 12px; }
            .zoom-indicator span { font-size: 11px; }
            
            .input-area { bottom: 80px; padding: 4px 0; }
            
            .capture-actions { bottom: 160px; padding: 10px 16px; }
            
            .preview-actions { bottom: 160px; padding: 10px 16px; }
            
            .subtitles-status { bottom: 220px; padding: 8px 12px; }
            .subtitles-status .subtitles-text span { font-size: 11px; }
            
            .text-editor-container textarea { font-size: 18px; height: 50%; }
            .text-editor-tools { bottom: 30px; }
            .recording-indicator { top: 56px; }
            .creator-preview .text-preview { font-size: 18px; padding: 20px; }
        }

        /* ============================================================
           DESKTOP
        ============================================================ */
        @media (min-width: 768px) {
            .creator-overlay {
                max-width: 480px;
                margin: 0 auto;
                border-radius: 0;
            }
            .mode-selector .mode-btn { padding: 8px 22px; }
            .text-editor-container textarea { font-size: 32px; }
        }
    `;
    document.head.appendChild(styles);
}

injectStyles();