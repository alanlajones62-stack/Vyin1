// ============================================================
// story-creator-modal.js - VERSIÓN DEFINITIVA CORREGIDA
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
let facingMode = 'environment';
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let timerInterval = null;
let recordingSeconds = 0;
let processedVideoData = null;
let zoomLevel = 1;
let selectedTextBg = '#1a1a2e';
let captureMode = 'video';

// ============================================================
// PALETA DE COLORES MODERNA
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
    if (!el) {
        console.warn(`⚠️ Elemento no encontrado: #${id}`);
    }
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

    // Crear el HTML si no existe
    const overlay = safeGetElement('creatorOverlay');
    if (!overlay) {
        createCreatorHTML();
    }

    // Ahora obtener el overlay recién creado
    const overlayEl = safeGetElement('creatorOverlay');
    if (overlayEl) {
        overlayEl.classList.add('active');
    }
    document.body.style.overflow = 'hidden';
    resetCreatorState();
    await startCamera();
    updateModeUI();
}

export function closeCreator() {
    isCreatorOpen = false;
    resetCreatorState();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const overlay = safeGetElement('creatorOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    document.body.style.overflow = '';
    stopCamera();
}

// ============================================================
// RESETEAR ESTADO - CON VERIFICACIÓN DE ELEMENTOS
// ============================================================

function resetCreatorState() {
    mediaFile = null;
    mediaType = null;
    previewUrl = null;
    processedVideoData = null;
    isRecording = false;
    zoomLevel = 1;
    recordingSeconds = 0;

    const preview = safeGetElement('creatorPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.background = '#000';
    }

    const inputArea = safeGetElement('inputArea');
    if (inputArea) inputArea.style.display = 'none';

    const subtitlesStatus = safeGetElement('subtitlesStatus');
    if (subtitlesStatus) subtitlesStatus.style.display = 'none';

    const captureActions = safeGetElement('captureActions');
    if (captureActions) captureActions.style.display = 'none';

    const recordingOverlay = safeGetElement('recordingOverlay');
    if (recordingOverlay) recordingOverlay.style.display = 'none';

    const textTools = safeGetElement('textTools');
    if (textTools) textTools.style.display = 'none';

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
// CREAR HTML - VERSIÓN DEFINITIVA CORREGIDA
// ============================================================

function createCreatorHTML() {
    // Verificar que no exista ya
    if (safeGetElement('creatorOverlay')) return;

    const html = `
        <div id="creatorOverlay" class="creator-overlay">
            
            <!-- ===== CAPA 1: PREVIEW ===== -->
            <div class="creator-preview" id="creatorPreview"></div>

            <!-- ===== CAPA 2: RECORDING OVERLAY ===== -->
            <div class="recording-overlay" id="recordingOverlay">
                <div class="recording-timer" id="recordTimer">00:00</div>
            </div>

            <!-- ===== CAPA 3: ZOOM INDICATOR ===== -->
            <div class="zoom-indicator" id="zoomIndicator">1x</div>

            <!-- ===== CAPA 4: SUBTÍTULOS ===== -->
            <div class="subtitles-status" id="subtitlesStatus">
                <i class="fas fa-closed-captioning"></i>
                <span id="subtitlesText">Generando subtítulos...</span>
            </div>

            <!-- ===== CAPA 5: TEXT TOOLS (colores) ===== -->
            <div class="text-tools" id="textTools">
                ${COLOR_PALETTE.map(color => `
                    <button class="btn-bg ${color === selectedTextBg ? 'active' : ''}" 
                            data-color="${color}" 
                            style="background:${color};"></button>
                `).join('')}
                <button class="btn-back-to-camera" onclick="window.backToCamera()">
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>

            <!-- ===== CAPA 6: CAPTURE ACTIONS (Rehacer/Usar) ===== -->
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

            <!-- ===== CAPA 7: INPUT DE TÍTULO ===== -->
            <div class="input-area" id="inputArea">
                <div class="input-wrapper">
                    <i class="fas fa-pencil-alt"></i>
                    <input type="text" id="creatorCaption" placeholder="Añade un título..." maxlength="220" />
                    <span class="char-counter" id="charCounter">0/220</span>
                </div>
            </div>

            <!-- ===== CAPA 8: CONTROLES SUPERIORES ===== -->
            <div class="top-controls">
                <button class="btn-close" onclick="window.closeCreator()">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button class="btn-next" id="publishBtn" disabled onclick="window.publishStory()">
                    <span>Siguiente</span>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <!-- ===== CAPA 9: SELECTOR DE MODO ===== -->
            <div class="mode-selector" id="modeSelector">
                <button class="mode-btn active" data-mode="video">
                    <i class="fas fa-video"></i>
                    <span>Video</span>
                </button>
                <button class="mode-btn" data-mode="photo">
                    <i class="fas fa-camera"></i>
                    <span>Foto</span>
                </button>
            </div>

            <!-- ===== CAPA 10: CONTROLES INFERIORES ===== -->
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
}

// ============================================================
// CONFIGURAR EVENTOS
// ============================================================

function setupCreatorEvents() {
    const captureBtn = safeGetElement('captureBtn');
    
    captureBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
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
            updateModeUI();
            if (isRecording) stopRecording();
        });
    });

    const captionInput = safeGetElement('creatorCaption');
    captionInput?.addEventListener('input', (e) => {
        const counter = safeGetElement('charCounter');
        if (counter) {
            counter.textContent = `${e.target.value.length}/220`;
        }
    });

    const publishBtn = safeGetElement('publishBtn');
    publishBtn?.addEventListener('click', publishStory);

    document.querySelectorAll('.btn-bg').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-bg').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTextBg = btn.dataset.color;
            const preview = safeGetElement('creatorPreview');
            if (preview) {
                preview.style.background = selectedTextBg;
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isCreatorOpen) {
            closeCreator();
        }
    });
}

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
    
    startCamera();
};

// ============================================================
// ACTUALIZAR UI DEL MODO
// ============================================================

function updateModeUI() {
    // La UI se actualiza visualmente con el modo
}

// ============================================================
// CÁMARA
// ============================================================

async function startCamera() {
    try {
        const preview = safeGetElement('creatorPreview');
        if (!preview) return;

        // Limpiar preview
        preview.innerHTML = '';

        const video = document.createElement('video');
        video.id = 'cameraVideo';
        video.autoplay = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        preview.appendChild(video);
        cameraVideo = video;

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: facingMode,
                width: { ideal: 1080 },
                height: { ideal: 1920 }
            },
            audio: true
        });

        cameraStream = stream;
        video.srcObject = stream;

        const textTools = safeGetElement('textTools');
        if (textTools) textTools.style.display = 'none';
        
        const modeSelector = safeGetElement('modeSelector');
        if (modeSelector) modeSelector.style.display = 'flex';
        
        const bottomControls = safeGetElement('bottomControls');
        if (bottomControls) bottomControls.style.display = 'flex';

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
// CAPTURAR FOTO
// ============================================================

function capturePhoto() {
    if (!cameraVideo || isRecording) return;

    const video = cameraVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const preview = safeGetElement('creatorPreview');
    if (preview) {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: white;
            z-index: 10;
            animation: flashEffect 0.3s ease;
        `;
        preview.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    canvas.toBlob((blob) => {
        if (blob) {
            mediaFile = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            mediaType = 'image';
            previewUrl = URL.createObjectURL(blob);

            if (preview) {
                preview.innerHTML = `
                    <img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;" />
                `;
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
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
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
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
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
                preview.innerHTML = `
                    <img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;" />
                `;
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
    }
    mediaType = 'text';
    mediaFile = null;
    processedVideoData = null;
    
    const publishBtn = safeGetElement('publishBtn');
    if (publishBtn) publishBtn.disabled = true;
    
    stopCamera();
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

    // Preguntar si quiere subtítulos
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
        
        console.log('📹 Resultado procesamiento:', result);
        
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
                publishBtn.textContent = 'Siguiente';
            }
            
            const inputArea = safeGetElement('inputArea');
            if (inputArea) inputArea.style.display = 'block';
            
            const captureActions = safeGetElement('captureActions');
            if (captureActions) captureActions.style.display = 'none';
            
            const statusEl = safeGetElement('subtitlesStatus');
            const textEl = safeGetElement('subtitlesText');
            if (statusEl) statusEl.style.display = 'flex';
            
            if (result.hasSubtitles) {
                if (textEl) textEl.innerHTML = `✅ Subtítulos generados (${result.subtitles?.substring(0, 50) || ''}...)`;
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
            publishBtn.textContent = 'Siguiente';
        }
        
        const subtitlesStatus = safeGetElement('subtitlesStatus');
        if (subtitlesStatus) subtitlesStatus.style.display = 'none';
        
        const captureActions = safeGetElement('captureActions');
        if (captureActions) captureActions.style.display = 'flex';
        
        processedVideoData = null;
    }
}

// ============================================================
// PUBLICAR - VERSIÓN CORREGIDA
// ============================================================

window.publishStory = async function() {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para publicar', true);
        return;
    }

    const publishBtn = safeGetElement('publishBtn');
    const caption = safeGetElement('creatorCaption');

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

        // ============================================================
        // 🔥 TEXTO
        // ============================================================
        if (mediaType === 'text') {
            const textInput = safeGetElement('textContent');
            textContent = textInput?.value.trim();
            if (!textContent) {
                throw new Error('Escribe algo');
            }
        }

        // ============================================================
        // 🔥 VIDEO (CON O SIN SUBTÍTULOS)
        // ============================================================
        else if (mediaType === 'video') {
            console.log('🎬 Publicando video...');
            console.log('📦 processedVideoData:', processedVideoData);
            
            if (processedVideoData && processedVideoData.mediaUrl) {
                console.log('📹 Usando video procesado con subtítulos:', processedVideoData.mediaUrl);
                mediaUrl = processedVideoData.mediaUrl;
                hasSubtitles = processedVideoData.hasSubtitles || false;
                subtitlesText = processedVideoData.subtitles || null;
                segments = processedVideoData.segments || null;
            } else if (mediaFile) {
                console.log('📹 Subiendo video original sin subtítulos...');
                
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
                console.log('📹 Video subido:', uploadData);
                
                mediaUrl = uploadData.videoUrl;
                hasSubtitles = uploadData.hasSubtitles || false;
                subtitlesText = uploadData.subtitles || null;
                segments = uploadData.segments || null;
            }
        }

        // ============================================================
        // 🔥 IMAGEN
        // ============================================================
        else if (mediaType === 'image' && mediaFile) {
            console.log('📸 Publicando imagen...');
            
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
                if (publishBtn) {
                    publishBtn.disabled = false;
                    publishBtn.textContent = 'Siguiente';
                }
                return;
            }
        }

        // ============================================================
        // 🔥 VALIDAR
        // ============================================================
        if (!mediaUrl && mediaType !== 'text') {
            throw new Error('No se pudo obtener la URL del medio');
        }

        // ============================================================
        // 🔥 CREAR HISTORIA
        // ============================================================
        console.log('📤 Publicando historia:', {
            mediaType,
            mediaUrl,
            hasSubtitles,
            subtitlesLength: subtitlesText?.length || 0,
            segmentsCount: segments?.length || 0,
            caption: caption?.value?.trim() || ''
        });

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
        closeCreator();
        if (window.refreshFeed) {
            setTimeout(() => window.refreshFeed(), 500);
        }

    } catch (error) {
        console.error('❌ Error publicando:', error);
        showToast(error.message || 'Error al publicar', true);
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Siguiente';
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

// ============================================================
// ESTILOS
// ============================================================

function injectStyles() {
    // Verificar si los estilos ya están inyectados
    if (document.getElementById('creatorStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'creatorStyles';
    styles.textContent = `
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
        
        @keyframes flashEffect {
            0% { opacity: 1; }
            100% { opacity: 0; }
        }

        .creator-preview {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            position: relative;
            overflow: hidden;
        }
        .creator-preview video, .creator-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .recording-overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 15;
            display: none;
            pointer-events: none;
        }
        .recording-timer {
            position: absolute;
            top: 56px;
            left: 50%;
            transform: translateX(-50%);
            color: #fff;
            font-size: 16px;
            font-weight: 600;
            background: rgba(0,0,0,0.4);
            padding: 4px 16px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        .recording-timer::before {
            content: '●';
            color: #ff0000;
            margin-right: 8px;
            animation: pulseDot 1s infinite;
        }
        @keyframes pulseDot {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .zoom-indicator {
            position: absolute;
            bottom: 140px;
            left: 50%;
            transform: translateX(-50%);
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            background: rgba(0,0,0,0.4);
            padding: 4px 12px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 12;
            pointer-events: none;
        }

        .subtitles-status {
            position: absolute;
            bottom: 170px;
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
        .subtitles-status i {
            color: #34d399;
            font-size: 14px;
        }
        .subtitles-status #subtitlesText {
            flex: 1;
            color: rgba(255,255,255,0.8);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .text-tools {
            position: absolute;
            bottom: 140px;
            left: 0;
            right: 0;
            z-index: 14;
            display: none;
            justify-content: center;
            gap: 8px;
            padding: 10px 20px;
            flex-wrap: wrap;
            background: linear-gradient(0deg, rgba(0,0,0,0.5) 0%, transparent 100%);
        }
        .text-tools .btn-bg {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.05);
            cursor: pointer;
            transition: all 0.2s;
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
            width: 32px;
            height: 32px;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .text-tools .btn-back-to-camera:active {
            transform: scale(0.85);
            background: rgba(255,255,255,0.2);
        }

        .capture-actions {
            position: absolute;
            bottom: 160px;
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

        .input-area {
            position: absolute;
            bottom: 110px;
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
        }
        .top-controls .btn-next:disabled { opacity: 0.3; cursor: not-allowed; }
        .top-controls .btn-next:active:not(:disabled) { transform: scale(0.95); }
        .top-controls .btn-next i { font-size: 10px; }

        .mode-selector {
            position: absolute;
            top: 56px;
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
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
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
            background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%);
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
            opacity: 0.8;
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
            background: rgba(255,255,255,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid rgba(255,255,255,0.3);
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
            opacity: 0.8;
        }
        .bottom-controls .btn-text i { font-size: 22px; }
        .bottom-controls .btn-text:active { transform: scale(0.9); opacity: 1; }

        .text-editor {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
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
        }
        .text-editor textarea::placeholder {
            color: rgba(255,255,255,0.2);
        }

        @media (max-width: 480px) {
            .bottom-controls { padding: 12px 16px 28px; }
            .bottom-controls .btn-capture .capture-outer { width: 64px; height: 64px; }
            .bottom-controls .btn-capture .capture-inner { width: 48px; height: 48px; }
            .bottom-controls .btn-capture.recording .capture-inner { width: 24px; height: 24px; }
            .top-controls { padding: 10px 16px; }
            .capture-actions { bottom: 140px; gap: 30px; }
            .capture-actions .btn-retake i,
            .capture-actions .btn-use i { width: 40px; height: 40px; font-size: 15px; }
            .input-area { bottom: 100px; padding: 0 16px; }
            .text-tools { bottom: 120px; gap: 6px; padding: 8px 12px; }
            .text-tools .btn-bg { width: 28px; height: 28px; }
            .text-tools .btn-back-to-camera { width: 28px; height: 28px; font-size: 12px; }
            .text-editor textarea { font-size: 20px; width: 90%; }
            .subtitles-status { bottom: 150px; left: 16px; right: 16px; padding: 8px 12px; }
            .mode-selector { top: 48px; padding: 3px; }
            .mode-selector .mode-btn { font-size: 11px; padding: 4px 12px; }
            .mode-selector .mode-btn i { font-size: 12px; }
        }
    `;
    document.head.appendChild(styles);
}

injectStyles();