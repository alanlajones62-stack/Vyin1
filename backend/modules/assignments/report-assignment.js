// backend/modules/assignments/report-assignment.js

/**
 * SISTEMA DE ASIGNACIÓN DE DENUNCIAS
 * 
 * Distribuye las denuncias entre administradores basado en:
 * - País del denunciante
 * - País del denunciado
 * - Región del denunciante
 * - Carga de trabajo actual de cada admin
 */

class ReportAssignment {
    constructor(read, write, logger) {
        this.read = read;
        this.write = write;
        this.logger = logger;
        this.ASSIGNMENT_FILE = 'report-assignments.json';
    }

    /**
     * Obtiene todos los administradores activos con sus cargas
     */
    getActiveAdmins() {
        const users = this.read('users.json');
        const admins = users.filter(u => u.role === 'admin');
        
        // Obtener asignaciones actuales
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        
        // Calcular carga de trabajo por admin
        const adminLoad = {};
        admins.forEach(admin => {
            const assignedCount = assignments.filter(a => 
                a.adminId === admin.id && 
                a.status === 'assigned'
            ).length;
            
            adminLoad[admin.id] = {
                admin: admin,
                assignedCount: assignedCount,
                totalReports: assignments.filter(a => a.adminId === admin.id).length
            };
        });
        
        return adminLoad;
    }

    /**
     * Encuentra el mejor administrador para una denuncia
     */
    findBestAdmin(report) {
        const admins = this.getActiveAdmins();
        const adminIds = Object.keys(admins);
        
        if (adminIds.length === 0) {
            this.logger?.warn('⚠️ No hay administradores disponibles');
            return null;
        }

        // Obtener información del denunciante y denunciado
        const users = this.read('users.json');
        const reporter = users.find(u => u.id === report.userId);
        const reported = users.find(u => u.id === report.storyOwnerId);
        
        // Si solo hay un admin, asignarle a él
        if (adminIds.length === 1) {
            return adminIds[0];
        }

        // Puntuación de cada admin
        const scores = {};
        
        for (const [adminId, data] of Object.entries(admins)) {
            let score = 0;
            const admin = data.admin;
            
            // 1. Priorizar admin del mismo país que el denunciante (25 puntos)
            if (reporter && admin.country === reporter.country) {
                score += 25;
            }
            
            // 2. Priorizar admin del mismo país que el denunciado (20 puntos)
            if (reported && admin.country === reported.country) {
                score += 20;
            }
            
            // 3. Priorizar admin de la misma región que el denunciante (15 puntos)
            if (reporter && admin.region === reporter.region) {
                score += 15;
            }
            
            // 4. Menor carga de trabajo = mayor puntuación (hasta 20 puntos)
            const maxLoad = Math.max(...Object.values(admins).map(a => a.assignedCount), 1);
            const loadRatio = 1 - (data.assignedCount / (maxLoad + 1));
            score += loadRatio * 20;
            
            // 5. Bonus por idioma compartido (10 puntos)
            if (reporter && admin.language === reporter.language) {
                score += 10;
            }
            
            scores[adminId] = score;
        }

        // Ordenar por puntuación y seleccionar el mejor
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        
        this.logger?.info(`📊 Asignación calculada: ${sorted.map(([id, score]) => `${id}: ${score.toFixed(1)}`).join(', ')}`);
        
        return sorted[0][0];
    }

    /**
     * Asigna una denuncia a un administrador
     */
    assignReport(reportId, adminId) {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        
        // Verificar si ya está asignada
        const existing = assignments.find(a => a.reportId === reportId);
        if (existing) {
            return existing;
        }
        
        const newAssignment = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            reportId: reportId,
            adminId: adminId,
            assignedAt: new Date().toISOString(),
            status: 'assigned',
            lastActivity: new Date().toISOString()
        };
        
        assignments.push(newAssignment);
        this.write(this.ASSIGNMENT_FILE, assignments);
        
        this.logger?.info(`📢 Denuncia ${reportId} asignada al admin ${adminId}`);
        
        return newAssignment;
    }

    /**
     * Asigna automáticamente una denuncia
     */
    autoAssign(report) {
        const adminId = this.findBestAdmin(report);
        if (!adminId) {
            this.logger?.warn(`⚠️ No se pudo asignar denuncia ${report.id}`);
            return null;
        }
        
        return this.assignReport(report.id, adminId);
    }

    /**
     * Libera una denuncia (cuando es resuelta o expirada)
     */
    releaseReport(reportId) {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        const index = assignments.findIndex(a => a.reportId === reportId);
        
        if (index !== -1) {
            assignments[index].status = 'released';
            assignments[index].releasedAt = new Date().toISOString();
            this.write(this.ASSIGNMENT_FILE, assignments);
            this.logger?.info(`📢 Denuncia ${reportId} liberada`);
            return true;
        }
        
        return false;
    }

    /**
     * Obtiene las denuncias asignadas a un admin
     */
    getAdminReports(adminId) {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        return assignments.filter(a => a.adminId === adminId && a.status === 'assigned');
    }

    /**
     * Estadísticas de asignación
     */
    getStats() {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        const admins = this.getActiveAdmins();
        
        const stats = {
            totalAssignments: assignments.length,
            activeAssignments: assignments.filter(a => a.status === 'assigned').length,
            released: assignments.filter(a => a.status === 'released').length,
            perAdmin: {}
        };
        
        for (const [adminId, data] of Object.entries(admins)) {
            stats.perAdmin[adminId] = {
                name: data.admin.fullName || data.admin.username,
                assigned: assignments.filter(a => a.adminId === adminId && a.status === 'assigned').length,
                total: assignments.filter(a => a.adminId === adminId).length
            };
        }
        
        return stats;
    }

    /**
     * Limpia asignaciones expiradas (24 horas sin actividad)
     */
    cleanupExpired() {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        const now = Date.now();
        const EXPIRATION_MS = 24 * 60 * 60 * 1000;
        let cleaned = 0;
        
        const updated = assignments.map(a => {
            if (a.status === 'assigned') {
                const lastActivity = new Date(a.lastActivity).getTime();
                if (now - lastActivity > EXPIRATION_MS) {
                    cleaned++;
                    return { ...a, status: 'expired', expiredAt: new Date().toISOString() };
                }
            }
            return a;
        });
        
        if (cleaned > 0) {
            this.write(this.ASSIGNMENT_FILE, updated);
            this.logger?.info(`🧹 ${cleaned} asignaciones expiradas limpiadas`);
        }
        
        return cleaned;
    }

    /**
     * Reasigna una denuncia expirada
     */
    reassignExpired(reportId) {
        const assignments = this.read(this.ASSIGNMENT_FILE) || [];
        const index = assignments.findIndex(a => a.reportId === reportId);
        
        if (index === -1) return null;
        
        // Marcar como expirada
        assignments[index].status = 'expired';
        assignments[index].expiredAt = new Date().toISOString();
        this.write(this.ASSIGNMENT_FILE, assignments);
        
        // Obtener el reporte
        const reports = this.read('reports.json');
        const report = reports.find(r => r.id === reportId);
        if (!report) return null;
        
        // Reasignar
        return this.autoAssign(report);
    }
}

module.exports = ReportAssignment;