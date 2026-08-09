// backend/chats.js
const auth = require('./middleware/auth');  // ← CORREGIDO

module.exports = (read, write, io, encryptMessage, decryptMessage) => {
    const router = require('express').Router();

    router.get('/conversations', auth, (req, res) => {
        try {
            const messages = read('messages.json');
            const users = read('users.json');
            
            const userMessages = messages.filter(m => m.from === req.userId || m.to === req.userId);
            const conversationsMap = new Map();
            
            userMessages.forEach(msg => {
                const otherUserId = msg.from === req.userId ? msg.to : msg.from;
                
                if (!conversationsMap.has(otherUserId)) {
                    const otherUser = users.find(u => u.id === otherUserId);
                    if (otherUser) {
                        conversationsMap.set(otherUserId, {
                            user: {
                                id: otherUser.id,
                                username: otherUser.username,
                                fullName: otherUser.fullName,
                                avatar: otherUser.avatar
                            },
                            lastMessage: {
                                content: msg.content ? (msg.encrypted ? decryptMessage(msg.content) : msg.content) : '',
                                timestamp: msg.timestamp,
                                read: msg.read,
                                fromMe: msg.from === req.userId
                            },
                            unreadCount: 0
                        });
                    }
                }
                
                const conv = conversationsMap.get(otherUserId);
                if (conv && new Date(msg.timestamp) > new Date(conv.lastMessage.timestamp)) {
                    conv.lastMessage = {
                        content: msg.content ? (msg.encrypted ? decryptMessage(msg.content) : msg.content) : '',
                        timestamp: msg.timestamp,
                        read: msg.read,
                        fromMe: msg.from === req.userId
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

    router.get('/messages/:userId', auth, (req, res) => {
        try {
            let messages = read('messages.json');
            const limit = parseInt(req.query.limit) || 30;
            const offset = parseInt(req.query.offset) || 0;
            
            let filtered = messages.filter(m => 
                (m.from === req.userId && m.to === req.params.userId) ||
                (m.from === req.params.userId && m.to === req.userId)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            const paginated = filtered.slice(offset, offset + limit);
            
            const result = paginated.map(msg => ({
                id: msg.id,
                from: msg.from,
                to: msg.to,
                content: msg.encrypted ? decryptMessage(msg.content) : msg.content,
                timestamp: msg.timestamp,
                read: msg.read,
                isOwn: msg.from === req.userId
            }));
            
            let updated = false;
            let updatedMessageIds = [];
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === req.userId && msg.from === req.params.userId && !msg.read) {
                    updated = true;
                    updatedMessageIds.push(msg.id);
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                write('messages.json', updatedMessages);
                console.log(`📖 Usuario ${req.userId} marcó ${updatedMessageIds.length} mensajes como leídos de ${req.params.userId}`);
                
                io.to(`user_${req.params.userId}`).emit('messages_read', {
                    byUserId: req.userId,
                    withUserId: req.params.userId,
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

    router.post('/messages/:userId', auth, (req, res) => {
        try {
            const { content } = req.body;
            const toUserId = req.params.userId;
            
            if (!content || content.trim().length === 0) {
                return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
            }
            
            const encryptedContent = encryptMessage(content);
            const messages = read('messages.json');
            
            const newMessage = {
                id: Date.now().toString(),
                from: req.userId,
                to: toUserId,
                content: encryptedContent,
                encrypted: true,
                read: false,
                timestamp: new Date().toISOString()
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
                isOwn: true
            };
            
            io.to(`user_${toUserId}`).emit('receive_message', {
                id: newMessage.id,
                from: req.userId,
                to: toUserId,
                content: content,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: false
            });
            
            io.to(`user_${req.userId}`).emit('message_sent', responseMessage);
            
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            io.to(`user_${toUserId}`).emit('conversations_update', { userId: toUserId });
            
            const users = read('users.json');
            const fromUser = users.find(u => u.id === req.userId);
            if (fromUser) {
                const notificationsModule = require('./notifications')(read, write, io);
                const { createNotification } = notificationsModule;
                if (createNotification) {
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

    router.put('/conversations/:userId/read', auth, (req, res) => {
        try {
            let messages = read('messages.json');
            let updated = false;
            let updatedMessageIds = [];
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === req.userId && msg.from === req.params.userId && !msg.read) {
                    updated = true;
                    updatedMessageIds.push(msg.id);
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                write('messages.json', updatedMessages);
                console.log(`📖 Usuario ${req.userId} marcó conversación con ${req.params.userId} como leída`);
                
                io.to(`user_${req.params.userId}`).emit('messages_read', {
                    byUserId: req.userId,
                    withUserId: req.params.userId,
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

    router.get('/search', auth, (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.length < 2) {
                return res.json([]);
            }
            
            const messages = read('messages.json');
            const users = read('users.json');
            
            const userMessages = messages.filter(m => m.from === req.userId || m.to === req.userId);
            const query = q.toLowerCase();
            const results = [];
            
            userMessages.forEach(msg => {
                let decryptedContent = '';
                try {
                    decryptedContent = msg.encrypted ? decryptMessage(msg.content) : msg.content;
                } catch (e) {
                    decryptedContent = '';
                }
                
                if (decryptedContent.toLowerCase().includes(query)) {
                    const otherUserId = msg.from === req.userId ? msg.to : msg.from;
                    const otherUser = users.find(u => u.id === otherUserId);
                    
                    if (otherUser && !results.some(r => r.user.id === otherUserId)) {
                        results.push({
                            user: {
                                id: otherUser.id,
                                username: otherUser.username,
                                fullName: otherUser.fullName,
                                avatar: otherUser.avatar
                            },
                            matchContent: decryptedContent.substring(0, 50) + (decryptedContent.length > 50 ? '...' : ''),
                            timestamp: msg.timestamp
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

    return router;
};