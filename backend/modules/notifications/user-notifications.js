// backend/modules/notifications/user-notifications.js

/**
 * SISTEMA DE NOTIFICACIONES A USUARIOS
 * 
 * Notifica a los usuarios cuando:
 * - Su historia es eliminada (con motivo)
 * - Reciben una advertencia
 * - Su cuenta es verificada
 * - Su solicitud de empresa es aprobada/rechazada
 */

class UserNotifications {
    constructor(read, write, io, logger) {
        this.read = read;
        this.write = write;
        this.io = io;
        this.logger = logger;
    }

    /**
     * Notificar eliminación de historia por NSFW
     */
    notifyStoryDeletedNSFW(userId, storyId, reason, confidence) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'story_deleted_nsfw',
            title: '🚫 Historia eliminada por contenido NSFW',
            message: `Tu historia ha sido eliminada automáticamente por contenido NSFW (${confidence.toFixed(1)}% de confianza).`,
            reason: reason || 'Contenido NSFW detectado automáticamente por VYIN IA',
            storyId: storyId,
            read: false,
            createdAt: new Date().toISOString(),
            icon: '🚫',
            action: 'warning',
            severity: 'high',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Notificación NSFW enviada a usuario ${userId} por historia ${storyId}`);
        
        return notification;
    }

    /**
     * Notificar advertencia por contenido inapropiado
     */
    notifyWarning(userId, reason, details) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'content_warning',
            title: '⚠️ Advertencia de contenido inapropiado',
            message: `Has recibido una advertencia por ${reason}. Por favor, revisa las normas de la comunidad.`,
            details: details || {},
            read: false,
            createdAt: new Date().toISOString(),
            icon: '⚠️',
            action: 'warning',
            severity: 'medium',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Advertencia enviada a usuario ${userId}: ${reason}`);
        
        return notification;
    }

    /**
     * Notificar suspensión temporal
     */
    notifySuspension(userId, duration, reason) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'account_suspended',
            title: '🔒 Cuenta suspendida temporalmente',
            message: `Tu cuenta ha sido suspendida por ${duration} días debido a: ${reason}`,
            duration: duration,
            reason: reason,
            read: false,
            createdAt: new Date().toISOString(),
            icon: '🔒',
            action: 'suspension',
            severity: 'critical',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Suspensión notificada a usuario ${userId}: ${duration} días`);
        
        return notification;
    }

    /**
     * Notificar verificación de cuenta
     */
    notifyAccountVerified(userId) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'account_verified',
            title: '✅ Cuenta verificada',
            message: '¡Felicidades! Tu cuenta ha sido verificada. Ahora tienes acceso a todas las funciones premium.',
            read: false,
            createdAt: new Date().toISOString(),
            icon: '✅',
            action: 'success',
            severity: 'low',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Verificación notificada a usuario ${userId}`);
        
        return notification;
    }

    /**
     * Notificar aprobación de cuenta de empresa
     */
    notifyBusinessApproved(userId, businessName) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'business_approved',
            title: '🏢 Cuenta de empresa aprobada',
            message: `Tu cuenta de empresa "${businessName}" ha sido aprobada. ¡Bienvenido al programa de empresas!`,
            businessName: businessName,
            read: false,
            createdAt: new Date().toISOString(),
            icon: '🏢',
            action: 'success',
            severity: 'low',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Empresa aprobada notificada a usuario ${userId}`);
        
        return notification;
    }

    /**
     * Notificar rechazo de cuenta de empresa
     */
    notifyBusinessRejected(userId, reason) {
        const notification = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            userId: userId,
            type: 'business_rejected',
            title: '❌ Solicitud de empresa rechazada',
            message: `Tu solicitud de cuenta de empresa ha sido rechazada. Motivo: ${reason || 'No cumple con los requisitos'}`,
            reason: reason,
            read: false,
            createdAt: new Date().toISOString(),
            icon: '❌',
            action: 'error',
            severity: 'medium',
            from: 'VYIN_IA'
        };

        this.saveNotification(notification);
        this.emitNotification(userId, notification);
        
        this.logger?.info(`📢 Empresa rechazada notificada a usuario ${userId}`);
        
        return notification;
    }

    /**
     * Guardar notificación en el sistema
     */
    saveNotification(notification) {
        try {
            const notifications = this.read('notifications.json') || [];
            notifications.push(notification);
            this.write('notifications.json', notifications);
        } catch (error) {
            this.logger?.error('Error guardando notificación:', error);
        }
    }

    /**
     * Emitir notificación vía Socket.IO
     */
    emitNotification(userId, notification) {
        try {
            if (this.io) {
                this.io.to(`user_${userId}`).emit('new_notification', notification);
                
                // Actualizar contador de no leídas
                const notifications = this.read('notifications.json') || [];
                const unreadCount = notifications.filter(n => n.userId === userId && !n.read).length;
                this.io.to(`user_${userId}`).emit('notification_count_updated', { unreadCount });
            }
        } catch (error) {
            this.logger?.error('Error emitiendo notificación:', error);
        }
    }

    /**
     * Enviar notificación de historias eliminadas en lote
     */
    notifyBatchDeletions(deletions) {
        const results = [];
        
        for (const deletion of deletions) {
            const { userId, storyId, reason, confidence } = deletion;
            const notification = this.notifyStoryDeletedNSFW(userId, storyId, reason, confidence);
            results.push(notification);
        }
        
        this.logger?.info(`📢 ${results.length} notificaciones de eliminación enviadas en lote`);
        
        return results;
    }
}

module.exports = UserNotifications;