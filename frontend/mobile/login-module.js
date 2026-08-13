// ============================================================
// LOGIN MODULE - Pantalla de login y gestión de sesión
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

// ============================================================
// 🔥 MOSTRAR PANTALLA DE LOGIN
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

    // 🔥 ESTILOS
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

    // 🔥 CONFIGURAR BOTÓN DE LOGIN
    const loginBtn = document.getElementById('loginMainBtn');
    if (loginBtn) {
        loginBtn.classList.add('login-btn-hover');
        
        // Eliminar listeners anteriores
        const newBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newBtn, loginBtn);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔑 Redirigiendo a login...');
            window.location.href = '/login.html';
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
            
            // Pre-cargar perfil en segundo plano
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
            // Limpiar listeners anteriores
            const newLoginBtn = loginBtn.cloneNode(true);
            loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
            newLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '/login.html';
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
    
    // Limpiar listeners anteriores
    const newLoginBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
    
    newLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/login.html';
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
    
    // Configurar botón de login en header
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
    initLoginModule
};