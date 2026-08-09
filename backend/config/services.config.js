// backend/config/services.config.js - Configuración central de servicios

module.exports = {
    // ============================================================
    // 🔥 VYIN PAY - CONFIGURACIÓN
    // ============================================================
    vyinPay: {
        // 🔥 ACTIVAR/DESACTIVAR VYIN PAY
        enabled: false,  // false = servicio inactivo, true = servicio activo
        
        // Mensaje que se muestra cuando está inactivo
        inactiveMessage: '⚠️ Vyin Pay no está disponible actualmente. Próximamente.',
        
        // Configuración de la billetera
        wallet: {
            defaultStatus: 'inactive',  // 'active' | 'inactive' | 'pending_kyc'
            defaultDailyLimit: 1000,
            defaultMonthlyLimit: 5000,
            currency: 'USD'
        },
        
        // Límites por tier
        tiers: {
            1: { dailyLimit: 1000, monthlyLimit: 5000, maxTransfer: 500, maxWithdrawal: 500, feeDiscount: 0 },
            2: { dailyLimit: 5000, monthlyLimit: 20000, maxTransfer: 2000, maxWithdrawal: 2000, feeDiscount: 0.3 },
            3: { dailyLimit: 20000, monthlyLimit: 100000, maxTransfer: 10000, maxWithdrawal: 10000, feeDiscount: 0.5 }
        },
        
        // Comisiones
        fees: {
            transfer: 0.005,    // 0.5%
            deposit: 0,         // 0%
            withdrawal: 0.01    // 1%
        },
        
        // Límites de transacciones
        limits: {
            transfer: { min: 0.01, max: 10000 },
            deposit: { min: 1, max: 50000 },
            withdrawal: { min: 10, max: 10000 }
        },
        
        // Requisitos KYC por tier
        kycRequirements: {
            1: { required: false, documents: [] },
            2: { required: true, documents: ['documentNumber', 'phone'] },
            3: { required: true, documents: ['documentNumber', 'addressProof', 'incomeProof'] }
        }
    },
    
    // ============================================================
    // OTROS SERVICIOS
    // ============================================================
    notifications: {
        enabled: true
    },
    
    reports: {
        enabled: true
    },
    
    verifiedAccounts: {
        enabled: true,
        threshold: 1000000
    }
};