// backend/chats.js - CON SISTEMA DE BLOQUEO, CIFRADO, MULTIMEDIA Y SOLICITUDES DE CHAT
// 🔥 CORREGIDO: Lógica de solicitudes (SOLO el destinatario ve "Pendiente")
// 🔥 CORREGIDO: El remitente NO ve botones de Aceptar/Rechazar
// 🔥 NUEVO: Funcionalidad de archivar conversaciones
// ============================================================

const auth = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURACIÓN DE MULTER PARA SUBIDA DE ARCHIVOS
// ============================================================

const CHAT_UPLOAD_DIR = path.join(__dirname, '../frontend/uploads/chat');

if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
    fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
    console.log('📁 Directorio de uploads de chat creado:', CHAT_UPLOAD_DIR);
}

const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, CHAT_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
        cb(null, uniqueName);
    }
});

// Configuración para imágenes (máx 10MB)
const chatImageUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de imagen no soportado para chat'));
        }
    }
});

// Configuración para archivos (máx 25MB)
const chatFileUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg',
            'audio/mp3', 'audio/wav', 'audio/ogg',
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo no soportado'));
        }
    }
});

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
// FUNCIÓN PARA VERIFICAR SI UNO SIGUE AL OTRO
// ============================================================

function userFollows(users, followerId, targetId) {
    const user = users.find(u => u.id === followerId);
    if (!user) return false;
    return user.following && user.following.includes(targetId);
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
// FUNCIÓN PARA OBTENER ICONO DE TIPO DE ARCHIVO
// ============================================================

function getFileTypeIcon(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype === 'application/pdf') return 'pdf';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'word';
    if (mimetype === 'text/plain') return 'text';
    return 'file';
}

module.exports = (read, write, io, encryptMessage, decryptMessage, createNotification) => {
    const router = require('express').Router();

    // ============================================================
    // 🔥 SUBIR IMAGEN PARA CHAT
    // ============================================================
    
    router.post('/upload/image', auth, chatImageUpload.single('image'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ninguna imagen' });
            }

            const imageUrl = `/uploads/chat/${req.file.filename}`;
            
            res.json({
                success: true,
                imageUrl: imageUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                message: '✅ Imagen subida correctamente'
            });
        } catch (error) {
            console.error('Error subiendo imagen al chat:', error);
            res.status(500).json({ error: 'Error subiendo imagen' });
        }
    });

    // ============================================================
    // 🔥 SUBIR ARCHIVO PARA CHAT
    // ============================================================
    
    router.post('/upload/file', auth, chatFileUpload.single('file'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ningún archivo' });
            }

            const fileUrl = `/uploads/chat/${req.file.filename}`;
            
            res.json({
                success: true,
                fileUrl: fileUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                message: '✅ Archivo subido correctamente'
            });
        } catch (error) {
            console.error('Error subiendo archivo al chat:', error);
            res.status(500).json({ error: 'Error subiendo archivo' });
        }
    });

    // ============================================================
    // 🔥 OBTENER ARCHIVO DEL CHAT (público)
    // ============================================================
    
    router.get('/file/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(CHAT_UPLOAD_DIR, filename);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Archivo no encontrado' });
            }
            
            res.sendFile(filePath);
        } catch (error) {
            console.error('Error sirviendo archivo del chat:', error);
            res.status(500).json({ error: 'Error sirviendo archivo' });
        }
    });

    // ============================================================
    // OBTENER CONVERSACIONES - CORREGIDO
    // 🔥 SOLO el destinatario ve "Pendiente" con botones de acción
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
            
            const uniqueUserIds = new Set();
            userMessages.forEach(msg => {
                const otherId = msg.from === req.userId ? msg.to : msg.from;
                uniqueUserIds.add(otherId);
            });
            
            const activeChats = [];
            const pendingChats = [];
            const archivedChats = [];
            
            uniqueUserIds.forEach(otherUserId => {
                const otherUser = users.find(u => u.id === otherUserId);
                if (!otherUser) return;
                
                const isUserBlocked = blockedIds.includes(otherUserId);
                const isUserBlockedBy = blockedByIds.includes(otherUserId);
                
                if (isUserBlocked || isUserBlockedBy) return;
                
                const userMessagesWithUser = userMessages.filter(m => 
                    (m.from === req.userId && m.to === otherUserId) ||
                    (m.from === otherUserId && m.to === req.userId)
                );
                
                const sortedMessages = [...userMessagesWithUser].sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                const lastMsg = sortedMessages[0];
                
                let lastContent = '[Mensaje]';
                let lastMediaType = null;
                
                if (lastMsg) {
                    if (lastMsg.mediaType) {
                        lastMediaType = lastMsg.mediaType;
                        lastContent = lastMsg.caption || `[${lastMsg.mediaType}]`;
                    } else if (lastMsg.content) {
                        if (lastMsg.encrypted) {
                            lastContent = safeDecryptMessage(lastMsg.content, '[Mensaje cifrado]');
                        } else {
                            lastContent = lastMsg.content;
                        }
                    }
                }
                
                const unreadCount = userMessagesWithUser.filter(m => 
                    m.to === req.userId && !m.read
                ).length;
                
                const mutualFollow = hasMutualFollow(users, req.userId, otherUserId);
                const otherFollowsMe = otherUser.following && otherUser.following.includes(req.userId);
                const iFollowOther = currentUser.following && currentUser.following.includes(otherUserId);
                
                // ============================================================
                // 🔥🔥🔥 CORREGIDO: Lógica de solicitudes de chat
                // ============================================================
                let status = 'archived';
                let isPending = false;
                let showActions = false; // 🔥 NUEVO: Indica si mostrar botones de acción
                
                if (mutualFollow) {
                    // ✅ AMBOS se siguen mutuamente -> Chat ACTIVO
                    status = 'active';
                    isPending = false;
                    showActions = false;
                } else if (iFollowOther && !otherFollowsMe) {
                    // ✅ YO sigo al otro, pero él NO me sigue
                    // Esto significa que YO ENVIÉ una solicitud de chat
                    // El DESTINATARIO (otro) es quien debe ver "Pendiente" con botones
                    // El REMITENTE (yo) solo ve la conversación como "en espera"
                    status = 'active'; // 🔥 CAMBIADO: Ya no es "pending" para el remitente
                    isPending = false; // 🔥 CAMBIADO: Ya no es pendiente para el remitente
                    showActions = false;
                } else if (otherFollowsMe && !iFollowOther) {
                    // ✅ El OTRO me sigue a mí, pero yo NO lo sigo
                    // Esto significa que el OTRO ENVIÓ una solicitud de chat
                    // YO soy el DESTINATARIO, debo ver "Pendiente" con botones
                    status = 'pending';
                    isPending = true;
                    showActions = true; // 🔥 NUEVO: Mostrar botones de acción para el destinatario
                } else if (!iFollowOther && !otherFollowsMe) {
                    // ❌ Nadie sigue a nadie -> Archivado
                    status = 'archived';
                    isPending = false;
                    showActions = false;
                }
                
                // 🔥 Verificar si la conversación está archivada por el usuario
                const archivedByUser = currentUser.archivedChats && currentUser.archivedChats.includes(otherUserId);
                if (archivedByUser) {
                    status = 'archived';
                    showActions = false;
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
                        mediaType: lastMediaType
                    },
                    unreadCount: unreadCount,
                    isPending: isPending,
                    status: status,
                    mutualFollow: mutualFollow,
                    iFollowOther: iFollowOther,
                    otherFollowsMe: otherFollowsMe,
                    isArchived: archivedByUser,
                    showActions: showActions // 🔥 NUEVO: Indica si mostrar botones de acción
                };
                
                if (status === 'archived') {
                    archivedChats.push(conversationData);
                } else if (status === 'pending') {
                    pendingChats.push(conversationData);
                } else {
                    activeChats.push(conversationData);
                }
            });
            
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
    // ACEPTAR SOLICITUD DE CHAT (solo el destinatario puede aceptar)
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
            
            // 🔥 Verificar que el otro usuario sigue al actual (él envió la solicitud)
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            if (!otherFollowsMe) {
                return res.status(400).json({ 
                    error: 'No puedes aceptar esta solicitud',
                    message: 'El usuario no te ha enviado una solicitud'
                });
            }
            
            // 🔥 Verificar que el usuario actual NO sigue al otro (si ya lo sigue, no es una solicitud pendiente)
            const iFollowOther = currentUser.following && currentUser.following.includes(targetUserId);
            if (iFollowOther) {
                return res.status(400).json({ 
                    error: 'Ya sigues a este usuario',
                    message: 'La solicitud ya fue aceptada anteriormente'
                });
            }
            
            // 🔥 Aceptar la solicitud: seguir al otro usuario
            if (!currentUser.following) currentUser.following = [];
            currentUser.following.push(targetUserId);
            
            // 🔥 Eliminar de archivados si estaba
            if (currentUser.archivedChats) {
                currentUser.archivedChats = currentUser.archivedChats.filter(id => id !== targetUserId);
            }
            
            write('users.json', users);
            
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
    // RECHAZAR SOLICITUD DE CHAT (solo el destinatario puede rechazar)
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
            
            // 🔥 Verificar que el otro usuario sigue al actual (él envió la solicitud)
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            if (!otherFollowsMe) {
                return res.status(400).json({ 
                    error: 'No puedes rechazar esta solicitud',
                    message: 'El usuario no te ha enviado una solicitud'
                });
            }
            
            // 🔥 Rechazar: dejar de seguir al otro (si lo seguía)
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
    // 🔥 ARCHIVAR CONVERSACIÓN
    // ============================================================
    
    router.post('/conversations/:userId/archive', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (isBlocked(users, req.userId, targetUserId)) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!currentUser.archivedChats) {
                currentUser.archivedChats = [];
            }
            
            if (!currentUser.archivedChats.includes(targetUserId)) {
                currentUser.archivedChats.push(targetUserId);
                write('users.json', users);
            }
            
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            
            res.json({ 
                success: true,
                message: 'Conversación archivada'
            });
        } catch (error) {
            console.error('Error archivando conversación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 DESARCHIVAR CONVERSACIÓN
    // ============================================================
    
    router.post('/conversations/:userId/unarchive', auth, (req, res) => {
        try {
            const targetUserId = req.params.userId;
            const users = read('users.json');
            
            const currentUser = users.find(u => u.id === req.userId);
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!currentUser.archivedChats) {
                currentUser.archivedChats = [];
            }
            
            currentUser.archivedChats = currentUser.archivedChats.filter(id => id !== targetUserId);
            write('users.json', users);
            
            io.to(`user_${req.userId}`).emit('conversations_update', { userId: req.userId });
            
            res.json({ 
                success: true,
                message: 'Conversación desarchivada'
            });
        } catch (error) {
            console.error('Error desarchivando conversación:', error);
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
            
            // ============================================================
            // 🔥 CORREGIDO: Misma lógica que en /conversations
            // ============================================================
            let status = 'archived';
            let isPending = false;
            let showActions = false;
            
            if (mutualFollow) {
                status = 'active';
                isPending = false;
                showActions = false;
            } else if (iFollowOther && !otherFollowsMe) {
                // YO envié solicitud -> Activo para mí, sin acciones
                status = 'active';
                isPending = false;
                showActions = false;
            } else if (otherFollowsMe && !iFollowOther) {
                // OTRO envió solicitud -> Pendiente para mí, con acciones
                status = 'pending';
                isPending = true;
                showActions = true;
            } else if (!iFollowOther && !otherFollowsMe) {
                status = 'archived';
                isPending = false;
                showActions = false;
            }
            
            const archivedByUser = currentUser.archivedChats && currentUser.archivedChats.includes(targetUserId);
            if (archivedByUser) {
                status = 'archived';
                showActions = false;
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
                isPending: isPending,
                showActions: showActions,
                mutualFollow: mutualFollow,
                iFollowOther: iFollowOther,
                otherFollowsMe: otherFollowsMe,
                isArchived: archivedByUser
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
            
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === targetUserId);
            
            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const mutualFollow = hasMutualFollow(users, req.userId, targetUserId);
            const iFollowOther = currentUser.following && currentUser.following.includes(targetUserId);
            const otherFollowsMe = targetUser.following && targetUser.following.includes(req.userId);
            
            let messages = read('messages.json');
            const limit = parseInt(req.query.limit) || 30;
            const offset = parseInt(req.query.offset) || 0;
            
            let filtered = messages.filter(m => 
                (m.from === req.userId && m.to === targetUserId) ||
                (m.from === targetUserId && m.to === req.userId)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            let result = [];
            let conversationStatus = 'archived';
            let isPending = false;
            let showActions = false;
            
            if (mutualFollow) {
                // ✅ AMBOS se siguen -> Chat ACTIVO
                conversationStatus = 'active';
                isPending = false;
                showActions = false;
                const paginated = filtered.slice(offset, offset + limit);
                result = paginated.map(msg => {
                    let content = '';
                    if (msg.mediaType) {
                        content = msg.caption || `[${msg.mediaType}]`;
                    } else if (msg.content) {
                        content = msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content;
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
                        mediaUrl: msg.mediaUrl || null,
                        filename: msg.filename || null,
                        fileSize: msg.fileSize || null,
                        fileIcon: msg.mediaType ? getFileTypeIcon(msg.mimetype || '') : null,
                        encrypted: msg.encrypted || false,
                        isPending: msg.isPending || false
                    };
                });
            } else if (iFollowOther && !otherFollowsMe) {
                // ✅ YO envié solicitud -> Veo mis mensajes enviados, pero NO veo botones
                conversationStatus = 'active'; // 🔥 CAMBIADO: Ya no es "pending"
                isPending = false;
                showActions = false;
                // Mostrar solo mensajes enviados por mí (los que envié)
                const myMessages = filtered.filter(m => m.from === req.userId);
                const previewMessages = myMessages.slice(-5);
                result = previewMessages.map(msg => {
                    let content = '';
                    if (msg.mediaType) {
                        content = msg.caption || `[${msg.mediaType}]`;
                    } else if (msg.content) {
                        content = msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content;
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
                        mediaUrl: msg.mediaUrl || null,
                        filename: msg.filename || null,
                        isPreview: true,
                        encrypted: msg.encrypted || false,
                        isPending: false // 🔥 CAMBIADO: Ya no es pendiente
                    };
                });
            } else if (otherFollowsMe && !iFollowOther) {
                // ✅ OTRO envió solicitud -> YO soy el destinatario, veo "Pendiente" con botones
                conversationStatus = 'pending';
                isPending = true;
                showActions = true;
                const paginated = filtered.slice(offset, offset + limit);
                result = paginated.map(msg => {
                    let content = '';
                    if (msg.mediaType) {
                        content = msg.caption || `[${msg.mediaType}]`;
                    } else if (msg.content) {
                        content = msg.encrypted ? safeDecryptMessage(msg.content, '[Mensaje cifrado]') : msg.content;
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
                        mediaUrl: msg.mediaUrl || null,
                        filename: msg.filename || null,
                        fileSize: msg.fileSize || null,
                        fileIcon: msg.mediaType ? getFileTypeIcon(msg.mimetype || '') : null,
                        encrypted: msg.encrypted || false,
                        isPending: true,
                        fromOther: true
                    };
                });
            } else {
                // ❌ Nadie sigue a nadie -> Archivado
                conversationStatus = 'archived';
                isPending = false;
                showActions = false;
                result = [];
            }
            
            // Marcar como leídos (solo si hay follow mutuo o el otro me sigue)
            if (mutualFollow || (otherFollowsMe && !iFollowOther)) {
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
            
            const archivedByUser = currentUser.archivedChats && currentUser.archivedChats.includes(targetUserId);
            
            res.json({
                conversationStatus: archivedByUser ? 'archived' : conversationStatus,
                isPending: isPending,
                showActions: showActions,
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
    // ENVIAR MENSAJE DE TEXTO - CORREGIDO
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
            
            // 🔥 Si no hay follow mutuo y el otro no me sigue, es una solicitud
            if (!mutualFollow && !otherFollowsMe) {
                // Solo se puede enviar solicitud si el otro es público o si lo sigo
                if (!iFollowOther) {
                    return res.status(403).json({ 
                        error: 'No puedes enviar mensajes a este usuario',
                        message: 'Debes seguir al usuario para enviar una solicitud'
                    });
                }
            }
            
            let cleanContent = content;
            try {
                cleanContent = Buffer.from(content, 'utf8').toString('utf8');
            } catch (e) {
                cleanContent = content.replace(/[^\x20-\x7E]/g, '');
            }
            
            const encryptedContent = encryptMessage(cleanContent);
            const messages = read('messages.json');
            
            // 🔥 Es solicitud si: no hay follow mutuo y el otro no me sigue (yo envié solicitud)
            const isPending = !mutualFollow && !otherFollowsMe && iFollowOther;
            
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
                
                // 🔥 Solo notificar solicitud si es pendiente (al destinatario)
                if (isPending) {
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
    // 🔥 ENVIAR IMAGEN POR CHAT
    // ============================================================
    
    router.post('/messages/:userId/image', auth, chatImageUpload.single('image'), (req, res) => {
        try {
            const toUserId = req.params.userId;
            
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ninguna imagen' });
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
            
            if (!mutualFollow && !otherFollowsMe && !iFollowOther) {
                return res.status(403).json({ 
                    error: 'No puedes enviar mensajes a este usuario'
                });
            }
            
            const imageUrl = `/uploads/chat/${req.file.filename}`;
            const isPending = !mutualFollow && !otherFollowsMe && iFollowOther;
            
            const messages = read('messages.json');
            const caption = req.body.caption || '';
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: caption || '[Imagen]',
                encrypted: false,
                mediaType: 'image',
                mediaUrl: imageUrl,
                filename: req.file.filename,
                fileSize: req.file.size,
                mimetype: req.file.mimetype,
                caption: caption || '',
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
                content: caption || '[Imagen]',
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: 'image',
                mediaUrl: imageUrl,
                filename: req.file.filename,
                fileSize: req.file.size,
                isPending: isPending
            };
            
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    ...responseMessage,
                    isOwn: false
                });
                
                if (isPending) {
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
            console.error('Error enviando imagen por chat:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 ENVIAR ARCHIVO POR CHAT
    // ============================================================
    
    router.post('/messages/:userId/file', auth, chatFileUpload.single('file'), (req, res) => {
        try {
            const toUserId = req.params.userId;
            
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ningún archivo' });
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
            
            if (!mutualFollow && !otherFollowsMe && !iFollowOther) {
                return res.status(403).json({ 
                    error: 'No puedes enviar mensajes a este usuario'
                });
            }
            
            const fileUrl = `/uploads/chat/${req.file.filename}`;
            const isPending = !mutualFollow && !otherFollowsMe && iFollowOther;
            
            const messages = read('messages.json');
            const caption = req.body.caption || '';
            const fileType = getFileTypeIcon(req.file.mimetype);
            
            const newMessage = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                from: req.userId,
                to: toUserId,
                content: caption || `[${fileType}] ${req.file.originalname}`,
                encrypted: false,
                mediaType: 'file',
                mediaUrl: fileUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                fileSize: req.file.size,
                mimetype: req.file.mimetype,
                fileType: fileType,
                caption: caption || '',
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
                content: caption || `[${fileType}] ${req.file.originalname}`,
                timestamp: newMessage.timestamp,
                read: false,
                isOwn: true,
                mediaType: 'file',
                mediaUrl: fileUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                fileSize: req.file.size,
                fileType: fileType,
                isPending: isPending
            };
            
            if (!isBlocked(users, toUserId, req.userId)) {
                io.to(`user_${toUserId}`).emit('receive_message', {
                    ...responseMessage,
                    isOwn: false
                });
                
                if (isPending) {
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
            console.error('Error enviando archivo por chat:', error);
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
            
            if (message.mediaUrl) {
                try {
                    const filename = path.basename(message.mediaUrl);
                    const filePath = path.join(CHAT_UPLOAD_DIR, filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Archivo de chat eliminado: ${filename}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando archivo de chat:', e.message);
                }
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
                
                const searchContent = decryptedContent.toLowerCase();
                const searchCaption = (msg.caption || '').toLowerCase();
                
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
                    mediaUrl: msg.mediaUrl || null,
                    filename: msg.filename || null,
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