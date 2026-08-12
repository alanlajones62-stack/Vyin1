// admin/admin.js - Lógica del panel de administración (CON VERIFICACIÓN DE CUENTAS Y PUBLICIDADES)

// ============================================================
// CONFIGURACIÓN
// ============================================================

const API_URL = window.location.origin;

// ============================================================
// AUTH
// ============================================================

function getToken() {
    return localStorage.getItem('token');
}

function getHeaders() {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

function getCurrentUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
}

function setCurrentUser(user) {
    if (user) {
        localStorage.setItem('user', JSON.stringify(user));
    } else {
        localStorage.removeItem('user');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, isError = false, duration = 3000) {
    const existing = document.querySelector('.toast-custom');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-custom ${isError ? 'error' : 'success'}`;
    toast.innerHTML = `<i class="fas fa-${isError ? 'exclamation-triangle' : 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, duration);
}

// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// HEADER
// ============================================================

let currentUser = null;

function updateHeader(user) {
    const avatarImg = document.getElementById('avatarImg');
    const avatarLetter = document.getElementById('avatarLetter');
    const adminName = document.getElementById('adminName');

    if (user) {
        const displayName = user.fullName || user.username || 'Admin';
        adminName.textContent = displayName;
        
        if (user.avatar) {
            avatarImg.src = user.avatar;
            avatarImg.style.display = 'block';
            avatarLetter.style.display = 'none';
        } else {
            avatarLetter.textContent = displayName.charAt(0).toUpperCase();
            avatarLetter.style.display = 'flex';
            avatarImg.style.display = 'none';
        }
    } else {
        adminName.textContent = 'No autenticado';
        avatarLetter.textContent = '?';
        avatarLetter.style.display = 'flex';
        avatarImg.style.display = 'none';
    }
}

// ============================================================
// AUTH CHECK
// ============================================================

async function checkAuth() {
    const token = getToken();
    if (!token) {
        showToast('Debes iniciar sesión', true);
        window.location.href = '/login.html';
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                showToast('Sesión expirada', true);
                logout();
                return false;
            }
            throw new Error('Error verificando autenticación');
        }

        const data = await response.json();
        currentUser = data.user;
        setCurrentUser(currentUser);

        if (currentUser.role !== 'admin') {
            showToast('Acceso denegado. Solo administradores.', true);
            window.location.href = '/feed.html';
            return false;
        }

        updateHeader(currentUser);
        console.log('✅ Admin autenticado:', currentUser.username);
        return true;

    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de autenticación', true);
        window.location.href = '/login.html';
        return false;
    }
}

// ============================================================
// STATS - ACTUALIZADO CON PUBLICIDADES
// ============================================================

async function loadStats() {
    try {
        // Cargar estadísticas de denuncias
        const reportsResponse = await fetch(`${API_URL}/api/reports/stats`, {
            headers: getHeaders()
        });

        if (reportsResponse.ok) {
            const stats = await reportsResponse.json();
            document.getElementById('totalReports').textContent = stats.total || 0;
            document.getElementById('pendingReports').textContent = stats.pending || 0;
            document.getElementById('resolvedReports').textContent = stats.resolved || 0;
            document.getElementById('autoHiddenReports').textContent = stats.autoHidden || 0;
            document.getElementById('avgScore').textContent = stats.avgCombinedScore || 0;
            document.getElementById('pendingCount').textContent = stats.pending || 0;
        }

        // Cargar estadísticas de verificación
        try {
            const verifyResponse = await fetch(`${API_URL}/api/verified/stats`, {
                headers: getHeaders()
            });

            if (verifyResponse.ok) {
                const verifyStats = await verifyResponse.json();
                document.getElementById('totalAdmins').textContent = verifyStats.totalAdmins || 0;
                document.getElementById('adminCount').textContent = verifyStats.totalAdmins || 0;
                document.getElementById('pendingRequests').textContent = verifyStats.pendingBusinessRequests || 0;
            }
        } catch (e) {
            console.warn('Error cargando estadísticas de verificación:', e);
        }

        // 🔥 Cargar publicidades pendientes
        try {
            const adsResponse = await fetch(`${API_URL}/api/ads/pending`, {
                headers: getHeaders()
            });
            if (adsResponse.ok) {
                const adsData = await adsResponse.json();
                const pendingCount = adsData.ads?.filter(a => a.status === 'pending').length || 0;
                document.getElementById('pendingAdsCount').textContent = pendingCount;
            }
        } catch (e) {
            console.warn('Error cargando publicidades pendientes:', e);
        }

    } catch (error) {
        console.error('Error cargando stats:', error);
    }
}

// ============================================================
// RENDERIZAR VISTA PREVIA DE LA HISTORIA
// ============================================================

function renderStoryPreview(storyData) {
    if (!storyData) {
        return `
            <div class="story-preview">
                <div class="no-content">
                    <i class="fas fa-file-alt"></i>
                    No hay datos de la historia
                </div>
            </div>
        `;
    }
    
    const mediaType = storyData.mediaType || 'text';
    const mediaUrl = storyData.mediaUrl || '';
    const caption = storyData.caption || '';
    const textContent = storyData.textContent || '';
    const textBgColor = storyData.textBgColor || '#1a1a2e';

    if (!mediaUrl && mediaType !== 'text') {
        return `
            <div class="story-preview">
                <div class="no-content">
                    <i class="fas fa-eye-slash"></i>
                    Contenido no disponible o eliminado
                    <div style="font-size:12px; margin-top:8px; color:rgba(255,255,255,0.2);">
                        Tipo: ${mediaType}
                    </div>
                </div>
            </div>
        `;
    }

    let contentHtml = '';

    if (mediaType === 'image' && mediaUrl) {
        contentHtml = `
            <div class="story-preview">
                <img src="${escapeHtml(mediaUrl)}" alt="Contenido de la historia" loading="lazy" 
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'no-content\\'><i class=\\'fas fa-image\\'></i> Imagen no disponible</div>'">
                ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
            </div>
        `;
    } else if (mediaType === 'video' && mediaUrl) {
        contentHtml = `
            <div class="story-preview">
                <video src="${escapeHtml(mediaUrl)}" controls style="width:100%; max-height:400px;" preload="metadata"
                       onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'no-content\\'><i class=\\'fas fa-video\\'></i> Video no disponible</div>'">
                </video>
                ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
            </div>
        `;
    } else if (mediaType === 'audio' && mediaUrl) {
        contentHtml = `
            <div class="story-preview">
                <div class="audio-content">
                    <i class="fas fa-music"></i>
                    <audio controls src="${escapeHtml(mediaUrl)}" 
                           onerror="this.style.display='none'; this.parentElement.querySelector('.fa-music').style.display='none'; this.parentElement.innerHTML+='<div style=\\'color:rgba(255,255,255,0.3);\\'>Audio no disponible</div>'">
                    </audio>
                    ${caption ? `<div style="color:rgba(255,255,255,0.4);font-size:13px;">${escapeHtml(caption)}</div>` : ''}
                </div>
            </div>
        `;
    } else if (mediaType === 'text' && textContent) {
        contentHtml = `
            <div class="story-preview">
                <div class="text-content" style="background:${escapeHtml(textBgColor)};">
                    ${escapeHtml(textContent)}
                </div>
                ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
            </div>
        `;
    } else {
        contentHtml = `
            <div class="story-preview">
                <div class="no-content">
                    <i class="fas fa-file-alt"></i>
                    Contenido no disponible
                    <div style="font-size:12px; margin-top:8px; color:rgba(255,255,255,0.2);">
                        Tipo: ${mediaType}
                    </div>
                </div>
            </div>
        `;
    }

    return contentHtml;
}

// ============================================================
// RENDERIZAR DENUNCIAS
// ============================================================

function renderReports(reportsList) {
    const container = document.getElementById('reportsList');

    container.innerHTML = reportsList.map(report => {
        const statusClass = report.status || 'pending';
        const analysisTags = [];
        
        if (report.analysis?.text?.level >= 3) {
            analysisTags.push('<span class="analysis-tag high">🔴 Texto grave</span>');
        } else if (report.analysis?.text?.level >= 2) {
            analysisTags.push('<span class="analysis-tag medium">🟡 Texto moderado</span>');
        }
        
        if (report.analysis?.image && report.analysis.image.is_nsfw && report.analysis.image.percentage > 70) {
            analysisTags.push('<span class="analysis-tag high">🖼️ Imagen NSFW</span>');
        } else if (report.analysis?.image && report.analysis.image.is_unknown) {
            analysisTags.push('<span class="analysis-tag medium">❓ No identificado</span>');
        }

        if (report.analysis?.combined?.autoFlagged) {
            analysisTags.push('<span class="analysis-tag high">🤖 Auto-flag</span>');
        }

        const statusLabels = {
            pending: 'Pendiente',
            reviewing: 'En revisión',
            resolved: 'Resuelta',
            dismissed: 'Desestimada',
            auto_hidden: 'Auto-ocultada'
        };

        const storyPreview = renderStoryPreview(report.storyData);

        return `
            <div class="report-item" data-report-id="${report.id}">
                <div class="header">
                    <div>
                        <span class="report-id">#${report.id}</span>
                        <span style="margin-left: 12px; font-size: 14px; font-weight: 500;">
                            ${report.reporterData?.fullName || 'Usuario'} 
                            <span style="color: rgba(255,255,255,0.3); font-weight: 400;">denunció a</span>
                            ${report.ownerData?.fullName || 'usuario'}
                        </span>
                    </div>
                    <div>
                        <span class="status-badge ${statusClass}">${statusLabels[statusClass] || statusClass}</span>
                    </div>
                </div>

                <div class="meta">
                    <span><i class="fas fa-tag"></i> ${report.category || 'other'}</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(report.createdAt).toLocaleString()}</span>
                    <span><i class="fas fa-${report.metadata?.mediaType === 'image' ? 'image' : report.metadata?.mediaType === 'video' ? 'video' : report.metadata?.mediaType === 'audio' ? 'music' : 'text'}"></i> ${report.metadata?.mediaType || 'text'}</span>
                    <span><i class="fas fa-chart-bar"></i> Score: ${report.analysis?.combined?.score || 0}%</span>
                    ${report.storyData?.mediaUrl ? `<span><i class="fas fa-link"></i> <a href="${escapeHtml(report.storyData.mediaUrl)}" target="_blank" style="color:#c084fc;text-decoration:none;">Ver original</a></span>` : ''}
                </div>

                <div class="analysis">
                    ${analysisTags.join('')}
                </div>

                ${storyPreview}

                <div class="reason">
                    <strong style="color: rgba(255,255,255,0.3);">Razón:</strong> ${escapeHtml(report.reason || 'Sin razón')}
                    ${report.description ? `<br><span style="color: rgba(255,255,255,0.3); font-size: 13px;">${escapeHtml(report.description)}</span>` : ''}
                </div>

                ${report.adminNote ? `
                    <div style="padding: 8px 12px; background: rgba(59,130,246,0.1); border-radius: 8px; margin: 8px 0; font-size: 13px; color: rgba(255,255,255,0.5);">
                        <i class="fas fa-sticky-note"></i> ${escapeHtml(report.adminNote)}
                    </div>
                ` : ''}

                <div class="actions">
                    ${statusClass === 'pending' || statusClass === 'reviewing' ? `
                        <button class="btn-review" onclick="updateReportStatus('${report.id}', 'reviewing')">
                            <i class="fas fa-eye"></i> Revisar
                        </button>
                        <button class="btn-resolve" onclick="updateReportStatus('${report.id}', 'resolved')">
                            <i class="fas fa-check"></i> Resolver
                        </button>
                        <button class="btn-dismiss" onclick="updateReportStatus('${report.id}', 'dismissed')">
                            <i class="fas fa-times"></i> Desestimar
                        </button>
                        <button class="btn-delete" onclick="deleteStoryFromReport('${report.id}')">
                            <i class="fas fa-trash"></i> Eliminar historia
                        </button>
                    ` : ''}
                    ${statusClass === 'auto_hidden' ? `
                        <button class="btn-resolve" onclick="updateReportStatus('${report.id}', 'resolved')">
                            <i class="fas fa-check"></i> Aprobar
                        </button>
                        <button class="btn-dismiss" onclick="updateReportStatus('${report.id}', 'dismissed')">
                            <i class="fas fa-times"></i> Desestimar
                        </button>
                    ` : ''}
                    <button class="btn-analyze" onclick="analyzeContent('${report.id}')">
                        <i class="fas fa-microscope"></i> Analizar contenido
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// CARGAR DENUNCIAS
// ============================================================

async function loadReports() {
    const container = document.getElementById('reportsList');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando denuncias...</div>';

    try {
        const response = await fetch(`${API_URL}/api/reports/all?limit=100`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando denuncias');
        }

        const data = await response.json();
        const reports = data.reports || [];

        if (reports.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No hay denuncias</h3>
                    <p>Todo tranquilo por ahora. ¡Sigue así!</p>
                </div>
            `;
            return;
        }

        renderReports(reports);

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ============================================================
// ACTUALIZAR ESTADO DE DENUNCIA
// ============================================================

window.updateReportStatus = async function(reportId, status) {
    try {
        const response = await fetch(`${API_URL}/api/reports/${reportId}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                status: status,
                adminNote: status === 'resolved' ? 'Resuelta por administrador' : 
                           status === 'dismissed' ? 'Desestimada por administrador' : 
                           'En revisión por administrador'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error actualizando estado');
        }

        showToast(`✅ Denuncia ${status === 'resolved' ? 'resuelta' : status === 'dismissed' ? 'desestimada' : 'en revisión'}`, false);
        await loadReports();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// ELIMINAR HISTORIA DESDE DENUNCIA
// ============================================================

window.deleteStoryFromReport = async function(reportId) {
    if (!confirm('¿Estás seguro de eliminar esta historia? Esta acción no se puede deshacer.')) return;

    try {
        const response = await fetch(`${API_URL}/api/reports/${reportId}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                status: 'resolved',
                adminNote: 'Historia eliminada por contenido inapropiado',
                action: 'delete_story'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error eliminando historia');
        }

        showToast('🗑️ Historia eliminada correctamente', false);
        await loadReports();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// ANÁLISIS DE CONTENIDO CON IA
// ============================================================

function closeAnalysisModal() {
    document.getElementById('analysisModal').classList.remove('active');
}

window.analyzeContent = async function(reportId) {
    const modal = document.getElementById('analysisModal');
    const resultDiv = document.getElementById('analysisResult');
    const btn = document.querySelector(`.btn-analyze[onclick*="${reportId}"]`);
    
    modal.classList.add('active');
    resultDiv.innerHTML = `
        <div style="text-align:center; padding: 40px; color: rgba(255,255,255,0.3);">
            <i class="fas fa-spinner fa-spin" style="font-size: 32px; display:block; margin-bottom:12px;"></i>
            Analizando contenido con IA...
        </div>
    `;

    if (btn) {
        btn.classList.add('analyzing');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando...';
    }

    try {
        const reportResponse = await fetch(`${API_URL}/api/reports/all?limit=200`, {
            headers: getHeaders()
        });

        if (!reportResponse.ok) throw new Error('Error obteniendo reporte');

        const data = await reportResponse.json();
        const report = data.reports.find(r => r.id === reportId);

        if (!report) {
            throw new Error('Reporte no encontrado');
        }

        const storyData = report.storyData || {};
        const mediaUrl = storyData.mediaUrl || '';
        const mediaType = storyData.mediaType || 'text';
        const caption = storyData.caption || '';
        const textContent = storyData.textContent || '';
        const storyId = report.storyId;

        let analysisHtml = `
            <div style="margin-bottom:16px;">
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                    <span style="background:rgba(192,132,252,0.1); padding:4px 12px; border-radius:12px; font-size:12px; color:#c084fc;">
                        <i class="fas fa-tag"></i> ${report.category || 'other'}
                    </span>
                    <span style="background:rgba(255,255,255,0.05); padding:4px 12px; border-radius:12px; font-size:12px; color:rgba(255,255,255,0.4);">
                        <i class="fas fa-${mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'music' : 'text'}"></i> ${mediaType}
                    </span>
                </div>
            </div>
        `;

        let iaResult = null;
        let isNsfw = false;
        let isUnknown = false;
        let isSafe = false;
        let nsfwConfidence = 0;
        let unknownConfidence = 0;

        // ANALIZAR IMAGEN CON IA
        if (mediaType === 'image' && mediaUrl && mediaUrl.startsWith('/uploads/')) {
            try {
                const imagePath = mediaUrl;
                const fullImagePath = `${window.location.origin}${imagePath}`;
                
                const iaResponse = await fetch(`${API_URL}/api/stories/analyze-image`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({ 
                        imageUrl: imagePath,
                        fullUrl: fullImagePath
                    })
                });

                if (iaResponse.ok) {
                    iaResult = await iaResponse.json();
                    
                    if (iaResult.label === 'nsfw') {
                        isNsfw = true;
                        nsfwConfidence = iaResult.percentage || iaResult.confidence * 100 || 0;
                    } else if (iaResult.label === 'unknown') {
                        isUnknown = true;
                        unknownConfidence = iaResult.percentage || iaResult.confidence * 100 || 0;
                    } else if (iaResult.label === 'safe') {
                        isSafe = true;
                    }
                    
                    let resultClass = 'analysis-result-unknown';
                    let icon = '❓';
                    let labelText = 'NO IDENTIFICADO';
                    let color = '#fbbf24';
                    
                    if (iaResult.label === 'nsfw') {
                        resultClass = 'analysis-result-nsfw';
                        icon = '🚫';
                        labelText = 'NSFW';
                        color = '#ef4444';
                    } else if (iaResult.label === 'safe') {
                        resultClass = 'analysis-result-safe';
                        icon = '✅';
                        labelText = 'SEGURA';
                        color = '#22c55e';
                    }
                    
                    analysisHtml += `
                        <div class="analysis-section ${resultClass}">
                            <h4><i class="fas fa-image"></i> Análisis de Imagen con IA</h4>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
                                <div>
                                    <div style="color:rgba(255,255,255,0.3); font-size:11px;">Clasificación</div>
                                    <div style="font-size:18px; font-weight:700; color:${color};">
                                        ${icon} ${labelText}
                                    </div>
                                </div>
                                <div>
                                    <div style="color:rgba(255,255,255,0.3); font-size:11px;">Confianza</div>
                                    <div style="font-size:18px; font-weight:700; color:#c084fc;">
                                        ${(iaResult.percentage || iaResult.confidence * 100 || 0).toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            ${iaResult.label === 'nsfw' && iaResult.percentage > 80 ? `
                                <div style="margin-top:10px; padding:10px; background:rgba(239,68,68,0.2); border-radius:8px; color:#ef4444;">
                                    <i class="fas fa-exclamation-triangle"></i> Contenido NSFW detectado con alta confianza
                                </div>
                            ` : ''}
                            ${iaResult.label === 'safe' ? `
                                <div style="margin-top:10px; padding:10px; background:rgba(34,197,94,0.2); border-radius:8px; color:#22c55e;">
                                    <i class="fas fa-check-circle"></i> Contenido seguro detectado
                                </div>
                            ` : ''}
                            ${iaResult.label === 'unknown' ? `
                                <div style="margin-top:10px; padding:10px; background:rgba(251,191,36,0.2); border-radius:8px; color:#fbbf24;">
                                    <i class="fas fa-question-circle"></i> Contenido no identificado (no es NSFW)
                                </div>
                            ` : ''}
                        </div>
                    `;

                    if (isNsfw && nsfwConfidence > 80) {
                        analysisHtml += `
                            <div class="action-result deleted" style="margin-top:12px; padding:14px; background:rgba(239,68,68,0.2); border-radius:10px; border:1px solid rgba(239,68,68,0.3);">
                                <i class="fas fa-trash" style="color:#ef4444; font-size:18px; margin-right:10px;"></i>
                                <strong style="color:#ef4444;">CONTENIDO NSFW DETECTADO</strong>
                                <div style="margin-top:6px; color:rgba(255,255,255,0.6); font-size:13px;">
                                    La imagen ha sido clasificada como NSFW con ${nsfwConfidence.toFixed(1)}% de confianza.
                                    <br>Eliminando historia y notificando al usuario...
                                </div>
                                <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                                    <button onclick="confirmDeleteStory('${reportId}', '${storyId}')" style="
                                        padding:8px 20px;
                                        background:#ef4444;
                                        border:none;
                                        border-radius:8px;
                                        color:white;
                                        font-weight:600;
                                        cursor:pointer;
                                        font-size:13px;
                                        font-family:inherit;
                                    ">
                                        <i class="fas fa-trash"></i> Confirmar Eliminación
                                    </button>
                                    <button onclick="closeAnalysisModal()" style="
                                        padding:8px 20px;
                                        background:rgba(255,255,255,0.1);
                                        border:none;
                                        border-radius:8px;
                                        color:rgba(255,255,255,0.6);
                                        cursor:pointer;
                                        font-size:13px;
                                        font-family:inherit;
                                    ">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        `;
                    } else if (isNsfw && nsfwConfidence > 60) {
                        analysisHtml += `
                            <div class="action-result suspicious" style="margin-top:12px; padding:14px; background:rgba(251,191,36,0.2); border-radius:10px; border:1px solid rgba(251,191,36,0.3);">
                                <i class="fas fa-exclamation-triangle" style="color:#fbbf24; font-size:18px; margin-right:10px;"></i>
                                <strong style="color:#fbbf24;">CONTENIDO SOSPECHOSO</strong>
                                <div style="margin-top:6px; color:rgba(255,255,255,0.6); font-size:13px;">
                                    La imagen ha sido clasificada como NSFW con ${nsfwConfidence.toFixed(1)}% de confianza.
                                    <br>Recomendamos revisar manualmente antes de eliminar.
                                </div>
                            </div>
                        `;
                    } else if (isUnknown) {
                        analysisHtml += `
                            <div class="action-result unknown" style="margin-top:12px; padding:14px; background:rgba(251,191,36,0.1); border-radius:10px; border:1px solid rgba(251,191,36,0.15);">
                                <i class="fas fa-info-circle" style="color:#fbbf24; font-size:18px; margin-right:10px;"></i>
                                <strong style="color:#fbbf24;">CONTENIDO NO IDENTIFICADO</strong>
                                <div style="margin-top:6px; color:rgba(255,255,255,0.6); font-size:13px;">
                                    La imagen ha sido clasificada como NO IDENTIFICADA con ${unknownConfidence.toFixed(1)}% de confianza.
                                    <br>Esto significa que la imagen no es NSFW ni segura, es algo no clasificado (animal, paisaje, comida, etc.).
                                </div>
                            </div>
                        `;
                    }
                } else {
                    analysisHtml += `
                        <div class="analysis-section" style="border-left-color:#ef4444;">
                            <h4><i class="fas fa-image"></i> Análisis de Imagen</h4>
                            <div style="color:rgba(255,255,255,0.3); font-size:13px;">
                                ❌ Error al analizar la imagen con IA
                            </div>
                        </div>
                    `;
                }
            } catch (error) {
                analysisHtml += `
                    <div class="analysis-section" style="border-left-color:#ef4444;">
                        <h4><i class="fas fa-image"></i> Análisis de Imagen</h4>
                        <div style="color:rgba(255,255,255,0.3); font-size:13px;">
                            ❌ Error al analizar imagen: ${error.message}
                        </div>
                    </div>
                `;
            }
        } else {
            analysisHtml += `
                <div class="analysis-section" style="border-left-color:#fbbf24;">
                    <h4><i class="fas fa-image"></i> Imagen</h4>
                    <div style="color:rgba(255,255,255,0.3); font-size:13px;">
                        ${mediaType === 'image' ? 'La imagen no está disponible localmente para analizar' : 'No hay imagen para analizar'}
                    </div>
                </div>
            `;
        }

        // Análisis de texto
        if (caption || textContent) {
            const textToAnalyze = caption || textContent;
            analysisHtml += `
                <div class="analysis-section">
                    <h4><i class="fas fa-font"></i> Análisis de Texto</h4>
                    <div style="color:rgba(255,255,255,0.5); font-size:13px; margin-top:4px;">
                        "${escapeHtml(textToAnalyze.substring(0, 200))}${textToAnalyze.length > 200 ? '...' : ''}"
                    </div>
                </div>
            `;
        }

        // Resumen final
        if (isNsfw && nsfwConfidence > 80) {
            analysisHtml += `
                <div style="margin-top:16px; padding:16px; background:rgba(239,68,68,0.15); border-radius:12px; border:1px solid rgba(239,68,68,0.3); text-align:center;">
                    <div style="font-size:20px; font-weight:700; color:#ef4444;">
                        🚫 CONTENIDO NSFW CONFIRMADO
                    </div>
                    <div style="color:rgba(255,255,255,0.5); font-size:14px; margin-top:4px;">
                        Confianza: ${nsfwConfidence.toFixed(1)}% - Se recomienda eliminar esta historia
                    </div>
                </div>
            `;
        } else if (isSafe) {
            analysisHtml += `
                <div style="margin-top:16px; padding:16px; background:rgba(34,197,94,0.15); border-radius:12px; border:1px solid rgba(34,197,94,0.3); text-align:center;">
                    <div style="font-size:20px; font-weight:700; color:#22c55e;">
                        ✅ CONTENIDO SEGURO
                    </div>
                    <div style="color:rgba(255,255,255,0.5); font-size:14px; margin-top:4px;">
                        No se detectó contenido inapropiado
                    </div>
                </div>
            `;
        } else if (isUnknown) {
            analysisHtml += `
                <div style="margin-top:16px; padding:16px; background:rgba(251,191,36,0.15); border-radius:12px; border:1px solid rgba(251,191,36,0.3); text-align:center;">
                    <div style="font-size:20px; font-weight:700; color:#fbbf24;">
                        ❓ CONTENIDO NO IDENTIFICADO
                    </div>
                    <div style="color:rgba(255,255,255,0.5); font-size:14px; margin-top:4px;">
                        La imagen no es NSFW ni segura. Puede ser un animal, paisaje, comida u objeto.
                    </div>
                </div>
            `;
        }

        resultDiv.innerHTML = analysisHtml;

    } catch (error) {
        console.error('Error analizando:', error);
        resultDiv.innerHTML = `
            <div class="analysis-section" style="border-left-color:#ef4444;">
                <h4><i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i> Error</h4>
                <div style="color:rgba(255,255,255,0.5); font-size:14px;">
                    ${error.message || 'Error al analizar el contenido'}
                </div>
            </div>
        `;
    } finally {
        if (btn) {
            btn.classList.remove('analyzing');
            btn.innerHTML = '<i class="fas fa-microscope"></i> Analizar contenido';
        }
    }
};

// ============================================================
// CONFIRMAR Y ELIMINAR HISTORIA NSFW
// ============================================================

window.confirmDeleteStory = async function(reportId, storyId) {
    if (!confirm('⚠️ ¿Estás seguro de eliminar esta historia NSFW? Esta acción no se puede deshacer y el usuario será notificado.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/reports/${reportId}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                status: 'resolved',
                adminNote: 'Historia eliminada por contenido NSFW (detectado automáticamente por IA)',
                action: 'delete_story'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error eliminando historia');
        }

        showToast('🗑️ Historia NSFW eliminada correctamente. Usuario notificado.', false);
        closeAnalysisModal();
        await loadReports();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// ADMINISTRADORES
// ============================================================

async function loadAdmins() {
    const container = document.getElementById('adminsList');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando administradores...</div>';

    try {
        const response = await fetch(`${API_URL}/api/users/admins`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando administradores');
        }

        const admins = await response.json();

        if (admins.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-shield"></i>
                    <h3>No hay administradores</h3>
                    <p>Registra el primer administrador</p>
                </div>
            `;
            return;
        }

        container.innerHTML = admins.map(admin => `
            <div class="admin-item">
                <div class="avatar">
                    ${admin.avatar ? `<img src="${admin.avatar}" alt="${admin.fullName}">` : (admin.fullName || admin.username || 'A').charAt(0).toUpperCase()}
                </div>
                <div class="info">
                    <div class="name">${admin.fullName || admin.username} 
                        ${admin.id === currentUser?.id ? '<span style="color: #c084fc; font-size: 12px;">(tú)</span>' : ''}
                    </div>
                    <div class="email">${admin.email} · @${admin.username}</div>
                </div>
                ${admin.id !== currentUser?.id ? `
                    <button class="remove-btn" onclick="removeAdmin('${admin.id}')">
                        <i class="fas fa-user-minus"></i> Remover
                    </button>
                ` : ''}
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

window.removeAdmin = async function(adminId) {
    if (!confirm('¿Estás seguro de remover este administrador?')) return;

    try {
        const response = await fetch(`${API_URL}/api/users/admin/${adminId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error removiendo administrador');
        }

        showToast('✅ Administrador removido', false);
        await loadAdmins();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// REGISTRAR ADMINISTRADOR
// ============================================================

document.getElementById('registerAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('.submit-btn');
    const messageEl = document.getElementById('registerMessage');

    const data = {
        username: document.getElementById('regUsername').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        fullName: document.getElementById('regFullName').value.trim(),
        password: document.getElementById('regPassword').value
    };

    if (!data.username || !data.email || !data.fullName || !data.password) {
        messageEl.innerHTML = '<span style="color: #ef4444;">❌ Todos los campos son requeridos</span>';
        return;
    }

    if (data.password.length < 6) {
        messageEl.innerHTML = '<span style="color: #ef4444;">❌ La contraseña debe tener al menos 6 caracteres</span>';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    messageEl.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/api/users/register-admin`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.innerHTML = `<span style="color: #22c55e;">✅ ${result.message}</span>`;
            form.reset();
            await loadAdmins();
            await loadStats();
            showToast('👑 Administrador registrado correctamente', false);
        } else {
            messageEl.innerHTML = `<span style="color: #ef4444;">❌ ${result.error || 'Error al registrar'}</span>`;
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.innerHTML = `<span style="color: #ef4444;">❌ Error: ${error.message}</span>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-shield"></i> Registrar Administrador';
    }
});

// ============================================================
// 🔥 VERIFICACIÓN DE CUENTAS
// ============================================================

// Cargar lista de usuarios verificados
async function loadVerifiedUsers() {
    const container = document.getElementById('verifiedList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando usuarios verificados...</div>';

    try {
        const response = await fetch(`${API_URL}/api/verified/verified?limit=50`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando usuarios verificados');
        }

        const users = await response.json();

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No hay usuarios verificados</h3>
                    <p>Los usuarios verificados aparecerán aquí</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="admin-item">
                <div class="avatar" style="background: linear-gradient(135deg, #22c55e, #16a34a);">
                    ${user.avatar ? `<img src="${user.avatar}" alt="${user.fullName}">` : (user.fullName || user.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div class="info">
                    <div class="name">${user.fullName || user.username} 
                        <span style="color: #22c55e; font-size: 12px; background: rgba(34,197,94,0.15); padding: 2px 10px; border-radius: 12px;">
                            <i class="fas fa-check-circle"></i> Verificado
                        </span>
                        ${user.accountType === 'business_verified' ? '<span style="color: #fbbf24; font-size: 12px;">🏢 Empresa</span>' : ''}
                    </div>
                    <div class="email">@${user.username} · ${user.followersCount || 0} seguidores</div>
                    ${user.verifiedAt ? `<div class="email" style="color: rgba(255,255,255,0.2);">Verificado: ${new Date(user.verifiedAt).toLocaleDateString()}</div>` : ''}
                </div>
                ${user.accountType !== 'business_verified' ? `
                    <button class="remove-btn" onclick="unverifyUser('${user.id}')" style="background: rgba(239,68,68,0.15); color: #ef4444;">
                        <i class="fas fa-times-circle"></i> Quitar verificación
                    </button>
                ` : ''}
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Cargar lista de cuentas de empresa
async function loadBusinessAccounts() {
    const container = document.getElementById('businessList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando cuentas de empresa...</div>';

    try {
        const response = await fetch(`${API_URL}/api/verified/business?limit=50`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando cuentas de empresa');
        }

        const users = await response.json();

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-building"></i>
                    <h3>No hay cuentas de empresa</h3>
                    <p>Las cuentas de empresa aparecerán aquí</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="admin-item">
                <div class="avatar" style="background: linear-gradient(135deg, #fbbf24, #f59e0b);">
                    ${user.avatar ? `<img src="${user.avatar}" alt="${user.fullName}">` : (user.fullName || user.username || 'B').charAt(0).toUpperCase()}
                </div>
                <div class="info">
                    <div class="name">${user.fullName || user.username} 
                        <span style="color: #fbbf24; font-size: 12px; background: rgba(251,191,36,0.15); padding: 2px 10px; border-radius: 12px;">
                            🏢 Empresa
                        </span>
                        ${user.isVerified ? '<span style="color: #22c55e; font-size: 12px;">✅ Verificada</span>' : ''}
                    </div>
                    <div class="email">@${user.username} · ${user.followersCount || 0} seguidores</div>
                    ${user.businessInfo ? `
                        <div class="email" style="color: rgba(255,255,255,0.3);">
                            ${user.businessInfo.name || ''} · ${user.businessInfo.type || ''}
                        </div>
                    ` : ''}
                </div>
                ${!user.isVerified ? `
                    <button class="remove-btn" onclick="verifyBusinessUser('${user.id}')" style="background: rgba(34,197,94,0.15); color: #22c55e;">
                        <i class="fas fa-check-circle"></i> Verificar empresa
                    </button>
                ` : ''}
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Cargar solicitudes de verificación/empresa pendientes
async function loadPendingBusinessRequests() {
    const container = document.getElementById('pendingBusinessRequests');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando solicitudes...</div>';

    try {
        const response = await fetch(`${API_URL}/api/verified/business/requests`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando solicitudes');
        }

        const requests = await response.json();
        const pending = requests.filter(r => r.status === 'pending');

        if (pending.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No hay solicitudes pendientes</h3>
                    <p>Todas las solicitudes han sido procesadas</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pending.map(req => `
            <div class="admin-item">
                <div class="avatar" style="background: linear-gradient(135deg, #fbbf24, #f59e0b);">
                    ${req.user?.avatar ? `<img src="${req.user.avatar}" alt="${req.user.fullName}">` : (req.user?.fullName || req.user?.username || 'B').charAt(0).toUpperCase()}
                </div>
                <div class="info">
                    <div class="name">${req.user?.fullName || req.user?.username || 'Usuario'} 
                        <span style="color: #fbbf24; font-size: 12px; background: rgba(251,191,36,0.15); padding: 2px 10px; border-radius: 12px;">
                            ⏳ Pendiente
                        </span>
                    </div>
                    <div class="email">@${req.user?.username || 'usuario'} · ${req.businessName || 'Sin nombre'}</div>
                    <div class="email" style="color: rgba(255,255,255,0.3);">
                        ${req.businessType || ''} · Solicitado: ${new Date(req.requestedAt).toLocaleDateString()}
                    </div>
                </div>
                <button class="remove-btn" onclick="approveBusinessRequest('${req.userId}')" style="background: rgba(34,197,94,0.15); color: #22c55e;">
                    <i class="fas fa-check"></i> Aprobar
                </button>
                <button class="remove-btn" onclick="rejectBusinessRequest('${req.userId}')" style="background: rgba(239,68,68,0.15); color: #ef4444;">
                    <i class="fas fa-times"></i> Rechazar
                </button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ============================================================
// 🔥 PUBLICIDADES - ADMIN
// ============================================================

// Cargar publicidades pendientes
async function loadPendingAds() {
    const container = document.getElementById('pendingAdsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando publicidades pendientes...</div>';

    try {
        const response = await fetch(`${API_URL}/api/ads/pending`, {
            headers: getHeaders()
        });

        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Acceso denegado</h3>
                        <p>No tienes permisos</p>
                    </div>
                `;
                return;
            }
            throw new Error('Error cargando publicidades pendientes');
        }

        const data = await response.json();
        const ads = data.ads || [];

        if (ads.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No hay publicidades pendientes</h3>
                    <p>Todas las publicidades han sido revisadas</p>
                </div>
            `;
            return;
        }

        container.innerHTML = ads.map(ad => `
            <div class="report-item">
                <div class="header">
                    <div>
                        <span class="report-id">#${ad.id.substring(0, 8)}</span>
                        <span style="margin-left: 12px; font-size: 14px; font-weight: 500;">
                            ${ad.user?.fullName || 'Empresa'} 
                            <span style="color: rgba(255,255,255,0.3); font-weight: 400;">publicó</span>
                            <span style="color: #fbbf24;">${escapeHtml(ad.title)}</span>
                        </span>
                    </div>
                    <div>
                        <span class="status-badge pending">⏳ Pendiente</span>
                    </div>
                </div>

                <div class="meta">
                    <span><i class="fas fa-building"></i> ${escapeHtml(ad.businessName || 'Empresa')}</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(ad.createdAt).toLocaleString()}</span>
                    <span><i class="fas fa-clock"></i> ${ad.durationDays || 7} días</span>
                    <span><i class="fas fa-users"></i> ${ad.targetAudience || 'all'}</span>
                </div>

                ${ad.imageUrl ? `
                    <div class="story-preview">
                        <img src="${ad.imageUrl}" alt="Publicidad" loading="lazy" 
                             onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'no-content\\'><i class=\\'fas fa-image\\'></i> Imagen no disponible</div>'">
                        <div class="caption">${escapeHtml(ad.title)}</div>
                    </div>
                ` : ''}

                <div style="margin: 12px 0; padding: 12px 16px; background: rgba(0,0,0,0.3); border-radius: 10px; font-size: 14px; color: rgba(255,255,255,0.7); border-left: 3px solid rgba(251,191,36,0.3);">
                    <strong style="color: rgba(255,255,255,0.3);">Descripción:</strong><br>
                    ${escapeHtml(ad.description)}
                </div>

                ${ad.linkUrl ? `
                    <div style="margin: 8px 0; font-size: 13px; color: rgba(255,255,255,0.3);">
                        <i class="fas fa-link"></i> <a href="${escapeHtml(ad.linkUrl)}" target="_blank" style="color: #c084fc; text-decoration: none;">${escapeHtml(ad.linkUrl)}</a>
                    </div>
                ` : ''}

                <div class="actions">
                    <button class="btn-review" onclick="approveAd('${ad.id}')" style="background: rgba(34,197,94,0.2); color: #22c55e;">
                        <i class="fas fa-check"></i> Aprobar publicidad
                    </button>
                    <button class="btn-dismiss" onclick="rejectAd('${ad.id}')" style="background: rgba(239,68,68,0.2); color: #ef4444;">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Aprobar publicidad
window.approveAd = async function(adId) {
    if (!confirm('¿Aprobar esta publicidad? Aparecerá en el feed de los usuarios.')) return;

    try {
        const response = await fetch(`${API_URL}/api/ads/approve/${adId}`, {
            method: 'POST',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al aprobar publicidad');
        }

        showToast('✅ Publicidad aprobada correctamente', false);
        await loadPendingAds();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// Rechazar publicidad
window.rejectAd = async function(adId) {
    const reason = prompt('Motivo del rechazo (opcional):');
    
    try {
        const response = await fetch(`${API_URL}/api/ads/reject/${adId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ reason: reason || 'No cumple con las políticas de la plataforma' })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al rechazar publicidad');
        }

        showToast('❌ Publicidad rechazada', false);
        await loadPendingAds();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// ACCIONES DE VERIFICACIÓN
// ============================================================

// Quitar verificación a un usuario
window.unverifyUser = async function(userId) {
    if (!confirm('¿Estás seguro de quitar la verificación a este usuario?')) return;

    try {
        const response = await fetch(`${API_URL}/api/verified/unverify/${userId}`, {
            method: 'POST',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al quitar verificación');
        }

        showToast('✅ Verificación removida correctamente', false);
        await loadVerifiedUsers();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// Verificar una cuenta de empresa
window.verifyBusinessUser = async function(userId) {
    if (!confirm('¿Estás seguro de verificar esta cuenta de empresa?')) return;

    try {
        const response = await fetch(`${API_URL}/api/verified/verify/${userId}`, {
            method: 'POST',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al verificar empresa');
        }

        showToast('✅ Empresa verificada correctamente', false);
        await loadBusinessAccounts();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// Aprobar solicitud de empresa
window.approveBusinessRequest = async function(userId) {
    if (!confirm('¿Aprobar esta solicitud de cuenta de empresa?')) return;

    try {
        const response = await fetch(`${API_URL}/api/verified/business/approve/${userId}`, {
            method: 'POST',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al aprobar solicitud');
        }

        showToast('✅ Solicitud de empresa aprobada correctamente', false);
        await loadPendingBusinessRequests();
        await loadBusinessAccounts();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// Rechazar solicitud de empresa
window.rejectBusinessRequest = async function(userId) {
    if (!confirm('¿Rechazar esta solicitud de cuenta de empresa?')) return;

    try {
        const response = await fetch(`${API_URL}/api/verified/business/requests/${userId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al rechazar solicitud');
        }

        showToast('❌ Solicitud rechazada', false);
        await loadPendingBusinessRequests();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// Ejecutar verificación masiva
window.runMassVerification = async function() {
    if (!confirm('⚠️ ¿Ejecutar verificación masiva? Esto verificará automáticamente todas las cuentas que cumplan con el requisito de seguidores.')) return;

    try {
        const response = await fetch(`${API_URL}/api/verified/run-verification`, {
            method: 'POST',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al ejecutar verificación');
        }

        const result = await response.json();
        showToast(`✅ Verificación masiva completada: ${result.verifiedCount || 0} cuentas verificadas`, false);
        await loadVerifiedUsers();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        showToast(`❌ ${error.message}`, true);
    }
};

// ============================================================
// TABS
// ============================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

        // Cargar contenido según la tab
        if (btn.dataset.tab === 'admins') {
            loadAdmins();
        } else if (btn.dataset.tab === 'verified') {
            loadVerifiedUsers();
        } else if (btn.dataset.tab === 'business') {
            loadBusinessAccounts();
        } else if (btn.dataset.tab === 'requests') {
            loadPendingBusinessRequests();
        } else if (btn.dataset.tab === 'ads') {
            loadPendingAds();
        }
    });
});

// ============================================================
// SOCKET.IO
// ============================================================

function initSocket() {
    const token = getToken();
    if (!token) return;

    try {
        const socket = io(API_URL, {
            auth: { token }
        });

        socket.on('new_report', () => {
            showToast('📢 Nueva denuncia recibida', false);
            loadReports();
            loadStats();
        });

        socket.on('high_priority_report', (data) => {
            showToast(`🔴 DENUNCIA PRIORIDAD ALTA - Score: ${data.combinedScore || 0}%`, true);
            loadReports();
            loadStats();
        });

        socket.on('report_status_updated', (data) => {
            showToast(`📢 Denuncia ${data.status === 'resolved' ? 'resuelta' : 'actualizada'}`, false);
            loadReports();
            loadStats();
        });

        socket.on('account_verified', (data) => {
            showToast(`👑 Cuenta verificada: ${data.userId}`, false);
            loadVerifiedUsers();
            loadStats();
        });

        socket.on('new_business_request', (data) => {
            showToast(`📊 Nueva solicitud de empresa: ${data.businessName}`, false);
            loadPendingBusinessRequests();
            loadStats();
        });

        socket.on('business_account_approved', (data) => {
            showToast(`✅ Cuenta de empresa aprobada`, false);
            loadBusinessAccounts();
            loadPendingBusinessRequests();
            loadStats();
        });

        socket.on('new_ad_pending', (data) => {
            showToast(`📢 Nueva publicidad pendiente: ${data.title}`, false);
            loadPendingAds();
            loadStats();
        });

        socket.on('ad_approved', (data) => {
            showToast(`✅ Publicidad aprobada: ${data.title}`, false);
            loadPendingAds();
            loadStats();
        });

        socket.on('ad_rejected', (data) => {
            showToast(`❌ Publicidad rechazada: ${data.title}`, false);
            loadPendingAds();
            loadStats();
        });

        socket.on('connect_error', (error) => {
            console.warn('⚠️ Socket error:', error);
        });
    } catch (e) {
        console.warn('⚠️ Socket no disponible:', e.message);
    }
}

// ============================================================
// LOGOUT
// ============================================================

document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
});

// ============================================================
// CERRAR MODAL CON ESC
// ============================================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAnalysisModal();
    }
});

document.getElementById('analysisModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeAnalysisModal();
    }
});

// ============================================================
// INICIALIZAR
// ============================================================

async function init() {
    // Restaurar sesión
    const token = getToken();
    const user = getCurrentUser();
    if (token && user) {
        console.log('✅ Sesión restaurada:', user.username);
    }
    
    const isAuth = await checkAuth();
    if (!isAuth) return;

    await loadStats();
    await loadReports();
    await loadAdmins();
    await loadVerifiedUsers();
    await loadBusinessAccounts();
    await loadPendingBusinessRequests();
    await loadPendingAds();

    setTimeout(initSocket, 500);

    console.log('👑 Panel de administración inicializado');
    console.log(`   Admin: ${currentUser?.fullName} (@${currentUser?.username})`);
    console.log('   📌 Botón "Analizar contenido" clasifica con IA (3 clases)');
    console.log('   👑 Gestión de cuentas verificadas');
    console.log('   🏢 Gestión de cuentas de empresa');
    console.log('   📢 Gestión de publicidades pendientes');
}

document.addEventListener('DOMContentLoaded', init);