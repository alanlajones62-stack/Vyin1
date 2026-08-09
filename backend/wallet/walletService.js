// backend/wallet/walletService.js

const WalletModel = require('./models/wallet');
const TransactionModel = require('./models/transaction');
const TransactionService = require('./transactionService');
const BankConnector = require('./bankConnector');
const config = require('./config/wallet.config');

class WalletService {
    constructor(read, write, logger) {
        this.read = read;
        this.write = write;
        this.logger = logger;
        this.WALLET_FILE = 'wallets.json';
        
        // Inicializar servicios
        this.transactionService = new TransactionService(read, write, logger);
        this.bankConnector = new BankConnector(logger);
        
        // Inicializar conexión bancaria
        this.bankConnector.initialize();
    }

    // ============================================================
    // INICIALIZAR BILLETERA
    // ============================================================
    initializeWallet(userId, userData = {}) {
        try {
            const wallets = this.read(this.WALLET_FILE);
            const existing = wallets.find(w => w.userId === userId);
            if (existing) {
                this.logger?.warn(`Usuario ${userId} ya tiene billetera: ${existing.vyinPayNumber}`);
                return existing;
            }

            const newWallet = WalletModel.create(userId, userData);
            wallets.push(newWallet);
            this.write(this.WALLET_FILE, wallets);

            this.logger?.info(`✅ Billetera creada para usuario ${userId}: ${newWallet.vyinPayNumber}`);
            return newWallet;
        } catch (error) {
            this.logger?.error('Error inicializando billetera:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // OBTENER BILLETERA
    // ============================================================
    getWalletByUserId(userId) {
        try {
            const wallets = this.read(this.WALLET_FILE);
            return wallets.find(w => w.userId === userId) || null;
        } catch (error) {
            this.logger?.error('Error obteniendo billetera:', { error: error.message });
            return null;
        }
    }

    getWalletByNumber(vyinPayNumber) {
        try {
            const wallets = this.read(this.WALLET_FILE);
            return wallets.find(w => w.vyinPayNumber === vyinPayNumber) || null;
        } catch (error) {
            this.logger?.error('Error obteniendo billetera por número:', { error: error.message });
            return null;
        }
    }

    // ============================================================
    // OBTENER SALDO (en USD)
    // ============================================================
    getBalance(userId) {
        try {
            const wallet = this.getWalletByUserId(userId);
            if (!wallet) return { balance: 0, currency: config.CURRENCY, error: 'Billetera no encontrada' };
            
            return { 
                balance: wallet.balance, 
                currency: config.CURRENCY,
                formatted: `$${wallet.balance.toFixed(2)}`
            };
        } catch (error) {
            this.logger?.error('Error obteniendo saldo:', { error: error.message });
            return { balance: 0, currency: config.CURRENCY, error: error.message };
        }
    }

    // ============================================================
    // TRANSFERIR ENTRE USUARIOS (EN USD)
    // ============================================================
    async transfer(fromUserId, toVyinPayNumber, amount, description = '') {
        try {
            // Validaciones
            if (amount <= 0) throw new Error('El monto debe ser mayor a 0');
            if (amount < config.TRANSFER.minAmount) throw new Error(`Monto mínimo: $${config.TRANSFER.minAmount}`);
            if (amount > config.TRANSFER.maxAmount) throw new Error(`Monto máximo: $${config.TRANSFER.maxAmount}`);

            const fromWallet = this.getWalletByUserId(fromUserId);
            if (!fromWallet) throw new Error('Billetera de origen no encontrada');

            // Verificar KYC si es requerido
            if (config.TRANSFER.requireKYC && fromWallet.kycStatus !== 'verified') {
                throw new Error('Debes completar la verificación KYC para transferir');
            }

            if (fromWallet.balance < amount) throw new Error('Saldo insuficiente');

            const toWallet = this.getWalletByNumber(toVyinPayNumber);
            if (!toWallet) throw new Error('Billetera de destino no encontrada');
            if (fromWallet.userId === toWallet.userId) throw new Error('No puedes transferirte a ti mismo');

            // Verificar límites
            const today = new Date().toISOString().split('T')[0];
            if (fromWallet.lastResetDaily !== today) {
                fromWallet.dailySpent = 0;
                fromWallet.lastResetDaily = today;
            }

            const tierLimits = WalletModel.getTierLimits(fromWallet.tier);
            if (amount > tierLimits.maxTransfer) {
                throw new Error(`Límite de transferencia: $${tierLimits.maxTransfer}`);
            }
            if (fromWallet.dailySpent + amount > fromWallet.dailyLimit) {
                throw new Error(`Límite diario excedido ($${fromWallet.dailyLimit})`);
            }

            // Calcular comisión
            const fee = TransactionModel.calculateFee(amount, fromWallet.tier, 'transfer');

            // Crear transacción
            const transaction = await this.transactionService.createTransaction({
                walletId: fromWallet.id,
                userId: fromUserId,
                type: 'transfer',
                amount: amount,
                fee: fee,
                description: description || `Transferencia a ${toWallet.vyinPayNumber}`,
                fromWallet: fromWallet.id,
                toWallet: toWallet.id,
                fromUserId: fromUserId,
                toUserId: toWallet.userId,
                currency: config.CURRENCY,
                metadata: {
                    toVyinPayNumber: toWallet.vyinPayNumber,
                    toUserName: toWallet.vyinPayNumber,
                    tier: fromWallet.tier
                }
            });

            // Actualizar saldos
            const wallets = this.read(this.WALLET_FILE);
            const fromIndex = wallets.findIndex(w => w.id === fromWallet.id);
            const toIndex = wallets.findIndex(w => w.id === toWallet.id);

            wallets[fromIndex].balance -= (amount + fee);
            wallets[fromIndex].dailySpent += amount;
            wallets[fromIndex].updatedAt = new Date().toISOString();

            wallets[toIndex].balance += amount;
            wallets[toIndex].updatedAt = new Date().toISOString();

            this.write(this.WALLET_FILE, wallets);

            // Completar transacción
            await this.transactionService.completeTransaction(transaction.id);

            this.logger?.info(`💸 Transferencia: $${amount} de ${fromUserId} a ${toWallet.vyinPayNumber}`);

            return {
                success: true,
                transaction: transaction,
                fee: fee,
                fromBalance: wallets[fromIndex].balance,
                toBalance: wallets[toIndex].balance
            };

        } catch (error) {
            this.logger?.error('Error en transferencia:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // DEPOSITAR (Con conexión bancaria real o simulación)
    // ============================================================
    async deposit(userId, amount, bankReference = null, accountData = {}) {
        try {
            if (amount <= 0) throw new Error('El monto debe ser mayor a 0');
            if (amount < config.DEPOSIT.minAmount) throw new Error(`Monto mínimo: $${config.DEPOSIT.minAmount}`);
            if (amount > config.DEPOSIT.maxAmount) throw new Error(`Monto máximo: $${config.DEPOSIT.maxAmount}`);

            const wallet = this.getWalletByUserId(userId);
            if (!wallet) throw new Error('Billetera no encontrada');

            // Procesar depósito con el banco
            const bankResult = await this.bankConnector.processDeposit({
                userId,
                amount,
                bankReference,
                accountNumber: accountData.accountNumber,
                userData: wallet.kycData
            });

            if (!bankResult.success) {
                throw new Error('El depósito no pudo ser procesado por el banco');
            }

            // Crear transacción
            const transaction = await this.transactionService.createTransaction({
                walletId: wallet.id,
                userId: userId,
                type: 'deposit',
                amount: amount,
                fee: 0,
                description: 'Depósito a través de banco',
                bankReference: bankReference || bankResult.bankReference,
                bankTransactionId: bankResult.bankTransactionId,
                bankResponse: bankResult.data,
                currency: config.CURRENCY,
                metadata: {
                    method: 'bank_transfer',
                    bankReference: bankReference || bankResult.bankReference,
                    bankTransactionId: bankResult.bankTransactionId
                }
            });

            // Actualizar saldo si el depósito fue completado inmediatamente
            if (bankResult.status === 'completed') {
                const wallets = this.read(this.WALLET_FILE);
                const index = wallets.findIndex(w => w.id === wallet.id);
                wallets[index].balance += amount;
                wallets[index].updatedAt = new Date().toISOString();
                this.write(this.WALLET_FILE, wallets);

                await this.transactionService.completeTransaction(transaction.id);
                this.logger?.info(`💰 Depósito completado: $${amount} para usuario ${userId}`);
            } else {
                // Si está en procesamiento, actualizar estado
                await this.transactionService.updateTransaction(transaction.id, {
                    status: 'processing',
                    processedAt: new Date().toISOString()
                });
                this.logger?.info(`⏳ Depósito en procesamiento: $${amount} para usuario ${userId}`);
            }

            const currentWallet = this.getWalletByUserId(userId);

            return {
                success: true,
                transaction: transaction,
                status: bankResult.status,
                bankReference: bankResult.bankReference,
                newBalance: currentWallet?.balance || wallet.balance,
                processingDays: bankResult.processingDays || 0
            };

        } catch (error) {
            this.logger?.error('Error en depósito:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // RETIRAR (Con conexión bancaria real o simulación)
    // ============================================================
    async withdraw(userId, amount, bankAccountId = null) {
        try {
            if (amount <= 0) throw new Error('El monto debe ser mayor a 0');
            if (amount < config.WITHDRAWAL.minAmount) throw new Error(`Monto mínimo: $${config.WITHDRAWAL.minAmount}`);
            if (amount > config.WITHDRAWAL.maxAmount) throw new Error(`Monto máximo: $${config.WITHDRAWAL.maxAmount}`);

            const wallet = this.getWalletByUserId(userId);
            if (!wallet) throw new Error('Billetera no encontrada');
            if (wallet.balance < amount) throw new Error('Saldo insuficiente');

            // Verificar cuenta bancaria
            if (config.WITHDRAWAL.requireBankAccount) {
                const bankAccount = wallet.bankAccounts.find(a => a.id === bankAccountId);
                if (!bankAccount) {
                    throw new Error('Debes vincular una cuenta bancaria para retirar');
                }
                if (!bankAccount.verified) {
                    throw new Error('La cuenta bancaria debe estar verificada');
                }
            }

            // Verificar límites
            const tierLimits = WalletModel.getTierLimits(wallet.tier);
            if (amount > tierLimits.maxWithdrawal) {
                throw new Error(`Límite de retiro: $${tierLimits.maxWithdrawal}`);
            }

            // Calcular comisión
            const fee = TransactionModel.calculateFee(amount, wallet.tier, 'withdraw');

            // Procesar retiro con el banco
            const bankAccount = wallet.bankAccounts.find(a => a.id === bankAccountId);
            const bankResult = await this.bankConnector.processWithdrawal({
                userId,
                amount: amount + fee,
                bankAccountId,
                accountData: bankAccount
            });

            if (!bankResult.success) {
                throw new Error('El retiro no pudo ser procesado por el banco');
            }

            // Crear transacción
            const transaction = await this.transactionService.createTransaction({
                walletId: wallet.id,
                userId: userId,
                type: 'withdraw',
                amount: amount,
                fee: fee,
                description: `Retiro a ${bankAccount?.bankName || 'cuenta bancaria'}`,
                bankReference: bankResult.bankReference,
                bankTransactionId: bankResult.bankTransactionId,
                bankResponse: bankResult.data,
                currency: config.CURRENCY,
                metadata: {
                    method: 'bank_transfer',
                    bankAccountId: bankAccountId,
                    bankName: bankAccount?.bankName,
                    accountNumber: bankAccount?.accountNumber
                }
            });

            // Actualizar saldo (retiro en procesamiento)
            const wallets = this.read(this.WALLET_FILE);
            const index = wallets.findIndex(w => w.id === wallet.id);
            wallets[index].balance -= (amount + fee);
            wallets[index].updatedAt = new Date().toISOString();
            this.write(this.WALLET_FILE, wallets);

            // Actualizar estado de la transacción
            if (bankResult.status === 'processing') {
                await this.transactionService.updateTransaction(transaction.id, {
                    status: 'processing',
                    processedAt: new Date().toISOString()
                });
            } else {
                await this.transactionService.completeTransaction(transaction.id);
            }

            this.logger?.info(`🏦 Retiro: $${amount} para usuario ${userId}`);

            const currentWallet = this.getWalletByUserId(userId);

            return {
                success: true,
                transaction: transaction,
                fee: fee,
                status: bankResult.status,
                bankReference: bankResult.bankReference,
                newBalance: currentWallet?.balance || 0,
                processingDays: bankResult.processingDays || 0
            };

        } catch (error) {
            this.logger?.error('Error en retiro:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // OBTENER HISTORIAL
    // ============================================================
    getTransactionHistory(userId, options = {}) {
        return this.transactionService.getUserTransactions(userId, options);
    }

    // ============================================================
    // OBTENER ESTADÍSTICAS
    // ============================================================
    getWalletStats(userId) {
        try {
            const wallet = this.getWalletByUserId(userId);
            if (!wallet) return { error: 'Billetera no encontrada' };

            const transactions = this.transactionService.getUserTransactions(userId, { limit: 1000 });
            const txList = transactions.transactions || [];

            const totalSent = txList
                .filter(t => t.fromUserId === userId && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const totalReceived = txList
                .filter(t => t.toUserId === userId && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const totalDeposits = txList
                .filter(t => t.type === 'deposit' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const totalWithdrawals = txList
                .filter(t => t.type === 'withdraw' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const totalFees = txList
                .filter(t => t.status === 'completed')
                .reduce((sum, t) => sum + (t.fee || 0), 0);

            return {
                vyinPayNumber: wallet.vyinPayNumber,
                balance: wallet.balance,
                currency: config.CURRENCY,
                formattedBalance: `$${wallet.balance.toFixed(2)}`,
                status: wallet.status,
                tier: wallet.tier,
                dailyLimit: wallet.dailyLimit,
                monthlyLimit: wallet.monthlyLimit,
                dailySpent: wallet.dailySpent || 0,
                totalSent: totalSent,
                totalReceived: totalReceived,
                totalDeposits: totalDeposits,
                totalWithdrawals: totalWithdrawals,
                totalFees: totalFees,
                transactionCount: txList.length,
                bankAccountsCount: wallet.bankAccounts?.length || 0,
                kycStatus: wallet.kycStatus,
                kycLevel: wallet.tier
            };
        } catch (error) {
            this.logger?.error('Error obteniendo estadísticas:', { error: error.message });
            return { error: error.message };
        }
    }

    // ============================================================
    // VINCULAR CUENTA BANCARIA
    // ============================================================
    addBankAccount(userId, bankData) {
        try {
            const wallet = this.getWalletByUserId(userId);
            if (!wallet) throw new Error('Billetera no encontrada');

            if (!wallet.bankAccounts) wallet.bankAccounts = [];

            const newAccount = {
                id: 'BA_' + Date.now().toString(),
                bankName: bankData.bankName,
                accountType: bankData.accountType || 'savings',
                accountNumber: bankData.accountNumber,
                accountHolder: bankData.accountHolder,
                documentNumber: bankData.documentNumber,
                routingNumber: bankData.routingNumber || null,
                swiftCode: bankData.swiftCode || null,
                isDefault: bankData.isDefault || false,
                verified: false, // Requiere verificación bancaria en producción
                createdAt: new Date().toISOString()
            };

            if (wallet.bankAccounts.length === 0) {
                newAccount.isDefault = true;
            }

            if (newAccount.isDefault) {
                wallet.bankAccounts.forEach(a => a.isDefault = false);
            }

            wallet.bankAccounts.push(newAccount);
            wallet.updatedAt = new Date().toISOString();

            const wallets = this.read(this.WALLET_FILE);
            const index = wallets.findIndex(w => w.id === wallet.id);
            wallets[index] = wallet;
            this.write(this.WALLET_FILE, wallets);

            this.logger?.info(`🏦 Cuenta bancaria vinculada para usuario ${userId}`);
            return newAccount;
        } catch (error) {
            this.logger?.error('Error vinculando cuenta bancaria:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // ACTUALIZAR CONFIGURACIÓN
    // ============================================================
    updateWalletSettings(userId, settings) {
        try {
            const wallets = this.read(this.WALLET_FILE);
            const index = wallets.findIndex(w => w.userId === userId);
            
            if (index === -1) throw new Error('Billetera no encontrada');

            const allowedSettings = ['dailyLimit', 'monthlyLimit', 'settings'];
            
            for (const [key, value] of Object.entries(settings)) {
                if (allowedSettings.includes(key)) {
                    if (key === 'settings') {
                        wallets[index].settings = { ...wallets[index].settings, ...value };
                    } else {
                        wallets[index][key] = value;
                    }
                }
            }
            
            wallets[index].updatedAt = new Date().toISOString();
            this.write(this.WALLET_FILE, wallets);
            
            this.logger?.info(`✅ Configuración actualizada para usuario ${userId}`);
            return wallets[index];
        } catch (error) {
            this.logger?.error('Error actualizando configuración:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // WEBHOOK - Recibir notificaciones del banco
    // ============================================================
    async handleBankWebhook(payload) {
        try {
            const result = await this.bankConnector.handleWebhook(payload);
            
            if (result.event === 'deposit_completed') {
                // Procesar depósito completado
                const transactions = this.read(this.TRANSACTIONS_FILE);
                const tx = transactions.find(t => t.bankTransactionId === result.transactionId);
                
                if (tx && tx.status === 'processing') {
                    // Completar el depósito
                    const wallet = this.getWalletByUserId(tx.userId);
                    if (wallet) {
                        const wallets = this.read(this.WALLET_FILE);
                        const index = wallets.findIndex(w => w.id === wallet.id);
                        wallets[index].balance += tx.amount;
                        wallets[index].updatedAt = new Date().toISOString();
                        this.write(this.WALLET_FILE, wallets);
                    }
                    
                    await this.transactionService.completeTransaction(tx.id);
                    this.logger?.info(`✅ Depósito ${tx.id} completado por webhook`);
                }
            }

            if (result.event === 'withdrawal_completed') {
                // Procesar retiro completado
                const transactions = this.read(this.TRANSACTIONS_FILE);
                const tx = transactions.find(t => t.bankTransactionId === result.transactionId);
                
                if (tx && tx.status === 'processing') {
                    await this.transactionService.completeTransaction(tx.id);
                    this.logger?.info(`✅ Retiro ${tx.id} completado por webhook`);
                }
            }

            if (result.event === 'withdrawal_failed') {
                // Revertir retiro fallido
                const transactions = this.read(this.TRANSACTIONS_FILE);
                const tx = transactions.find(t => t.bankTransactionId === result.transactionId);
                
                if (tx && tx.status === 'processing') {
                    // Revertir el saldo
                    const wallet = this.getWalletByUserId(tx.userId);
                    if (wallet) {
                        const wallets = this.read(this.WALLET_FILE);
                        const index = wallets.findIndex(w => w.id === wallet.id);
                        wallets[index].balance += (tx.amount + (tx.fee || 0));
                        wallets[index].updatedAt = new Date().toISOString();
                        this.write(this.WALLET_FILE, wallets);
                    }
                    
                    await this.transactionService.failTransaction(tx.id, result.reason || 'Retiro fallido');
                    this.logger?.warn(`❌ Retiro ${tx.id} fallido por webhook: ${result.reason}`);
                }
            }

            return { success: true, event: result.event };

        } catch (error) {
            this.logger?.error('Error procesando webhook:', { error: error.message });
            throw error;
        }
    }
}

module.exports = WalletService;