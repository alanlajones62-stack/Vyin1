// Servicio de transacciones
// backend/wallet/transactionService.js

const TransactionModel = require('./models/transaction');
const config = require('./config/wallet.config');

class TransactionService {
    constructor(read, write, logger) {
        this.read = read;
        this.write = write;
        this.logger = logger;
        this.TRANSACTIONS_FILE = 'transactions.json';
    }

    // ============================================================
    // CREAR TRANSACCIÓN
    // ============================================================
    createTransaction(data) {
        try {
            const transactions = this.read(this.TRANSACTIONS_FILE);
            const transaction = TransactionModel.create(data);
            transactions.push(transaction);
            this.write(this.TRANSACTIONS_FILE, transactions);
            
            this.logger?.info(`📝 Transacción creada: ${transaction.id} - ${transaction.type}`);
            return transaction;
        } catch (error) {
            this.logger?.error('Error creando transacción:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // ACTUALIZAR TRANSACCIÓN
    // ============================================================
    updateTransaction(transactionId, updates) {
        try {
            const transactions = this.read(this.TRANSACTIONS_FILE);
            const index = transactions.findIndex(t => t.id === transactionId);
            
            if (index === -1) {
                throw new Error('Transacción no encontrada');
            }

            const allowedUpdates = ['status', 'bankReference', 'bankTransactionId', 'bankResponse', 'externalId', 'metadata', 'processedAt', 'completedAt', 'failedAt'];
            
            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key)) {
                    transactions[index][key] = value;
                }
            }
            
            transactions[index].updatedAt = new Date().toISOString();
            this.write(this.TRANSACTIONS_FILE, transactions);
            
            this.logger?.info(`✅ Transacción ${transactionId} actualizada`);
            return transactions[index];
        } catch (error) {
            this.logger?.error('Error actualizando transacción:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // COMPLETAR TRANSACCIÓN
    // ============================================================
    completeTransaction(transactionId, result = {}) {
        try {
            const updates = {
                status: 'completed',
                completedAt: new Date().toISOString(),
                processedAt: new Date().toISOString(),
                metadata: { ...result }
            };
            return this.updateTransaction(transactionId, updates);
        } catch (error) {
            this.logger?.error('Error completando transacción:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // MARCAR TRANSACCIÓN COMO FALLIDA
    // ============================================================
    failTransaction(transactionId, errorMessage) {
        try {
            const updates = {
                status: 'failed',
                failedAt: new Date().toISOString(),
                metadata: { error: errorMessage }
            };
            return this.updateTransaction(transactionId, updates);
        } catch (error) {
            this.logger?.error('Error marcando transacción como fallida:', { error: error.message });
            throw error;
        }
    }

    // ============================================================
    // OBTENER TRANSACCIÓN POR ID
    // ============================================================
    getTransaction(transactionId) {
        try {
            const transactions = this.read(this.TRANSACTIONS_FILE);
            return transactions.find(t => t.id === transactionId) || null;
        } catch (error) {
            this.logger?.error('Error obteniendo transacción:', { error: error.message });
            return null;
        }
    }

    // ============================================================
    // OBTENER TRANSACCIONES POR USUARIO
    // ============================================================
    getUserTransactions(userId, options = {}) {
        try {
            const transactions = this.read(this.TRANSACTIONS_FILE);
            const limit = options.limit || 50;
            const offset = options.offset || 0;
            const type = options.type || null;
            const status = options.status || null;

            let filtered = transactions.filter(t => 
                t.userId === userId || t.fromUserId === userId || t.toUserId === userId
            );

            if (type && TransactionModel.getValidTypes().includes(type)) {
                filtered = filtered.filter(t => t.type === type);
            }

            if (status && TransactionModel.getValidStatuses().includes(status)) {
                filtered = filtered.filter(t => t.status === status);
            }

            filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            const total = filtered.length;
            const paginated = filtered.slice(offset, offset + limit);

            return {
                transactions: paginated,
                total: total,
                limit: limit,
                offset: offset,
                hasMore: offset + limit < total
            };
        } catch (error) {
            this.logger?.error('Error obteniendo transacciones:', { error: error.message });
            return { transactions: [], total: 0, error: error.message };
        }
    }
}

module.exports = TransactionService;