// backend/wallet/config/wallet.config.js

module.exports = {
    // ============================================================
    // MONEDA PRINCIPAL - DÓLARES ESTADOUNIDENSES
    // ============================================================
    CURRENCY: 'USD',
    CURRENCY_SYMBOL: '$',
    CURRENCY_DECIMALS: 2,

    // ============================================================
    // LÍMITES POR DEFECTO (en USD)
    // ============================================================
    DEFAULT_DAILY_LIMIT: 1000,
    DEFAULT_MONTHLY_LIMIT: 5000,
    DEFAULT_WITHDRAWAL_LIMIT: 500,

    // ============================================================
    // COMISIONES (en porcentaje)
    // ============================================================
    TRANSACTION_FEE: 0.005, // 0.5% por transferencia
    DEPOSIT_FEE: 0,         // 0% depósitos
    WITHDRAWAL_FEE: 0.01,   // 1% retiros

    // ============================================================
    // NIVELES DE USUARIO
    // ============================================================
    TIERS: {
        1: { 
            dailyLimit: 1000, 
            monthlyLimit: 5000, 
            maxTransfer: 500,
            maxWithdrawal: 500,
            feeDiscount: 0
        },
        2: { 
            dailyLimit: 5000, 
            monthlyLimit: 20000, 
            maxTransfer: 2000,
            maxWithdrawal: 2000,
            feeDiscount: 0.3
        },
        3: { 
            dailyLimit: 20000, 
            monthlyLimit: 100000, 
            maxTransfer: 10000,
            maxWithdrawal: 10000,
            feeDiscount: 0.5
        }
    },

    // ============================================================
    // REQUISITOS KYC POR NIVEL
    // ============================================================
    KYC_REQUIREMENTS: {
        1: { required: false, documents: [] },
        2: { 
            required: true, 
            documents: ['documentNumber', 'phone'] 
        },
        3: { 
            required: true, 
            documents: ['documentNumber', 'addressProof', 'incomeProof', 'bankStatement'] 
        }
    },

    // ============================================================
    // CONFIGURACIÓN DE RETIROS
    // ============================================================
    WITHDRAWAL: {
        minAmount: 10,
        maxAmount: 10000,
        processingDays: 1,      // Días hábiles para procesar
        requireBankAccount: true
    },

    // ============================================================
    // CONFIGURACIÓN DE DEPÓSITOS
    // ============================================================
    DEPOSIT: {
        minAmount: 1,
        maxAmount: 50000,
        methods: ['bank_transfer', 'card', 'crypto']
    },

    // ============================================================
    // CONFIGURACIÓN DE TRANSFERENCIAS
    // ============================================================
    TRANSFER: {
        minAmount: 0.01,
        maxAmount: 10000,
        requireKYC: true
    },

    // ============================================================
    // CONFIGURACIÓN DE BANCOS (para conexión real)
    // ============================================================
    BANK_CONFIG: {
        // En producción, estos valores vendrían de variables de entorno
        apiUrl: process.env.BANK_API_URL || 'https://api.banco.com/v1',
        apiKey: process.env.BANK_API_KEY || '',
        apiSecret: process.env.BANK_API_SECRET || '',
        webhookUrl: process.env.BANK_WEBHOOK_URL || 'https://api.vyn.com/webhooks/bank',
        timeout: 30000
    },

    // ============================================================
    // MONEDAS SOPORTADAS
    // ============================================================
    SUPPORTED_CURRENCIES: ['USD', 'EUR', 'VYN'],
    DEFAULT_CURRENCY: 'USD'
};