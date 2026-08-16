// ============================================================
// survey-modal.js - MODAL DE ENCUESTAS (SOLO POLL)
// ============================================================

import { getToken, getCurrentUser, showToast } from './auth.js';
import { t, onLocaleChange } from './i18n.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO
// ============================================================

let isOpen = false;
let onPublishCallback = null;

let surveyData = {
    type: 'poll',
    question: '',
    options: [{ id: '1', label: '' }, { id: '2', label: '' }],
    allowMultiple: false,
    anonymous: false,
    showResults: false,
    expiresIn: 24
};
let currentStep = 'type';
let isPublishing = false;
let localeUnsubscribe = null;

// ============================================================
// FUNCIONES PRINCIPALES
// ============================================================

export function openSurveyModal(callback) {
    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para crear encuestas', true);
        return;
    }

    if (isOpen) {
        closeSurveyModal();
        return;
    }

    isOpen = true;
    onPublishCallback = callback || null;
    resetSurveyData();
    currentStep = 'type';

    if (!document.getElementById('surveyModalOverlay')) {
        createSurveyModalHTML();
    }

    const overlay = document.getElementById('surveyModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        showStep('type');
        renderSurveyOptions();
        initI18nForSurvey();
        setTimeout(translateSurveyUI, 100);
    }
}

export function closeSurveyModal() {
    isOpen = false;
    const overlay = document.getElementById('surveyModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (localeUnsubscribe) {
        localeUnsubscribe();
        localeUnsubscribe = null;
    }
}

function resetSurveyData() {
    surveyData = {
        type: 'poll',
        question: '',
        options: [{ id: '1', label: '' }, { id: '2', label: '' }],
        allowMultiple: false,
        anonymous: false,
        showResults: false,
        expiresIn: 24
    };
    currentStep = 'type';
}

// ============================================================
// TRADUCCIÓN
// ============================================================

function initI18nForSurvey() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    localeUnsubscribe = onLocaleChange(() => {
        if (isOpen) translateSurveyUI();
    });
}

function translateSurveyUI() {
    const overlay = document.getElementById('surveyModalOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;

    overlay.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text && text !== key) {
            const hasChild = el.querySelector('i, span, .required');
            if (hasChild) {
                const childNodes = el.childNodes;
                for (const node of childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        node.textContent = text;
                        break;
                    }
                }
            } else {
                el.textContent = text;
            }
        }
    });

    overlay.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = t(key);
        if (text && text !== key) {
            el.placeholder = text;
        }
    });
}

// ============================================================
// CREAR HTML DEL MODAL - SOLO POLL
// ============================================================

function createSurveyModalHTML() {
    if (document.getElementById('surveyModalOverlay')) return;

    const html = `
        <div id="surveyModalOverlay" class="survey-modal-overlay">
            <div class="survey-modal-content">
                <div class="survey-modal-header">
                    <button class="btn-close" onclick="window.closeSurveyModal()">
                        <i class="fas fa-times"></i>
                    </button>
                    <span class="title" data-i18n="survey.create">📊 Crear encuesta</span>
                    <button class="btn-publish" id="surveyPublishBtn" onclick="window.publishSurvey()">
                        <i class="fas fa-paper-plane"></i> <span data-i18n="action.publish">Publicar</span>
                    </button>
                </div>

                <div class="survey-modal-body" id="surveyModalBody">

                    <!-- STEP 1: PREGUNTA Y OPCIONES -->
                    <div class="survey-step" id="surveyStepType">
                        <div class="survey-form-group">
                            <label data-i18n="survey.question">Pregunta / Título</label>
                            <input type="text" id="surveyQuestionInput" data-i18n-placeholder="survey.questionPlaceholder" placeholder="Ej: ¿Cuál es tu color favorito?" maxlength="200" />
                            <small class="char-counter" id="surveyQuestionCounter">0/200</small>
                        </div>

                        <div id="surveyOptionsContainer">
                            <label data-i18n="survey.options">Opciones</label>
                            <div id="surveyOptionsList"></div>
                            <button class="btn-add-option" onclick="window.addSurveyOption()">
                                <i class="fas fa-plus"></i> <span data-i18n="survey.addOption">Añadir opción</span>
                            </button>
                        </div>

                        <div class="survey-options-row">
                            <button class="btn-next" onclick="window.goToSurveyStep('settings')">
                                <span data-i18n="action.continue">Continuar</span> <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>

                    <!-- STEP 2: CONFIGURACIÓN -->
                    <div class="survey-step" id="surveyStepSettings" style="display:none;">
                        <h3 data-i18n="survey.settings">Configuración</h3>
                        
                        <div class="survey-toggle-group">
                            <label class="toggle-label">
                                <span data-i18n="survey.allowMultiple">Permitir múltiples votos</span>
                                <input type="checkbox" id="surveyAllowMultiple" />
                                <span class="toggle-slider"></span>
                            </label>
                            <label class="toggle-label">
                                <span data-i18n="survey.anonymous">Votos anónimos</span>
                                <input type="checkbox" id="surveyAnonymous" />
                                <span class="toggle-slider"></span>
                            </label>
                            <label class="toggle-label">
                                <span data-i18n="survey.showResults">Mostrar resultados</span>
                                <input type="checkbox" id="surveyShowResults" />
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="survey-form-group">
                            <label data-i18n="survey.expiresIn">Expira en (horas)</label>
                            <select id="surveyExpiresIn">
                                <option value="1">1 <span data-i18n="survey.hour">hora</span></option>
                                <option value="6">6 <span data-i18n="survey.hours">horas</span></option>
                                <option value="12">12 <span data-i18n="survey.hours">horas</span></option>
                                <option value="24" selected>24 <span data-i18n="survey.hours">horas</span></option>
                                <option value="48">48 <span data-i18n="survey.hours">horas</span></option>
                                <option value="72">72 <span data-i18n="survey.hours">horas</span></option>
                                <option value="168">7 <span data-i18n="survey.days">días</span></option>
                            </select>
                        </div>

                        <div class="survey-options-row">
                            <button class="btn-back" onclick="window.goToSurveyStep('type')">
                                <i class="fas fa-arrow-left"></i> <span data-i18n="action.back">Volver</span>
                            </button>
                            <button class="btn-publish" onclick="window.publishSurvey()">
                                <i class="fas fa-paper-plane"></i> <span data-i18n="action.publish">Publicar</span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
    setupSurveyEvents();
    injectSurveyStyles();
}

// ============================================================
// EVENTOS
// ============================================================

function setupSurveyEvents() {
    const questionInput = document.getElementById('surveyQuestionInput');
    const counter = document.getElementById('surveyQuestionCounter');
    questionInput?.addEventListener('input', () => {
        if (counter) counter.textContent = `${questionInput.value.length}/200`;
    });
}

// ============================================================
// NAVEGACIÓN
// ============================================================

function showStep(step) {
    currentStep = step;
    document.querySelectorAll('.survey-step').forEach(el => {
        el.style.display = 'none';
    });

    const stepMap = {
        'type': 'surveyStepType',
        'settings': 'surveyStepSettings'
    };

    const stepEl = document.getElementById(stepMap[step]);
    if (stepEl) stepEl.style.display = 'block';
}

window.goToSurveyStep = function(step) {
    if (step === 'type') {
        renderSurveyOptions();
    }
    showStep(step);
};

// ============================================================
// OPCIONES (POLL)
// ============================================================

window.addSurveyOption = function() {
    const options = surveyData.options;
    if (options.length >= 10) {
        showToast(t('survey.maxOptions') || 'Máximo 10 opciones', true);
        return;
    }
    const newId = (Math.max(...options.map(o => parseInt(o.id)), 0) + 1).toString();
    options.push({ id: newId, label: '' });
    renderSurveyOptions();
};

window.removeSurveyOption = function(id) {
    const options = surveyData.options;
    if (options.length <= 2) {
        showToast(t('survey.minOptions') || 'Mínimo 2 opciones', true);
        return;
    }
    surveyData.options = options.filter(o => o.id !== id);
    renderSurveyOptions();
};

function renderSurveyOptions() {
    const container = document.getElementById('surveyOptionsList');
    if (!container) return;

    container.innerHTML = surveyData.options.map((opt, index) => `
        <div class="survey-option-item">
            <span class="option-number">${index + 1}</span>
            <input type="text" value="${opt.label}" placeholder="${t('survey.optionPlaceholder') || 'Opción...'}"
                   data-option-id="${opt.id}" class="poll-option-input" />
            <button class="btn-remove-option" onclick="window.removeSurveyOption('${opt.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.poll-option-input').forEach(input => {
        input.addEventListener('input', () => {
            const id = input.dataset.optionId;
            const option = surveyData.options.find(o => o.id === id);
            if (option) option.label = input.value;
        });
    });
}

// ============================================================
// PUBLICAR
// ============================================================

window.publishSurvey = async function() {
    if (isPublishing) return;

    const token = getToken();
    if (!token) {
        showToast(t('error.unauthorized') || 'Inicia sesión para publicar', true);
        return;
    }

    const questionInput = document.getElementById('surveyQuestionInput');
    const question = questionInput?.value.trim();
    if (!question) {
        showToast(t('survey.enterQuestion') || 'Ingresa una pregunta', true);
        return;
    }

    const options = surveyData.options
        .filter(o => o.label && o.label.trim())
        .map(o => ({
            id: o.id || Math.random().toString(36).substring(2, 8),
            label: o.label.trim(),
            votes: 0
        }));
    
    if (options.length < 2) {
        showToast(t('survey.needOptions') || 'Necesitas al menos 2 opciones', true);
        return;
    }

    const dataToSend = {
        surveyType: 'poll',
        question: question,
        options: options,
        allowMultiple: document.getElementById('surveyAllowMultiple')?.checked || false,
        anonymous: document.getElementById('surveyAnonymous')?.checked || false,
        showResults: document.getElementById('surveyShowResults')?.checked || false,
        expiresIn: parseInt(document.getElementById('surveyExpiresIn')?.value) || 24
    };

    console.log('📊 [SURVEY] Datos a enviar:', JSON.stringify(dataToSend, null, 2));

    isPublishing = true;
    const publishBtn = document.getElementById('surveyPublishBtn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (t('action.publishing') || 'Publicando...');
    }

    try {
        const response = await fetch(`${API_URL}/api/stories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mediaType: 'survey',
                caption: question,
                surveyData: dataToSend
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(t('survey.published') || '📊 Encuesta publicada');
            closeSurveyModal();
            if (typeof window.closeCreator === 'function') {
                window.closeCreator();
            }
            if (window.refreshFeed) setTimeout(() => window.refreshFeed(), 500);
            if (onPublishCallback) onPublishCallback(data);
        } else {
            console.error('❌ Error del servidor:', data);
            showToast(data.error || t('error.general') || 'Error al publicar', true);
        }
    } catch (error) {
        console.error('❌ Error publicando encuesta:', error);
        showToast(t('error.network') || 'Error de conexión', true);
    } finally {
        isPublishing = false;
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<i class="fas fa-paper-plane"></i> <span data-i18n="action.publish">Publicar</span>`;
        }
    }
};

// ============================================================
// FUNCIONES GLOBALES (window)
// ============================================================

window.closeSurveyModal = closeSurveyModal;
window.publishSurvey = window.publishSurvey;

// ============================================================
// ESTILOS
// ============================================================

function injectSurveyStyles() {
    if (document.getElementById('surveyModalStyles')) return;

    const styles = document.createElement('style');
    styles.id = 'surveyModalStyles';
    styles.textContent = `
        .survey-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 10050;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        }
        .survey-modal-overlay.active { display: flex; }

        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .survey-modal-content {
            background: linear-gradient(145deg, #1a1a3e, #0d0d2b);
            border-radius: 24px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(192,132,252,0.15);
            box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(192,132,252,0.05);
        }

        .survey-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            flex-shrink: 0;
            background: rgba(255,255,255,0.02);
        }
        .survey-modal-header .btn-close {
            background: rgba(255,255,255,0.06);
            border: none;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            color: rgba(255,255,255,0.5);
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .survey-modal-header .btn-close:hover {
            background: rgba(255,255,255,0.12);
            color: #fff;
            transform: rotate(90deg);
        }
        .survey-modal-header .btn-close:active { transform: scale(0.9) rotate(90deg); }
        
        .survey-modal-header .title {
            font-weight: 700;
            font-size: 17px;
            background: linear-gradient(135deg, #c084fc, #db2777);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .survey-modal-header .btn-publish {
            background: linear-gradient(135deg, #c084fc, #a855f7);
            border: none;
            border-radius: 50px;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            color: #fff;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: inherit;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(192,132,252,0.3);
        }
        .survey-modal-header .btn-publish:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(192,132,252,0.4);
        }
        .survey-modal-header .btn-publish:active { 
            transform: scale(0.95) translateY(0);
        }
        .survey-modal-header .btn-publish:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .survey-modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        .survey-modal-body::-webkit-scrollbar { width: 4px; }
        .survey-modal-body::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, rgba(192,132,252,0.3), rgba(219,39,119,0.3));
            border-radius: 10px;
        }

        .survey-step {
            display: flex;
            flex-direction: column;
            gap: 16px;
            animation: slideUp 0.4s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .survey-step h3 {
            color: #fff;
            font-size: 18px;
            font-weight: 600;
            text-align: center;
            margin: 0;
        }

        .survey-form-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .survey-form-group label {
            color: rgba(255,255,255,0.5);
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .survey-form-group input,
        .survey-form-group select {
            padding: 12px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        .survey-form-group input:focus { 
            border-color: #c084fc;
            box-shadow: 0 0 0 3px rgba(192,132,252,0.15);
            background: rgba(255,255,255,0.07);
        }
        .survey-form-group input::placeholder { color: rgba(255,255,255,0.2); }
        .survey-form-group .char-counter {
            color: rgba(255,255,255,0.15);
            font-size: 10px;
            text-align: right;
        }
        .survey-form-group select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.3)' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
            padding-right: 40px;
            cursor: pointer;
        }
        .survey-form-group select option {
            background: #1a1a3e;
            color: #fff;
        }

        .survey-option-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .survey-option-item .option-number {
            color: rgba(255,255,255,0.15);
            font-size: 12px;
            font-weight: 600;
            min-width: 20px;
            text-align: center;
        }
        .survey-option-item input {
            flex: 1;
            padding: 10px 14px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 10px;
            color: #fff;
            font-size: 13px;
            outline: none;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        .survey-option-item input:focus { 
            border-color: #c084fc;
            box-shadow: 0 0 0 3px rgba(192,132,252,0.1);
        }
        
        .survey-option-item .btn-remove-option {
            background: rgba(255,255,255,0.05);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            color: rgba(255,255,255,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            font-size: 14px;
            flex-shrink: 0;
        }
        .survey-option-item .btn-remove-option:hover {
            background: rgba(255,107,107,0.15);
            color: #ff6b6b;
        }
        .survey-option-item .btn-remove-option:active {
            transform: scale(0.85);
        }

        .btn-add-option {
            background: rgba(255,255,255,0.04);
            border: 1px dashed rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 10px;
            color: rgba(255,255,255,0.3);
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: inherit;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            font-weight: 500;
        }
        .btn-add-option:hover {
            background: rgba(255,255,255,0.08);
            border-color: rgba(192,132,252,0.3);
            color: rgba(255,255,255,0.5);
        }
        .btn-add-option:active { transform: scale(0.97); }

        .survey-toggle-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .toggle-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.04);
        }
        .toggle-label:hover { 
            background: rgba(255,255,255,0.06);
            border-color: rgba(255,255,255,0.08);
        }
        .toggle-label span {
            color: rgba(255,255,255,0.6);
            font-size: 13px;
            font-weight: 500;
        }
        .toggle-label input { display: none; }
        .toggle-label .toggle-slider {
            width: 44px;
            height: 24px;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            position: relative;
            transition: all 0.3s ease;
            flex-shrink: 0;
        }
        .toggle-label .toggle-slider::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .toggle-label input:checked + .toggle-slider { 
            background: linear-gradient(135deg, #c084fc, #a855f7);
        }
        .toggle-label input:checked + .toggle-slider::after { transform: translateX(20px); }

        .survey-options-row {
            display: flex;
            gap: 12px;
            margin-top: 8px;
        }
        .survey-options-row .btn-back,
        .survey-options-row .btn-next,
        .survey-options-row .btn-publish {
            flex: 1;
            padding: 14px;
            border: none;
            border-radius: 14px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            position: relative;
            overflow: hidden;
        }
        .survey-options-row .btn-back {
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.5);
            border: 1px solid rgba(255,255,255,0.06);
        }
        .survey-options-row .btn-back:hover {
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.8);
            transform: translateY(-2px);
        }
        .survey-options-row .btn-back:active { transform: scale(0.95); }
        
        .survey-options-row .btn-next {
            background: linear-gradient(135deg, #fff, #e8e8e8);
            color: #000;
            box-shadow: 0 4px 15px rgba(255,255,255,0.15);
        }
        .survey-options-row .btn-next:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(255,255,255,0.2);
        }
        .survey-options-row .btn-next:active { transform: scale(0.95); }
        
        .survey-options-row .btn-publish {
            background: linear-gradient(135deg, #c084fc, #a855f7);
            color: #fff;
            box-shadow: 0 4px 20px rgba(192,132,252,0.3);
        }
        .survey-options-row .btn-publish:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 30px rgba(192,132,252,0.4);
        }
        .survey-options-row .btn-publish:active { transform: scale(0.95); }

        @media (max-width: 480px) {
            .survey-modal-content { border-radius: 16px; margin: 10px; }
            .survey-modal-header { padding: 12px 16px; }
            .survey-modal-header .title { font-size: 15px; }
            .survey-modal-body { padding: 16px; }
            .survey-option-item input { font-size: 12px; padding: 8px 10px; }
            .survey-options-row .btn-back,
            .survey-options-row .btn-next,
            .survey-options-row .btn-publish { font-size: 12px; padding: 12px; }
            .toggle-label { padding: 10px 12px; }
            .toggle-label span { font-size: 12px; }
        }

        @media (hover: none) {
            .btn-add-option:hover,
            .survey-options-row .btn-back:hover,
            .survey-options-row .btn-next:hover,
            .survey-options-row .btn-publish:hover,
            .survey-modal-header .btn-publish:hover {
                transform: none;
            }
        }
    `;
    document.head.appendChild(styles);
}

injectSurveyStyles();