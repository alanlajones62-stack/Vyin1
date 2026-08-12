// backend/chats.js - CON SISTEMA DE BLOQUEO, CIFRADO Y MULTIMEDIA
const auth = require('./middleware/auth');

module.exports = (read, write, io, encryptMessage, decryptMessage, createNotification) => {
    const router = require('express').Router();

    // ============================================================
    // FUNCIÓN AUXILIAR PARA VERIFICAR BLOQUEOS
    // ============================================================
    function isBlocked(users, blockerId, blockedId) {
        const blocker = users.find(u => u.id === blockerId);
        const blocked = users.find(u => u.id === blockedId);
        
        if (!blocker || !blocked) return false;
        
        // Si el bloqueador tiene al bloqueado en su lista de bloqueados
        if (blocker.blocked && blocker.blocked.includes(blockedId)) return true;
        
        // Si el bloqueado tiene al bloqueador en su lista de bloqueados
        if (blocked.blockedBy && blocked.blockedBy.includes(blockerId)) return true;
        
        return false;
    }

    // ============================================================
    // FUNCIÓN PARA CIFRAR MULTIMEDIA (BASE64)
    // ============================================================
    function encryptMedia(mediaData) {
        return encryptMessage(mediaData);
    }

    function decryptMedia(encryptedMedia) {
        return decryptMessage(encryptedMedia);
    }

    // ============================================================
    // OBTENER CONVERSACIONES - CON FILTRO DE BLOQUEOS
    // ============================================================
    router.get('/conversations', auth, (req, res) => {
        try {
            const messages = read('messages.json');
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];
            
            const userMessages = messages.filter(m => {
                const otherId = m.from === req.userId ? m.to : m.from;
                if (blockedIds.includes(otherId)) return false;
                if (blockedByIds.includes(otherId)) return false;
                return m.from === req.userId || m.to === req.userId;
            });
            
            const conversationsMap = new Map();
            
            userMessages.forEach(msg => {
                const otherUserId = msg.from === req.userId ? msg.to : msg.from;
                
                if (!conversationsMap.has(otherUserId)) {
                    const otherUser = users.find(u => u.id === otherUserId);
                    if (otherUser) {
                        const isUserBlocked = blockedIds.includes(otherUserId);
                        const isUserBlockedBy = blockedByIds.includes(otherUserId);
                        
                        let userData = {
                            id: otherUser.id,
                            username: otherUser.username,
                            fullName: otherUser.fullName,
                            avatar: otherUser.avatar
                        };
                        
                        if (isUserBlocked || isUserBlockedBy) {
                            userData = {
                                id: otherUser.id,
                                username: 'usuario_no_encontrado',
                                fullName: 'Usuario no encontrado',
                                avatar: null,
                                blocked: true
                            };
                        }
                        
                        // Decrypt last message content
                        let lastContent = '';
                        if (msg.content) {
                            try {
                                lastContent = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                            } catch (e) {
                                lastContent = '[Mensaje cifrado]';
                            }
                        }
                        
                        conversationsMap.set(otherUserId, {
                            user: userData,
                            lastMessage: {
                                content: lastContent,
                                timestamp: msg.timestamp,
                                read: msg.read,
                                fromMe: msg.from === req.userId,
                                mediaType: msg.mediaType || null
                            },
                            unreadCount: 0,
                            isBlocked: isUserBlocked || isUserBlockedBy
                        });
                    }
                }
                
                const conv = conversationsMap.get(otherUserId);
                if (conv && new Date(msg.timestamp) > new Date(conv.lastMessage.timestamp)) {
                    let lastContent = '';
                    if (msg.content) {
                        try {
                            lastContent = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                        } catch (e) {
                            lastContent = '[Mensaje cifrado]';
                        }
                    }
                    conv.lastMessage = {
                        content: lastContent,
                        timestamp: msg.timestamp,
                        read: msg.read,
                        fromMe: msg.from === req.userId,
                        mediaType: msg.mediaType || null
                    };
                }
            });
            
            userMessages.forEach(msg => {
                if (msg.to === req.userId && !msg.read) {
                    const conv = conversationsMap.get(msg.from);
                    if (conv) conv.unreadCount++;
                }
            });
            
            const conversations = Array.from(conversationsMap.values());
            conversations.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
            
            res.json(conversations);
        } catch (error) {
            console.error('Error obteniendo conversaciones:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER MENSAJES CON UN USUARIO - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    router.get('/messages/:userId', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'No se puede acceder a esta conversación'
                });
            }
            
            let messages = read('messages.json');
            const limit = parseInt(req.query.limit) || 30;
            const offset = parseInt(req.query.offset) || 0;
            
            let filtered = messages.filter(m => 
                (m.from === req.userId && m.to === targetUserId) ||
                (m.from === targetUserId && m.to === req.userId)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            const paginated = filtered.slice(offset, offset + limit);
            
            const result = paginated.map(msg => {
                let content = '';
                try {
                    content = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                } catch (e) {
                    content = '[Mensaje corrupto]';
                }
                
                return {
                    id: msg.id,
                    from: msg.from,
                    to: msg.to,
                    content: content,
                    timestamp: msg.timestamp,
                    read: msg.read,
                    isOwn: msg.from === req.userId,
                    mediaType: msg.mediaType || null,
                    encrypted: msg.encrypted || false
                };
            });
            
            let updated = false;
            let updatedMessageIds = [];
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === req.userId && msg.from === targetUserId && !msg.read) {
                    updated = true;
                    updatedMessageIds.push(msg.id);
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                write('messages.json', updatedMessages);
                console.log(`📖 Usuario ${req.userId} marcó ${updatedMessageIds.length} mensajes como leídos de ${targetUserId}`);
                
                io.to(`user_${targetUserId}`).emit('messages_read', {
                    byUserId: req.userId,
                    withUserId: targetUserId,
                    messageIds: updatedMessageIds
                });
                
                io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            }
            
            res.json(result);
        } catch (error) {
            console.error('Error obteniendo mensajes:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ENVIAR MENSAJE DE TEXTO - CON CIFRADO Y BLOQUEOS
    // ============================================================
    router.post('/messages/:userId', auth, (req, res) => {
        try {
            const { content } = req.body;
            const toUserId = req.params.userId;
            
            if (!content || content.trim().length === 0) {
                return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
            }
            
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, toUserId)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'No puedes enviar mensajes a este usuario'
                });
            }
            
            const encryptedContent = encryptMessage(content);
            const messages = read('messages.json');
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: encryptedContent,
                encrypted: true,
                read: false,
                timestamp: new Date().toISOString(),
                mediaType: null
            };
            
            messages.push(newMessage);
            write('messages.json', messages);
            
            const responseMessage = {
                id: newMessage.id,
                from: newMessage.from,
                to: newMessage.to,
                content: content,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: null,
                encrypted: true
            };
            
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    id: newMessage.id,
                    from: req.userId,
                    to: toUserId,
                    content: content,
                    timestamp: newMessage.timestamp,
                    read: false,
                    isOwn: false,
                    mediaType: null,
                    encrypted: true
                });
            }
            
            io.to(`user_${req.userId}`).emit('message_sent', responseMessage);
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${toUserId}`).emit('conversations_update', { userId: toUserId });
            
            const fromUser = users.find(u => u.id === req.userId);
            if (fromUser && createNotification) {
                if (!isBlocked(users, toUserId, req.userId)) {
                    createNotification(toUserId, 'message', req.userId, {
                        message: `${fromUser.fullName} te envió un mensaje`,
                        preview: content.substring(0, 50)
                    });
                }
            }
            
            res.status(201).json(responseMessage);
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 ENVIAR MENSAJE CON MULTIMEDIA - CIFRADO (IMÁGENES, AUDIOS, VIDEOS)
    // ============================================================
    router.post('/messages/:userId/media', auth, async (req, res) => {
        try {
            const { mediaType, mediaData, caption } = req.body;
            const toUserId = req.params.userId;
            
            if (!mediaData || !mediaType) {
                return res.status(400).json({ error: 'Datos multimedia requeridos' });
            }
            
            const validTypes = ['image', 'audio', 'video', 'file'];
            if (!validTypes.includes(mediaType)) {
                return res.status(400).json({ error: 'Tipo de multimedia no válido' });
            }
            
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, toUserId)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'No puedes enviar mensajes a este usuario'
                });
            }
            
            // Cifrar datos multimedia (base64)
            const encryptedMedia = encryptMedia(mediaData);
            const messages = read('messages.json');
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: encryptedMedia,
                encrypted: true,
                mediaType: mediaType,
                caption: caption || null,
                read: false,
                timestamp: new Date().toISOString()
            };
            
            messages.push(newMessage);
            write('messages.json', messages);
            
            const responseMessage = {
                id: newMessage.id,
                from: newMessage.from,
                to: newMessage.to,
                content: caption || `[${mediaType}]`,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: mediaType,
                encrypted: true,
                hasMedia: true
            };
            
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    id: newMessage.id,
                    from: req.userId,
                    to: toUserId,
                    content: caption || `[${mediaType}]`,
                    timestamp: newMessage.timestamp,
                    read: false,
                    isOwn: false,
                    mediaType: mediaType,
                    encrypted: true,
                    hasMedia: true
                });
            }
            
            io.to(`user_${req.userId}`).emit('message_sent', responseMessage);
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${toUserId}`).emit('conversations_update', { userId: toUserId });
            
            const fromUser = users.find(u => u.id === req.userId);
            if (fromUser && createNotification) {
                if (!isBlocked(users, toUserId, req.userId)) {
                    createNotification(toUserId, 'message', req.userId, {
                        message: `${fromUser.fullName} te envió un ${mediaType}`,
                        preview: `[${mediaType}]`
                    });
                }
            }
            
            res.status(201).json(responseMessage);
        } catch (error) {
            console.error('Error enviando mensaje multimedia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 DESCARGAR/OBTENER MEDIA CIFRADA
    // ============================================================
    router.get('/messages/:messageId/media', auth, (req, res) => {
        try {
            const messages = read('messages.json');
            const message = messages.find(m => m.id === req.params.messageId);
            
            if (!message) {
                return res.status(404).json({ error: 'Mensaje no encontrado' });
            }
            
            if (message.from !== req.userId && message.to !== req.userId) {
                return res.status(403).json({ error: 'No tienes permiso para ver este archivo' });
            }
            
            if (!message.mediaType) {
                return res.status(400).json({ error: 'Este mensaje no contiene multimedia' });
            }
            
            let decryptedMedia = '';
            try {
                decryptedMedia = decryptMedia(message.content);
            } catch (e) {
                return res.status(500).json({ error: 'Error descifrando el archivo' });
            }
            
            res.json({
                mediaType: message.mediaType,
                mediaData: decryptedMedia,
                caption: message.caption || null,
                timestamp: message.timestamp
            });
        } catch (error) {
            console.error('Error obteniendo media:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR MENSAJE
    // ============================================================
    router.delete('/messages/:messageId', auth, (req, res) => {
        try {
            let messages = read('messages.json');
            const messageIndex = messages.findIndex(m => m.id === req.params.messageId);
            
            if (messageIndex === -1) {
                return res.status(404).json({ error: 'Mensaje no encontrado' });
            }
            
            const message = messages[messageIndex];
            
            if (message.from !== req.userId) {
                return res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
            }
            
            messages.splice(messageIndex, 1);
            write('messages.json', messages);
            
            io.to(`user_${message.to}`).emit('message_deleted', { messageId: req.params.messageId });
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${message.to}`).emit('conversations_update', { userId: message.to });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Error eliminando mensaje:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR MENSAJE MULTIMEDIA (también elimina el archivo)
    // ============================================================
    router.delete('/messages/:messageId/media', auth, (req, res) => {
        try {
            let messages = read('messages.json');
            const messageIndex = messages.findIndex(m => m.id === req.params.messageId);
            
            if (messageIndex === -1) {
                return res.status(404).json({ error: 'Mensaje no encontrado' });
            }
            
            const message = messages[messageIndex];
            
            if (message.from !== req.userId) {
                return res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
            }
            
            // Si tiene multimedia, limpiar el contenido
            if (message.mediaType) {
                message.content = '[Archivo eliminado]';
                message.mediaType = null;
                message.encrypted = false;
                write('messages.json', messages);
                
                io.to(`user_${message.to}`).emit('message_updated', { 
                    messageId: req.params.messageId,
                    content: '[Archivo eliminado]',
                    mediaType: null
                });
            } else {
                messages.splice(messageIndex, 1);
                write('messages.json', messages);
            }
            
            io.to(`user_${message.to}`).emit('message_deleted', { messageId: req.params.messageId });
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${message.to}`).emit('conversations_update', { userId: message.to });
            
            res.json({ success: true });
        } catch (error) {
            console.error('Error eliminando mensaje multimedia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // MARCAR CONVERSACIÓN COMO LEÍDA - CON VERIFICACIÓN DE BLOQUEOS
    // ============================================================
    router.put('/conversations/:userId/read', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'No se puede acceder a esta conversación'
                });
            }
            
            let messages = read('messages.json');
            let updated = false;
            let updatedMessageIds = [];
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === req.userId && msg.from === targetUserId && !msg.read) {
                    updated = true;
                    updatedMessageIds.push(msg.id);
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                write('messages.json', updatedMessages);
                console.log(`📖 Usuario ${req.userId} marcó conversación con ${targetUserId} como leída`);
                
                io.to(`user_${targetUserId}`).emit('messages_read', {
                    byUserId: req.userId,
                    withUserId: targetUserId,
                    messageIds: updatedMessageIds
                });
                io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error('Error marcando conversación como leída:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // BUSCAR MENSAJES - CON FILTRO DE BLOQUEOS
    // ============================================================
    router.get('/search', auth, (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.length < 2) {
                return res.json([]);
            }
            
            const messages = read('messages.json');
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            if (!currentUser) {
                return res.json([]);
            }
            
            const blockedIds = currentUser.blocked || [];
            const blockedByIds = currentUser.blockedBy || [];
            
            const userMessages = messages.filter(m => {
                const otherId = m.from === req.userId ? m.to : m.from;
                if (blockedIds.includes(otherId)) return false;
                if (blockedByIds.includes(otherId)) return false;
                return m.from === req.userId || m.to === req.userId;
            });
            
            const query = q.toLowerCase();
            const results = [];
            
            userMessages.forEach(msg => {
                let decryptedContent = '';
                try {
                    decryptedContent = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                } catch (e) {
                    decryptedContent = '';
                }
                
                // Buscar en contenido o en caption
                const searchContent = decryptedContent.toLowerCase();
                const searchCaption = msg.caption ? msg.caption.toLowerCase() : '';
                
                if (searchContent.includes(query) || searchCaption.includes(query)) {
                    const otherUserId = msg.from === req.userId ? msg.to : msg.from;
                    const otherUser = users.find(u => u.id === otherUserId);
                    
                    if (otherUser && !results.some(r => r.user.id === otherUserId)) {
                        const isBlockedUser = blockedIds.includes(otherUserId);
                        const isBlockedByUser = blockedByIds.includes(otherUserId);
                        
                        let userData = {
                            id: otherUser.id,
                            username: otherUser.username,
                            fullName: otherUser.fullName,
                            avatar: otherUser.avatar
                        };
                        
                        if (isBlockedUser || isBlockedByUser) {
                            userData = {
                                id: otherUser.id,
                                username: 'usuario_no_encontrado',
                                fullName: 'Usuario no encontrado',
                                avatar: null,
                                blocked: true
                            };
                        }
                        
                        let matchContent = decryptedContent.substring(0, 50);
                        if (msg.mediaType) {
                            matchContent = `[${msg.mediaType}] ${msg.caption || ''}`;
                        }
                        
                        results.push({
                            user: userData,
                            matchContent: matchContent + (decryptedContent.length > 50 ? '...' : ''),
                            timestamp: msg.timestamp,
                            isBlocked: isBlockedUser || isBlockedByUser,
                            mediaType: msg.mediaType || null
                        });
                    }
                }
            });
            
            results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            res.json(results);
        } catch (error) {
            console.error('Error buscando mensajes:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 OBTENER ESTADÍSTICAS DE MENSAJES (para el usuario)
    // ============================================================
    router.get('/stats', auth, (req, res) => {
        try {
            const messages = read('messages.json');
            const userMessages = messages.filter(m => 
                m.from === req.userId || m.to === req.userId
            );
            
            const totalSent = messages.filter(m => m.from === req.userId).length;
            const totalReceived = messages.filter(m => m.to === req.userId).length;
            const unread = messages.filter(m => m.to === req.userId && !m.read).length;
            
            // Mensajes por tipo
            const mediaMessages = messages.filter(m => m.mediaType && (m.from === req.userId || m.to === req.userId));
            const mediaByType = {};
            mediaMessages.forEach(m => {
                if (m.mediaType) {
                    mediaByType[m.mediaType] = (mediaByType[m.mediaType] || 0) + 1;
                }
            });
            
            // Última actividad
            const sortedByDate = [...userMessages].sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            const lastActivity = sortedByDate.length > 0 ? sortedByDate[0].timestamp : null;
            
            res.json({
                totalSent,
                totalReceived,
                unread,
                mediaByType,
                lastActivity,
                totalMessages: userMessages.length
            });
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 OBTENER TODOS LOS MENSAJES DE UN USUARIO (para exportar)
    // ============================================================
    router.get('/export/:userId', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            // Solo el propio usuario o admin puede exportar
            if (req.userId !== targetUserId) {
                const currentUser = users.find(u => u.id === req.userId);
                if (!currentUser || currentUser.role !== 'admin') {
                    return res.status(403).json({ error: 'No tienes permiso para exportar estos mensajes' });
                }
            }
            
            const messages = read('messages.json');
            const userMessages = messages.filter(m => 
                (m.from === targetUserId || m.to === targetUserId) &&
                !isBlocked(users, targetUserId, m.from === targetUserId ? m.to : m.from)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            const exported = userMessages.map(msg => {
                let content = '';
                try {
                    content = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                } catch (e) {
                    content = '[Mensaje corrupto]';
                }
                
                return {
                    id: msg.id,
                    from: msg.from,
                    to: msg.to,
                    content: content,
                    timestamp: msg.timestamp,
                    mediaType: msg.mediaType || null,
                    read: msg.read
                };
            });
            
            res.json({
                userId: targetUserId,
                totalMessages: exported.length,
                messages: exported,
                exportedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error exportando mensajes:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};