// ============================================================
// LOGIN MODULE - Pantalla de login y gestión de sesión
// CON MODAL DE LOGIN INTEGRADO
// ============================================================

import { 
    getToken, getCurrentUser, setCurrentUser,
    restoreSession, updateUIForLoggedIn, updateUIForLoggedOut,
    verifySession, showToast 
} from './auth.js';

import { preloadCurrentUserProfile } from './profile-modal.js';

const API_URL = window.location.origin;

// ============================================================
// ESTADO DEL MÓDULO
// ============================================================

let isInitialized = false;
let onLoginSuccessCallback = null;
let onLoginFailCallback = null;
let isLoginModalOpen = false;
let isLoading = false;

// ============================================================
// 🔥 CREAR MODAL DE LOGIN
// ============================================================

function createLoginModalHTML() {
    if (document.getElementById('loginModalOverlay')) return;

    const html = `
        <div id="loginModalOverlay" class="login-modal-overlay" style="display:none;">
            <div class="login-modal-content" onclick="event.stopPropagation()">
                <button class="login-modal-close" id="loginModalClose">
                    <i class="fas fa-times"></i>
                </button>
                
                <div class="login-modal-header">
                    <div class="login-modal-logo">
                        <i class="fas fa-bolt"></i> Vyin
                    </div>
                    <h2>Iniciar Sesión</h2>
                    <p class="login-modal-subtitle">Conecta con el mundo</p>
                </div>
                
                <div id="loginModalMessage" class="login-modal-message"></div>
                
                <form id="loginModalForm">
                    <div class="login-modal-group">
                        <label>Email <span class="required">*</span></label>
                        <input type="email" id="loginModalEmail" placeholder="tu@email.com" autocomplete="email" required />
                    </div>
                    
                    <div class="login-modal-group">
                        <label>Contraseña <span class="required">*</span></label>
                        <input type="password" id="loginModalPassword" placeholder="Mínimo 6 caracteres" autocomplete="current-password" minlength="6" required />
                        <div class="login-modal-hint">Mínimo 6 caracteres</div>
                    </div>
                    
                    <button type="submit" class="login-modal-btn" id="loginModalSubmit">
                        <span id="loginModalBtnText">Iniciar Sesión</span>
                    </button>
                </form>
                
                <div class="login-modal-links">
                    <div class="login-modal-divider">
                        <span>o</span>
                    </div>
                    <a href="#" id="loginModalRegisterLink">
                        <i class="fas fa-user-plus"></i> Crear nueva cuenta
                    </a>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    // 🔥 INYECTAR ESTILOS DEL MODAL
    const styles = document.createElement('style');
    styles.id = 'login-modal-styles';
    styles.textContent = `
        /* ============================================================
           LOGIN MODAL - ESTILOS
        ============================================================ */
        .login-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            animation: loginFadeIn 0.3s ease;
            padding: 16px;
        }

        .login-modal-overlay.active {
            display: flex !important;
        }

        @keyframes loginFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .login-modal-content {
            background: rgba(20, 20, 35, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
            width: 100%;
            max-width: 420px;
            padding: 32px 28px;
            border: 1px solid rgba(192, 132, 252, 0.12);
            position: relative;
            max-height: 95vh;
            overflow-y: auto;
        }

        .login-modal-content::-webkit-scrollbar { width: 3px; }
        .login-modal-content::-webkit-scrollbar-track { background: transparent; }
        .login-modal-content::-webkit-scrollbar-thumb { background: rgba(192,132,252,0.2); border-radius: 10px; }

        .login-modal-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: rgba(255,255,255,0.05);
            border: none;
            color: rgba(255,255,255,0.3);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }

        .login-modal-close:hover {
            background: rgba(255,255,255,0.08);
            color: #fff;
        }

        .login-modal-close:active {
            transform: scale(0.88);
        }

        .login-modal-header {
            text-align: center;
            margin-bottom: 20px;
        }

        .login-modal-logo {
            font-size: 24px;
            font-weight: 800;
            background: linear-gradient(135deg, #c084fc, #db2777, #f43f5e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 2px;
        }

        .login-modal-logo i {
            background: linear-gradient(135deg, #c084fc, #db2777);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .login-modal-content h2 {
            color: #fff;
            font-size: 19px;
            font-weight: 600;
            margin: 0 0 2px 0;
            letter-spacing: -0.2px;
        }

        .login-modal-subtitle {
            color: rgba(255,255,255,0.25);
            font-size: 13px;
            font-weight: 400;
            margin: 0;
        }

        .login-modal-message {
            padding: 10px 14px;
            border-radius: 10px;
            margin-bottom: 14px;
            display: none;
            font-size: 13px;
            font-weight: 500;
            animation: loginFadeIn 0.3s ease;
        }

        .login-modal-message.error {
            background: rgba(255,68,68,0.12);
            color: #ff6b6b;
            border: 1px solid rgba(255,68,68,0.15);
            display: block;
        }

        .login-modal-message.success {
            background: rgba(34,197,94,0.12);
            color: #22c55e;
            border: 1px solid rgba(34,197,94,0.15);
            display: block;
        }

        .login-modal-message.info {
            background: rgba(192,132,252,0.12);
            color: #c084fc;
            border: 1px solid rgba(192,132,252,0.15);
            display: block;
        }

        .login-modal-group {
            margin-bottom: 12px;
        }

        .login-modal-group label {
            display: block;
            margin-bottom: 4px;
            color: rgba(255,255,255,0.6);
            font-weight: 500;
            font-size: 12px;
            letter-spacing: 0.2px;
        }

        .login-modal-group label .required {
            color: #ff6b6b;
            margin-left: 2px;
        }

        .login-modal-group input {
            width: 100%;
            padding: 10px 14px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 10px;
            font-size: 14px;
            color: #fff;
            transition: all 0.3s ease;
            font-family: inherit;
        }

        .login-modal-group input:focus {
            outline: none;
            border-color: #c084fc;
            background: rgba(255,255,255,0.08);
            box-shadow: 0 0 0 3px rgba(192,132,252,0.1);
        }

        .login-modal-group input::placeholder {
            color: rgba(255,255,255,0.2);
        }

        .login-modal-hint {
            font-size: 10px;
            color: rgba(255,255,255,0.2);
            margin-top: 3px;
        }

        .login-modal-btn {
            width: 100%;
            padding: 13px;
            background: linear-gradient(135deg, #c084fc, #db2777);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 6px;
            font-family: inherit;
            position: relative;
            overflow: hidden;
        }

        .login-modal-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 20px rgba(192,132,252,0.35);
        }

        .login-modal-btn:active {
            transform: scale(0.97);
        }

        .login-modal-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: none !important;
        }

        .login-modal-btn .login-spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top: 2px solid #fff;
            border-radius: 50%;
            animation: loginSpin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 8px;
        }

        @keyframes loginSpin {
            to { transform: rotate(360deg); }
        }

        .login-modal-links {
            margin-top: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        .login-modal-divider {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
            color: rgba(255,255,255,0.08);
            font-size: 11px;
        }

        .login-modal-divider::before,
        .login-modal-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255,255,255,0.05);
        }

        .login-modal-links a {
            color: rgba(255,255,255,0.4);
            text-decoration: none;
            font-size: 13px;
            transition: all 0.3s ease;
            padding: 8px 16px;
            border-radius: 50px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.04);
            cursor: pointer;
        }

        .login-modal-links a:hover {
            color: #c084fc;
            background: rgba(192,132,252,0.06);
            border-color: rgba(192,132,252,0.1);
        }

        .login-modal-links a:active {
            transform: scale(0.97);
        }

        .login-modal-links a i {
            margin-right: 8px;
            font-size: 13px;
        }

        /* ============================================================
           RESPONSIVE
        ============================================================ */
        @media (max-width: 520px) {
            .login-modal-content { padding: 20px 16px; max-height: 96vh; }
            .login-modal-logo { font-size: 20px; }
            .login-modal-content h2 { font-size: 17px; }
            .login-modal-subtitle { font-size: 12px; }
            .login-modal-group input { font-size: 15px; padding: 11px 12px; }
            .login-modal-btn { font-size: 15px; padding: 12px; }
        }

        @media (max-width: 380px) {
            .login-modal-content { padding: 14px 12px; }
            .login-modal-logo { font-size: 17px; }
            .login-modal-content h2 { font-size: 15px; }
            .login-modal-group input { font-size: 14px; padding: 9px 10px; }
            .login-modal-btn { font-size: 14px; padding: 10px; }
        }

        @media (orientation: landscape) and (max-height: 500px) {
            .login-modal-content { padding: 12px 16px; max-height: 90vh; }
            .login-modal-logo { font-size: 16px; }
            .login-modal-content h2 { font-size: 14px; margin-bottom: 0; }
            .login-modal-subtitle { font-size: 11px; }
            .login-modal-group { margin-bottom: 6px; }
            .login-modal-group input { padding: 6px 10px; font-size: 13px; }
            .login-modal-btn { padding: 8px; font-size: 13px; }
            .login-modal-message { padding: 4px 10px; font-size: 11px; margin-bottom: 6px; }
            .login-modal-links { margin-top: 8px; }
            .login-modal-links a { font-size: 11px; padding: 4px 12px; }
            .login-modal-close { top: 6px; right: 6px; width: 26px; height: 26px; font-size: 13px; }
        }
    `;
    document.head.appendChild(styles);

    // 🔥 CONFIGURAR EVENTOS
    setupLoginModalEvents();

    console.log('🔐 Modal de login creado');
}

// ============================================================
// 🔥 CONFIGURAR EVENTOS DEL MODAL DE LOGIN
// ============================================================

function setupLoginModalEvents() {
    // Cerrar modal
    const closeBtn = document.getElementById('loginModalClose');
    const overlay = document.getElementById('loginModalOverlay');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeLoginModal);
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeLoginModal();
            }
        });
    }

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isLoginModalOpen) {
            closeLoginModal();
        }
    });

    // Enviar formulario
    const form = document.getElementById('loginModalForm');
    if (form) {
        form.addEventListener('submit', handleLoginSubmit);
    }

    // Link de registro
    const registerLink = document.getElementById('loginModalRegisterLink');
    if (registerLink) {
        registerLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeLoginModal();
            setTimeout(() => {
                window.location.href = '/register.html';
            }, 300);
        });
    }

    // Validación en tiempo real
    const emailInput = document.getElementById('loginModalEmail');
    const passwordInput = document.getElementById('loginModalPassword');

    if (emailInput) {
        emailInput.addEventListener('input', () => {
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value);
            emailInput.style.borderColor = emailInput.value && !isValid ? '#ff6b6b' : '';
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const isValid = passwordInput.value.length >= 6;
            passwordInput.style.borderColor = passwordInput.value && !isValid ? '#ff6b6b' : '';
        });
    }
}

// ============================================================
// 🔥 ABRIR MODAL DE LOGIN
// ============================================================

export function openLoginModal() {
    console.log('🔐 Abriendo modal de login...');

    const overlay = document.getElementById('loginModalOverlay');
    if (!overlay) {
        createLoginModalHTML();
    }

    const overlayEl = document.getElementById('loginModalOverlay');
    if (overlayEl) {
        overlayEl.style.display = 'flex';
        overlayEl.classList.add('active');
        overlayEl.style.zIndex = '99999';
    }

    isLoginModalOpen = true;
    document.body.style.overflow = 'hidden';

    // Limpiar campos
    const emailInput = document.getElementById('loginModalEmail');
    const passwordInput = document.getElementById('loginModalPassword');
    const messageEl = document.getElementById('loginModalMessage');
    
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (messageEl) {
        messageEl.className = 'login-modal-message';
        messageEl.textContent = '';
    }

    // Enfocar email
    setTimeout(() => {
        if (emailInput) emailInput.focus();
    }, 300);
}

// ============================================================
// 🔥 CERRAR MODAL DE LOGIN
// ============================================================

export function closeLoginModal() {
    console.log('🔐 Cerrando modal de login...');

    const overlay = document.getElementById('loginModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
    }

    isLoginModalOpen = false;
    document.body.style.overflow = '';
    isLoading = false;

    const submitBtn = document.getElementById('loginModalSubmit');
    const btnText = document.getElementById('loginModalBtnText');
    if (submitBtn) {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Iniciar Sesión';
    }
}

// ============================================================
// 🔥 MANEJAR ENVÍO DE LOGIN
// ============================================================

async function handleLoginSubmit(e) {
    e.preventDefault();
    if (isLoading) return;

    const emailInput = document.getElementById('loginModalEmail');
    const passwordInput = document.getElementById('loginModalPassword');
    const messageEl = document.getElementById('loginModalMessage');
    const submitBtn = document.getElementById('loginModalSubmit');
    const btnText = document.getElementById('loginModalBtnText');

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';

    // Validar
    if (!email || !password) {
        showLoginMessage('Por favor, completa todos los campos', 'error');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showLoginMessage('Por favor, ingresa un email válido', 'error');
        return;
    }

    if (password.length < 6) {
        showLoginMessage('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    isLoading = true;
    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.innerHTML = '<span class="login-spinner"></span> Cargando...';

    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showLoginMessage('✅ ¡Bienvenido!', 'success');
            
            // Actualizar UI
            updateUIForLoggedIn();
            const user = getCurrentUser();
            if (user) {
                // Actualizar header
                updateHeaderUI(user);
                // Pre-cargar perfil
                setTimeout(() => {
                    preloadCurrentUserProfile();
                }, 1000);
            }

            setTimeout(() => {
                closeLoginModal();
                if (typeof onLoginSuccessCallback === 'function') {
                    onLoginSuccessCallback(user);
                }
                // Recargar feed
                if (typeof window.refreshFeed === 'function') {
                    window.refreshFeed();
                }
                showToast('✅ Sesión iniciada correctamente');
            }, 800);
        } else {
            showLoginMessage(data.error || 'Error al iniciar sesión', 'error');
            isLoading = false;
            if (submitBtn) submitBtn.disabled = false;
            if (btnText) btnText.textContent = 'Iniciar Sesión';
        }
    } catch (err) {
        console.error('Error en login:', err);
        showLoginMessage('Error de conexión. Verifica tu internet.', 'error');
        isLoading = false;
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Iniciar Sesión';
    }
}

// ============================================================
// 🔥 MOSTRAR MENSAJE EN EL MODAL
// ============================================================

function showLoginMessage(text, type = 'error') {
    const messageEl = document.getElementById('loginModalMessage');
    if (messageEl) {
        messageEl.textContent = text;
        messageEl.className = 'login-modal-message ' + type;
    }
}

// ============================================================
// 🔥 MOSTRAR PANTALLA DE LOGIN (fallback para cuando no hay sesión)
// ============================================================

function showLoginScreen(containerId = 'feedContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('⚠️ Contenedor para login no encontrado');
        return;
    }

    container.innerHTML = `
        <div class="login-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;padding:40px 24px;text-align:center;animation:fadeIn 0.6s ease;">
            <div style="width:100px;height:100px;background:linear-gradient(135deg,#c084fc,#db2777);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:28px;box-shadow:0 12px 48px rgba(192,132,252,0.25);">
                <i class="fas fa-camera" style="font-size:42px;color:#fff;"></i>
            </div>
            
            <h2 style="color:#fff;font-size:24px;font-weight:700;margin-bottom:8px;">Bienvenido a Vyin</h2>
            <p style="color:rgba(255,255,255,0.35);font-size:14px;margin-bottom:32px;max-width:300px;">
                Descubre historias, conecta con amigos y comparte momentos únicos
            </p>
            
            <button id="loginMainBtn" 
                    style="background:linear-gradient(135deg,#c084fc,#db2777);border:none;color:#fff;padding:16px 48px;border-radius:50px;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.3s ease;box-shadow:0 8px 32px rgba(192,132,252,0.3);position:relative;overflow:hidden;letter-spacing:0.5px;">
                <i class="fas fa-sign-in-alt" style="font-size:18px;"></i>
                Iniciar sesión
                <span style="position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(255,255,255,0.1) 0%,transparent 70%);transform:scale(0);transition:transform 0.5s ease;"></span>
            </button>
            
            <div style="margin-top:16px;display:flex;gap:20px;align-items:center;">
                <span style="color:rgba(255,255,255,0.08);font-size:12px;">¿No tienes cuenta?</span>
                <a href="/register.html" style="color:#c084fc;font-size:13px;font-weight:600;text-decoration:none;transition:color 0.3s;">
                    Regístrate gratis
                    <i class="fas fa-arrow-right" style="font-size:10px;margin-left:4px;"></i>
                </a>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:40px;width:100%;max-width:320px;">
                <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:12px 8px;border:1px solid rgba(255,255,255,0.04);">
                    <i class="fas fa-camera" style="color:#c084fc;font-size:16px;margin-bottom:4px;display:block;"></i>
                    <span style="color:rgba(255,255,255,0.15);font-size:9px;font-weight:500;">Historias</span>
                </div>
                <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:12px 8px;border:1px solid rgba(255,255,255,0.04);">
                    <i class="fas fa-users" style="color:#c084fc;font-size:16px;margin-bottom:4px;display:block;"></i>
                    <span style="color:rgba(255,255,255,0.15);font-size:9px;font-weight:500;">Conecta</span>
                </div>
                <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:12px 8px;border:1px solid rgba(255,255,255,0.04);">
                    <i class="fas fa-globe" style="color:#c084fc;font-size:16px;margin-bottom:4px;display:block;"></i>
                    <span style="color:rgba(255,255,255,0.15);font-size:9px;font-weight:500;">Global</span>
                </div>
            </div>
        </div>
    `;

    // ESTILOS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(20px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .login-btn-hover:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 40px rgba(192,132,252,0.4);
        }
        .login-btn-hover:active {
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);

    // CONFIGURAR BOTÓN DE LOGIN - AHORA ABRE EL MODAL
    const loginBtn = document.getElementById('loginMainBtn');
    if (loginBtn) {
        loginBtn.classList.add('login-btn-hover');
        
        const newBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newBtn, loginBtn);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔑 Abriendo modal de login...');
            openLoginModal();
        });
        
        newBtn.addEventListener('mouseenter', () => {
            const span = newBtn.querySelector('span');
            if (span) {
                span.style.transform = 'scale(1)';
            }
        });
        newBtn.addEventListener('mouseleave', () => {
            const span = newBtn.querySelector('span');
            if (span) {
                span.style.transform = 'scale(0)';
            }
        });
    }
}

// ============================================================
// 🔥 VERIFICAR SESIÓN AL INICIO
// ============================================================

async function checkSessionAndLoad(onSuccess, onFail) {
    console.log('🔐 Verificando sesión...');
    
    const hasSession = restoreSession();
    const currentUser = getCurrentUser();

    if (hasSession && currentUser) {
        updateUIForLoggedIn();
        const isValid = await verifySession();
        
        if (isValid) {
            const refreshedUser = getCurrentUser();
            console.log(`✅ Sesión válida para: ${refreshedUser?.fullName || refreshedUser?.username}`);
            
            setTimeout(() => {
                preloadCurrentUserProfile();
            }, 1500);
            
            if (typeof onSuccess === 'function') {
                onSuccess(refreshedUser);
            }
            return true;
        } else {
            updateUIForLoggedOut();
            showToast('Sesión expirada', true);
            if (typeof onFail === 'function') {
                onFail();
            }
            return false;
        }
    } else {
        updateUIForLoggedOut();
        if (typeof onFail === 'function') {
            onFail();
        }
        return false;
    }
}

// ============================================================
// 🔥 ACTUALIZAR UI DEL HEADER
// ============================================================

function updateHeaderUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const userBadge = document.getElementById('userBadge');
    const navProfile = document.getElementById('navProfile');
    const avatar = document.getElementById('headerAvatar');
    const name = document.getElementById('headerName');
    
    if (!user) {
        if (userBadge) userBadge.style.display = 'none';
        if (navProfile) navProfile.style.display = 'none';
        if (loginBtn) {
            loginBtn.style.display = 'flex';
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Iniciar sesión';
            const newLoginBtn = loginBtn.cloneNode(true);
            loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
            newLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openLoginModal();
            });
        }
        return;
    }

    if (loginBtn) {
        loginBtn.style.display = 'none';
    }
    
    if (userBadge) userBadge.style.display = 'flex';
    if (navProfile) navProfile.style.display = 'flex';

    if (avatar) {
        avatar.src = user.avatar || getAvatar(user.fullName || user.username);
        avatar.onerror = function() {
            this.src = getAvatar(user.fullName || user.username);
        };
    }
    if (name) name.textContent = user.fullName || user.username;
}

// ============================================================
// 🔥 FUNCIONES DE AUTENTICACIÓN PARA EL HEADER
// ============================================================

function setupHeaderLoginButton() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;
    
    const newLoginBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
    
    newLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openLoginModal();
    });
}

// ============================================================
// 🔥 INICIALIZAR MÓDULO
// ============================================================

function initLoginModule(options = {}) {
    if (isInitialized) return;
    
    const {
        onSuccess = null,
        onFail = null,
        containerId = 'feedContainer',
        autoCheck = true
    } = options;
    
    onLoginSuccessCallback = onSuccess;
    onLoginFailCallback = onFail;
    
    setupHeaderLoginButton();
    
    if (autoCheck) {
        checkSessionAndLoad(onSuccess, onFail);
    }
    
    isInitialized = true;
    console.log('🔐 Módulo de login inicializado');
}

// ============================================================
// 🔥 EXPORTAR
// ============================================================

export {
    showLoginScreen,
    checkSessionAndLoad,
    updateHeaderUI,
    setupHeaderLoginButton,
    initLoginModule,
    openLoginModal,
    closeLoginModal
};