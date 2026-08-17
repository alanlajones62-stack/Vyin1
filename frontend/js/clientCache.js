// frontend/js/clientCache.js

class ClientCache {
    constructor(dbName = 'VynSocialCache', storeName = 'cacheStore') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
        this.initialized = false;
    }

    // ============================================================
    // INICIALIZAR BASE DE DATOS
    // ============================================================
    async init() {
        if (this.initialized) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
                    store.createIndex('expiry', 'expiry', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initialized = true;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // ============================================================
    // GUARDAR EN CACHÉ
    // ============================================================
    async set(key, value, ttl = 3600000) { // 1 hora por defecto
        await this.init();

        const data = {
            key: key,
            value: value,
            expiry: Date.now() + ttl,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // OBTENER DE CACHÉ
    // ============================================================
    async get(key) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                const data = request.result;
                if (!data) {
                    resolve(null);
                    return;
                }

                // Verificar expiración
                if (Date.now() > data.expiry) {
                    this.delete(key);
                    resolve(null);
                    return;
                }

                resolve(data.value);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // ELIMINAR UN ITEM
    // ============================================================
    async delete(key) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // LIMPIAR CACHÉ COMPLETO
    // ============================================================
    async clear() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // LIMPIAR ITEMS EXPIRADOS
    // ============================================================
    async cleanExpired() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('expiry');
            const now = Date.now();
            const range = IDBKeyRange.upperBound(now);
            const request = index.openCursor(range);

            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    count++;
                    cursor.continue();
                } else {
                    resolve(count);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // OBTENER ESTADÍSTICAS
    // ============================================================
    async getStats() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result || [];
                const now = Date.now();
                const total = items.length;
                const expired = items.filter(item => now > item.expiry).length;
                const valid = total - expired;

                resolve({
                    totalItems: total,
                    validItems: valid,
                    expiredItems: expired,
                    keys: items.map(item => item.key)
                });
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // INVALIDAR POR PATRÓN
    // ============================================================
    async invalidatePattern(pattern) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();

            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.key.includes(pattern)) {
                        cursor.delete();
                        count++;
                    }
                    cursor.continue();
                } else {
                    resolve(count);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ============================================================
    // ESPERAR A QUE SE INICIALICE (método auxiliar)
    // ============================================================
    async ready() {
        await this.init();
        return this.db;
    }
}

// ============================================================
// INSTANCIA GLOBAL
// ============================================================
const clientCache = new ClientCache();

// ============================================================
// LIMPIEZA AUTOMÁTICA CADA 5 MINUTOS
// ============================================================
setInterval(async () => {
    try {
        const cleaned = await clientCache.cleanExpired();
        if (cleaned > 0) {
            console.log(`🧹 [IndexedDB] Limpiados ${cleaned} items expirados`);
        }
    } catch (error) {
        console.warn('Error limpiando caché:', error);
    }
}, 300000);

// ============================================================
// EXPORTAR PARA USO EN EL FRONTEND
// ============================================================
export default clientCache;