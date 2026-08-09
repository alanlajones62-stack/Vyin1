// backend/notifications.js - VERSIÓN CORREGIDA CON MENSAJES DETALLADOS Y VYIN IA
// CON SOPORTE PARA RESPUESTAS A RESPUESTAS

const auth = require('./middleware/auth');
const { getVyinService } = require('./services/vyin-ia.service');

module.exports = (read, write, io) => {
    const router = require('express').Router();
    const vyinService = getVyinService();

    // ============================================================
    // OBTENER NOTIFICACIONES (CON TRADUCCIÓN Y MENSAJES DETALLADOS)
    // ============================================================
    router.get('/', auth, async (req, res) => {
        try {
            const notifications = read('notifications.json');
            const users = read('users.json');
            const stories = read('stories.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            const userLang = currentUser ? vyinService.getUserLanguage(currentUser) : 'es';
            
            let userNotifications = notifications
                .filter(n => n.userId === req.userId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 50);
            
            // Enriquecer y traducir notificaciones
            const updatedNotifications = await Promise.all(userNotifications.map(async (notif) => {
                const fromUser = users.find(u => u.id === notif.fromUserId);
                const story = notif.storyId ? stories.find(s => s.id === notif.storyId) : null;
                
                if (fromUser) {
                    notif.fromName = fromUser.fullName || 'Usuario';
                    notif.fromUsername = fromUser.username || 'usuario';
                    notif.fromAvatar = fromUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fromUser.fullName || 'U')}&background=a855f7&color=fff`;
                }
                
                // 🔥 CONSTRUIR MENSAJE DETALLADO
                let detailedMessage = '';
                let icon = notif.icon || '🔔';
                let previewText = '';
                
                switch(notif.type) {
                    case 'like':
                        icon = '❤️';
                        detailedMessage = `${notif.fromName || 'Usuario'} le dio like a tu historia`;
                        if (story && story.caption) {
                            detailedMessage += `: "${story.caption.substring(0, 30)}${story.caption.length > 30 ? '...' : ''}"`;
                        }
                        break;
                    case 'comment':
                        icon = '💬';
                        previewText = notif.commentPreview || notif.data?.commentPreview || '';
                        const preview = previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText;
                        detailedMessage = `${notif.fromName || 'Usuario'} comentó en tu historia: "${preview}"`;
                        notif.commentPreview = previewText;
                        notif.data = notif.data || {};
                        notif.data.commentPreview = previewText;
                        break;
                    case 'reply':
                        icon = '💬';
                        const replyPreview = notif.replyPreview || notif.data?.replyPreview || '';
                        const reply = replyPreview.length > 50 ? replyPreview.substring(0, 50) + '...' : replyPreview;
                        detailedMessage = `${notif.fromName || 'Usuario'} respondió a tu comentario: "${reply}"`;
                        notif.replyPreview = replyPreview;
                        notif.data = notif.data || {};
                        notif.data.replyPreview = replyPreview;
                        break;
                    case 'reply_to_reply':
                        icon = '💬';
                        const replyToReplyPreview = notif.replyPreview || notif.data?.replyPreview || '';
                        const replyToReply = replyToReplyPreview.length > 50 ? replyToReplyPreview.substring(0, 50) + '...' : replyToReplyPreview;
                        const repliedToName = notif.data?.repliedToName || 'usuario';
                        detailedMessage = `${notif.fromName || 'Usuario'} respondió a @${repliedToName}: "${replyToReply}"`;
                        notif.replyPreview = replyToReplyPreview;
                        notif.data = notif.data || {};
                        notif.data.replyPreview = replyToReplyPreview;
                        break;
                    case 'follow_request':
                        icon = '📨';
                        detailedMessage = `${notif.fromName || 'Usuario'} te ha enviado una solicitud de seguimiento`;
                        break;
                    case 'follow_accept':
                        icon = '✅';
                        detailedMessage = `${notif.fromName || 'Usuario'} ha aceptado tu solicitud de seguimiento`;
                        break;
                    case 'mention':
                        icon = '🔔';
                        detailedMessage = `${notif.fromName || 'Usuario'} te mencionó en un comentario`;
                        if (story && story.caption) {
                            detailedMessage += ` en "${story.caption.substring(0, 30)}${story.caption.length > 30 ? '...' : ''}"`;
                        }
                        if (notif.data?.commentPreview) {
                            detailedMessage += `: "${notif.data.commentPreview.substring(0, 30)}${notif.data.commentPreview.length > 30 ? '...' : ''}"`;
                        }
                        break;
                    case 'message':
                        icon = '💬';
                        const msgPreview = notif.data?.preview || '';
                        const previewMsg = msgPreview.length > 40 ? msgPreview.substring(0, 40) + '...' : previewMsg;
                        detailedMessage = `${notif.fromName || 'Usuario'} te envió un mensaje: "${previewMsg}"`;
                        break;
                    default:
                        detailedMessage = `${notif.fromName || 'Usuario'} interactuó contigo`;
                }
                
                notif.message = detailedMessage;
                notif.icon = icon;
                
                // 🔥 TRADUCIR SI ES NECESARIO
                if (currentUser && userLang !== 'es' && detailedMessage) {
                    try {
                        const translated = await vyinService.translateText(detailedMessage, userLang);
                        if (translated && translated !== detailedMessage) {
                            notif.message = translated;
                            notif.translated = true;
                            notif.originalMessage = detailedMessage;
                        }
                    } catch (error) {
                        console.warn('⚠️ Error traduciendo notificación:', error.message);
                    }
                }
                
                return notif;
            }));
            
            const unreadCount = updatedNotifications.filter(n => !n.read).length;
            
            res.json({
                notifications: updatedNotifications,
                unreadCount: unreadCount,
                userLanguage: userLang
            });
        } catch (error) {
            console.error('Error obteniendo notificaciones:', error);
            res.json({ notifications: [], unreadCount: 0 });
        }
    });

    // ============================================================
    // MARCAR NOTIFICACIÓN COMO LEÍDA
    // ============================================================
    router.put('/:id/read', auth, (req, res) => {
        try {
            let notifications = read('notifications.json');
            const index = notifications.findIndex(n => n.id === req.params.id && n.userId === req.userId);
            
            if (index !== -1) {
                notifications[index].read = true;
                write('notifications.json', notifications);
                
                io.to(`user_${req.userId}`).emit('notification_read', {
                    notificationId: req.params.id
                });
                
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'Notificación no encontrada' });
            }
        } catch (error) {
            console.error('Error marcando notificación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // MARCAR TODAS COMO LEÍDAS
    // ============================================================
    router.put('/read-all', auth, (req, res) => {
        try {
            let notifications = read('notifications.json');
            let markedCount = 0;
            
            notifications = notifications.map(n => {
                if (n.userId === req.userId && !n.read) {
                    markedCount++;
                    n.read = true;
                }
                return n;
            });
            
            write('notifications.json', notifications);
            
            io.to(`user_${req.userId}`).emit('all_notifications_read');
            
            res.json({ 
                success: true, 
                markedCount: markedCount,
                message: `Se marcaron ${markedCount} notificaciones como leídas`
            });
        } catch (error) {
            console.error('Error marcando todas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR NOTIFICACIÓN
    // ============================================================
    router.delete('/:id', auth, (req, res) => {
        try {
            let notifications = read('notifications.json');
            const notification = notifications.find(n => n.id === req.params.id);
            
            if (!notification || notification.userId !== req.userId) {
                return res.status(404).json({ error: 'Notificación no encontrada' });
            }
            
            notifications = notifications.filter(n => n.id !== req.params.id);
            write('notifications.json', notifications);
            
            io.to(`user_${req.userId}`).emit('notification_deleted', {
                notificationId: req.params.id
            });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Error eliminando notificación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR TODAS LAS NOTIFICACIONES
    // ============================================================
    router.delete('/clear-all', auth, (req, res) => {
        try {
            let notifications = read('notifications.json');
            const beforeCount = notifications.length;
            
            notifications = notifications.filter(n => n.userId !== req.userId);
            write('notifications.json', notifications);
            
            io.to(`user_${req.userId}`).emit('all_notifications_cleared');
            
            res.json({ 
                success: true, 
                deletedCount: beforeCount - notifications.length,
                message: `Se eliminaron todas las notificaciones`
            });
        } catch (error) {
            console.error('Error eliminando todas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // CONTADOR DE NO LEÍDAS
    // ============================================================
    router.get('/unread-count', auth, (req, res) => {
        try {
            const notifications = read('notifications.json');
            const unreadCount = notifications
                .filter(n => n.userId === req.userId && !n.read)
                .length;
            
            res.json({ unreadCount });
        } catch (error) {
            console.error('Error obteniendo contador:', error);
            res.json({ unreadCount: 0 });
        }
    });

    // ============================================================
    // CREAR NOTIFICACIÓN (FUNCIÓN AUXILIAR)
    // ============================================================
    const createNotification = (userId, type, fromUserId, data) => {
        try {
            const notifications = read('notifications.json');
            const users = read('users.json');
            const fromUser = users.find(u => u.id === fromUserId);
            const targetUser = users.find(u => u.id === userId);
            
            if (!fromUser) {
                console.error('Usuario no encontrado para notificación:', fromUserId);
                return null;
            }
            
            let message = '';
            let icon = '';
            let previewText = '';
            
            switch(type) {
                case 'follow_request':
                    icon = '📨';
                    message = `${fromUser.fullName || 'Usuario'} te ha enviado una solicitud de seguimiento`;
                    break;
                case 'follow_accept':
                    icon = '✅';
                    message = `${fromUser.fullName || 'Usuario'} ha aceptado tu solicitud de seguimiento`;
                    break;
                case 'like':
                    icon = '❤️';
                    const likeStory = data?.storyId ? read('stories.json').find(s => s.id === data.storyId) : null;
                    let likeCaption = '';
                    if (likeStory && likeStory.caption) {
                        likeCaption = `: "${likeStory.caption.substring(0, 30)}${likeStory.caption.length > 30 ? '...' : ''}"`;
                    }
                    message = `${fromUser.fullName || 'Usuario'} le dio like a tu historia${likeCaption}`;
                    break;
                case 'comment':
                    icon = '💬';
                    previewText = data?.commentPreview || '';
                    const preview = previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText;
                    message = `${fromUser.fullName || 'Usuario'} comentó en tu historia: "${preview}"`;
                    break;
                case 'reply':
                    icon = '💬';
                    previewText = data?.replyPreview || '';
                    const reply = previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText;
                    message = `${fromUser.fullName || 'Usuario'} respondió a tu comentario: "${reply}"`;
                    break;
                case 'reply_to_reply':
                    icon = '💬';
                    previewText = data?.replyPreview || '';
                    const replyToReply = previewText.length > 50 ? previewText.substring(0, 50) + '...' : previewText;
                    const repliedToName = data?.repliedToName || 'usuario';
                    message = `${fromUser.fullName || 'Usuario'} respondió a @${repliedToName}: "${replyToReply}"`;
                    break;
                case 'mention':
                    icon = '🔔';
                    message = `${fromUser.fullName || 'Usuario'} te mencionó en un comentario`;
                    if (data?.storyId) {
                        const mentionStory = read('stories.json').find(s => s.id === data.storyId);
                        if (mentionStory && mentionStory.caption) {
                            message += ` en "${mentionStory.caption.substring(0, 30)}${mentionStory.caption.length > 30 ? '...' : ''}"`;
                        }
                    }
                    if (data?.commentPreview) {
                        message += `: "${data.commentPreview.substring(0, 30)}${data.commentPreview.length > 30 ? '...' : ''}"`;
                    }
                    break;
                case 'message':
                    icon = '💬';
                    const msgPreview = data?.preview || '';
                    const previewMsg = msgPreview.length > 40 ? msgPreview.substring(0, 40) + '...' : previewMsg;
                    message = `${fromUser.fullName || 'Usuario'} te envió un mensaje: "${previewMsg}"`;
                    break;
                default:
                    icon = '🔔';
                    message = `${fromUser.fullName || 'Usuario'} interactuó contigo`;
            }
            
            const notificationData = {
                ...data,
                previewText: previewText || data?.commentPreview || data?.replyPreview || ''
            };
            
            const newNotification = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                userId: userId,
                type: type,
                fromUserId: fromUserId,
                fromName: fromUser.fullName || 'Usuario',
                fromUsername: fromUser.username || 'usuario',
                fromAvatar: fromUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fromUser.fullName || 'U')}&background=a855f7&color=fff`,
                message: message,
                icon: icon,
                storyId: data?.storyId || null,
                commentId: data?.commentId || null,
                replyId: data?.replyId || null,
                commentPreview: data?.commentPreview || null,
                replyPreview: data?.replyPreview || null,
                data: notificationData,
                read: false,
                translated: false,
                language: targetUser?.language || 'es',
                createdAt: new Date().toISOString()
            };
            
            notifications.push(newNotification);
            write('notifications.json', notifications);
            
            io.to(`user_${userId}`).emit('new_notification', newNotification);
            
            const unreadCount = notifications.filter(n => n.userId === userId && !n.read).length;
            io.to(`user_${userId}`).emit('notification_count_updated', { unreadCount });
            
            console.log(`📢 Notificación creada: ${type} para usuario ${userId} de ${fromUser.username}`);
            
            return newNotification;
        } catch (error) {
            console.error('Error creando notificación:', error);
            return null;
        }
    };

    return { router, createNotification };
};