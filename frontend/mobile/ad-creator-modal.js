// ============================================================
// ad-creator-modal.js - Creador de publicidad para cuentas de empresa
// ============================================================

import { getToken, getCurrentUser, showToast } from './auth.js';

const API_URL = window.location.origin;

let isOpen = false;

// ============================================================
// ABRIR CREADOR DE PUBLICIDAD
// ============================================================

export function openAdCreator() {
    const user = getCurrentUser();
    if (!user) {
        showToast('Inicia sesión para crear publicidad', true);
        return;
    }

    // Verificar que es cuenta de empresa
    const isBusiness = user.accountType === 'business' || user.accountType === 'business_verified';
    if (!isBusiness) {
        showToast('Solo cuentas de empresa pueden crear publicidad', true);
        return;
    }

    if (isOpen) return;
    isOpen = true;

    const existing = document.getElementById('adCreatorOverlay');
    if (existing) {
        existing.classList.add('active');
        document.body.style.overflow = 'hidden';
        resetForm();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'adCreatorOverlay';
    overlay.className = 'ad-creator-overlay';
    overlay.innerHTML = `
        <div class="ad-creator-content" onclick="event.stopPropagation()">
            <div class="ad-creator-header">
                <button class="close-btn" id="adCreatorCloseBtn">
                    <i class="fas fa-times"></i>
                </button>
                <span class="title">
                    <i class="fas fa-bullhorn" style="color:#fbbf24;"></i> 
                    Crear Publicidad
                </span>
                <span class="subtitle">Cuenta de empresa</span>
            </div>
            
            <div class="ad-creator-body" id="adCreatorBody">
                <div class="ad-form">
                    <!-- Título -->
                    <div class="form-group">
                        <label>Título de la publicidad <span class="required">*</span></label>
                        <input type="text" id="adTitle" placeholder="Ej: ¡Ofertas increíbles!" maxlength="100" />
                        <div class="helper"><span id="adTitleCount">0</span>/100 caracteres</div>
                    </div>

                    <!-- Descripción -->
                    <div class="form-group">
                        <label>Descripción <span class="required">*</span></label>
                        <textarea id="adDescription" placeholder="Describe tu producto o servicio..." maxlength="500" rows="3"></textarea>
                        <div class="helper"><span id="adDescCount">0</span>/500 caracteres</div>
                    </div>

                    <!-- Imagen -->
                    <div class="form-group">
                        <label>Imagen de la publicidad</label>
                        <div class="ad-upload-area" id="adUploadArea">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <span>Selecciona una imagen</span>
                            <small>Recomendado: 1080x1080px (max 10MB)</small>
                            <input type="file" id="adFileInput" accept="image/*" style="display:none;" />
                        </div>
                        <div class="ad-preview" id="adPreview" style="display:none;">
                            <img id="adPreviewImg" src="" alt="Preview" />
                            <button class="remove-media-btn" id="adRemoveMedia">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Enlace -->
                    <div class="form-group">
                        <label>Enlace (opcional)</label>
                        <input type="url" id="adLink" placeholder="https://tusitio.com/oferta" />
                        <div class="helper">Los usuarios podrán hacer clic en tu publicidad</div>
                    </div>

                    <!-- Duración -->
                    <div class="form-group">
                        <label>Duración</label>
                        <select id="adDuration">
                            <option value="3">3 días</option>
                            <option value="7" selected>7 días</option>
                            <option value="14">14 días</option>
                            <option value="30">30 días</option>
                        </select>
                    </div>

                    <!-- Público objetivo -->
                    <div class="form-group">
                        <label>Público objetivo</label>
                        <select id="adAudience">
                            <option value="all">Todos los usuarios</option>
                            <option value="followers">Solo mis seguidores</option>
                            <option value="region">Mi región</option>
                        </select>
                    </div>
                </div>

                <!-- Info box -->
                <div class="ad-info-box">
                    <i class="fas fa-info-circle"></i>
                    <div>
                        <strong>¿Cómo funciona?</strong>
                        <p>Tu publicidad aparecerá en el feed de los usuarios como contenido destacado. 
                        Será revisada por el equipo de moderación antes de publicarse.</p>
                    </div>
                </div>

                <!-- Botón publicar -->
                <button class="publish-btn" id="adPublishBtn" disabled>
                    <i class="fas fa-paper-plane"></i> Enviar publicidad
                </button>
                
                <!-- Mensaje de estado -->
                <div id="adStatusMessage" class="ad-status-message" style="display:none;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    setupEvents();
    resetForm();
}

// ============================================================
// CONFIGURAR EVENTOS
// ============================================================

function setupEvents() {
    const closeBtn = document.getElementById('adCreatorCloseBtn');
    const overlay = document.getElementById('adCreatorOverlay');
    const fileInput = document.getElementById('adFileInput');
    const uploadArea = document.getElementById('adUploadArea');
    const preview = document.getElementById('adPreview');
    const previewImg = document.getElementById('adPreviewImg');
    const removeBtn = document.getElementById('adRemoveMedia');
    const publishBtn = document.getElementById('adPublishBtn');
    const statusMsg = document.getElementById('adStatusMessage');

    // Campos del formulario
    const titleInput = document.getElementById('adTitle');
    const descInput = document.getElementById('adDescription');
    const titleCount = document.getElementById('adTitleCount');
    const descCount = document.getElementById('adDescCount');

    let selectedImage = null;

    // Contador de caracteres - Título
    titleInput?.addEventListener('input', () => {
        if (titleCount) titleCount.textContent = titleInput.value.length;
        validateForm();
    });

    // Contador de caracteres - Descripción
    descInput?.addEventListener('input', () => {
        if (descCount) descCount.textContent = descInput.value.length;
        validateForm();
    });

    // Validar formulario - Ahora solo requiere título y descripción
    function validateForm() {
        const title = titleInput?.value.trim() || '';
        const desc = descInput?.value.trim() || '';
        const isValid = title.length >= 3 && desc.length >= 3;
        publishBtn.disabled = !isValid;
        publishBtn.style.opacity = isValid ? '1' : '0.5';
    }

    // Subir imagen - Click
    uploadArea?.addEventListener('click', () => {
        fileInput?.click();
    });

    // Subir imagen - File input
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    // Drag and drop
    uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#c084fc';
        uploadArea.style.background = 'rgba(192,132,252,0.05)';
    });

    uploadArea?.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadArea.style.background = 'rgba(255,255,255,0.02)';
    });

    uploadArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadArea.style.background = 'rgba(255,255,255,0.02)';
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    });

    // Manejar archivo
    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Solo se permiten imágenes', true);
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('La imagen no puede superar los 10MB', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            selectedImage = {
                file: file,
                dataUrl: e.target.result
            };
            
            // Mostrar preview
            previewImg.src = e.target.result;
            preview.style.display = 'block';
            uploadArea.style.display = 'none';
            validateForm();
        };
        reader.readAsDataURL(file);
    }

    // Eliminar imagen
    removeBtn?.addEventListener('click', () => {
        selectedImage = null;
        preview.style.display = 'none';
        uploadArea.style.display = 'flex';
        fileInput.value = '';
        validateForm();
    });

    // Cerrar
    closeBtn?.addEventListener('click', closeAdCreator);
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeAdCreator();
    });

    // ESC para cerrar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeAdCreator();
        }
    });

    // Publicar
    publishBtn?.addEventListener('click', async () => {
        await publishAd();
    });
}

// ============================================================
// RESET FORMULARIO
// ============================================================

function resetForm() {
    document.getElementById('adTitle').value = '';
    document.getElementById('adDescription').value = '';
    document.getElementById('adLink').value = '';
    document.getElementById('adDuration').value = '7';
    document.getElementById('adAudience').value = 'all';
    document.getElementById('adPreview').style.display = 'none';
    document.getElementById('adUploadArea').style.display = 'flex';
    document.getElementById('adFileInput').value = '';
    document.getElementById('adPublishBtn').disabled = true;
    document.getElementById('adPublishBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Enviar publicidad';
    document.getElementById('adPublishBtn').style.opacity = '0.5';
    document.getElementById('adStatusMessage').style.display = 'none';
    document.getElementById('adTitleCount').textContent = '0';
    document.getElementById('adDescCount').textContent = '0';
}

// ============================================================
// PUBLICAR PUBLICIDAD
// ============================================================

async function publishAd() {
    const title = document.getElementById('adTitle')?.value.trim() || '';
    const description = document.getElementById('adDescription')?.value.trim() || '';
    const link = document.getElementById('adLink')?.value.trim() || '';
    const duration = parseInt(document.getElementById('adDuration')?.value || '7');
    const audience = document.getElementById('adAudience')?.value || 'all';

    const statusMsg = document.getElementById('adStatusMessage');
    const publishBtn = document.getElementById('adPublishBtn');

    // Validar
    if (title.length < 3) {
        showToast('El título debe tener al menos 3 caracteres', true);
        return;
    }

    if (description.length < 3) {
        showToast('La descripción debe tener al menos 3 caracteres', true);
        return;
    }

    // Subir imagen si hay
    let imageUrl = null;
    const fileInput = document.getElementById('adFileInput');
    const preview = document.getElementById('adPreview');
    const hasImage = preview.style.display !== 'none' && preview.querySelector('img')?.src;

    if (hasImage) {
        const file = fileInput?.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('image', file);

            try {
                const token = getToken();
                const uploadRes = await fetch(`${API_URL}/api/stories/upload-image`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    imageUrl = data.imageUrl;
                } else {
                    showToast('Error subiendo imagen', true);
                    return;
                }
            } catch (error) {
                console.error('Error subiendo imagen:', error);
                showToast('Error subiendo imagen', true);
                return;
            }
        }
    }

    // Crear publicidad
    try {
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Enviando...';
        statusMsg.style.display = 'none';

        const token = getToken();
        const res = await fetch(`${API_URL}/api/ads/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                description,
                imageUrl: imageUrl || null,
                linkUrl: link || null,
                durationDays: duration,
                targetAudience: audience,
                mediaType: 'image',
                mediaUrl: imageUrl || null
            })
        });

        const data = await res.json();

        if (res.ok) {
            statusMsg.className = 'ad-status-message success';
            statusMsg.innerHTML = `
                <i class="fas fa-check-circle"></i>
                ${data.message || '✅ Publicidad enviada correctamente'}
            `;
            statusMsg.style.display = 'block';
            publishBtn.innerHTML = '✅ Enviado';
            publishBtn.disabled = true;

            setTimeout(() => {
                closeAdCreator();
                showToast('📢 Publicidad enviada para revisión');
            }, 2000);
        } else {
            statusMsg.className = 'ad-status-message error';
            statusMsg.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                ${data.error || 'Error al enviar publicidad'}
            `;
            statusMsg.style.display = 'block';
            publishBtn.disabled = false;
            publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar publicidad';
        }
    } catch (error) {
        console.error('Error creando publicidad:', error);
        showToast('Error de conexión', true);
        publishBtn.disabled = false;
        publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar publicidad';
    }
}

// ============================================================
// CERRAR CREADOR DE PUBLICIDAD
// ============================================================

export function closeAdCreator() {
    isOpen = false;
    const overlay = document.getElementById('adCreatorOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 300);
    }
    document.body.style.overflow = '';
}