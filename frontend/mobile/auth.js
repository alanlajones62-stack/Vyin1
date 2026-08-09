// ============================================================
// auth.js - AUTENTICACIÓN Y SESIÓN (VERSIÓN CORREGIDA)
// ============================================================

const API_URL = window.location.origin || 'http://localhost:3000';

let currentUser = null;
let token = localStorage.getItem('token');

// ============================================================
// TOKEN Y HEADERS
// ============================================================

export function getToken() {
    // Siempre verificar localStorage para mantener sincronía
    const stored = localStorage.getItem('token');
    if (stored) {
        token = stored;
    }
    return token || null;
}

export function setToken(newToken) {
    token = newToken;
    if (newToken) {
        localStorage.setItem('token', newToken);
        console.log('✅ Token guardado en localStorage');
    } else {
        localStorage.removeItem('token');
        console.log('🗑️ Token eliminado de localStorage');
    }
}

export function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) {
        headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
}

// ============================================================
// USUARIO ACTUAL
// ============================================================

export function getCurrentUser() {
    if (!currentUser) {
        const saved = localStorage.getItem('user');
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
                console.log('🔄 Usuario cargado desde localStorage:', currentUser.username);
            } catch (e) {
                console.error('Error cargando usuario:', e);
                currentUser = null;
            }
        }
    }
    return currentUser;
}

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        console.log('✅ Usuario guardado en localStorage:', user.username);
    } else {
        localStorage.removeItem('user');
        console.log('🗑️ Usuario eliminado de localStorage');
    }
}

// ============================================================
// IDIOMA DEL USUARIO
// ============================================================

export const LANGUAGES = [
    { code: 'es', name: 'Español', flag: '🇪🇸', native: 'Español' },
    { code: 'en', name: 'Inglés', flag: '🇬🇧', native: 'English' },
    { code: 'pt', name: 'Portugués', flag: '🇧🇷', native: 'Português' },
    { code: 'fr', name: 'Francés', flag: '🇫🇷', native: 'Français' },
    { code: 'de', name: 'Alemán', flag: '🇩🇪', native: 'Deutsch' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹', native: 'Italiano' },
    { code: 'nl', name: 'Neerlandés', flag: '🇳🇱', native: 'Nederlands' },
    { code: 'ru', name: 'Ruso', flag: '🇷🇺', native: 'Русский' },
    { code: 'zh', name: 'Chino', flag: '🇨🇳', native: '中文' },
    { code: 'ja', name: 'Japonés', flag: '🇯🇵', native: '日本語' },
    { code: 'ko', name: 'Coreano', flag: '🇰🇷', native: '한국어' },
    { code: 'ar', name: 'Árabe', flag: '🇸🇦', native: 'العربية' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
    { code: 'bn', name: 'Bengalí', flag: '🇧🇩', native: 'বাংলা' },
    { code: 'pa', name: 'Punyabí', flag: '🇵🇰', native: 'پنجابی' },
    { code: 'ur', name: 'Urdu', flag: '🇵🇰', native: 'اردو' },
    { code: 'fa', name: 'Persa', flag: '🇮🇷', native: 'فارسی' },
    { code: 'tr', name: 'Turco', flag: '🇹🇷', native: 'Türkçe' },
    { code: 'vi', name: 'Vietnamita', flag: '🇻🇳', native: 'Tiếng Việt' },
    { code: 'th', name: 'Tailandés', flag: '🇹🇭', native: 'ไทย' },
    { code: 'id', name: 'Indonesio', flag: '🇮🇩', native: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Malayo', flag: '🇲🇾', native: 'Bahasa Melayu' },
    { code: 'tl', name: 'Tagalo', flag: '🇵🇭', native: 'Tagalog' },
    { code: 'sw', name: 'Suajili', flag: '🇹🇿', native: 'Kiswahili' },
    { code: 'af', name: 'Afrikáans', flag: '🇿🇦', native: 'Afrikaans' },
    { code: 'am', name: 'Amárico', flag: '🇪🇹', native: 'አማርኛ' },
    { code: 'yo', name: 'Yoruba', flag: '🇳🇬', native: 'Yorùbá' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬', native: 'Igbo' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬', native: 'Hausa' },
    { code: 'so', name: 'Somalí', flag: '🇸🇴', native: 'Soomaali' },
    { code: 'el', name: 'Griego', flag: '🇬🇷', native: 'Ελληνικά' },
    { code: 'pl', name: 'Polaco', flag: '🇵🇱', native: 'Polski' },
    { code: 'cs', name: 'Checo', flag: '🇨🇿', native: 'Čeština' },
    { code: 'hu', name: 'Húngaro', flag: '🇭🇺', native: 'Magyar' },
    { code: 'ro', name: 'Rumano', flag: '🇷🇴', native: 'Română' },
    { code: 'bg', name: 'Búlgaro', flag: '🇧🇬', native: 'Български' },
    { code: 'sr', name: 'Serbio', flag: '🇷🇸', native: 'Српски' },
    { code: 'hr', name: 'Croata', flag: '🇭🇷', native: 'Hrvatski' },
    { code: 'sk', name: 'Eslovaco', flag: '🇸🇰', native: 'Slovenčina' },
    { code: 'sl', name: 'Esloveno', flag: '🇸🇮', native: 'Slovenščina' },
    { code: 'lt', name: 'Lituano', flag: '🇱🇹', native: 'Lietuvių' },
    { code: 'lv', name: 'Letón', flag: '🇱🇻', native: 'Latviešu' },
    { code: 'et', name: 'Estonio', flag: '🇪🇪', native: 'Eesti' },
    { code: 'fi', name: 'Finlandés', flag: '🇫🇮', native: 'Suomi' },
    { code: 'sv', name: 'Sueco', flag: '🇸🇪', native: 'Svenska' },
    { code: 'no', name: 'Noruego', flag: '🇳🇴', native: 'Norsk' },
    { code: 'da', name: 'Danés', flag: '🇩🇰', native: 'Dansk' },
    { code: 'is', name: 'Islandés', flag: '🇮🇸', native: 'Íslenska' },
    { code: 'ga', name: 'Irlandés', flag: '🇮🇪', native: 'Gaeilge' },
    { code: 'cy', name: 'Galés', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', native: 'Cymraeg' }
];

export function getUserLanguage() {
    const user = getCurrentUser();
    return user?.language || 'es';
}

export function setUserLanguage(language) {
    const user = getCurrentUser();
    if (user) {
        user.language = language;
        setCurrentUser(user);
        
        const token = getToken();
        if (token) {
            fetch(`${API_URL}/api/users/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ language })
            }).catch(console.error);
        }
        
        console.log(`🌐 Idioma actualizado a: ${language}`);
        return true;
    }
    return false;
}

export function getAvailableLanguages() {
    return LANGUAGES;
}

export function getLanguageInfo(code) {
    return LANGUAGES.find(l => l.code === code) || { code, name: code, flag: '🌐', native: code };
}

// ============================================================
// TRADUCCIÓN
// ============================================================

export async function translateText(text, targetLanguage) {
    if (!text) return text;
    if (targetLanguage === 'es') return text;
    
    const token = getToken();
    if (!token) return text;
    
    try {
        const res = await fetch(`${API_URL}/api/vyin/translate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, targetLanguage })
        });
        
        if (res.ok) {
            const data = await res.json();
            return data.translated || text;
        }
        return text;
    } catch (error) {
        console.error('Error traduciendo:', error);
        return text;
    }
}

export async function translateStories(stories, targetLanguage) {
    if (!stories || stories.length === 0) return stories;
    if (targetLanguage === 'es') return stories;
    
    const token = getToken();
    if (!token) return stories;
    
    try {
        const res = await fetch(`${API_URL}/api/vyin/translate-batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                texts: stories.map(s => s.caption || s.textContent || '').filter(Boolean),
                targetLanguage 
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.translated && Array.isArray(data.translated)) {
                return stories.map((story, index) => ({
                    ...story,
                    caption: data.translated[index] || story.caption,
                    translated: true,
                    originalLanguage: story.language || 'es',
                    language: targetLanguage
                }));
            }
        }
        return stories;
    } catch (error) {
        console.error('Error traduciendo historias:', error);
        return stories;
    }
}

export async function detectLanguage(text) {
    if (!text) return 'es';
    
    const token = getToken();
    if (!token) return 'es';
    
    try {
        const res = await fetch(`${API_URL}/api/vyin/detect-language`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
        
        if (res.ok) {
            const data = await res.json();
            return data.language || 'es';
        }
        return 'es';
    } catch (error) {
        console.error('Error detectando idioma:', error);
        return 'es';
    }
}

// ============================================================
// 🔥 SESIÓN - CORREGIDO
// ============================================================

export function restoreSession() {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    console.log('🔍 Restaurando sesión...');
    console.log('   token:', savedToken ? '✅ SI' : '❌ NO');
    console.log('   user:', savedUser ? '✅ SI' : '❌ NO');
    
    if (savedToken && savedUser) {
        try {
            token = savedToken;
            currentUser = JSON.parse(savedUser);
            console.log('✅ Sesión restaurada:', currentUser.username);
            return true;
        } catch (e) {
            console.error('❌ Error restaurando sesión:', e);
            // Limpiar datos corruptos
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            token = null;
            currentUser = null;
            return false;
        }
    }
    
    // Si no hay token pero hay user, limpiar
    if (!savedToken && savedUser) {
        console.warn('⚠️ Token ausente pero user existe - limpiando');
        localStorage.removeItem('user');
        currentUser = null;
        return false;
    }
    
    return false;
}

export async function verifySession() {
    const t = getToken();
    if (!t) {
        console.log('🔒 No hay token para verificar');
        return false;
    }
    
    try {
        console.log('🔍 Verificando sesión con token...');
        const res = await fetch(`${API_URL}/api/auth/verify`, {
            headers: { 'Authorization': `Bearer ${t}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                currentUser = data.user;
                localStorage.setItem('user', JSON.stringify(data.user));
                console.log('✅ Sesión verificada:', currentUser.username);
                return true;
            }
            return false;
        } else if (res.status === 401) {
            console.warn('⚠️ Token inválido - limpiando sesión');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            token = null;
            currentUser = null;
            return false;
        }
        return false;
    } catch (error) {
        console.error('❌ Error verificando sesión:', error);
        // Si hay usuario local, asumir que la sesión es válida (fallback)
        return !!currentUser;
    }
}

export function logout() {
    console.log('🔓 Cerrando sesión...');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null;
    currentUser = null;
    
    // Cerrar socket si existe
    if (window.socket) {
        window.socket.disconnect();
        window.socket = null;
    }
    
    window.location.href = 'index.html';
}

export function goToProfile() {
    const user = getCurrentUser();
    if (user && user.id) {
        window.location.href = `profile.html?id=${user.id}`;
    } else {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                const u = JSON.parse(savedUser);
                window.location.href = `profile.html?id=${u.id}`;
            } catch (e) {
                window.location.href = 'index.html';
            }
        } else {
            window.location.href = 'index.html';
        }
    }
}

// ============================================================
// UI HELPERS
// ============================================================

export function updateUIForLoggedIn() {
    console.log('🔄 UI: Usuario logueado');
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'flex';
}

export function updateUIForLoggedOut() {
    console.log('🔄 UI: Usuario NO logueado');
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'none';
}

// ============================================================
// UTILIDADES
// ============================================================

let toastTimeout = null;

export function showToast(message, isError = false, duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);
    
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : 'success'}`;
    toast.innerHTML = `<i class="fas fa-${isError ? 'exclamation-triangle' : 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    
    toastTimeout = setTimeout(() => {
        toast.remove();
        toastTimeout = null;
    }, duration);
}

export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function getAvatar(name) {
    if (!name) return 'https://ui-avatars.com/api/?name=U&background=a855f7&color=fff&size=128&bold=true';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=a855f7&color=fff&size=128&bold=true`;
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
