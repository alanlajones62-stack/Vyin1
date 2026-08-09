// filters/ar-filters.js - Filtros de realidad aumentada (estilo Snapchat/TikTok)

// ============================================================
// FILTROS AR CON OVERLAYS SVG
// ============================================================

export const AR_FILTERS = {
    none: {
        id: 'none',
        name: 'Sin filtro',
        icon: 'fa-user',
        category: 'ar',
        overlay: null,
        position: 'center'
    },
    dog_ears: {
        id: 'dog_ears',
        name: '🐶 Orejas de perro',
        icon: 'fa-dog',
        category: 'ar',
        position: 'top',
        color: '#8B6B4C',
        svg: `
            <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="45" cy="40" rx="35" ry="50" fill="#8B6B4C" transform="rotate(-20, 45, 40)"/>
                <ellipse cx="155" cy="40" rx="35" ry="50" fill="#8B6B4C" transform="rotate(20, 155, 40)"/>
                <ellipse cx="45" cy="40" rx="22" ry="35" fill="#D4A574" transform="rotate(-20, 45, 40)"/>
                <ellipse cx="155" cy="40" rx="22" ry="35" fill="#D4A574" transform="rotate(20, 155, 40)"/>
                <circle cx="40" cy="10" r="8" fill="#8B6B4C"/>
                <circle cx="160" cy="10" r="8" fill="#8B6B4C"/>
            </svg>
        `
    },
    cat_ears: {
        id: 'cat_ears',
        name: '🐱 Orejas de gato',
        icon: 'fa-cat',
        category: 'ar',
        position: 'top',
        color: '#2D2D2D',
        svg: `
            <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
                <polygon points="20,80 60,10 100,80" fill="#2D2D2D"/>
                <polygon points="100,80 140,10 180,80" fill="#2D2D2D"/>
                <polygon points="35,70 60,20 85,70" fill="#FFB6C1"/>
                <polygon points="115,70 140,20 165,70" fill="#FFB6C1"/>
                <circle cx="55" cy="15" r="6" fill="#FFB6C1"/>
                <circle cx="145" cy="15" r="6" fill="#FFB6C1"/>
            </svg>
        `
    },
    bunny_ears: {
        id: 'bunny_ears',
        name: '🐰 Orejas de conejo',
        icon: 'fa-rabbit',
        category: 'ar',
        position: 'top',
        color: '#F5F5F5',
        svg: `
            <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="60" cy="30" rx="25" ry="60" fill="#F5F5F5" transform="rotate(-15, 60, 30)"/>
                <ellipse cx="140" cy="30" rx="25" ry="60" fill="#F5F5F5" transform="rotate(15, 140, 30)"/>
                <ellipse cx="60" cy="30" rx="12" ry="45" fill="#FFB6C1" transform="rotate(-15, 60, 30)"/>
                <ellipse cx="140" cy="30" rx="12" ry="45" fill="#FFB6C1" transform="rotate(15, 140, 30)"/>
            </svg>
        `
    },
    glasses: {
        id: 'glasses',
        name: '👓 Gafas',
        icon: 'fa-glasses',
        category: 'ar',
        position: 'eyes',
        color: '#1A1A2E',
        svg: `
            <svg viewBox="0 0 300 80" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="20" rx="15" ry="15" width="110" height="50" fill="none" stroke="#1A1A2E" stroke-width="4"/>
                <rect x="180" y="20" rx="15" ry="15" width="110" height="50" fill="none" stroke="#1A1A2E" stroke-width="4"/>
                <line x1="120" y1="45" x2="180" y2="45" stroke="#1A1A2E" stroke-width="4"/>
                <rect x="25" y="25" rx="10" ry="10" width="80" height="40" fill="rgba(192,132,252,0.15)" stroke="#c084fc" stroke-width="2"/>
                <rect x="195" y="25" rx="10" ry="10" width="80" height="40" fill="rgba(192,132,252,0.15)" stroke="#c084fc" stroke-width="2"/>
            </svg>
        `
    },
    crown: {
        id: 'crown',
        name: '👑 Corona',
        icon: 'fa-crown',
        category: 'ar',
        position: 'top',
        color: '#FFD700',
        svg: `
            <svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
                <polygon points="20,60 40,10 70,40 100,0 130,40 160,10 180,60" fill="#FFD700"/>
                <polygon points="20,60 40,10 70,40 100,0 130,40 160,10 180,60" fill="none" stroke="#DAA520" stroke-width="2"/>
                <circle cx="40" cy="25" r="5" fill="#FF6B6B"/>
                <circle cx="100" cy="15" r="7" fill="#FF6B6B"/>
                <circle cx="160" cy="25" r="5" fill="#FF6B6B"/>
                <rect x="30" y="60" width="140" height="10" fill="#FFD700" rx="3"/>
            </svg>
        `
    },
    heart_eyes: {
        id: 'heart_eyes',
        name: '❤️ Ojos corazón',
        icon: 'fa-heart',
        category: 'ar',
        position: 'eyes',
        color: '#FF6B6B',
        svg: `
            <svg viewBox="0 0 300 80" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(40, 20)">
                    <path d="M15,10 C15,5 5,0 0,10 C-5,0 -15,5 -15,10 C-15,20 0,30 0,30 C0,30 15,20 15,10Z" fill="#FF6B6B"/>
                    <path d="M15,10 C15,5 5,0 0,10 C-5,0 -15,5 -15,10 C-15,20 0,30 0,30 C0,30 15,20 15,10Z" fill="#FF6B6B" transform="translate(220, 0)"/>
                </g>
            </svg>
        `
    },
    sunglasses: {
        id: 'sunglasses',
        name: '🕶️ Lentes oscuros',
        icon: 'fa-sunglasses',
        category: 'ar',
        position: 'eyes',
        color: '#1A1A2E',
        svg: `
            <svg viewBox="0 0 300 60" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="10" rx="12" ry="12" width="130" height="40" fill="#1A1A2E" opacity="0.8"/>
                <rect x="160" y="10" rx="12" ry="12" width="130" height="40" fill="#1A1A2E" opacity="0.8"/>
                <line x1="140" y1="30" x2="160" y2="30" stroke="#1A1A2E" stroke-width="4"/>
                <rect x="20" y="18" rx="8" ry="8" width="110" height="24" fill="#333" opacity="0.5"/>
                <rect x="170" y="18" rx="8" ry="8" width="110" height="24" fill="#333" opacity="0.5"/>
                <rect x="30" y="22" rx="4" ry="4" width="20" height="16" fill="rgba(255,255,255,0.1)"/>
                <rect x="180" y="22" rx="4" ry="4" width="20" height="16" fill="rgba(255,255,255,0.1)"/>
                <line x1="15" y1="20" x2="10" y2="5" stroke="#1A1A2E" stroke-width="3"/>
                <line x1="285" y1="20" x2="290" y2="5" stroke="#1A1A2E" stroke-width="3"/>
            </svg>
        `
    },
    mustache: {
        id: 'mustache',
        name: '🧔 Bigote',
        icon: 'fa-people-arrows',
        category: 'ar',
        position: 'mouth',
        color: '#4A3728',
        svg: `
            <svg viewBox="0 0 300 60" xmlns="http://www.w3.org/2000/svg">
                <path d="M30,30 C60,10 90,20 110,35 C130,20 160,10 190,30 C210,20 240,10 270,30 C240,45 210,50 190,45 C160,50 130,45 110,35 C90,45 60,50 30,30Z" 
                      fill="#4A3728" opacity="0.9"/>
                <path d="M30,30 C60,10 90,20 110,35 C130,20 160,10 190,30 C210,20 240,10 270,30 C240,45 210,50 190,45 C160,50 130,45 110,35 C90,45 60,50 30,30Z" 
                      fill="none" stroke="#3A2718" stroke-width="2"/>
            </svg>
        `
    },
    butterfly: {
        id: 'butterfly',
        name: '🦋 Mariposa',
        icon: 'fa-butterfly',
        category: 'ar',
        position: 'cheek',
        color: '#FF6B9D',
        svg: `
            <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="35" cy="40" rx="30" ry="25" fill="#FF6B9D" opacity="0.8" transform="rotate(-30, 35, 40)"/>
                <ellipse cx="85" cy="40" rx="30" ry="25" fill="#FF6B9D" opacity="0.8" transform="rotate(30, 85, 40)"/>
                <ellipse cx="35" cy="40" rx="20" ry="15" fill="#FFB6C1" opacity="0.6" transform="rotate(-30, 35, 40)"/>
                <ellipse cx="85" cy="40" rx="20" ry="15" fill="#FFB6C1" opacity="0.6" transform="rotate(30, 85, 40)"/>
                <ellipse cx="60" cy="45" rx="10" ry="25" fill="#FF6B9D" opacity="0.9"/>
                <circle cx="35" cy="30" r="6" fill="#FFB6C1" opacity="0.5"/>
                <circle cx="85" cy="30" r="6" fill="#FFB6C1" opacity="0.5"/>
            </svg>
        `
    },
    flower_crown: {
        id: 'flower_crown',
        name: '🌸 Corona de flores',
        icon: 'fa-flower',
        category: 'ar',
        position: 'top',
        color: '#FFB6C1',
        svg: `
            <svg viewBox="0 0 300 80" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="18" fill="#FF6B8A"/>
                <circle cx="70" cy="20" r="16" fill="#FFB6C1"/>
                <circle cx="110" cy="25" r="14" fill="#FF6B8A"/>
                <circle cx="150" cy="15" r="18" fill="#FFB6C1"/>
                <circle cx="190" cy="25" r="14" fill="#FF6B8A"/>
                <circle cx="230" cy="20" r="16" fill="#FFB6C1"/>
                <circle cx="270" cy="30" r="18" fill="#FF6B8A"/>
                <circle cx="30" cy="30" r="10" fill="#FFD700" opacity="0.5"/>
                <circle cx="70" cy="20" r="8" fill="#FFD700" opacity="0.5"/>
                <circle cx="110" cy="25" r="7" fill="#FFD700" opacity="0.5"/>
                <circle cx="150" cy="15" r="10" fill="#FFD700" opacity="0.5"/>
                <circle cx="190" cy="25" r="7" fill="#FFD700" opacity="0.5"/>
                <circle cx="230" cy="20" r="8" fill="#FFD700" opacity="0.5"/>
                <circle cx="270" cy="30" r="10" fill="#FFD700" opacity="0.5"/>
            </svg>
        `
    }
};

// ============================================================
// FUNCIONES PARA FILTROS AR
// ============================================================

export function getARFilters() {
    return Object.values(AR_FILTERS);
}

export function getARFilter(id) {
    return AR_FILTERS[id] || AR_FILTERS.none;
}

export function applyARFilter(videoElement, canvasElement, filterId, faceData = null) {
    const filter = AR_FILTERS[filterId];
    if (!filter || filterId === 'none' || !filter.svg) {
        if (canvasElement) {
            const ctx = canvasElement.getContext('2d');
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
        return;
    }

    // Dibujar el overlay SVG en el canvas
    drawSVGOverlay(canvasElement, filter.svg, filter.position, faceData);
}

function drawSVGOverlay(canvas, svgContent, position, faceData) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    // Crear imagen desde SVG
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
        // Calcular posición y tamaño
        let x = 0, y = 0, w = width * 0.6, h = height * 0.3;
        
        switch(position) {
            case 'top':
                x = width * 0.2;
                y = height * 0.05;
                w = width * 0.6;
                h = height * 0.2;
                break;
            case 'eyes':
                x = width * 0.1;
                y = height * 0.2;
                w = width * 0.8;
                h = height * 0.15;
                break;
            case 'mouth':
                x = width * 0.2;
                y = height * 0.55;
                w = width * 0.6;
                h = height * 0.12;
                break;
            case 'cheek':
                x = width * 0.65;
                y = height * 0.35;
                w = width * 0.2;
                h = height * 0.15;
                break;
            case 'center':
            default:
                x = width * 0.2;
                y = height * 0.3;
                w = width * 0.6;
                h = height * 0.3;
                break;
        }
        
        ctx.drawImage(img, x, y, w, h);
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

// ============================================================
// FILTROS COMBINADOS (Color + AR)
// ============================================================

export function getCombinedFilters() {
    return {
        color: Object.values(COLOR_FILTERS || {}),
        face: Object.values(FACE_FILTERS || {}),
        ar: Object.values(AR_FILTERS)
    };
}