// backend/chats.js - CON SISTEMA DE BLOQUEO, CIFRADO, MULTIMEDIA Y SOLICITUDES DE CHAT
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
        
        if (blocker.blocked && blocker.blocked.includes(blockedId)) return true;
        if (blocked.blockedBy && blocked.blockedBy.includes(blockerId)) return true;
        
        return false;
    }

    // ============================================================
    // FUNCIÓN PARA VERIFICAR SI HAY FOLLOW MUTUO
    // ============================================================
    function hasMutualFollow(users, userId1, userId2) {
        const user1 = users.find(u => u.id === userId1);
        const user2 = users.find(u => u.id === userId2);
        
        if (!user1 || !user2) return false;
        
        const follows1to2 = user1.following && user1.following.includes(userId2);
        const follows2to1 = user2.following && user2.following.includes(userId1);
        
        return follows1to2 && follows2to1;
    }

    // ============================================================
    // FUNCIÓN SEGURA PARA DESCIFRAR
    // ============================================================
    function safeDecryptMessage(encryptedContent, fallbackMessage = '[Mensaje cifrado]') {
        if (!encryptedContent) return fallbackMessage;
        
        if (typeof encryptedContent === 'string' && !encryptedContent.startsWith('U2FsdGVkX1')) {
            return encryptedContent;
        }
        
        try {
            const decrypted = decryptMessage(encryptedContent);
            if (!decrypted || decrypted === '') {
                return fallbackMessage;
            }
            return decrypted;
        } catch (error) {
            console.error('Error descifrando mensaje:', error.message);
            try {
                const cleaned = encryptedContent.replace(/[^\x20-\x7E]/g, '');
                if (cleaned && cleaned.length > 0) {
                    return decryptMessage(cleaned);
                }
            } catch (e) {}
            return fallbackMessage;
        }
    }

    // ============================================================
    // OBTENER CONVERSACIONES - CON CATEGORÍAS (activas, pendientes, archivadas)
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
            
            // Obtener todos los usuarios con los que hay mensajes
            const userMessages = messages.filter(m => {
                const otherId = m.from === req.userId ? m.to : m.from;
                if (blockedIds.includes(otherId)) return false;
                if (blockedByIds.includes(otherId)) return false;
                return m.from === req.userId || m.to === req.userId;
            });
            
            // Obtener IDs únicos de usuarios con los que hay conversación
            const uniqueUserIds = new Set();
            userMessages.forEach(msg => {
                const otherId = msg.from === req.userId ? msg.to : msg.from;
                uniqueUserIds.add(otherId);
            });
            
            // Clasificar conversaciones
            const activeChats = [];
            const pendingChats = [];
            const archivedChats = [];
            
            uniqueUserIds.forEach(otherUserId => {
                const otherUser = users.find(u => u.id === otherUserId);
                if (!otherUser) return;
                
                // Verificar si es bloqueado
                const isUserBlocked = blockedIds.includes(otherUserId);
                const isUserBlockedBy = blockedByIds.includes(otherUserId);
                
                if (isUserBlocked || isUserBlockedBy) return;
                
                // Obtener mensajes con este usuario
                const userMessagesWithUser = userMessages.filter(m => 
                    (m.from === req.userId && m.to === otherUserId) ||
                    (m.from === otherUserId && m.to === req.userId)
                );
                
                // Último mensaje
                const sortedMessages = [...userMessagesWithUser].sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                const lastMsg = sortedMessages[0];
                
                let lastContent = '[Mensaje]';
                if (lastMsg && lastMsg.content) {
                    if (lastMsg.encrypted) {
                        lastContent = safeDecryptMessage(lastMsg.content, '[Mensaje cifrado]');
                    } else {
                        lastContent = lastMsg.content;
                    }
                }
                
                // Contar no leídos
                const unreadCount = userMessagesWithUser.filter(m => 
                    m.to === req.userId && !m.read
                ).length;
                
                // Verificar follow mutuo
                const mutualFollow = hasMutualFollow(users, req.userId, otherUserId);
                
                // Verificar si el otro usuario sigue al actual
                const otherFollowsMe = otherUser.following && otherUser.following.includes(req.userId);
                
                // Verificar si el actual sigue al otro
                const iFollowOther = currentUser.following && currentUser.following.includes(otherUserId);
                
                // Determinar estado de la conversación
                let status = 'active';
                let isPending = false;
                
                // Si hay follow mutuo -> activo
                if (mutualFollow) {
                    status = 'active';
                } 
                // Si solo uno sigue al otro -> pendiente
                else if (iFollowOther || otherFollowsMe) {
                    status = 'pending';
                    isPending = true;
                } 
                // Si no hay follow en ninguna dirección -> archivado
                else {
                    status = 'archived';
                }
                
                const conversationData = {
                    user: {
                        id: otherUser.id,
                        username: otherUser.username,
                        fullName: otherUser.fullName,
                        avatar: otherUser.avatar,
                        isVerified: otherUser.isVerified || false
                    },
                    lastMessage: {
                        content: lastContent,
                        timestamp: lastMsg ? lastMsg.timestamp : new Date().toISOString(),
                        read: lastMsg ? lastMsg.read : false,
                        fromMe: lastMsg ? lastMsg.from === req.userId : false,
                        mediaType: lastMsg ? lastMsg.mediaType : null
                    },
                    unreadCount: unreadCount,
                    isPending: isPending,
                    status: status,
                    mutualFollow: mutualFollow,
                    iFollowOther: iFollowOther,
                    otherFollowsMe: otherFollowsMe
                };
                
                if (status === 'active') {
                    activeChats.push(conversationData);
                } else if (status === 'pending') {
                    pendingChats.push(conversationData);
                } else {
                    archivedChats.push(conversationData);
                }
            });
            
            // Ordenar por timestamp
            activeChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
            pendingChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
            archivedChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
            
            res.json({
                active: activeChats,
                pending: pendingChats,
                archived: archivedChats
            });
        } catch (error) {
            console.error('Error obteniendo conversaciones:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ACEPTAR SOLICITUD DE CHAT (mover de pendiente a activo)
    // ============================================================
    router.post('/conversations/:userId/accept', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === targetUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // Verificar que el otro usuario sigue al actual
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            if (!otherFollowsMe) {
                return res.status(400).json({ 
                    error: 'No puedes aceptar esta solicitud',
                    message: 'El usuario no te sigue'
                });
            }
            
            // Si el usuario actual no sigue al otro, lo sigue automáticamente
            if (!currentUser.following || !currentUser.following.includes(targetUserId)) {
                if (!currentUser.following) currentUser.following = [];
                currentUser.following.push(targetUserId);
                write('users.json', users);
            }
            
            // Notificar
            io.to(`user_${targetUserId}`).emit('chat_request_accepted', {
                fromUserId: req.userId,
                fromUser: {
                    id: currentUser.id,
                    fullName: currentUser.fullName,
                    username: currentUser.username,
                    avatar: currentUser.avatar
                }
            });
            
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${targetUserId}`).emit('conversations_update', { userId: targetUserId });
            
            res.json({ 
                success: true,
                message: 'Solicitud de chat aceptada'
            });
        } catch (error) {
            console.error('Error aceptando solicitud:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RECHAZAR SOLICITUD DE CHAT (mover de pendiente a archivado)
    // ============================================================
    router.post('/conversations/:userId/reject', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === targetUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            // Si el usuario actual sigue al otro, dejar de seguir
            if (currentUser.following && currentUser.following.includes(targetUserId)) {
                currentUser.following = currentUser.following.filter(id => id !== targetUserId);
                write('users.json', users);
            }
            
            // Notificar
            io.to(`user_${targetUserId}`).emit('chat_request_rejected', {
                fromUserId: req.userId
            });
            
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${targetUserId}`).emit('conversations_update', { userId: targetUserId });
            
            res.json({ 
                success: true,
                message: 'Solicitud de chat rechazada'
            });
        } catch (error) {
            console.error('Error rechazando solicitud:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER CONVERSACIÓN CON UN USUARIO ESPECÍFICO
    // ============================================================
    router.get('/conversation/:userId', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === targetUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const mutualFollow = hasMutualFollow(users, req.userId, targetUserId);
            const iFollowOther = currentUser.following && currentUser.following.includes(targetUserId);
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            let status = 'archived';
            if (mutualFollow) {
                status = 'active';
            } else if (iFollowOther || otherFollowsMe) {
                status = 'pending';
            }
            
            res.json({
                userId: targetUserId,
                user: {
                    id: targetUser.id,
                    username: targetUser.username,
                    fullName: targetUser.fullName,
                    avatar: targetUser.avatar,
                    isVerified: targetUser.isVerified || false
                },
                status: status,
                mutualFollow: mutualFollow,
                iFollowOther: iFollowOther,
                otherFollowsMe: otherFollowsMe
            });
        } catch (error) {
            console.error('Error obteniendo conversación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER MENSAJES CON UN USUARIO
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
            
            // Verificar estado de la conversación
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === targetUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const mutualFollow = hasMutualFollow(users, req.userId, targetUserId);
            const iFollowOther = currentUser.following && currentUser.following.includes(targetUserId);
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            // Si no hay follow mutuo, solo mostrar últimos 5 mensajes y un mensaje de solicitud
            let messages = read('messages.json');
            const limit = parseInt(req.query.limit) || 30;
            const offset = parseInt(req.query.offset) || 0;
            
            let filtered = messages.filter(m => 
                (m.from === req.userId && m.to === targetUserId) ||
                (m.from === targetUserId && m.to === req.userId)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            let result = [];
            let conversationStatus = 'archived';
            
            if (mutualFollow) {
                conversationStatus = 'active';
                // Mostrar todos los mensajes
                const paginated = filtered.slice(offset, offset + limit);
                result = paginated.map(msg => ({
                    id: msg.id,
                    from: msg.from,
                    to: msg.to,
                    content: msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content,
                    timestamp: msg.timestamp,
                    read: msg.read,
                    isOwn: msg.from === req.userId,
                    mediaType: msg.mediaType || null,
                    encrypted: msg.encrypted || false
                }));
            } else if (iFollowOther || otherFollowsMe) {
                conversationStatus = 'pending';
                // Mostrar solo últimos 5 mensajes como vista previa
                const previewMessages = filtered.slice(-5);
                result = previewMessages.map(msg => ({
                    id: msg.id,
                    from: msg.from,
                    to: msg.to,
                    content: msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content,
                    timestamp: msg.timestamp,
                    read: msg.read,
                    isOwn: msg.from === req.userId,
                    mediaType: msg.mediaType || null,
                    encrypted: msg.encrypted || false,
                    isPreview: true
                }));
            } else {
                conversationStatus = 'archived';
                // No mostrar mensajes, solo el estado archivado
                result = [];
            }
            
            // Marcar como leídos si hay follow mutuo
            if (mutualFollow) {
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
                    io.to(`user_${targetUserId}`).emit('messages_read', {
                        byUserId: req.userId,
                        withUserId: targetUserId,
                        messageIds: updatedMessageIds
                    });
                    io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
                }
            }
            
            res.json({
                conversationStatus: conversationStatus,
                mutualFollow: mutualFollow,
                iFollowOther: iFollowOther,
                otherFollowsMe: otherFollowsMe,
                messages: result,
                totalMessages: filtered.length,
                hasMore: filtered.length > offset + limit
            });
        } catch (error) {
            console.error('Error obteniendo mensajes:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ENVIAR MENSAJE DE TEXTO - CON VERIFICACIÓN DE ESTADO
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
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === toUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const mutualFollow = hasMutualFollow(users, req.userId, toUserId);
            const iFollowOther = currentUser.following && currentUser.following.includes(toUserId);
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            // Si no hay follow mutuo, no se puede enviar mensaje (solo si hay follow en una dirección)
            if (!mutualFollow && !iFollowOther && !otherFollowsMe) {
                return res.status(403).json({ 
                    error: 'No puedes enviar mensajes a este usuario',
                    message: 'Debes seguir al usuario o aceptar su solicitud'
                });
            }
            
            // Limpiar contenido
            let cleanContent = content;
            try {
                cleanContent = Buffer.from(content, 'utf8').toString('utf8');
            } catch (e) {
                cleanContent = content.replace(/[^\x20-\x7E]/g, '');
            }
            
            const encryptedContent = encryptMessage(cleanContent);
            const messages = read('messages.json');
            
            // Si no hay follow mutuo, el mensaje se marca como solicitud
            const isPending = !mutualFollow && (iFollowOther || otherFollowsMe);
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: encryptedContent,
                encrypted: true,
                read: false,
                timestamp: new Date().toISOString(),
                mediaType: null,
                isPending: isPending
            };
            
            messages.push(newMessage);
            write('messages.json', messages);
            
            const responseMessage = {
                id: newMessage.id,
                from: newMessage.from,
                to: newMessage.to,
                content: cleanContent,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: null,
                encrypted: true,
                isPending: isPending
            };
            
            // Enviar al otro usuario si no está bloqueado
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    id: newMessage.id,
                    from: req.userId,
                    to: toUserId,
                    content: cleanContent,
                    timestamp: newMessage.timestamp,
                    read: false,
                    isOwn: false,
                    mediaType: null,
                    encrypted: true,
                    isPending: isPending
                });
                
                // Si es pendiente, notificar solicitud
                if (isPending && otherFollowsMe) {
                    io.to(`user_${toUserId}`).emit('chat_request_received', {
                        fromUserId: req.userId,
                        fromUser: {
                            id: currentUser.id,
                            fullName: currentUser.fullName,
                            username: currentUser.username,
                            avatar: currentUser.avatar
                        }
                    });
                }
            }
            
            io.to(`user_${req.userId}`).emit('message_sent', responseMessage);
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${toUserId}`).emit('conversations_update', { userId: toUserId });
            
            const fromUser = users.find(u => u.id === req.userId);
            if (fromUser && createNotification) {
                if (!isBlocked(users, toUserId, req.userId)) {
                    const notificationType = isPending ? 'chat_request' : 'message';
                    createNotification(toUserId, notificationType, req.userId, {
                        message: isPending ? 
                            `${fromUser.fullName} quiere chatear contigo` :
                            `${fromUser.fullName} te envió un mensaje`,
                        preview: cleanContent.substring(0, 50)
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
    // ENVIAR MENSAJE CON MULTIMEDIA
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
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === toUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const mutualFollow = hasMutualFollow(users, req.userId, toUserId);
            const iFollowOther = currentUser.following && currentUser.following.includes(toUserId);
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            if (!mutualFollow && !iFollowOther && !otherFollowsMe) {
                return res.status(403).json({ 
                    error: 'No puedes enviar mensajes a este usuario'
                });
            }
            
            let cleanCaption = caption || '';
            try {
                cleanCaption = Buffer.from(cleanCaption, 'utf8').toString('utf8');
            } catch (e) {
                cleanCaption = cleanCaption.replace(/[^\x20-\x7E]/g, '');
            }
            
            const isPending = !mutualFollow && (iFollowOther || otherFollowsMe);
            const encryptedMedia = encryptMessage(mediaData);
            const messages = read('messages.json');
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: encryptedMedia,
                encrypted: true,
                mediaType: mediaType,
                caption: cleanCaption || null,
                read: false,
                timestamp: new Date().toISOString(),
                isPending: isPending
            };
            
            messages.push(newMessage);
            write('messages.json', messages);
            
            const responseMessage = {
                id: newMessage.id,
                from: newMessage.from,
                to: newMessage.to,
                content: cleanCaption || `[${mediaType}]`,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: mediaType,
                encrypted: true,
                hasMedia: true,
                isPending: isPending
            };
            
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    id: newMessage.id,
                    from: req.userId,
                    to: toUserId,
                    content: cleanCaption || `[${mediaType}]`,
                    timestamp: newMessage.timestamp,
                    read: false,
                    isOwn: false,
                    mediaType: mediaType,
                    encrypted: true,
                    hasMedia: true,
                    isPending: isPending
                });
                
                if (isPending && otherFollowsMe) {
                    io.to(`user_${toUserId}`).emit('chat_request_received', {
                        fromUserId: req.userId,
                        fromUser: {
                            id: currentUser.id,
                            fullName: currentUser.fullName,
                            username: currentUser.username,
                            avatar: currentUser.avatar
                        }
                    });
                }
            }
            
            io.to(`user_${req.userId}`).emit('message_sent', responseMessage);
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${toUserId}`).emit('conversations_update', { userId: toUserId });
            
            res.status(201).json(responseMessage);
        } catch (error) {
            console.error('Error enviando mensaje multimedia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // DESCARGAR MEDIA
    // ============================================================
    router.get('/messages/:messageId/media', auth, (req, res) => {
        try {
            const messages = read('messages.json');
            const message = messages.find(m => m.id === req.params.messageId);
            
            if (!message) {
                return res.status(404).json({ error: 'Mensaje no encontrado' });
            }
            
            if (message.from !== req.userId && message.to !== req.userId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!message.mediaType) {
                return res.status(400).json({ error: 'No contiene multimedia' });
            }
            
            let decryptedMedia = '';
            try {
                decryptedMedia = decryptMessage(message.content);
            } catch (e) {
                return res.status(500).json({ error: 'Error descifrando' });
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
                return res.status(403).json({ error: 'No tienes permiso' });
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
    // ELIMINAR MENSAJE MULTIMEDIA
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
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
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
    // MARCAR CONVERSACIÓN COMO LEÍDA
    // ============================================================
    router.put('/conversations/:userId/read', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
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
    // BUSCAR MENSAJES
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
                    decryptedContent = msg.encrypted ? safeDecryptMessage(msg.content, '') : msg.content || '';
                } catch (e) {
                    decryptedContent = '';
                }
                
                const searchCaption = msg.caption ? msg.caption.toLowerCase() : '';
                const searchContent = decryptedContent.toLowerCase();
                
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
    // ESTADÍSTICAS
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
            
            const mediaMessages = messages.filter(m => m.mediaType && (m.from === req.userId || m.to === req.userId));
            const mediaByType = {};
            mediaMessages.forEach(m => {
                if (m.mediaType) {
                    mediaByType[m.mediaType] = (mediaByType[m.mediaType] || 0) + 1;
                }
            });
            
            const sortedByDate = [...userMessages].sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            const lastActivity = sortedByDate.length > 0 ? sortedByDate[0].timestamp : null;
            
            // Contar solicitudes pendientes
            const pendingRequests = userMessages.filter(m => 
                m.to === req.userId && m.isPending && !m.read
            ).length;
            
            res.json({
                totalSent,
                totalReceived,
                unread,
                mediaByType,
                lastActivity,
                totalMessages: userMessages.length,
                pendingRequests
            });
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // EXPORTAR MENSAJES
    // ============================================================
    router.get('/export/:userId', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            if (req.userId !== targetUserId) {
                const currentUser = users.find(u => u.id === req.userId);
                if (!currentUser || currentUser.role !== 'admin') {
                    return res.status(403).json({ error: 'No tienes permiso' });
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
                    content = msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content || '';
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
                    read: msg.read,
                    isPending: msg.isPending || false
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