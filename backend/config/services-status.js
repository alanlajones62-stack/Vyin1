// backend/config/services-status.js - Estado de servicios

const servicesConfig = require('./services.config');

// ============================================================
// FUNCIONES PARA VERIFICAR ESTADO DE SERVICIOS
// ============================================================

function isVyinPayEnabled() {
    return servicesConfig.vyinPay.enabled === true;
}

function getVyinPayStatus() {
    return {
        enabled: servicesConfig.vyinPay.enabled,
        message: servicesConfig.vyinPay.enabled 
            ? '✅ Vyin Pay está activo' 
            : servicesConfig.vyinPay.inactiveMessage,
        walletStatus: servicesConfig.vyinPay.wallet.defaultStatus,
        currency: servicesConfig.vyinPay.wallet.currency
    };
}

function getServiceStatus(serviceName) {
    const status = {
        vyinPay: getVyinPayStatus(),
        notifications: { enabled: servicesConfig.notifications.enabled },
        reports: { enabled: servicesConfig.reports.enabled },
        verifiedAccounts: { 
            enabled: servicesConfig.verifiedAccounts.enabled,
            threshold: servicesConfig.verifiedAccounts.threshold
        }
    };
    
    return serviceName ? status[serviceName] : status;
}

function isServiceEnabled(serviceName) {
    const status = getServiceStatus(serviceName);
    return status ? status.enabled : false;
}

module.exports = {
    isVyinPayEnabled,
    getVyinPayStatus,
    getServiceStatus,
    isServiceEnabled
};