// backend/modules/moderation/story-moderation.js

/**
 * SISTEMA DE MODERACIÓN DE HISTORIAS
 * 
 * Maneja:
 * - Eliminación de historias por NSFW
 * - Notificaciones automáticas a usuarios
 * - Registro de acciones de moderación
 * - Sistema de advertencias
 */

class StoryModeration {
    constructor(read, write, io, logger) {
        this.read = read;
        this.write = write;
        this.io = io;
        this.logger = logger;
        this.MODERATION_LOG = 'moderation-log.json';
        this.WARNING_THRESHOLD = 3;
        this.SUSPENSION_DAYS = {
            1: 1,
            2: 3,
            3: 7,
            4: 30,
            5: 'permanent'
        };
    }

    /**
     * Eliminar una historia por NSFW
     */
    async deleteNSFWStory(storyId, reason, confidence, adminId = null) {
        try {
            const stories = this.read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                this.logger?.warn(`⚠️ Historia ${storyId} no encontrada para eliminar`);
                return { success: false, error: 'Historia no encontrada' };
            }
            
            const story = stories[storyIndex];
            const userId = story.userId;
            
            // Guardar copia antes de eliminar para el registro
            const storyData = { ...story };
            
            // Eliminar archivo de imagen si existe
            if (story.mediaType === 'image' && story.mediaUrl) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const imagePath = path.join(__dirname, '../../frontend', story.mediaUrl);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                        this.logger?.info(`🗑️ Imagen eliminada: ${story.mediaUrl}`);
                    }
                } catch (e) {
                    this.logger?.warn('⚠️ Error eliminando imagen:', e.message);
                }
            }
            
            // Eliminar la historia
            stories.splice(storyIndex, 1);
            this.write('stories.json', stories);
            
            // Registrar en el log de moderación
            this.logModerationAction({
                action: 'delete_nsfw',
                storyId: storyId,
                userId: userId,
                adminId: adminId,
                reason: reason,
                confidence: confidence,
                storyData: storyData,
                timestamp: new Date().toISOString()
            });
            
            // Notificar al usuario
            const userNotifications = require('../notifications/user-notifications');
            const notifier = new userNotifications(this.read, this.write, this.io, this.logger);
            const notification = notifier.notifyStoryDeletedNSFW(
                userId,
                storyId,
                reason || 'Contenido NSFW detectado automáticamente',
                confidence || 0
            );
            
            // Verificar si el usuario necesita advertencia
            await this.checkUserWarnings(userId, storyId);
            
            // Emitir evento
            if (this.io) {
                this.io.to(`user_${userId}`).emit('story_deleted_by_moderator', {
                    storyId: storyId,
                    reason: reason || 'Contenido NSFW',
                    byIA: !adminId,
                    notification: notification
                });
            }
            
            this.logger?.info(`🗑️ Historia NSFW eliminada: ${storyId} (confianza: ${confidence}%)`);
            
            return {
                success: true,
                storyId: storyId,
                userId: userId,
                notification: notification
            };
            
        } catch (error) {
            this.logger?.error('❌ Error eliminando historia NSFW:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verificar y gestionar advertencias del usuario
     */
    async checkUserWarnings(userId, storyId) {
        const log = this.read(this.MODERATION_LOG) || [];
        
        // Obtener advertencias del usuario (últimos 30 días)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const userWarnings = log.filter(entry => 
            entry.userId === userId && 
            entry.action === 'delete_nsfw' &&
            new Date(entry.timestamp) > thirtyDaysAgo
        );
        
        const warningCount = userWarnings.length;
        
        if (warningCount >= this.WARNING_THRESHOLD) {
            // Enviar advertencia seria
            const userNotifications = require('../notifications/user-notifications');
            const notifier = new userNotifications(this.read, this.write, this.io, this.logger);
            
            notifier.notifyWarning(
                userId,
                `múltiples violaciones de contenido NSFW (${warningCount} en los últimos 30 días)`,
                {
                    storyId: storyId,
                    warningCount: warningCount,
                    threshold: this.WARNING_THRESHOLD,
                    action: 'review'
                }
            );
            
            // Si tiene 5 o más, suspender
            if (warningCount >= 5) {
                await this.suspendUser(userId, warningCount);
            }
        }
        
        return { warningCount };
    }

    /**
     * Suspender a un usuario por violaciones repetidas
     */
    async suspendUser(userId, violationCount) {
        const users = this.read('users.json');
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) return;
        
        const suspensionDays = this.SUSPENSION_DAYS[Math.min(violationCount, 5)] || 30;
        const suspendedUntil = suspensionDays === 'permanent' 
            ? null 
            : new Date(Date.now() + suspensionDays * 24 * 60 * 60 * 1000).toISOString();
        
        users[userIndex].suspended = true;
        users[userIndex].suspendedUntil = suspendedUntil;
        users[userIndex].suspensionReason = `Múltiples violaciones de contenido NSFW (${violationCount} advertencias)`;
        users[userIndex].suspendedAt = new Date().toISOString();
        
        this.write('users.json', users);
        
        // Notificar suspensión
        const userNotifications = require('../notifications/user-notifications');
        const notifier = new userNotifications(this.read, this.write, this.io, this.logger);
        
        notifier.notifySuspension(
            userId,
            suspensionDays === 'permanent' ? 'indefinidos' : suspensionDays,
            users[userIndex].suspensionReason
        );
        
        this.logger?.info(`🔒 Usuario ${userId} suspendido por ${suspensionDays} días`);
        
        return { suspended: true, days: suspensionDays };
    }

    /**
     * Registrar acción de moderación
     */
    logModerationAction(action) {
        try {
            const log = this.read(this.MODERATION_LOG) || [];
            log.push({
                ...action,
                loggedAt: new Date().toISOString()
            });
            this.write(this.MODERATION_LOG, log);
        } catch (error) {
            this.logger?.error('Error registrando acción de moderación:', error);
        }
    }

    /**
     * Obtener estadísticas de moderación
     */
    getStats() {
        const log = this.read(this.MODERATION_LOG) || [];
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const stats = {
            totalDeletions: log.filter(e => e.action === 'delete_nsfw').length,
            today: log.filter(e => e.action === 'delete_nsfw' && e.timestamp.startsWith(today)).length,
            thisWeek: log.filter(e => e.action === 'delete_nsfw' && new Date(e.timestamp) > weekAgo).length,
            byConfidence: {
                high: log.filter(e => e.action === 'delete_nsfw' && e.confidence > 90).length,
                medium: log.filter(e => e.action === 'delete_nsfw' && e.confidence > 70 && e.confidence <= 90).length,
                low: log.filter(e => e.action === 'delete_nsfw' && e.confidence <= 70).length
            },
            uniqueUsers: new Set(log.filter(e => e.action === 'delete_nsfw').map(e => e.userId)).size,
            recent: log
                .filter(e => e.action === 'delete_nsfw')
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10)
        };
        
        return stats;
    }

    /**
     * Revertir eliminación (solo para administradores)
     */
    async restoreStory(storyId, adminId) {
        const log = this.read(this.MODERATION_LOG) || [];
        const entry = log.find(e => e.storyId === storyId && e.action === 'delete_nsfw');
        
        if (!entry) {
            return { success: false, error: 'No se encontró registro de eliminación' };
        }
        
        // Restaurar historia
        const stories = this.read('stories.json');
        const storyData = entry.storyData;
        
        // Verificar que no exista ya
        const exists = stories.find(s => s.id === storyId);
        if (exists) {
            return { success: false, error: 'La historia ya existe' };
        }
        
        stories.push(storyData);
        this.write('stories.json', stories);
        
        // Registrar restauración
        this.logModerationAction({
            action: 'restore_story',
            storyId: storyId,
            userId: storyData.userId,
            adminId: adminId,
            restoredAt: new Date().toISOString()
        });
        
        this.logger?.info(`📂 Historia ${storyId} restaurada por admin ${adminId}`);
        
        return { success: true, story: storyData };
    }
}

module.exports = StoryModeration;