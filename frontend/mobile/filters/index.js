// filters/index.js - Exporta todos los filtros (incluyendo AR)

import { COLOR_FILTERS, applyColorFilter, getColorFilter, getColorFiltersByCategory } from './color-filters.js';
import { FACE_FILTERS, applyFaceFilter, getFaceFilter, getFaceFilters } from './face-filters.js';
import { AR_FILTERS, getARFilters, getARFilter, applyARFilter, getCombinedFilters } from './ar-filters.js';

// Todos los filtros combinados
export const ALL_FILTERS = {
    ...COLOR_FILTERS,
    ...FACE_FILTERS,
    ...AR_FILTERS
};

// Exportar funciones de color
export {
    COLOR_FILTERS,
    applyColorFilter,
    getColorFilter,
    getColorFiltersByCategory
};

// Exportar funciones de rostro
export {
    FACE_FILTERS,
    applyFaceFilter,
    getFaceFilter,
    getFaceFilters
};

// Exportar funciones AR
export {
    AR_FILTERS,
    getARFilters,
    getARFilter,
    applyARFilter,
    getCombinedFilters
};

// Función para aplicar cualquier filtro
export function applyFilter(element, filterId) {
    if (!element) return;
    const filter = ALL_FILTERS[filterId];
    if (filter && filter.css) {
        element.style.filter = filter.css || 'none';
    }
}

// Obtener filtros por categoría
export function getFiltersByCategory() {
    const categories = {
        color: Object.values(COLOR_FILTERS),
        face: Object.values(FACE_FILTERS),
        ar: Object.values(AR_FILTERS)
    };
    return categories;
}

// Obtener filtros para UI
export function getFiltersForUI() {
    return {
        color: Object.values(COLOR_FILTERS),
        face: Object.values(FACE_FILTERS),
        ar: Object.values(AR_FILTERS)
    };
}