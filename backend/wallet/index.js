// backend/wallet/index.js - VERSIÓN MODIFICADA CON VERIFICACIÓN DE SERVICIO

const express = require('express');
const auth = require('../middleware/auth');
const WalletService = require('./walletService');
const WalletModel = require('./models/wallet');
const { isVyinPayEnabled, getVyinPayStatus } = require('../config/services-status');

module.exports = function(read, write, io, logger) {
    const router = express.Router();

    // ============================================================
    // MIDDLEWARE: VERIFICAR QUE VYIN PAY ESTÉ ACTIVO
    // ============================================================
    const checkVyinPayEnabled = (req, res, next) => {
        if (!isVyinPayEnabled()) {
            const status = getVyinPayStatus();
            return res.status(503).json({
                error: 'service_unavailable',
                message: status.message,
                service: 'vyin_pay',
                status: 'inactive'
            });
        }
        next();
    };

    // ============================================================
    // MIDDLEWARE: VERIFICAR/INICIALIZAR BILLETERA
    // ============================================================
    const ensureWallet = (req, res, next) => {
        try {
            const userId = req.userId;
            
            // Verificar si el servicio está activo
            if (!isVyinPayEnabled()) {
                return res.status(503).json({
                    error: 'service_unavailable',
                    message: 'Vyin Pay no está disponible'
                });
            }
            
            const walletService = new WalletService(read, write, logger);
            let wallet = walletService.getWalletByUserId(userId);
            
            if (!wallet) {
                const users = read('users.json');
                const user = users.find(u => u.id === userId);
                wallet = walletService.initializeWallet(userId, user);
            }
            
            req.wallet = wallet;
            req.walletService = walletService;
            next();
        } catch (error) {
            logger?.error('Error en ensureWallet:', { error: error.message });
            res.status(500).json({ error: 'Error al inicializar billetera' });
        }
    };

    // ============================================================
    // 🔥 ENDPOINT: ESTADO DEL SERVICIO (PÚBLICO)
    // ============================================================
    router.get('/status', (req, res) => {
        const status = getVyinPayStatus();
        res.json({
            success: true,
            service: 'vyin_pay',
            ...status
        });
    });

    // ============================================================
    // 🔥 ENDPOINTS DE BILLETERA (SOLO SI ESTÁ ACTIVO)
    // ============================================================
    
    // OBTENER INFORMACIÓN DE BILLETERA
    router.get('/wallet', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const wallet = req.wallet;
            const walletService = req.walletService;
            const stats = walletService.getWalletStats(req.userId);
            
            res.json({
                success: true,
                wallet: {
                    vyinPayNumber: wallet.vyinPayNumber,
                    balance: wallet.balance,
                    currency: wallet.currency || 'USD',
                    formattedBalance: `$${wallet.balance.toFixed(2)}`,
                    status: wallet.status,
                    tier: wallet.tier,
                    dailyLimit: wallet.dailyLimit,
                    monthlyLimit: wallet.monthlyLimit,
                    dailySpent: wallet.dailySpent || 0,
                    kycStatus: wallet.kycStatus,
                    bankAccounts: wallet.bankAccounts || []
                },
                stats: stats
            });
        } catch (error) {
            logger?.error('Error obteniendo wallet:', { error: error.message });
            res.status(500).json({ error: 'Error al obtener información de billetera' });
        }
    });

    // OBTENER SALDO
    router.get('/balance', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const walletService = req.walletService;
            const balance = walletService.getBalance(req.userId);
            res.json({ success: true, ...balance });
        } catch (error) {
            logger?.error('Error obteniendo saldo:', { error: error.message });
            res.status(500).json({ error: 'Error al obtener saldo' });
        }
    });

    // TRANSFERIR
    router.post('/transfer', auth, checkVyinPayEnabled, ensureWallet, async (req, res) => {
        try {
            const { toVyinPayNumber, amount, description } = req.body;
            const walletService = req.walletService;

            if (!toVyinPayNumber) {
                return res.status(400).json({ error: 'Número de Vyin Pay destino requerido' });
            }
            if (!amount || amount <= 0) {
                return res.status(400).json({ error: 'Monto inválido' });
            }
            if (!WalletModel.validateVyinPayNumber(toVyinPayNumber)) {
                return res.status(400).json({ error: 'Número de Vyin Pay inválido' });
            }

            const result = await walletService.transfer(
                req.userId,
                toVyinPayNumber,
                parseFloat(amount),
                description
            );

            res.json({
                success: true,
                message: 'Transferencia realizada con éxito',
                transaction: result.transaction,
                fee: result.fee,
                newBalance: result.fromBalance
            });

            // Notificar al destinatario
            const toWallet = walletService.getWalletByNumber(toVyinPayNumber);
            if (toWallet) {
                io.to(`user_${toWallet.userId}`).emit('wallet_transfer_received', {
                    fromUserId: req.userId,
                    amount: parseFloat(amount),
                    description: description || 'Transferencia recibida',
                    vyinPayNumber: toVyinPayNumber,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            logger?.error('Error en transferencia:', { error: error.message });
            res.status(400).json({ error: error.message });
        }
    });

    // DEPOSITAR
    router.post('/deposit', auth, checkVyinPayEnabled, ensureWallet, async (req, res) => {
        try {
            const { amount, bankReference, accountNumber } = req.body;
            const walletService = req.walletService;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: 'Monto inválido' });
            }

            const result = await walletService.deposit(
                req.userId,
                parseFloat(amount),
                bankReference,
                { accountNumber }
            );

            res.json({
                success: true,
                message: result.status === 'completed' ? 'Depósito realizado con éxito' : 'Depósito en procesamiento',
                transaction: result.transaction,
                status: result.status,
                bankReference: result.bankReference,
                newBalance: result.newBalance,
                processingDays: result.processingDays || 0
            });

        } catch (error) {
            logger?.error('Error en depósito:', { error: error.message });
            res.status(400).json({ error: error.message });
        }
    });

    // RETIRAR
    router.post('/withdraw', auth, checkVyinPayEnabled, ensureWallet, async (req, res) => {
        try {
            const { amount, bankAccountId } = req.body;
            const walletService = req.walletService;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: 'Monto inválido' });
            }

            const result = await walletService.withdraw(
                req.userId,
                parseFloat(amount),
                bankAccountId
            );

            res.json({
                success: true,
                message: result.status === 'processing' ? 'Retiro en procesamiento' : 'Retiro realizado con éxito',
                transaction: result.transaction,
                fee: result.fee,
                status: result.status,
                bankReference: result.bankReference,
                newBalance: result.newBalance,
                processingDays: result.processingDays || 0
            });

        } catch (error) {
            logger?.error('Error en retiro:', { error: error.message });
            res.status(400).json({ error: error.message });
        }
    });

    // HISTORIAL DE TRANSACCIONES
    router.get('/transactions', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const type = req.query.type || null;
            const status = req.query.status || null;

            const walletService = req.walletService;
            const history = walletService.getTransactionHistory(req.userId, {
                limit: limit,
                offset: offset,
                type: type,
                status: status
            });

            res.json({
                success: true,
                ...history
            });
        } catch (error) {
            logger?.error('Error obteniendo historial:', { error: error.message });
            res.status(500).json({ error: 'Error al obtener historial de transacciones' });
        }
    });

    // ESTADÍSTICAS
    router.get('/stats', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const walletService = req.walletService;
            const stats = walletService.getWalletStats(req.userId);
            
            if (stats.error) {
                return res.status(404).json({ error: stats.error });
            }

            res.json({
                success: true,
                ...stats
            });
        } catch (error) {
            logger?.error('Error obteniendo estadísticas:', { error: error.message });
            res.status(500).json({ error: 'Error al obtener estadísticas' });
        }
    });

    // CUENTAS BANCARIAS
    router.post('/bank-account', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const { bankName, accountType, accountNumber, accountHolder, documentNumber, routingNumber, swiftCode, isDefault } = req.body;
            const walletService = req.walletService;

            if (!bankName || !accountNumber || !accountHolder) {
                return res.status(400).json({ error: 'Datos de cuenta bancaria incompletos' });
            }

            const account = walletService.addBankAccount(req.userId, {
                bankName,
                accountType,
                accountNumber,
                accountHolder,
                documentNumber,
                routingNumber,
                swiftCode,
                isDefault
            });

            res.json({
                success: true,
                message: 'Cuenta bancaria vinculada con éxito',
                account: account
            });

        } catch (error) {
            logger?.error('Error vinculando cuenta bancaria:', { error: error.message });
            res.status(400).json({ error: error.message });
        }
    });

    router.get('/bank-accounts', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const wallet = req.wallet;
            res.json({
                success: true,
                accounts: wallet.bankAccounts || [],
                defaultAccount: wallet.bankAccounts?.find(a => a.isDefault) || null
            });
        } catch (error) {
            logger?.error('Error obteniendo cuentas bancarias:', { error: error.message });
            res.status(500).json({ error: 'Error al obtener cuentas bancarias' });
        }
    });

    router.delete('/bank-account/:accountId', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const { accountId } = req.params;
            const wallet = req.wallet;

            if (!wallet.bankAccounts || wallet.bankAccounts.length === 0) {
                return res.status(404).json({ error: 'No hay cuentas bancarias vinculadas' });
            }

            const accountIndex = wallet.bankAccounts.findIndex(a => a.id === accountId);
            if (accountIndex === -1) {
                return res.status(404).json({ error: 'Cuenta bancaria no encontrada' });
            }

            if (wallet.bankAccounts.length === 1) {
                return res.status(400).json({ error: 'No puedes eliminar la única cuenta bancaria vinculada' });
            }

            wallet.bankAccounts.splice(accountIndex, 1);
            
            if (wallet.bankAccounts.every(a => !a.isDefault)) {
                wallet.bankAccounts[0].isDefault = true;
            }

            wallet.updatedAt = new Date().toISOString();

            const wallets = read('wallets.json');
            const index = wallets.findIndex(w => w.id === wallet.id);
            wallets[index] = wallet;
            write('wallets.json', wallets);

            res.json({
                success: true,
                message: 'Cuenta bancaria eliminada con éxito'
            });

        } catch (error) {
            logger?.error('Error eliminando cuenta bancaria:', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    router.put('/bank-account/:accountId/default', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const { accountId } = req.params;
            const wallet = req.wallet;

            if (!wallet.bankAccounts || wallet.bankAccounts.length === 0) {
                return res.status(404).json({ error: 'No hay cuentas bancarias vinculadas' });
            }

            const account = wallet.bankAccounts.find(a => a.id === accountId);
            if (!account) {
                return res.status(404).json({ error: 'Cuenta bancaria no encontrada' });
            }

            wallet.bankAccounts.forEach(a => a.isDefault = false);
            account.isDefault = true;
            wallet.updatedAt = new Date().toISOString();

            const wallets = read('wallets.json');
            const index = wallets.findIndex(w => w.id === wallet.id);
            wallets[index] = wallet;
            write('wallets.json', wallets);

            res.json({
                success: true,
                message: 'Cuenta bancaria establecida como predeterminada'
            });

        } catch (error) {
            logger?.error('Error estableciendo cuenta default:', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    // VERIFICAR NÚMERO VYIN PAY
    router.get('/verify/:vyinPayNumber', auth, checkVyinPayEnabled, (req, res) => {
        try {
            const { vyinPayNumber } = req.params;

            if (!WalletModel.validateVyinPayNumber(vyinPayNumber)) {
                return res.status(400).json({ 
                    valid: false, 
                    error: 'Número de Vyin Pay inválido' 
                });
            }

            const walletService = new WalletService(read, write, logger);
            const wallet = walletService.getWalletByNumber(vyinPayNumber);
            if (!wallet) {
                return res.json({ 
                    valid: false, 
                    error: 'Número de Vyin Pay no encontrado' 
                });
            }

            const users = read('users.json');
            const user = users.find(u => u.id === wallet.userId);

            res.json({
                valid: true,
                user: {
                    fullName: user?.fullName || 'Usuario',
                    username: user?.username || 'unknown'
                },
                wallet: {
                    vyinPayNumber: wallet.vyinPayNumber,
                    status: wallet.status
                }
            });

        } catch (error) {
            logger?.error('Error verificando Vyin Pay:', { error: error.message });
            res.status(500).json({ error: 'Error al verificar número' });
        }
    });

    // ACTUALIZAR CONFIGURACIÓN
    router.put('/settings', auth, checkVyinPayEnabled, ensureWallet, (req, res) => {
        try {
            const { dailyLimit, monthlyLimit, notifications, autoSave, preferredCurrency } = req.body;
            const walletService = req.walletService;

            const updates = {};
            if (dailyLimit) updates.dailyLimit = parseFloat(dailyLimit);
            if (monthlyLimit) updates.monthlyLimit = parseFloat(monthlyLimit);
            if (notifications !== undefined || autoSave !== undefined || preferredCurrency) {
                updates.settings = {
                    notifications,
                    autoSave,
                    preferredCurrency
                };
            }

            const wallet = walletService.updateWalletSettings(req.userId, updates);

            res.json({
                success: true,
                message: 'Configuración actualizada',
                settings: {
                    dailyLimit: wallet.dailyLimit,
                    monthlyLimit: wallet.monthlyLimit,
                    notifications: wallet.settings?.notifications,
                    autoSave: wallet.settings?.autoSave,
                    preferredCurrency: wallet.settings?.preferredCurrency
                }
            });

        } catch (error) {
            logger?.error('Error actualizando configuración:', { error: error.message });
            res.status(400).json({ error: error.message });
        }
    });

    // WEBHOOK
    router.post('/webhook', checkVyinPayEnabled, async (req, res) => {
        try {
            const payload = req.body;
            const signature = req.headers['x-bank-signature'];

            const walletService = new WalletService(read, write, logger);
            const result = await walletService.handleBankWebhook(payload);
            
            res.json({
                success: true,
                message: 'Webhook procesado correctamente',
                event: result.event
            });

        } catch (error) {
            logger?.error('Error en webhook:', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};