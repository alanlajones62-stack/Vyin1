// backend/storyInteractions.js - VERSIÓN COMPLETA CON RESPUESTAS ANIDADAS
// Y SOPORTE PARA SUBIR ARCHIVOS EN COMENTARIOS (SOLO DUEÑO DE HISTORIA)
// ============================================================

const auth = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURACIÓN DE MULTER PARA SUBIDA DE ARCHIVOS EN COMENTARIOS
// ============================================================

const COMMENT_UPLOAD_DIR = path.join(__dirname, '../frontend/uploads/comments');

if (!fs.existsSync(COMMENT_UPLOAD_DIR)) {
    fs.mkdirSync(COMMENT_UPLOAD_DIR, { recursive: true });
    console.log('📁 Directorio de uploads de comentarios creado:', COMMENT_UPLOAD_DIR);
}

const commentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, COMMENT_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const uniqueName = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
        cb(null, uniqueName);
    }
});

// Configuración para archivos en comentarios (máx 20MB)
const commentFileUpload = multer({
    storage: commentStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
            'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg',
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo no soportado para comentarios'));
        }
    }
});

module.exports = function(read, write, io, areStoriesVisible, logger) {
    const router = require('express').Router();

    // ============================================================
    // FUNCIÓN AUXILIAR: BUSCAR UN COMENTARIO POR ID (EN CUALQUIER NIVEL)
    // ============================================================
    function findCommentById(comments, commentId) {
        for (const comment of comments) {
            if (comment.id === commentId) {
                return comment;
            }
            if (comment.replies && comment.replies.length > 0) {
                const found = findCommentById(comment.replies, commentId);
                if (found) return found;
            }
        }
        return null;
    }

    // ============================================================
    // FUNCIÓN AUXILIAR: ENCONTRAR EL PADRE DE UN COMENTARIO
    // ============================================================
    function findParentAndComment(comments, commentId, parent = null) {
        for (const comment of comments) {
            if (comment.id === commentId) {
                return { parent, comment };
            }
            if (comment.replies && comment.replies.length > 0) {
                const result = findParentAndComment(comment.replies, commentId, comment);
                if (result) return result;
            }
        }
        return null;
    }

    // ============================================================
    // FUNCIÓN AUXILIAR: OBTENER ICONO DE TIPO DE ARCHIVO
    // ============================================================
    function getFileTypeIcon(mimetype) {
        if (!mimetype) return 'file';
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype === 'application/pdf') return 'pdf';
        if (mimetype.includes('word') || mimetype.includes('document')) return 'word';
        if (mimetype === 'text/plain') return 'text';
        return 'file';
    }

    // ============================================================
    // FUNCIÓN AUXILIAR: FORMATEAR TAMAÑO DE ARCHIVO
    // ============================================================
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ============================================================
    // 🔥 SUBIR ARCHIVO PARA COMENTARIO (SOLO DUEÑO DE HISTORIA)
    // ============================================================
    router.post('/:storyId/upload-comment-file', auth, commentFileUpload.single('file'), async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;

            if (!req.file) {
                return res.status(400).json({ error: 'No se subió ningún archivo' });
            }

            // Verificar que la historia existe y el usuario es el dueño
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);

            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            if (story.userId !== userId) {
                return res.status(403).json({ 
                    error: 'No tienes permiso para subir archivos en esta historia',
                    message: 'Solo el dueño de la historia puede subir archivos en los comentarios'
                });
            }

            const fileUrl = `/uploads/comments/${req.file.filename}`;
            const fileType = getFileTypeIcon(req.file.mimetype);

            res.json({
                success: true,
                fileUrl: fileUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                sizeFormatted: formatFileSize(req.file.size),
                mimetype: req.file.mimetype,
                fileType: fileType,
                message: '✅ Archivo subido correctamente para comentario'
            });

        } catch (error) {
            console.error('Error subiendo archivo para comentario:', error);
            res.status(500).json({ error: 'Error subiendo archivo' });
        }
    });

    // ============================================================
    // OBTENER COMENTARIOS DE UNA HISTORIA
    // ============================================================
    router.get('/:storyId/comments', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);
            
            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const users = read('users.json');
            const storyOwner = users.find(u => u.id === story.userId);
            
            if (!storyOwner || !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!story.comments) {
                story.comments = [];
                write('stories.json', stories);
            }
            
            // Enriquecer con datos de usuario (recursivo)
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });
            
            const enrichComments = (items) => {
                if (!items) return [];
                items.forEach(item => {
                    const user = userMap[item.userId];
                    if (user) {
                        item.username = user.username;
                        item.fullName = user.fullName;
                        item.avatar = user.avatar;
                    }
                    if (item.replies && item.replies.length) {
                        enrichComments(item.replies);
                    }
                });
                return items;
            };
            
            // Ordenar comentarios: nuevos primero
            const sortedComments = [...story.comments].sort((a, b) => {
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            
            // Ordenar respuestas: viejas primero (orden cronológico) - recursivo
            const sortReplies = (items) => {
                if (!items) return;
                items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                items.forEach(item => {
                    if (item.replies && item.replies.length) {
                        sortReplies(item.replies);
                    }
                });
            };
            
            sortedComments.forEach(comment => {
                if (comment.replies && comment.replies.length > 0) {
                    sortReplies(comment.replies);
                }
            });
            
            const enriched = enrichComments(sortedComments);
            
            res.json(enriched);
        } catch (error) {
            if (logger) logger.error('Error obteniendo comentarios:', { error: error.message });
            else console.error('Error obteniendo comentarios:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // AGREGAR COMENTARIO PRINCIPAL (CON SOPORTE PARA ARCHIVO)
    // ============================================================
    router.post('/:storyId/comments', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            const { content, fileUrl, filename, originalName, fileSize, mimetype } = req.body;
            
            if ((!content || content.trim().length === 0) && !fileUrl) {
                return res.status(400).json({ error: 'El comentario debe tener texto o un archivo adjunto' });
            }
            
            if (content && content.length > 500) {
                return res.status(400).json({ error: 'Máximo 500 caracteres' });
            }
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const users = read('users.json');
            const storyOwner = users.find(u => u.id === stories[storyIndex].userId);
            
            if (!storyOwner || !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!stories[storyIndex].comments) {
                stories[storyIndex].comments = [];
            }
            
            const user = users.find(u => u.id === userId);
            const isStoryOwner = storyOwner.id === userId;
            
            const newComment = {
                id: Date.now().toString(),
                userId: userId,
                username: user?.username || 'Usuario',
                fullName: user?.fullName || 'Usuario',
                avatar: user?.avatar || 'https://ui-avatars.com/api/?name=Usuario&background=a855f7&color=fff',
                content: content?.trim() || '',
                createdAt: new Date().toISOString(),
                replies: [],
                likes: [],
                // 🔥 NUEVOS CAMPOS PARA ARCHIVOS ADJUNTOS
                hasFile: !!fileUrl,
                fileUrl: fileUrl || null,
                filename: filename || null,
                originalName: originalName || null,
                fileSize: fileSize || null,
                fileSizeFormatted: fileSize ? formatFileSize(fileSize) : null,
                mimetype: mimetype || null,
                fileType: mimetype ? getFileTypeIcon(mimetype) : null,
                isStoryOwner: isStoryOwner
            };
            
            stories[storyIndex].comments.push(newComment);
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            io.to(`user_${stories[storyIndex].userId}`).emit('new_comment', {
                storyId: storyId,
                comment: newComment,
                commenterId: userId
            });
            
            if (stories[storyIndex].userId !== userId) {
                const notifications = read('notifications.json');
                const commentText = content?.trim() || '📎 Archivó adjunto';
                const previewText = commentText.length > 50 ? commentText.substring(0, 50) + '...' : commentText;
                
                const newNotification = {
                    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                    userId: stories[storyIndex].userId,
                    type: 'comment',
                    fromUserId: userId,
                    fromName: user?.fullName || user?.username || 'Usuario',
                    fromUsername: user?.username || 'usuario',
                    fromAvatar: user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'U')}&background=a855f7&color=fff`,
                    storyId: storyId,
                    commentId: newComment.id,
                    commentPreview: commentText,
                    hasFile: !!fileUrl,
                    message: `${user?.fullName || 'Usuario'} comentó en tu historia: "${previewText}"`,
                    icon: fileUrl ? '📎' : '💬',
                    data: {
                        commentPreview: commentText,
                        storyId: storyId,
                        commentId: newComment.id,
                        hasFile: !!fileUrl,
                        fileUrl: fileUrl || null
                    },
                    read: false,
                    translated: false,
                    language: 'es',
                    createdAt: new Date().toISOString()
                };
                
                notifications.push(newNotification);
                write('notifications.json', notifications);
                io.to(`user_${stories[storyIndex].userId}`).emit('new_notification', newNotification);
            }
            
            if (logger) logger.info(`💬 Usuario ${userId} comentó en historia ${storyId}${fileUrl ? ' con archivo adjunto' : ''}`);
            res.status(201).json(newComment);
        } catch (error) {
            if (logger) logger.error('Error agregando comentario:', { error: error.message });
            else console.error('Error agregando comentario:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR COMENTARIO (RECURSIVO) - CON ELIMINACIÓN DE ARCHIVO
    // ============================================================
    router.delete('/:storyId/comments/:commentId', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const commentId = req.params.commentId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            if (!stories[storyIndex].comments) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            // Buscar recursivamente
            const result = findParentAndComment(stories[storyIndex].comments, commentId);
            
            if (!result) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            const { parent, comment } = result;
            
            // Verificar permisos: dueño del comentario O dueño de la historia
            if (comment.userId !== userId && stories[storyIndex].userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            // 🔥 ELIMINAR ARCHIVO ADJUNTO SI EXISTE
            if (comment.fileUrl) {
                try {
                    const filename = path.basename(comment.fileUrl);
                    const filePath = path.join(COMMENT_UPLOAD_DIR, filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Archivo de comentario eliminado: ${filename}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando archivo de comentario:', e.message);
                }
            }
            
            if (parent) {
                parent.replies = parent.replies.filter(c => c.id !== commentId);
            } else {
                stories[storyIndex].comments = stories[storyIndex].comments.filter(c => c.id !== commentId);
            }
            
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            io.to(`user_${stories[storyIndex].userId}`).emit('comment_deleted', {
                storyId: storyId,
                commentId: commentId
            });
            
            if (logger) logger.info(`🗑️ Comentario ${commentId} eliminado`);
            res.json({ success: true });
        } catch (error) {
            if (logger) logger.error('Error eliminando comentario:', { error: error.message });
            else console.error('Error eliminando comentario:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // AGREGAR RESPUESTA (ANIDADA - MÚLTIPLES NIVELES)
    // ============================================================
    router.post('/:storyId/comments/:commentId/replies', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const parentCommentId = req.params.commentId;
            const userId = req.userId;
            const { content } = req.body;
            
            if (!content || content.trim().length === 0) {
                return res.status(400).json({ error: 'La respuesta no puede estar vacía' });
            }
            
            if (content.length > 500) {
                return res.status(400).json({ error: 'Máximo 500 caracteres' });
            }
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const users = read('users.json');
            const storyOwner = users.find(u => u.id === stories[storyIndex].userId);
            
            if (!storyOwner || !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!stories[storyIndex].comments) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            // BUSCAR EL COMENTARIO PADRE (EN CUALQUIER NIVEL)
            const parentComment = findCommentById(stories[storyIndex].comments, parentCommentId);
            
            if (!parentComment) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            if (!parentComment.replies) {
                parentComment.replies = [];
            }
            
            const user = users.find(u => u.id === userId);
            
            const newReply = {
                id: Date.now().toString(),
                userId: userId,
                username: user?.username || 'Usuario',
                fullName: user?.fullName || 'Usuario',
                avatar: user?.avatar || 'https://ui-avatars.com/api/?name=Usuario&background=a855f7&color=fff',
                content: content.trim(),
                createdAt: new Date().toISOString(),
                replies: [],
                likes: [],
                hasFile: false,
                fileUrl: null
            };
            
            parentComment.replies.push(newReply);
            
            // Ordenar respuestas del padre (viejas primero)
            parentComment.replies.sort((a, b) => {
                return new Date(a.createdAt) - new Date(b.createdAt);
            });
            
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            io.to(`user_${stories[storyIndex].userId}`).emit('new_reply', {
                storyId: storyId,
                commentId: parentCommentId,
                reply: newReply,
                replierId: userId
            });
            
            // ============================================================
            // NOTIFICACIÓN: AL DUEÑO DEL COMENTARIO QUE SE ESTÁ RESPONDIENDO
            // ============================================================
            if (parentComment.userId && parentComment.userId !== userId) {
                const notifications = read('notifications.json');
                const replyText = content.trim();
                const previewReply = replyText.length > 50 ? replyText.substring(0, 50) + '...' : replyText;
                
                // Verificar si el padre tiene un padre (es una respuesta a una respuesta)
                const parentOfParent = findParentAndComment(stories[storyIndex].comments, parentCommentId);
                const isReplyToReply = parentOfParent && parentOfParent.parent !== null;
                
                let message = '';
                let notificationType = 'reply';
                
                if (isReplyToReply) {
                    message = `${user?.fullName || 'Usuario'} respondió a tu comentario`;
                    notificationType = 'reply_to_reply';
                } else {
                    message = `${user?.fullName || 'Usuario'} respondió a tu comentario`;
                    notificationType = 'reply';
                }
                
                const newNotification = {
                    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
                    userId: parentComment.userId,
                    type: notificationType,
                    fromUserId: userId,
                    fromName: user?.fullName || user?.username || 'Usuario',
                    fromUsername: user?.username || 'usuario',
                    fromAvatar: user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'U')}&background=a855f7&color=fff`,
                    storyId: storyId,
                    commentId: parentCommentId,
                    replyId: newReply.id,
                    replyPreview: replyText,
                    message: `${message}: "${previewReply}"`,
                    icon: '💬',
                    data: {
                        replyPreview: replyText,
                        storyId: storyId,
                        commentId: parentCommentId,
                        replyId: newReply.id,
                        isReplyToReply: isReplyToReply,
                        repliedToUserId: parentComment.userId,
                        repliedToName: parentComment.fullName || parentComment.username || 'Usuario'
                    },
                    read: false,
                    translated: false,
                    language: 'es',
                    createdAt: new Date().toISOString()
                };
                
                notifications.push(newNotification);
                write('notifications.json', notifications);
                io.to(`user_${parentComment.userId}`).emit('new_notification', newNotification);
                
                if (logger) logger.info(`📢 Notificación de respuesta: ${newNotification.message}`);
            }
            
            if (logger) logger.info(`💬 Usuario ${userId} respondió al comentario ${parentCommentId}`);
            res.status(201).json(newReply);
        } catch (error) {
            if (logger) logger.error('Error agregando respuesta:', { error: error.message });
            else console.error('Error agregando respuesta:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ELIMINAR RESPUESTA (RECURSIVO) - CON ELIMINACIÓN DE ARCHIVO
    // ============================================================
    router.delete('/:storyId/comments/:commentId/replies/:replyId', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const commentId = req.params.commentId;
            const replyId = req.params.replyId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            if (!stories[storyIndex].comments) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            // Buscar el comentario padre
            const parentComment = findCommentById(stories[storyIndex].comments, commentId);
            
            if (!parentComment) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            if (!parentComment.replies) {
                return res.status(404).json({ error: 'Respuesta no encontrada' });
            }
            
            const replyIndex = parentComment.replies.findIndex(r => r.id === replyId);
            
            if (replyIndex === -1) {
                return res.status(404).json({ error: 'Respuesta no encontrada' });
            }
            
            const replyFound = parentComment.replies[replyIndex];
            
            if (replyFound.userId !== userId && stories[storyIndex].userId !== userId) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            // 🔥 ELIMINAR ARCHIVO ADJUNTO SI EXISTE
            if (replyFound.fileUrl) {
                try {
                    const filename = path.basename(replyFound.fileUrl);
                    const filePath = path.join(COMMENT_UPLOAD_DIR, filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Archivo de respuesta eliminado: ${filename}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Error eliminando archivo de respuesta:', e.message);
                }
            }
            
            parentComment.replies.splice(replyIndex, 1);
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            io.to(`user_${stories[storyIndex].userId}`).emit('reply_deleted', {
                storyId: storyId,
                commentId: commentId,
                replyId: replyId
            });
            
            if (logger) logger.info(`🗑️ Respuesta ${replyId} eliminada`);
            res.json({ success: true });
        } catch (error) {
            if (logger) logger.error('Error eliminando respuesta:', { error: error.message });
            else console.error('Error eliminando respuesta:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // DAR LIKE A UN COMENTARIO (RECURSIVO)
    // ============================================================
    router.post('/:storyId/comments/:commentId/like', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const commentId = req.params.commentId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const users = read('users.json');
            const storyOwner = users.find(u => u.id === stories[storyIndex].userId);
            
            if (!storyOwner || !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!stories[storyIndex].comments) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            const comment = findCommentById(stories[storyIndex].comments, commentId);
            
            if (!comment) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            if (!comment.likes) {
                comment.likes = [];
            }
            
            const isLiked = comment.likes.includes(userId);
            
            if (isLiked) {
                comment.likes = comment.likes.filter(id => id !== userId);
            } else {
                comment.likes.push(userId);
            }
            
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            res.json({ 
                success: true,
                liked: !isLiked,
                likes: comment.likes,
                likesCount: comment.likes.length
            });
        } catch (error) {
            if (logger) logger.error('Error dando like a comentario:', { error: error.message });
            else console.error('Error dando like a comentario:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // QUITAR LIKE DE UN COMENTARIO (RECURSIVO)
    // ============================================================
    router.delete('/:storyId/comments/:commentId/like', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const commentId = req.params.commentId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const users = read('users.json');
            const storyOwner = users.find(u => u.id === stories[storyIndex].userId);
            
            if (!storyOwner || !areStoriesVisible(storyOwner, userId)) {
                return res.status(403).json({ error: 'No tienes permiso' });
            }
            
            if (!stories[storyIndex].comments) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            const comment = findCommentById(stories[storyIndex].comments, commentId);
            
            if (!comment) {
                return res.status(404).json({ error: 'Comentario no encontrado' });
            }
            
            if (!comment.likes) {
                comment.likes = [];
            }
            
            comment.likes = comment.likes.filter(id => id !== userId);
            
            write('stories.json', stories);
            
            try {
                const cache = require('./cache');
                cache.invalidatePattern(`story_detail_complete_${storyId}`);
                cache.invalidatePattern(`story_detail_${storyId}`);
            } catch(e) {}
            
            res.json({ 
                success: true,
                liked: false,
                likes: comment.likes,
                likesCount: comment.likes.length
            });
        } catch (error) {
            if (logger) logger.error('Error quitando like de comentario:', { error: error.message });
            else console.error('Error quitando like de comentario:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ✅ RETORNAR EL ROUTER
    return router;
};