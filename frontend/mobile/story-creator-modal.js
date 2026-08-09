// ============================================================
// story-creator-modal.js - VERSIÓN REDISEÑADA CON CÁMARA INVERTIDA
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
let facingMode = 'user'; // 🔥 Por defecto cámara frontal (selfie)
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let timerInterval = null;
let recordingSeconds = 0;
let processedVideoData = null;
let selectedTextBg = '#1a1a2e';
let captureMode = 'video';
let isPublishing = false;

// ============================================================
// PALETA DE COLORES
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

    const elements = [
        'inputArea', 'subtitlesStatus', 'captureActions',
        'recordingOverlay', 'textTools'
    ];
    elements.forEach(id => {
        const el = safeGetElement(id);
        if (el) el.style.display = 'none';
    });

    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';

    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'flex';

    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Siguiente';
    }

    const caption = safeGetElement('creatorCaption');
    if (caption) caption.value = '';
}

// ============================================================
// CREAR HTML - DISEÑO REDISEÑADO
// ============================================================

function createCreatorHTML() {
    if (safeGetElement('creatorOverlay')) return;

    const html = `
        <div id="creatorOverlay" class="creator-overlay">
            
            <!-- PREVIEW -->
            <div class="creator-preview" id="creatorPreview">
                <div class="camera-placeholder">
                    <i class="fas fa-camera"></i>
                    <span>Iniciando cámara...</span>
                </div>
            </div>

            <!-- RECORDING OVERLAY -->
            <div class="recording-overlay" id="recordingOverlay">
                <div class="recording-timer" id="recordTimer">00:00</div>
                <div class="recording-dot"></div>
            </div>

            <!-- SUBTÍTULOS -->
            <div class="subtitles-status" id="subtitlesStatus">
                <i class="fas fa-closed-captioning"></i>
                <span id="subtitlesText">Generando subtítulos...</span>
            </div>

            <!-- TEXT TOOLS -->
            <div class="text-tools" id="textTools">
                <div class="text-tools-scroll">
                    ${COLOR_PALETTE.map(color => `
                        <button class="btn-bg ${color === selectedTextBg ? 'active' : ''}" 
                                data-color="${color}" style="background:${color};"></button>
                    `).join('')}
                </div>
                <button class="btn-back-to-camera" onclick="window.backToCamera()">
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>

            <!-- CAPTURE ACTIONS -->
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

            <!-- INPUT DE TÍTULO -->
            <div class="input-area" id="inputArea">
                <div class="input-wrapper">
                    <i class="fas fa-pencil-alt"></i>
                    <input type="text" id="creatorCaption" placeholder="Añade un título..." maxlength="220" />
                    <span class="char-counter" id="charCounter">0/220</span>
                </div>
            </div>

            <!-- CONTROLES SUPERIORES -->
            <div class="top-controls">
                <button class="btn-close" onclick="window.closeCreator()">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button class="btn-next" id="publishBtn" disabled onclick="window.publishStory()">
                    <span>Publicar</span>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <!-- SELECTOR DE MODO -->
            <div class="mode-selector" id="modeSelector">
                <button class="mode-btn active" data-mode="video">
                    <i class="fas fa-video"></i>
                    <span>Video</span>
                </button>
                <button class="mode-btn" data-mode="photo">
                    <i class="fas fa-camera"></i>
                    <span>Foto</span>
                </button>
                <button class="mode-btn flip-btn" id="flipCameraBtn" title="Cambiar cámara">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>

            <!-- CONTROLES INFERIORES -->
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
                showToast('Ya tienes un medio capturado. Usa "Rehacer" para cambiar', true);
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

    const publishBtn = safeGetElement('publishBtn');
    publishBtn?.addEventListener('click', publishStory);

    document.querySelectorAll('.btn-bg').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-bg').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTextBg = btn.dataset.color;
            const preview = safeGetElement('creatorPreview');
            if (preview) preview.style.background = selectedTextBg;
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isCreatorOpen) closeCreator();
    });
}

// ============================================================
// 🔥 CÁMARA CON EFECTO ESPEJO (INVERTIDA)
// ============================================================

async function startCamera() {
    try {
        const preview = safeGetElement('creatorPreview');
        if (!preview) return;

        // Limpiar placeholder
        preview.innerHTML = '';

        const video = document.createElement('video');
        video.id = 'cameraVideo';
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        // 🔥 EFECTO ESPEJO (invertir horizontalmente)
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

        // Esperar a que el video esté listo
        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        const textTools = safeGetElement('textTools');
        if (textTools) textTools.style.display = 'none';
        
        const modeSelector = safeGetElement('modeSelector');
        if (modeSelector) modeSelector.style.display = 'flex';
        
        const bottomControls = safeGetElement('bottomControls');
        if (bottomControls) bottomControls.style.display = 'flex';

        const flipBtn = safeGetElement('flipCameraBtn');
        if (flipBtn) flipBtn.style.display = 'flex';

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
// 🔥 GIRAR CÁMARA (CON EFECTO ESPEJO)
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
// CAPTURAR FOTO (CON EFECTO ESPEJO)
// ============================================================

function capturePhoto() {
    if (!cameraVideo || isRecording) return;

    const video = cameraVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext('2d');
    
    // 🔥 Si es cámara frontal, invertir la imagen para que no quede espejada
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
                // Quitar efecto espejo en la vista previa
                preview.querySelector('img').style.transform = 'scaleX(1)';
            }

            const captureActions = safeGetElement('captureActions');
            if (captureActions) captureActions.style.display = 'flex';
            
            const inputArea = safeGetElement('inputArea');
            if (inputArea) inputArea.style.display = 'block';
            
            const publishBtn = safeGetElement('publishBtn');
            if (publishBtn) publishBtn.disabled = false;
            
            const textTools = safeGetElement('textTools');
            if (textTools) textTools.style.display = 'none';
            
            const modeSelector = safeGetElement('modeSelector');
            if (modeSelector) modeSelector.style.display = 'none';
            
            const bottomControls = safeGetElement('bottomControls');
            if (bottomControls) bottomControls.style.display = 'none';
            
            stopCamera();

            const flipBtn = safeGetElement('flipCameraBtn');
            if (flipBtn) flipBtn.style.display = 'none';
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

    const recordingOverlay = safeGetElement('recordingOverlay');
    if (recordingOverlay) recordingOverlay.style.display = 'block';
    
    const recordTimer = safeGetElement('recordTimer');
    if (recordTimer) recordTimer.textContent = '00:00';
    
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
        if (recordingOverlay) recordingOverlay.style.display = 'none';
        clearInterval(timerInterval);
    };

    mediaRecorder.start();
    
    timerInterval = setInterval(() => {
        recordingSeconds++;
        const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const secs = String(recordingSeconds % 60).padStart(2, '0');
        const recordTimerEl = safeGetElement('recordTimer');
        if (recordTimerEl) recordTimerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopRecording() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

// ============================================================
// RETOMAR / USAR MEDIA
// ============================================================

window.retakeMedia = function() {
    mediaFile = null;
    mediaType = null;
    previewUrl = null;
    processedVideoData = null;
    
    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'none';
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'none';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = true;
    
    const subtitlesStatus = safeGetElement('subtitlesStatus');
    if (subtitlesStatus) subtitlesStatus.style.display = 'none';
    
    const textTools = safeGetElement('textTools');
    if (textTools) textTools.style.display = 'none';
    
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
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = false;
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'block';
};

// ============================================================
// VOLVER A LA CÁMARA DESDE TEXTO
// ============================================================

window.backToCamera = function() {
    resetCreatorState();
    
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
            const captureActions = safeGetElement('captureActions');
            if (captureActions) captureActions.style.display = 'flex';
            
            const inputArea = safeGetElement('inputArea');
            if (inputArea) inputArea.style.display = 'block';
            
            const publishBtn = safeGetElement('publishBtn');
            if (publishBtn) publishBtn.disabled = false;
            
            const textTools = safeGetElement('textTools');
            if (textTools) textTools.style.display = 'none';
            
            const modeSelector = safeGetElement('modeSelector');
            if (modeSelector) modeSelector.style.display = 'none';
            
            const bottomControls = safeGetElement('bottomControls');
            if (bottomControls) bottomControls.style.display = 'none';
            
            showToast('✅ Imagen seleccionada');
            stopCamera();

            const flipBtn = safeGetElement('flipCameraBtn');
            if (flipBtn) flipBtn.style.display = 'none';
        }
        document.body.removeChild(input);
    };
    input.click();
};

// ============================================================
// TEXTO
// ============================================================

window.createTextStory = function() {
    resetCreatorState();
    
    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = `
            <div class="text-editor">
                <textarea id="textContent" placeholder="Escribe algo..." maxlength="1000"></textarea>
            </div>
        `;
        preview.style.background = selectedTextBg;

        const textTools = safeGetElement('textTools');
        if (textTools) textTools.style.display = 'flex';
        
        const captureActions = safeGetElement('captureActions');
        if (captureActions) captureActions.style.display = 'none';
        
        const inputArea = safeGetElement('inputArea');
        if (inputArea) inputArea.style.display = 'none';
        
        const modeSelector = safeGetElement('modeSelector');
        if (modeSelector) modeSelector.style.display = 'none';
        
        const bottomControls = safeGetElement('bottomControls');
        if (bottomControls) bottomControls.style.display = 'none';

        const input = safeGetElement('textContent');
        input?.focus();
        input?.addEventListener('input', () => {
            const hasText = input.value.trim().length > 0;
            const publishBtn = safeGetElement('publishBtn');
            if (publishBtn) publishBtn.disabled = !hasText;
            if (hasText) {
                const inputAreaEl = safeGetElement('inputArea');
                if (inputAreaEl) inputAreaEl.style.display = 'block';
            }
        });

        // Botón para salir del modo texto
        const exitTextBtn = document.createElement('button');
        exitTextBtn.className = 'btn-exit-text';
        exitTextBtn.innerHTML = '<i class="fas fa-times"></i> Salir';
        exitTextBtn.onclick = () => {
            resetCreatorState();
            const previewEl = safeGetElement('creatorPreview');
            if (previewEl) {
                previewEl.innerHTML = '';
                previewEl.style.background = '#000';
            }
            const textToolsEl = safeGetElement('textTools');
            if (textToolsEl) textToolsEl.style.display = 'none';
            const inputAreaEl = safeGetElement('inputArea');
            if (inputAreaEl) inputAreaEl.style.display = 'none';
            const publishBtnEl = safeGetElement('publishBtn');
            if (publishBtnEl) publishBtnEl.disabled = true;
            const modeSelectorEl = safeGetElement('modeSelector');
            if (modeSelectorEl) modeSelectorEl.style.display = 'flex';
            const bottomControlsEl = safeGetElement('bottomControls');
            if (bottomControlsEl) bottomControlsEl.style.display = 'flex';
            mediaType = null;
            startCamera();
        };
        exitTextBtn.style.cssText = `
            position: absolute;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255,255,255,0.1);
            border: none;
            color: #fff;
            padding: 8px 20px;
            border-radius: 50px;
            font-size: 13px;
            cursor: pointer;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 15;
        `;
        preview.appendChild(exitTextBtn);
    }
    mediaType = 'text';
    mediaFile = null;
    processedVideoData = null;
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = true;
    
    stopCamera();

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';
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

    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'flex';
    
    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'none';
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = false;
    
    const modeSelector = safeGetElement('modeSelector');
    if (modeSelector) modeSelector.style.display = 'none';
    
    const bottomControls = safeGetElement('bottomControls');
    if (bottomControls) bottomControls.style.display = 'none';

    const flipBtn = safeGetElement('flipCameraBtn');
    if (flipBtn) flipBtn.style.display = 'none';

    const addSubtitles = confirm('🎬 ¿Agregar subtítulos al video?');
    if (addSubtitles) {
        if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.textContent = '⏳ Procesando...';
        }
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) subtitlesStatus.style.display = 'flex';
        const subtitlesText = safeGetElement('subtitlesText');
        if (subtitlesText) subtitlesText.textContent = '⏳ Generando subtítulos...';
        await processVideoWithSubtitles(file);
    } else {
        if (publishBtn) publishBtn.disabled = false;
        if (inputArea) inputArea.style.display = 'block';
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) subtitlesStatus.style.display = 'none';
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
            
            const captureActions = safeGetElement('captureActions');
            if (captureActions) captureActions.style.display = 'none';
            
            const statusEl = safeGetElement('subtitlesStatus');
            const textEl = safeGetElement('subtitlesText');
            if (statusEl) statusEl.style.display = 'flex';
            
            if (result.hasSubtitles) {
                if (textEl) textEl.innerHTML = `✅ Subtítulos generados`;
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
        
        const captureActions = safeGetElement('captureActions');
        if (captureActions) captureActions.style.display = 'flex';
        
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
            const textInput = safeGetElement('textContent');
            textContent = textInput?.value.trim();
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

// ============================================================
// ESTILOS REDISEÑADOS
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
           RECORDING
        ============================================================ */
        .recording-overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 15;
            display: none;
            pointer-events: none;
            border: 3px solid rgba(255,0,0,0.3);
            border-radius: 0;
        }
        .recording-timer {
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            color: #fff;
            font-size: 16px;
            font-weight: 600;
            background: rgba(0,0,0,0.5);
            padding: 4px 16px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .recording-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff0000;
            animation: pulseDot 1s infinite;
            display: none;
        }
        .recording-overlay.active .recording-dot { display: block; }
        
        @keyframes pulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(0.8); }
        }

        /* ============================================================
           SUBTÍTULOS
        ============================================================ */
        .subtitles-status {
            position: absolute;
            bottom: 160px;
            left: 20px;
            right: 20px;
            z-index: 14;
            display: none;
            align-items: center;
            gap: 10px;
            background: rgba(0,0,0,0.7);
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
            padding: 10px 16px;
            background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%);
        }
        .text-tools-scroll {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding: 4px 0;
            flex: 1;
            -webkit-overflow-scrolling: touch;
        }
        .text-tools-scroll::-webkit-scrollbar { display: none; }
        .text-tools .btn-bg {
            min-width: 32px;
            height: 32px;
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
        .text-tools .btn-back-to-camera {
            background: rgba(255,255,255,0.1);
            border: none;
            border-radius: 50%;
            min-width: 32px;
            height: 32px;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.2s;
        }
        .text-tools .btn-back-to-camera:active {
            transform: scale(0.85);
            background: rgba(255,255,255,0.2);
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
        }
        .capture-actions .btn-retake,
        .capture-actions .btn-use {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            background: none;
            border: none;
            color: #fff;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.8;
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
            background: rgba(255,255,255,0.1);
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
            background: rgba(255,255,255,0.08);
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
            background: rgba(255,255,255,0.1);
            border: none;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            color: #fff;
            font-size: 18px;
            cursor: pointer;
            backdrop-filter: blur(10px);
            transition: all 0.2s;
        }
        .top-controls .btn-close:active { transform: scale(0.9); }
        .top-controls .btn-next {
            background: #fff;
            border: none;
            border-radius: 50px;
            padding: 6px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
            color: #000;
        }
        .top-controls .btn-next:disabled { opacity: 0.3; cursor: not-allowed; }
        .top-controls .btn-next:active:not(:disabled) { transform: scale(0.95); }
        .top-controls .btn-next i { font-size: 10px; }

        /* ============================================================
           MODE SELECTOR
        ============================================================ */
        .mode-selector {
            position: absolute;
            top: 56px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 20;
            display: flex;
            gap: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 50px;
            padding: 4px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.05);
        }
        .mode-selector .mode-btn {
            background: none;
            border: none;
            color: rgba(255,255,255,0.4);
            font-size: 12px;
            font-weight: 600;
            padding: 6px 14px;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .mode-selector .mode-btn i { font-size: 14px; }
        .mode-selector .mode-btn.active {
            background: #fff;
            color: #000;
        }
        .mode-selector .mode-btn:active { transform: scale(0.95); }
        .mode-selector .flip-btn {
            border-left: 1px solid rgba(255,255,255,0.1);
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
        .bottom-controls .btn-gallery {
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            opacity: 0.7;
            transition: all 0.2s;
        }
        .bottom-controls .btn-gallery i { font-size: 22px; }
        .bottom-controls .btn-gallery:active { transform: scale(0.9); opacity: 1; }

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
            background: rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.2);
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
            opacity: 0.7;
            transition: all 0.2s;
        }
        .bottom-controls .btn-text i { font-size: 22px; }
        .bottom-controls .btn-text:active { transform: scale(0.9); opacity: 1; }

        /* ============================================================
           TEXT EDITOR
        ============================================================ */
        .text-editor {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
            position: relative;
        }
        .text-editor textarea {
            width: 80%;
            max-width: 400px;
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
        }
        .text-editor textarea::placeholder {
            color: rgba(255,255,255,0.2);
        }
        .btn-exit-text {
            position: absolute;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255,255,255,0.1);
            border: none;
            color: #fff;
            padding: 8px 20px;
            border-radius: 50px;
            font-size: 13px;
            cursor: pointer;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 15;
            transition: all 0.2s;
        }
        .btn-exit-text:active { transform: scale(0.95); }

        /* ============================================================
           RESPONSIVE
        ============================================================ */
        @media (max-width: 480px) {
            .bottom-controls { padding: 12px 16px 28px; }
            .bottom-controls .btn-capture .capture-outer { width: 64px; height: 64px; }
            .bottom-controls .btn-capture .capture-inner { width: 48px; height: 48px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 24px; height: 24px; }
            .top-controls { padding: 10px 16px; }
            .top-controls .btn-close { width: 32px; height: 32px; font-size: 16px; }
            .capture-actions { bottom: 130px; gap: 30px; }
            .capture-actions .btn-retake i,
            .capture-actions .btn-use i { width: 40px; height: 40px; font-size: 15px; }
            .input-area { bottom: 100px; padding: 0 16px; }
            .input-area .input-wrapper input { font-size: 13px; padding: 10px 12px; padding-left: 36px; padding-right: 50px; }
            .text-tools { bottom: 120px; padding: 8px 12px; }
            .text-tools .btn-bg { min-width: 28px; height: 28px; }
            .text-tools .btn-back-to-camera { min-width: 28px; height: 28px; font-size: 12px; }
            .text-editor textarea { font-size: 20px; width: 90%; }
            .subtitles-status { bottom: 150px; left: 16px; right: 16px; padding: 8px 12px; }
            .mode-selector { top: 48px; padding: 3px; }
            .mode-selector .mode-btn { font-size: 11px; padding: 4px 12px; }
            .mode-selector .mode-btn i { font-size: 12px; }
            .recording-timer { top: 52px; font-size: 14px; }
        }

        @media (max-height: 600px) {
            .top-controls { padding: 8px 16px; }
            .bottom-controls { padding: 10px 16px 20px; }
            .bottom-controls .btn-capture .capture-outer { width: 56px; height: 56px; }
            .bottom-controls .btn-capture .capture-inner { width: 40px; height: 40px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 20px; height: 20px; }
            .mode-selector { top: 42px; }
            .mode-selector .mode-btn { font-size: 10px; padding: 3px 10px; }
            .text-editor textarea { font-size: 18px; height: 50%; }
            .capture-actions { bottom: 110px; }
            .input-area { bottom: 80px; }
            .subtitles-status { bottom: 120px; }
            .text-tools { bottom: 110px; }
        }
    `;
    document.head.appendChild(styles);
}

// Inyectar estilos al cargar
injectStyles();