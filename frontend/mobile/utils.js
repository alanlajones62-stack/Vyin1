// ============================================================
// utils.js - Utilidades para móvil (SOLO LO ÚNICO)
// ============================================================

export function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    if (num < 0) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}