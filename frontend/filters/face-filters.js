// filters/face-filters.js - Filtros de rostro tipo Snapchat/TikTok

// NOTA: Estos filtros son visuales (no usan IA) y se aplican como overlays CSS
// Para filtros reales de rostro se necesitaría TensorFlow.js o una API externa

export const FACE_FILTERS = {
    none: {
        id: 'none',
        name: 'Sin filtro',
        icon: 'fa-user',
        css: '',
        category: 'face'
    },
    glow: {
        id: 'glow',
        name: 'Brillo',
        icon: 'fa-star',
        css: 'brightness(1.1) contrast(1.05) saturate(1.1)',
        category: 'face',
        description: 'Piel más brillante'
    },
    soft: {
        id: 'soft',
        name: 'Suave',
        icon: 'fa-feather',
        css: 'blur(0.5px) brightness(1.05) contrast(0.95)',
        category: 'face',
        description: 'Efecto suave'
    },
    warm_skin: {
        id: 'warm_skin',
        name: 'Piel cálida',
        icon: 'fa-sun',
        css: 'sepia(0.2) saturate(1.2) brightness(1.05)',
        category: 'face',
        description: 'Tono de piel cálido'
    },
    cool_skin: {
        id: 'cool_skin',
        name: 'Piel fría',
        icon: 'fa-snowflake',
        css: 'saturate(0.9) hue-rotate(5deg) brightness(1.05)',
        category: 'face',
        description: 'Tono de piel frío'
    },
    sharpen: {
        id: 'sharpen',
        name: 'Definido',
        icon: 'fa-crosshairs',
        css: 'contrast(1.1) saturate(1.1)',
        category: 'face',
        description: 'Rostro más definido'
    }
};

export function applyFaceFilter(element, filterId) {
    const filter = FACE_FILTERS[filterId];
    if (!filter || !element) return;
    element.style.filter = filter.css || 'none';
}

export function getFaceFilter(id) {
    return FACE_FILTERS[id] || FACE_FILTERS.none;
}

export function getFaceFilters() {
    return Object.values(FACE_FILTERS);
}