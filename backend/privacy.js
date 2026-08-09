const auth = require('./middleware/auth');

module.exports = (read, write, io) => {
    const router = require('express').Router();

    // ========== OBTENER CONFIGURACIÓN DE PRIVACIDAD - SOLO AUTENTICADO ==========
    router.get('/', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            res.json({ 
                privacy: user.privacy || 'public',
                settings: {
                    public: '🌍 Público - Cualquiera puede ver tu perfil y tus historias',
                    followers: '👥 Solo seguidores - Solo tus seguidores pueden ver tus historias',
                    private: '🔒 Privado - Solo tú puedes ver tu perfil'
                }
            });
        } catch (error) {
            console.error('Error en GET privacy:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ========== ACTUALIZAR PRIVACIDAD - SOLO AUTENTICADO ==========
    router.put('/', auth, (req, res) => {
        try {
            const { privacy } = req.body;
            
            if (!['public', 'followers', 'private'].includes(privacy)) {
                return res.status(400).json({ error: 'Opción de privacidad inválida' });
            }
            
            let users = read('users.json');
            const userIndex = users.findIndex(u => u.id === req.userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const oldPrivacy = users[userIndex].privacy;
            users[userIndex].privacy = privacy;
            
            if ((oldPrivacy === 'private' || oldPrivacy === 'followers') && privacy === 'public') {
                console.log(`🔄 Usuario ${users[userIndex].username} cambió a público - Aceptando solicitudes pendientes...`);
                
                const pendingRequestsList = [...(users[userIndex].pendingRequests || [])];
                let acceptedCount = 0;
                
                for (const requesterId of pendingRequestsList) {
                    const requesterIndex = users.findIndex(u => u.id === requesterId);
                    if (requesterIndex !== -1) {
                        if (!users[userIndex].followers) users[userIndex].followers = [];
                        if (!users[requesterIndex].following) users[requesterIndex].following = [];
                        if (!users[userIndex].pendingRequests) users[userIndex].pendingRequests = [];
                        if (!users[requesterIndex].pendingSent) users[requesterIndex].pendingSent = [];
                        
                        if (!users[userIndex].followers.includes(requesterId)) {
                            users[userIndex].followers.push(requesterId);
                        }
                        if (!users[requesterIndex].following.includes(req.userId)) {
                            users[requesterIndex].following.push(req.userId);
                        }
                        
                        users[userIndex].pendingRequests = users[userIndex].pendingRequests.filter(id => id !== requesterId);
                        users[requesterIndex].pendingSent = users[requesterIndex].pendingSent.filter(id => id !== req.userId);
                        
                        acceptedCount++;
                        console.log(`  ✅ Solicitud de ${users[requesterIndex].username} aceptada automáticamente`);
                    }
                }
                
                let notifications = read('notifications.json');
                notifications = notifications.filter(n => !(n.userId === req.userId && n.type === 'follow_request'));
                write('notifications.json', notifications);
                
                write('users.json', users);
                
                if (acceptedCount > 0 && io) {
                    for (const requesterId of pendingRequestsList) {
                        io.to(`user_${requesterId}`).emit('follow_request_accepted', {
                            followerId: requesterId,
                            byId: req.userId,
                            byName: users[userIndex].fullName,
                            followerName: users.find(u => u.id === requesterId)?.fullName
                        });
                        
                        io.to(`user_${requesterId}`).emit('follow_status_updated', {
                            userId: req.userId,
                            status: 'following'
                        });
                        
                        io.to(`user_${requesterId}`).emit('followers_count_updated', {
                            userId: requesterId,
                            newCount: users.find(u => u.id === requesterId)?.following?.length || 0
                        });
                        
                        io.to(`user_${requesterId}`).emit('profile_data_updated', { 
                            userId: requesterId,
                            targetUserId: req.userId
                        });
                    }
                    
                    io.to(`user_${req.userId}`).emit('followers_count_updated', {
                        userId: req.userId,
                        newCount: users[userIndex].followers.length
                    });
                    
                    console.log(`  📢 Emitidos eventos a ${acceptedCount} usuarios`);
                }
            } else {
                write('users.json', users);
            }
            
            if (io) {
                io.emit('privacy_updated', {
                    userId: req.userId,
                    privacy: privacy,
                    oldPrivacy: oldPrivacy,
                    username: users[userIndex].username,
                    fullName: users[userIndex].fullName
                });
                console.log(`  📢 Emitido evento privacy_updated a todos los clientes`);
            }
            
            console.log(`🔒 Usuario ${users[userIndex].username} cambió privacidad de ${oldPrivacy} a: ${privacy}`);
            
            res.json({ 
                success: true, 
                privacy,
                message: `Tu perfil ahora es ${privacy}`
            });
        } catch (error) {
            console.error('Error en PUT privacy:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ========== VERIFICAR SI EL PERFIL ES VISIBLE ==========
    const isProfileVisible = (targetUser, currentUserId) => {
        if (!targetUser) return false;
        if (targetUser.id === currentUserId) return true;
        
        const privacy = targetUser.privacy || 'public';
        
        if (privacy === 'public') return true;
        if (privacy === 'followers') return true;
        if (privacy === 'private') return false;
        
        return true;
    };
    
    // ========== VERIFICAR SI LAS HISTORIAS SON VISIBLES ==========
    const areStoriesVisible = (targetUser, currentUserId) => {
        if (!targetUser) return false;
        if (targetUser.id === currentUserId) return true;
        
        const privacy = targetUser.privacy || 'public';
        
        if (privacy === 'public') return true;
        
        if (privacy === 'followers') {
            const isFollowing = targetUser.followers?.includes(currentUserId) || false;
            return isFollowing;
        }
        
        if (privacy === 'private') return false;
        
        return true;
    };

    // ========== OBTENER USUARIOS QUE PUEDEN VER MIS HISTORIAS - SOLO AUTENTICADO ==========
    router.get('/viewers', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const privacy = currentUser.privacy || 'public';
            let viewers = [];
            
            if (privacy === 'public') {
                viewers = users
                    .filter(u => u.id !== req.userId)
                    .map(({ password, ...u }) => u)
                    .slice(0, 50);
            } else if (privacy === 'followers') {
                viewers = users
                    .filter(u => currentUser.followers?.includes(u.id))
                    .map(({ password, ...u }) => u);
            } else {
                viewers = [];
            }
            
            res.json(viewers);
        } catch (error) {
            console.error('Error en viewers:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return { router, isProfileVisible, areStoriesVisible };
};