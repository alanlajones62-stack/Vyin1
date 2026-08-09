// ============================================================
// story-creator-modal.js - VERSIÓN REDISEÑADA COMPLETA
// (INTERFAZ LIMPIA, MODERNA Y RESPONSIVE)
// ============================================================

import { getToken, getCurrentUser, showToast } from './auth.js';

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
let selectedTextBg = '#1a1a2e';
let captureMode = 'video';
let isPublishing = false;
let currentStep = 'camera'; // 'camera', 'preview', 'text'

// ============================================================
// PALETA DE COLORES PARA TEXTO
// ============================================================

const COLOR_PALETTE = [
    '#1a1a2e', '#2d1b4e', '#4a1942', '#1a3a4a', 
    '#0a0a0a', '#2d2d2d', '#1a2a3a', '#3d1a3a',
    '#1a3a2a', '#3a2a1a', '#4a2a4a', '#2a1a3a',
    '#1a2a2a', '#3a1a2a', '#2a3a1a', '#1a1a3a',
    '#4a1a1a', '#1a4a3a'
];

// ============================================================
// FUNCIÓN SEGURA PARA OBTENER ELEMENTOS
// ============================================================

function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`⚠️ Elemento no encontrado: #${id}`);
    return el;
}

// ============================================================
// ABRIR / CERRAR
// ============================================================

export async function openCreator() {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para publicar', true);
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

    const overlay = safeGetElement('creatorOverlay');
    if (!overlay) createCreatorHTML();

    const overlayEl = safeGetElement('creatorOverlay');
    if (overlayEl) overlayEl.classList.add('active');
    
    document.body.style.overflow = 'hidden';
    resetCreatorState();
    await startCamera();
}

export function closeCreator() {
    isCreatorOpen = false;
    isPublishing = false;
    currentStep = 'camera';
    resetCreatorState();

    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    if (timerInterval) clearInterval(timerInterval);

    const overlay = safeGetElement('creatorOverlay');
    if (overlay) overlay.classList.remove('active');
    
    document.body.style.overflow = '';
    stopCamera();
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

    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }

    // Ocultar todos los paneles
    ['inputArea', 'captureActions', 'textTools', 'subtitlesStatus', 'previewActions'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });

    // Mostrar controles de cámara
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'flex';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publicar';
    }

    const caption = safeGetElement('creatorCaption');
    if (caption) caption.value = '';
}

// ============================================================
// CREAR HTML - DISEÑO MODERNO
// ============================================================

function createCreatorHTML() {
    if (safeGetElement('creatorOverlay')) return;

    const html = `
        <div id="creatorOverlay" class="creator-overlay">
            
            <!-- ========== PREVIEW ========== -->
            <div class="creator-preview" id="creatorPreview">
                <div class="camera-placeholder">
                    <i class="fas fa-camera"></i>
                    <span>Iniciando cámara...</span>
                </div>
            </div>

            <!-- ========== TOP CONTROLS ========== -->
            <div class="top-controls" id="topControls">
                <button class="btn-close" onclick="window.closeCreator()">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button class="btn-next" id="publishBtn" disabled onclick="window.publishStory()">
                    <span>Publicar</span>
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>

            <!-- ========== MODE SELECTOR ========== -->
            <div class="mode-selector" id="modeSelector">
                <button class="mode-btn active" data-mode="video">
                    <i class="fas fa-video"></i>
                </button>
                <button class="mode-btn" data-mode="photo">
                    <i class="fas fa-camera"></i>
                </button>
                <button class="mode-btn flip-btn" id="flipCameraBtn">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>

            <!-- ========== RECORDING INDICATOR ========== -->
            <div class="recording-indicator" id="recordingIndicator">
                <div class="recording-dot"></div>
                <span id="recordTimer">00:00</span>
            </div>

            <!-- ========== CAPTURE ACTIONS (PREVIEW) ========== -->
            <div class="capture-actions" id="captureActions">
                <button class="btn-retake" onclick="window.retakeMedia()">
                    <i class="fas fa-undo"></i>
                    <span>Rehacer</span>
                </button>
                <button class="btn-use" onclick="window.useMedia()">
                    <i class="fas fa-check"></i>
                    <span>Usar</span>
                </button>
            </div>

            <!-- ========== PREVIEW ACTIONS ========== -->
            <div class="preview-actions" id="previewActions">
                <button class="btn-edit" onclick="window.editMedia()">
                    <i class="fas fa-pen"></i>
                    <span>Editar</span>
                </button>
                <button class="btn-next-preview" onclick="window.confirmMedia()">
                    <i class="fas fa-check"></i>
                    <span>Confirmar</span>
                </button>
            </div>

            <!-- ========== SUBTITLES STATUS ========== -->
            <div class="subtitles-status" id="subtitlesStatus">
                <i class="fas fa-closed-captioning"></i>
                <span id="subtitlesText">Generando subtítulos...</span>
            </div>

            <!-- ========== TEXT TOOLS ========== -->
            <div class="text-tools" id="textTools">
                <div class="text-tools-scroll">
                    ${COLOR_PALETTE.map(color => `
                        <button class="btn-bg ${color === selectedTextBg ? 'active' : ''}" 
                                data-color="${color}" style="background:${color};"></button>
                    `).join('')}
                </div>
            </div>

            <!-- ========== TEXT EDITOR ========== -->
            <div class="text-editor-container" id="textEditorContainer">
                <textarea id="textContent" placeholder="Escribe algo..." maxlength="1000"></textarea>
                <div class="text-editor-tools">
                    <button class="btn-back-camera" onclick="window.backToCamera()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <button class="btn-confirm-text" onclick="window.confirmText()">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            </div>

            <!-- ========== INPUT AREA ========== -->
            <div class="input-area" id="inputArea">
                <div class="input-wrapper">
                    <i class="fas fa-pencil-alt"></i>
                    <input type="text" id="creatorCaption" placeholder="Añade un título..." maxlength="220" />
                    <span class="char-counter" id="charCounter">0/220</span>
                </div>
            </div>

            <!-- ========== BOTTOM CONTROLS ========== -->
            <div class="bottom-controls" id="bottomControls">
                <button class="btn-gallery" onclick="window.openGallery()">
                    <i class="fas fa-image"></i>
                    <span>Galería</span>
                </button>

                <button class="btn-capture" id="captureBtn">
                    <div class="capture-outer">
                        <div class="capture-inner"></div>
                    </div>
                </button>

                <button class="btn-text" onclick="window.createTextStory()">
                    <i class="fas fa-font"></i>
                    <span>Texto</span>
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
                showToast('Ya tienes un medio capturado', true);
                return;
            }
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            captureMode = btn.dataset.mode;
            if (isRecording) stopRecording();
        });
    });

    const flipBtn = safeGetElement('flipCameraBtn');
    flipBtn?.addEventListener('click', () => {
        if (cameraStream && !mediaType) {
            flipCamera();
        } else {
            showToast('No hay cámara activa', true);
        }
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

    document.querySelectorAll('.btn-bg').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-bg').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTextBg = btn.dataset.color;
            const preview = safeGetElement('creatorPreview');
            if (preview) preview.style.background = selectedTextBg;
            const textarea = safeGetElement('textContent');
            if (textarea) textarea.style.background = selectedTextBg;
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isCreatorOpen) closeCreator();
    });
}

// ============================================================
// CÁMARA
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
        video.style.transform = 'scaleX(-1)';
        preview.appendChild(video);
        cameraVideo = video;

        const constraints = {
            video: { 
                facingMode: facingMode,
                width: { ideal: 1080 },
                height: { ideal: 1920 }
            },
            audio: true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream = stream;
        video.srcObject = stream;

        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        // Mostrar controles
        document.querySelectorAll('.mode-selector, .bottom-controls, .top-controls').forEach(el => {
            if (el) el.style.display = 'flex';
        });
        
        const flipBtn = safeGetElement('flipCameraBtn');
        if (flipBtn) flipBtn.style.display = 'flex';

        // Ocultar otros paneles
        ['inputArea', 'captureActions', 'previewActions', 'textTools', 'subtitlesStatus', 'textEditorContainer'].forEach(id => {
            const el = safeGetElement(id);
            if (el) el.style.display = 'none';
        });

    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        showToast('No se pudo acceder a la cámara', true);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    cameraVideo = null;
}

// ============================================================
// GIRAR CÁMARA
// ============================================================

async function flipCamera() {
    if (!cameraStream) {
        showToast('No hay cámara activa', true);
        return;
    }

    facingMode = facingMode === 'user' ? 'environment' : 'user';
    showToast(facingMode === 'user' ? '📸 Cámara frontal' : '📸 Cámara trasera');

    stopCamera();
    await startCamera();
}

// ============================================================
// CAPTURAR FOTO
// ============================================================

function capturePhoto() {
    if (!cameraVideo || isRecording) return;

    const video = cameraVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
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
                preview.innerHTML = `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
                const img = preview.querySelector('img');
                if (img) img.style.transform = 'scaleX(1)';
            }

            // Cambiar a modo preview
            showPreviewActions();
            stopCamera();
        }
    }, 'image/jpeg', 0.9);
}

// ============================================================
// GRABAR VIDEO
// ============================================================

function startRecording() {
    if (!cameraStream) {
        showToast('Espera a que la cámara se active', true);
        return;
    }

    if (mediaType === 'image') {
        showToast('Cambia a modo Video para grabar', true);
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

    mediaRecorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm' });
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
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

    mediaRecorder.start();
    
    timerInterval = setInterval(() => {
        recordingSeconds++;
        const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const secs = String(recordingSeconds % 60).padStart(2, '0');
        const timerEl = safeGetElement('recordTimer');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopRecording() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

// ============================================================
// MOSTRAR ACCIONES DE PREVIEW
// ============================================================

function showPreviewActions() {
    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'flex';
    
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'none';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publicar';
    }

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';
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
    
    ['captureActions', 'previewActions', 'inputArea', 'subtitlesStatus', 'textTools', 'textEditorContainer'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publicar';
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
};

// ============================================================
// TEXTO
// ============================================================

window.createTextStory = function() {
    resetCreatorState();
    currentStep = 'text';
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = selectedTextBg;
    }

    // Mostrar editor de texto
    const editor = safeGetElement('textEditorContainer');
    if (editor) {
        editor.style.display = 'flex';
        const textarea = safeGetElement('textContent');
        if (textarea) {
            textarea.value = '';
            textarea.style.background = selectedTextBg;
            setTimeout(() => textarea.focus(), 100);
        }
    }

    // Ocultar controles de cámara
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'none';
    
    const topControls = safeGetElement('topControls');
    if (topControls) topControls.style.display = 'flex';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publicar';
    }

    // Mostrar herramientas de texto
    const textTools = safeGetElement('textTools');
    if (textTools) textTools.style.display = 'flex';
    
    // Ocultar otros paneles
    ['captureActions', 'inputArea', 'subtitlesStatus', 'previewActions'].forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });
    
    mediaType = 'text';
    stopCamera();

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';
};

window.confirmText = function() {
    const textarea = safeGetElement('textContent');
    if (!textarea) return;
    
    const text = textarea.value.trim();
    if (!text) {
        showToast('Escribe algo', true);
        return;
    }
    
    mediaType = 'text';
    mediaFile = null;
    
    // Mostrar preview del texto
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = `
            <div class="text-preview" style="background:${selectedTextBg};color:#fff;font-size:28px;font-weight:500;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center;width:100%;height:100%;">
                ${text}
            </div>
        `;
    }
    
    // Ocultar editor y mostrar input
    const editor = safeGetElement('textEditorContainer');
    if (editor) editor.style.display = 'none';
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'block';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = false;
    
    const textTools = safeGetElement('textTools');
    if (textTools) textTools.style.display = 'none';
    
    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'flex';
    
    showToast('✅ Texto listo');
};

window.backToCamera = function() {
    resetCreatorState();
    currentStep = 'camera';
    
    const editor = safeGetElement('textEditorContainer');
    if (editor) editor.style.display = 'none';
    
    const textTools = safeGetElement('textTools');
    if (textTools) textTools.style.display = 'none';
    
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
                preview.innerHTML = `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
            }
            showPreviewActions();
            stopCamera();
            showToast('✅ Imagen seleccionada');
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
                   style="width:100%;height:100%;object-fit:cover;"></video>
        `;
    }

    showPreviewActions();
    stopCamera();

    const addSubtitles = confirm('🎬 ¿Agregar subtítulos al video?');
    if (addSubtitles) {
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.textContent = '⏳ Procesando...';
        }
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) subtitlesStatus.style.display = 'flex';
        await processVideoWithSubtitles(file);
    } else {
        const inputArea = safeGetElement('inputArea');
        if (inputArea) inputArea.style.display = 'block';
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) publishBtn.disabled = false;
        processedVideoData = null;
    }
}

// ============================================================
// PROCESAR VIDEO CON SUBTÍTULOS
// ============================================================

async function processVideoWithSubtitles(file) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión', true);
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
                publishBtn.textContent = 'Publicar';
            }
            
            const inputArea = safeGetElement('inputArea');
            if (inputArea) inputArea.style.display = 'block';
            
            const statusEl = safeGetElement('subtitlesStatus');
            const textEl = safeGetElement('subtitlesText');
            if (statusEl) statusEl.style.display = 'flex';
            
            if (result.hasSubtitles) {
                if (textEl) textEl.innerHTML = '✅ Subtítulos generados';
                showToast('✅ Subtítulos generados');
            } else {
                if (textEl) textEl.textContent = '⚠️ No se generaron subtítulos';
            }
            
            if (result.videoUrl) {
                const preview = safeGetElement('creatorPreview');
                if (preview) {
                    preview.innerHTML = `
                        <video src="${result.videoUrl}" controls autoplay muted 
                               style="width:100%;height:100%;object-fit:cover;"></video>
                    `;
                }
                mediaFile = result.videoUrl;
            }
        }

    } catch (error) {
        console.error('❌ Error procesando video:', error);
        showToast(error.message || 'Error procesando video', true);
        
        const publishBtn = safeGetElement('publishBtn');
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publicar';
        }
        
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) subtitlesStatus.style.display = 'none';
        
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
        showToast('Inicia sesión para publicar', true);
        return;
    }

    const publishBtn = safeGetElement('publishBtn');
    const caption = safeGetElement('creatorCaption');

    isPublishing = true;
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = '⏳ Publicando...';
    }

    try {
        let mediaUrl = null;
        let hasSubtitles = false;
        let subtitlesText = null;
        let textContent = null;
        let segments = null;

        if (mediaType === 'text') {
            const textPreview = document.querySelector('.text-preview');
            if (textPreview) {
                textContent = textPreview.textContent.trim();
            } else {
                const textInput = safeGetElement('textContent');
                textContent = textInput?.value.trim();
            }
            if (!textContent) throw new Error('Escribe algo');
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
                showToast('⚠️ Contenido inapropiado', true);
                isPublishing = false;
                if (publishBtn) {
                    publishBtn.disabled = false;
                    publishBtn.textContent = 'Publicar';
                }
                return;
            }
        }

        if (!mediaUrl && mediaType !== 'text') {
            throw new Error('No se pudo obtener la URL del medio');
        }

        const storyData = {
            mediaType: mediaType,
            mediaUrl: mediaUrl,
            caption: caption?.value?.trim() || '',
            textContent: textContent || null,
            textBgColor: selectedTextBg || '#1a1a2e',
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
        showToast(hasSubtitles ? '📸 Publicada con subtítulos ✅' : '📸 Publicada');

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
        showToast(error.message || 'Error al publicar', true);
        isPublishing = false;
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publicar';
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
window.editMedia = function() {
    showToast('✏️ Editar próximo en actualización');
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
// INYECTAR ESTILOS MODERNOS
// ============================================================

function injectStyles() {
    if (document.getElementById('creatorStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'creatorStyles';
    styles.textContent = `
        /* ============================================================
           OVERLAY
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
        }
        .creator-overlay.active { display: flex; }
        
        .camera-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: rgba(255,255,255,0.2);
            gap: 12px;
            width: 100%;
            height: 100%;
        }
        .camera-placeholder i { font-size: 40px; }
        .camera-placeholder span { font-size: 14px; }

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
            object-fit: cover;
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
        }

        /* ============================================================
           FLASH
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
            padding: 12px 20px;
            background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
        }
        .top-controls .btn-close {
            background: rgba(255,255,255,0.08);
            border: none;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            backdrop-filter: blur(10px);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .top-controls .btn-close:active { transform: scale(0.9); }
        .top-controls .btn-next {
            background: #fff;
            border: none;
            border-radius: 50px;
            padding: 8px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
            color: #000;
        }
        .top-controls .btn-next:disabled { opacity: 0.3; cursor: not-allowed; }
        .top-controls .btn-next:active:not(:disabled) { transform: scale(0.95); }
        .top-controls .btn-next i { font-size: 12px; }

        /* ============================================================
           MODE SELECTOR
        ============================================================ */
        .mode-selector {
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 20;
            display: flex;
            gap: 4px;
            background: rgba(255,255,255,0.08);
            border-radius: 50px;
            padding: 4px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.05);
        }
        .mode-selector .mode-btn {
            background: none;
            border: none;
            color: rgba(255,255,255,0.4);
            font-size: 14px;
            padding: 8px 16px;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .mode-selector .mode-btn i { font-size: 16px; }
        .mode-selector .mode-btn.active {
            background: #fff;
            color: #000;
        }
        .mode-selector .mode-btn:active { transform: scale(0.95); }
        .mode-selector .flip-btn {
            border-left: 1px solid rgba(255,255,255,0.08);
        }

        /* ============================================================
           RECORDING INDICATOR
        ============================================================ */
        .recording-indicator {
            position: absolute;
            top: 64px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 18;
            display: none;
            align-items: center;
            gap: 10px;
            background: rgba(0,0,0,0.5);
            padding: 6px 16px;
            border-radius: 50px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,0,0,0.2);
        }
        .recording-indicator.active { display: flex; }
        .recording-indicator .recording-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ff0000;
            animation: pulseDot 1s infinite;
        }
        .recording-indicator span {
            color: #fff;
            font-size: 14px;
            font-weight: 500;
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
            background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%);
        }
        .bottom-controls .btn-gallery,
        .bottom-controls .btn-text {
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            opacity: 0.6;
            transition: all 0.2s;
        }
        .bottom-controls .btn-gallery i,
        .bottom-controls .btn-text i { font-size: 24px; }
        .bottom-controls .btn-gallery:active,
        .bottom-controls .btn-text:active { transform: scale(0.9); opacity: 1; }

        .bottom-controls .btn-capture {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
        }
        .bottom-controls .btn-capture .capture-outer {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.15);
            transition: all 0.3s;
        }
        .bottom-controls .btn-capture .capture-inner {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: #fff;
            transition: all 0.3s;
        }
        .bottom-controls .btn-capture:active .capture-outer { transform: scale(0.92); }
        .bottom-controls .btn-capture.recording .capture-outer {
            border-color: #ff0000;
            border-width: 3px;
        }
        .bottom-controls .btn-capture.recording .capture-inner {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            background: #ff0000;
        }

        /* ============================================================
           CAPTURE ACTIONS
        ============================================================ */
        .capture-actions {
            position: absolute;
            bottom: 140px;
            left: 0;
            right: 0;
            z-index: 14;
            display: none;
            justify-content: center;
            gap: 50px;
            padding: 0 20px;
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
            transition: all 0.2s;
            opacity: 0.7;
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
        }
        .capture-actions .btn-retake i {
            background: rgba(255,255,255,0.08);
            backdrop-filter: blur(10px);
        }
        .capture-actions .btn-use i {
            background: #fff;
            color: #000;
        }
        .capture-actions .btn-retake:active,
        .capture-actions .btn-use:active {
            transform: scale(0.9);
            opacity: 1;
        }

        /* ============================================================
           PREVIEW ACTIONS
        ============================================================ */
        .preview-actions {
            position: absolute;
            bottom: 140px;
            left: 0;
            right: 0;
            z-index: 14;
            display: none;
            justify-content: center;
            gap: 20px;
            padding: 0 20px;
        }
        .preview-actions .btn-edit,
        .preview-actions .btn-next-preview {
            padding: 10px 24px;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .preview-actions .btn-edit {
            background: rgba(255,255,255,0.08);
            color: #fff;
            backdrop-filter: blur(10px);
        }
        .preview-actions .btn-next-preview {
            background: #fff;
            color: #000;
        }
        .preview-actions .btn-edit:active,
        .preview-actions .btn-next-preview:active {
            transform: scale(0.95);
        }

        /* ============================================================
           INPUT AREA
        ============================================================ */
        .input-area {
            position: absolute;
            bottom: 100px;
            left: 0;
            right: 0;
            z-index: 14;
            padding: 0 20px;
            display: none;
        }
        .input-area .input-wrapper {
            position: relative;
            background: rgba(255,255,255,0.06);
            border-radius: 12px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.05);
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
        }
        .input-area .input-wrapper input::placeholder {
            color: rgba(255,255,255,0.3);
        }
        .input-area .char-counter {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 10px;
            color: rgba(255,255,255,0.2);
        }

        /* ============================================================
           SUBTITLES STATUS
        ============================================================ */
        .subtitles-status {
            position: absolute;
            bottom: 180px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            align-items: center;
            gap: 10px;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            padding: 10px 16px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .subtitles-status i { color: #34d399; font-size: 14px; }
        .subtitles-status #subtitlesText {
            flex: 1;
            color: rgba(255,255,255,0.8);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ============================================================
           TEXT TOOLS
        ============================================================ */
        .text-tools {
            position: absolute;
            bottom: 140px;
            left: 0;
            right: 0;
            z-index: 14;
            display: none;
            padding: 12px 20px;
            background: linear-gradient(0deg, rgba(0,0,0,0.5) 0%, transparent 100%);
        }
        .text-tools-scroll {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding: 4px 0;
            -webkit-overflow-scrolling: touch;
            justify-content: center;
            flex-wrap: wrap;
        }
        .text-tools-scroll::-webkit-scrollbar { display: none; }
        .text-tools .btn-bg {
            min-width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.05);
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .text-tools .btn-bg:active { transform: scale(0.85); }
        .text-tools .btn-bg.active {
            border-color: #fff;
            transform: scale(1.15);
            box-shadow: 0 0 20px rgba(255,255,255,0.2);
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
        }
        .text-editor-container textarea::placeholder {
            color: rgba(255,255,255,0.2);
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
            padding: 10px 24px;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .text-editor-tools .btn-back-camera {
            background: rgba(255,255,255,0.08);
            color: #fff;
            backdrop-filter: blur(10px);
        }
        .text-editor-tools .btn-confirm-text {
            background: #fff;
            color: #000;
        }
        .text-editor-tools .btn-back-camera:active,
        .text-editor-tools .btn-confirm-text:active {
            transform: scale(0.95);
        }

        /* ============================================================
           RESPONSIVE
        ============================================================ */
        @media (max-width: 480px) {
            .bottom-controls { padding: 12px 16px 28px; }
            .bottom-controls .btn-capture .capture-outer { width: 64px; height: 64px; }
            .bottom-controls .btn-capture .capture-inner { width: 48px; height: 48px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 24px; height: 24px; }
            .top-controls { padding: 10px 16px; }
            .top-controls .btn-close { width: 32px; height: 32px; font-size: 14px; }
            .top-controls .btn-next { font-size: 12px; padding: 6px 16px; }
            .mode-selector { top: 54px; padding: 3px; }
            .mode-selector .mode-btn { font-size: 12px; padding: 6px 12px; }
            .mode-selector .mode-btn i { font-size: 14px; }
            .capture-actions { bottom: 130px; gap: 30px; }
            .capture-actions .btn-retake i,
            .capture-actions .btn-use i { width: 40px; height: 40px; font-size: 15px; }
            .preview-actions { bottom: 130px; gap: 12px; }
            .preview-actions .btn-edit,
            .preview-actions .btn-next-preview { font-size: 12px; padding: 8px 16px; }
            .input-area { bottom: 100px; padding: 0 16px; }
            .input-area .input-wrapper input { font-size: 13px; padding: 10px 12px; padding-left: 36px; padding-right: 50px; }
            .text-tools { bottom: 120px; padding: 8px 12px; }
            .text-tools .btn-bg { min-width: 30px; height: 30px; }
            .text-editor-container textarea { font-size: 20px; padding: 10px; }
            .text-editor-tools { bottom: 40px; padding: 0 16px; }
            .text-editor-tools .btn-back-camera,
            .text-editor-tools .btn-confirm-text { font-size: 12px; padding: 8px 16px; }
            .subtitles-status { bottom: 160px; left: 16px; right: 16px; padding: 8px 12px; }
            .recording-indicator { top: 58px; padding: 4px 12px; }
            .recording-indicator span { font-size: 12px; }
            .creator-preview .text-preview { font-size: 22px; padding: 30px; }
        }

        @media (max-height: 600px) {
            .top-controls { padding: 8px 16px; }
            .bottom-controls { padding: 10px 16px 20px; }
            .bottom-controls .btn-capture .capture-outer { width: 56px; height: 56px; }
            .bottom-controls .btn-capture .capture-inner { width: 40px; height: 40px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 20px; height: 20px; }
            .mode-selector { top: 48px; }
            .mode-selector .mode-btn { font-size: 11px; padding: 4px 10px; }
            .mode-selector .mode-btn i { font-size: 12px; }
            .text-editor-container textarea { font-size: 18px; height: 50%; }
            .capture-actions { bottom: 110px; }
            .preview-actions { bottom: 110px; }
            .input-area { bottom: 80px; }
            .subtitles-status { bottom: 130px; }
            .text-tools { bottom: 110px; }
            .text-editor-tools { bottom: 30px; }
            .recording-indicator { top: 52px; }
            .creator-preview .text-preview { font-size: 18px; padding: 20px; }
        }

        @media (min-width: 768px) {
            .creator-overlay {
                max-width: 480px;
                margin: 0 auto;
                border-radius: 0;
            }
            .mode-selector .mode-btn { padding: 10px 20px; }
            .text-editor-container textarea { font-size: 32px; }
        }
    `;
    document.head.appendChild(styles);
}

// Inyectar estilos al cargar
injectStyles();