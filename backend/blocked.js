// backend/blocked.js - Sistema de bloqueo de usuarios
// Los bloqueos son silenciosos: el usuario bloqueado no se entera
// El bloqueador puede seguir viendo al bloqueado, pero el bloqueado no ve al bloqueador

const auth = require('./middleware/auth');

module.exports = (read, write, io, logger) => {
    const router = require('express').Router();

    // ============================================================
    // BLOQUEAR USUARIO
    // ============================================================
    router.post('/block', auth, (req, res) => {
        try {
            const { userId } = req.body;
            const blockerId = req.userId;

            if (!userId) {
                return res.status(400).json({ error: 'ID de usuario requerido' });
            }

            if (userId === blockerId) {
                return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
            }

            let users = read('users.json');
            
            const blockerIndex = users.findIndex(u => u.id === blockerId);
            const blockedIndex = users.findIndex(u => u.id === userId);

            if (blockerIndex === -1 || blockedIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const blocker = users[blockerIndex];
            const blocked = users[blockedIndex];

            // Inicializar arrays si no existen
            if (!blocker.blocked) blocker.blocked = [];
            if (!blocked.blockedBy) blocked.blockedBy = [];

            // Verificar si ya está bloqueado
            if (blocker.blocked.includes(userId)) {
                return res.status(400).json({ error: 'Ya has bloqueado a este usuario' });
            }

            // 🔥 BLOQUEAR
            blocker.blocked.push(userId);
            blocked.blockedBy.push(blockerId);

            // 🔥 ELIMINAR SEGUIMIENTO (si existe)
            if (blocker.following && blocker.following.includes(userId)) {
                blocker.following = blocker.following.filter(id => id !== userId);
            }
            if (blocked.followers && blocked.followers.includes(blockerId)) {
                blocked.followers = blocked.followers.filter(id => id !== blockerId);
            }

            // 🔥 ELIMINAR SOLICITUDES PENDIENTES
            if (blocker.pendingSent) {
                blocker.pendingSent = blocker.pendingSent.filter(id => id !== userId);
            }
            if (blocked.pendingRequests) {
                blocked.pendingRequests = blocked.pendingRequests.filter(id => id !== blockerId);
            }

            write('users.json', users);

            // 🔥 NOTIFICACIÓN SILENCIOSA - SOLO PARA EL BLOQUEADOR
            io.to(`user_${blockerId}`).emit('user_blocked', {
                userId: userId,
                username: blocked.username,
                fullName: blocked.fullName
            });

            // 🔥 NOTIFICACIÓN PARA EL BLOQUEADO - NO SE ENVÍA (BLOQUEO SILENCIOSO)
            // El bloqueado no debe saber que fue bloqueado

            logger.info(`🔒 Usuario ${blocker.username} bloqueó a ${blocked.username}`);

            res.json({
                success: true,
                message: `Has bloqueado a ${blocked.fullName}`,
                blockedUser: {
                    id: blocked.id,
                    username: blocked.username,
                    fullName: blocked.fullName
                }
            });

        } catch (error) {
            logger.error('Error bloqueando usuario:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // DESBLOQUEAR USUARIO
    // ============================================================
    router.delete('/unblock/:userId', auth, (req, res) => {
        try {
            const blockerId = req.userId;
            const blockedId = req.params.userId;

            let users = read('users.json');
            
            const blockerIndex = users.findIndex(u => u.id === blockerId);
            const blockedIndex = users.findIndex(u => u.id === blockedId);

            if (blockerIndex === -1 || blockedIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const blocker = users[blockerIndex];
            const blocked = users[blockedIndex];

            if (!blocker.blocked || !blocker.blocked.includes(blockedId)) {
                return res.status(400).json({ error: 'No has bloqueado a este usuario' });
            }

            // 🔥 DESBLOQUEAR
            blocker.blocked = blocker.blocked.filter(id => id !== blockedId);
            if (blocked.blockedBy) {
                blocked.blockedBy = blocked.blockedBy.filter(id => id !== blockerId);
            }

            write('users.json', users);

            io.to(`user_${blockerId}`).emit('user_unblocked', {
                userId: blockedId,
                username: blocked.username,
                fullName: blocked.fullName
            });

            logger.info(`🔓 Usuario ${blocker.username} desbloqueó a ${blocked.username}`);

            res.json({
                success: true,
                message: `Has desbloqueado a ${blocked.fullName}`
            });

        } catch (error) {
            logger.error('Error desbloqueando usuario:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // OBTENER LISTA DE BLOQUEADOS
    // ============================================================
    router.get('/blocked', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);

            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const blockedUsers = users
                .filter(u => currentUser.blocked?.includes(u.id))
                .map(({ password, ...u }) => u);

            res.json(blockedUsers);

        } catch (error) {
            logger.error('Error obteniendo bloqueados:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // VERIFICAR SI UN USUARIO ESTÁ BLOQUEADO
    // ============================================================
    router.get('/check/:userId', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === req.params.userId);

            if (!currentUser || !targetUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const isBlocked = currentUser.blocked?.includes(req.params.userId) || false;
            const isBlockedBy = targetUser.blockedBy?.includes(req.userId) || false;

            res.json({
                isBlocked,
                isBlockedBy,
                userId: req.params.userId
            });

        } catch (error) {
            logger.error('Error verificando bloqueo:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // VERIFICAR BLOQUEO MÚLTIPLE (BATCH)
    // ============================================================
    router.post('/check/batch', auth, (req, res) => {
        try {
            const { userIds } = req.body;
            
            if (!userIds || !Array.isArray(userIds)) {
                return res.status(400).json({ error: 'Se requiere un array de userIds' });
            }

            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);

            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const results = userIds.map(userId => {
                const targetUser = users.find(u => u.id === userId);
                return {
                    userId,
                    isBlocked: currentUser.blocked?.includes(userId) || false,
                    isBlockedBy: targetUser?.blockedBy?.includes(req.userId) || false,
                    userExists: !!targetUser
                };
            });

            res.json(results);

        } catch (error) {
            logger.error('Error verificando bloqueos batch:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};