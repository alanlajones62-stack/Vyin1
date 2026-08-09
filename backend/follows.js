// backend/follows.js
const auth = require('./middleware/auth');  // ← CORREGIDO

module.exports = (read, write, io, createNotification) => {
    const router = require('express').Router();

    router.post('/follow', auth, (req, res) => {
        try {
            const { userId } = req.body;
            console.log(`📌 Follow request: ${req.userId} -> ${userId}`);
            
            if (userId === req.userId) {
                return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });
            }
            
            let users = read('users.json');
            
            const currentUserIndex = users.findIndex(u => u.id === req.userId);
            const targetUserIndex = users.findIndex(u => u.id === userId);
            
            if (currentUserIndex === -1) {
                return res.status(404).json({ error: 'Usuario actual no encontrado' });
            }
            if (targetUserIndex === -1) {
                return res.status(404).json({ error: 'Usuario destino no encontrado' });
            }
            
            const currentUser = users[currentUserIndex];
            const targetUser = users[targetUserIndex];
            
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.pendingSent) currentUser.pendingSent = [];
            if (!targetUser.followers) targetUser.followers = [];
            if (!targetUser.pendingRequests) targetUser.pendingRequests = [];
            
            if (currentUser.following.includes(userId)) {
                return res.status(400).json({ error: 'Ya sigues a este usuario' });
            }
            
            if (currentUser.pendingSent.includes(userId)) {
                return res.status(400).json({ error: 'Ya enviaste solicitud a este usuario' });
            }
            
            const isPrivate = targetUser.privacy === 'private' || targetUser.privacy === 'followers';
            
            if (isPrivate) {
                if (!targetUser.pendingRequests.includes(req.userId)) {
                    targetUser.pendingRequests.push(req.userId);
                }
                if (!currentUser.pendingSent.includes(userId)) {
                    currentUser.pendingSent.push(userId);
                }
                
                write('users.json', users);
                
                if (createNotification) {
                    createNotification(userId, 'follow_request', req.userId, {
                        message: `${currentUser.fullName} (@${currentUser.username}) quiere seguirte`
                    });
                }
                
                io.to(`user_${userId}`).emit('follow_request_sent', { 
                    fromId: req.userId, 
                    toId: userId,
                    fromName: currentUser.fullName,
                    fromUsername: currentUser.username,
                    fromAvatar: currentUser.avatar,
                    toName: targetUser.fullName
                });
                
                console.log(`📨 Solicitud enviada de ${currentUser.username} a ${targetUser.username}`);
                
                return res.json({ 
                    success: true, 
                    status: 'pending_sent',
                    message: `Solicitud enviada a ${targetUser.fullName}`
                });
            } else {
                if (!currentUser.following.includes(userId)) {
                    currentUser.following.push(userId);
                }
                if (!targetUser.followers.includes(req.userId)) {
                    targetUser.followers.push(req.userId);
                }
                
                write('users.json', users);
                
                io.emit('user_followed', { 
                    followerId: req.userId, 
                    followedId: userId,
                    followersCount: targetUser.followers.length,
                    followingCount: currentUser.following.length,
                    followerName: currentUser.fullName,
                    followedName: targetUser.fullName
                });
                
                io.to(`user_${req.userId}`).emit('following_count_updated', {
                    userId: req.userId,
                    newCount: currentUser.following.length
                });
                io.to(`user_${userId}`).emit('followers_count_updated', {
                    userId: userId,
                    newCount: targetUser.followers.length
                });
                
                console.log(`✅ ${currentUser.username} ahora sigue a ${targetUser.username}`);
                
                return res.json({ 
                    success: true, 
                    status: 'following',
                    followersCount: targetUser.followers.length,
                    message: `Ahora sigues a ${targetUser.fullName}`
                });
            }
        } catch (error) {
            console.error('Error en follow:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    router.post('/accept', auth, (req, res) => {
        try {
            const { userId } = req.body;
            console.log(`📌 Accept: ${req.userId} acepta a ${userId}`);
            
            let users = read('users.json');
            
            const currentUserIndex = users.findIndex(u => u.id === req.userId);
            const requesterIndex = users.findIndex(u => u.id === userId);
            
            if (currentUserIndex === -1 || requesterIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!users[currentUserIndex].pendingRequests) users[currentUserIndex].pendingRequests = [];
            if (!users[requesterIndex].pendingSent) users[requesterIndex].pendingSent = [];
            if (!users[currentUserIndex].followers) users[currentUserIndex].followers = [];
            if (!users[requesterIndex].following) users[requesterIndex].following = [];
            
            if (!users[currentUserIndex].pendingRequests.includes(userId)) {
                return res.status(400).json({ error: 'No hay solicitud pendiente' });
            }
            
            users[currentUserIndex].pendingRequests = users[currentUserIndex].pendingRequests.filter(id => id !== userId);
            users[requesterIndex].pendingSent = users[requesterIndex].pendingSent.filter(id => id !== req.userId);
            
            if (!users[currentUserIndex].followers.includes(userId)) {
                users[currentUserIndex].followers.push(userId);
            }
            if (!users[requesterIndex].following.includes(req.userId)) {
                users[requesterIndex].following.push(req.userId);
            }
            
            write('users.json', users);
            
            let notifications = read('notifications.json');
            notifications = notifications.filter(n => !(n.userId === req.userId && n.fromUserId === userId && n.type === 'follow_request'));
            write('notifications.json', notifications);
            
            if (createNotification) {
                createNotification(userId, 'follow_accept', req.userId, {
                    message: `${users[currentUserIndex].fullName} aceptó tu solicitud`
                });
            }
            
            io.emit('follow_request_accepted', { 
                followerId: userId,
                byId: req.userId, 
                byName: users[currentUserIndex].fullName,
                followerName: users[requesterIndex].fullName
            });
            
            io.to(`user_${req.userId}`).emit('followers_count_updated', {
                userId: req.userId,
                newCount: users[currentUserIndex].followers.length
            });
            io.to(`user_${userId}`).emit('following_count_updated', {
                userId: userId,
                newCount: users[requesterIndex].following.length
            });
            
            io.to(`user_${req.userId}`).emit('profile_data_updated', { userId: req.userId });
            io.to(`user_${userId}`).emit('profile_data_updated', { userId: userId });
            
            console.log(`✅ ${users[currentUserIndex].username} aceptó a ${users[requesterIndex].username}`);
            
            res.json({ success: true, message: `Aceptaste a ${users[requesterIndex].fullName}` });
        } catch (error) {
            console.error('Error aceptando:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.delete('/reject', auth, (req, res) => {
        try {
            const { userId } = req.body;
            let users = read('users.json');
            
            const currentUserIndex = users.findIndex(u => u.id === req.userId);
            const requesterIndex = users.findIndex(u => u.id === userId);
            
            if (currentUserIndex === -1 || requesterIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!users[currentUserIndex].pendingRequests) users[currentUserIndex].pendingRequests = [];
            if (!users[requesterIndex].pendingSent) users[requesterIndex].pendingSent = [];
            
            users[currentUserIndex].pendingRequests = users[currentUserIndex].pendingRequests.filter(id => id !== userId);
            users[requesterIndex].pendingSent = users[requesterIndex].pendingSent.filter(id => id !== req.userId);
            
            write('users.json', users);
            
            let notifications = read('notifications.json');
            notifications = notifications.filter(n => !(n.userId === req.userId && n.fromUserId === userId && n.type === 'follow_request'));
            write('notifications.json', notifications);
            
            io.to(`user_${userId}`).emit('follow_request_rejected', { 
                byId: req.userId,
                toId: userId
            });
            
            res.json({ success: true, message: 'Solicitud rechazada' });
        } catch (error) {
            console.error('Error rechazando:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.delete('/cancel', auth, (req, res) => {
        try {
            const { userId } = req.body;
            console.log(`📌 Cancel follow request: ${req.userId} cancela solicitud a ${userId}`);
            
            let users = read('users.json');
            
            const currentUserIndex = users.findIndex(u => u.id === req.userId);
            const targetUserIndex = users.findIndex(u => u.id === userId);
            
            if (currentUserIndex === -1 || targetUserIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!users[currentUserIndex].pendingSent) users[currentUserIndex].pendingSent = [];
            if (!users[targetUserIndex].pendingRequests) users[targetUserIndex].pendingRequests = [];
            
            users[currentUserIndex].pendingSent = users[currentUserIndex].pendingSent.filter(id => id !== userId);
            users[targetUserIndex].pendingRequests = users[targetUserIndex].pendingRequests.filter(id => id !== req.userId);
            
            write('users.json', users);
            
            let notifications = read('notifications.json');
            notifications = notifications.filter(n => !(n.userId === userId && n.fromUserId === req.userId && n.type === 'follow_request'));
            write('notifications.json', notifications);
            
            io.to(`user_${userId}`).emit('follow_request_cancelled', { 
                fromId: req.userId, 
                toId: userId,
                fromName: users[currentUserIndex].fullName
            });
            
            io.to(`user_${req.userId}`).emit('profile_data_updated', { userId: req.userId });
            
            console.log(`📨 ${users[currentUserIndex].username} canceló solicitud a ${users[targetUserIndex].username}`);
            
            res.json({ success: true, message: 'Solicitud cancelada' });
        } catch (error) {
            console.error('Error cancelando:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.delete('/unfollow', auth, (req, res) => {
        try {
            const { userId } = req.body;
            let users = read('users.json');
            
            const currentUserIndex = users.findIndex(u => u.id === req.userId);
            const targetUserIndex = users.findIndex(u => u.id === userId);
            
            if (currentUserIndex === -1 || targetUserIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            if (!users[currentUserIndex].following) users[currentUserIndex].following = [];
            if (!users[targetUserIndex].followers) users[targetUserIndex].followers = [];
            
            if (!users[currentUserIndex].following.includes(userId)) {
                return res.status(400).json({ error: 'No sigues a este usuario' });
            }
            
            users[currentUserIndex].following = users[currentUserIndex].following.filter(id => id !== userId);
            users[targetUserIndex].followers = users[targetUserIndex].followers.filter(id => id !== req.userId);
            
            write('users.json', users);
            
            io.emit('user_unfollowed', { 
                followerId: req.userId, 
                followedId: userId,
                followersCount: users[targetUserIndex].followers.length,
                followingCount: users[currentUserIndex].following.length,
                followerName: users[currentUserIndex].fullName,
                followedName: users[targetUserIndex].fullName
            });
            
            io.to(`user_${req.userId}`).emit('following_count_updated', {
                userId: req.userId,
                newCount: users[currentUserIndex].following.length
            });
            io.to(`user_${userId}`).emit('followers_count_updated', {
                userId: userId,
                newCount: users[targetUserIndex].followers.length
            });
            
            io.to(`user_${req.userId}`).emit('profile_data_updated', { userId: req.userId });
            io.to(`user_${userId}`).emit('profile_data_updated', { userId: userId });
            
            console.log(`👋 ${users[currentUserIndex].username} dejó de seguir a ${users[targetUserIndex].username}`);
            
            res.json({ success: true, message: `Dejaste de seguir al usuario` });
        } catch (error) {
            console.error('Error en unfollow:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.get('/followers/:userId', auth, (req, res) => {
        try {
            const users = read('users.json');
            const targetUser = users.find(u => u.id === req.params.userId);
            if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
            
            const followers = users
                .filter(u => targetUser.followers?.includes(u.id))
                .map(({ password, ...u }) => u);
            
            res.json(followers);
        } catch (error) {
            console.error('Error en followers:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.get('/following/:userId', auth, (req, res) => {
        try {
            const users = read('users.json');
            const targetUser = users.find(u => u.id === req.params.userId);
            if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
            
            const following = users
                .filter(u => targetUser.following?.includes(u.id))
                .map(({ password, ...u }) => u);
            
            res.json(following);
        } catch (error) {
            console.error('Error en following:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    router.get('/status/:userId', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            const targetUser = users.find(u => u.id === req.params.userId);
            
            if (!currentUser || !targetUser) {
                return res.json({ status: 'none', isPrivate: false });
            }
            
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.pendingSent) currentUser.pendingSent = [];
            
            let status = 'none';
            
            if (currentUser.following.includes(req.params.userId)) {
                status = 'following';
            } else if (currentUser.pendingSent.includes(req.params.userId)) {
                status = 'pending_sent';
            } else if (targetUser.privacy === 'private' || targetUser.privacy === 'followers') {
                status = 'can_request';
            } else {
                status = 'can_follow';
            }
            
            res.json({ 
                status, 
                isPrivate: targetUser.privacy !== 'public',
                canViewStories: targetUser.privacy === 'public' || 
                               (targetUser.privacy === 'followers' && currentUser.following.includes(targetUser.id))
            });
        } catch (error) {
            console.error('Error en status:', error);
            res.json({ status: 'none', isPrivate: false });
        }
    });

    return router;
};