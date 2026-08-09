class Cache {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 60000; // 60 segundos
        this.hits = 0;
        this.misses = 0;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.misses++;
            return null;
        }
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }
        
        this.hits++;
        return item.value;
    }

    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, {
            value: value,
            expiry: Date.now() + ttl
        });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    invalidatePattern(pattern) {
        const toDelete = [];
        for (const [key] of this.cache) {
            if (key.includes(pattern)) {
                toDelete.push(key);
            }
        }
        toDelete.forEach(key => this.cache.delete(key));
    }

    getStats() {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%',
            size: this.cache.size
        };
    }

    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        return cleaned;
    }
}

const cache = new Cache();

setInterval(() => {
    const cleaned = cache.cleanExpired();
    if (cleaned > 0) {
        console.log(`🧹 Caché limpiado: ${cleaned} items expirados`);
    }
}, 300000);

module.exports = cache;