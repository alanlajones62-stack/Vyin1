// filters/color-filters.js - Filtros de color tipo Instagram

export const COLOR_FILTERS = {
    original: {
        id: 'original',
        name: 'Original',
        css: '',
        icon: 'fa-circle',
        category: 'color'
    },
    vintage: {
        id: 'vintage',
        name: 'Vintage',
        css: 'sepia(0.6) contrast(1.1) brightness(0.95)',
        icon: 'fa-clock',
        category: 'color'
    },
    noir: {
        id: 'noir',
        name: 'Noir',
        css: 'grayscale(1) contrast(1.2)',
        icon: 'fa-moon',
        category: 'color'
    },
    warm: {
        id: 'warm',
        name: 'Cálido',
        css: 'saturate(1.3) hue-rotate(-10deg)',
        icon: 'fa-sun',
        category: 'color'
    },
    cool: {
        id: 'cool',
        name: 'Frío',
        css: 'saturate(0.8) hue-rotate(20deg)',
        icon: 'fa-snowflake',
        category: 'color'
    },
    dramatic: {
        id: 'dramatic',
        name: 'Dramático',
        css: 'contrast(1.4) brightness(0.85) saturate(1.2)',
        icon: 'fa-bolt',
        category: 'color'
    },
    pastel: {
        id: 'pastel',
        name: 'Pastel',
        css: 'saturate(0.6) brightness(1.1)',
        icon: 'fa-palette',
        category: 'color'
    },
    neon: {
        id: 'neon',
        name: 'Neón',
        css: 'saturate(2) hue-rotate(20deg) brightness(1.1)',
        icon: 'fa-lightbulb',
        category: 'color'
    },
    vintage_warm: {
        id: 'vintage_warm',
        name: 'Retro',
        css: 'sepia(0.4) saturate(1.2) hue-rotate(-5deg) brightness(0.9)',
        icon: 'fa-camera-retro',
        category: 'color'
    }
};

export function applyColorFilter(element, filterId) {
    const filter = COLOR_FILTERS[filterId];
    if (!filter || !element) return;
    element.style.filter = filter.css || 'none';
}

export function getColorFilter(id) {
    return COLOR_FILTERS[id] || COLOR_FILTERS.original;
}

export function getColorFiltersByCategory() {
    const categories = {};
    Object.values(COLOR_FILTERS).forEach(filter => {
        if (!categories[filter.category]) {
            categories[filter.category] = [];
        }
        categories[filter.category].push(filter);
    });
    return categories;
}