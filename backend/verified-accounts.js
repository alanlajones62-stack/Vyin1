// backend/verified-accounts.js - Sistema de verificación y cuentas de empresa (VERSIÓN COMPLETA CON DOWNGRADE)

const auth = require('./middleware/auth');

const VERIFIED_FOLLOWERS_THRESHOLD = 1000000; // 1 millón de seguidores para verificación
const BUSINESS_ACCOUNT_FEE = 50; // Costo mensual en VYN
const BUSINESS_TRIAL_DAYS = 7; // Días de prueba

module.exports = function(read, write, io, logger) {
    const router = require('express').Router();

    // ============================================================
    // TIPOS DE CUENTA
    // ============================================================
    const ACCOUNT_TYPES = {
        PERSONAL: 'personal',
        BUSINESS: 'business',
        VERIFIED: 'verified',
        BUSINESS_VERIFIED: 'business_verified'
    };

    // ============================================================
    // ADMINISTRADORES OFICIALES (SIEMPRE VERIFICADOS)
    // ============================================================
    const OFFICIAL_ADMINS = [
        { id: '1783122622538', username: 'demo' },
        { id: '1783370679935', username: 'Admin_Ecuador' }
    ];

    // ============================================================
    // VERIFICAR CUENTAS EXISTENTES (EVENTO PROGRAMADO)
    // ============================================================
    async function verifyExistingAccounts() {
        try {
            logger.info('🔄 Iniciando verificación masiva de cuentas...');
            
            const users = read('users.json');
            let verifiedCount = 0;
            let businessCount = 0;
            let adminVerifiedCount = 0;
            
            users.forEach(user => {
                // 🔥 ADMINISTRADORES: SIEMPRE VERIFICADOS
                const isOfficialAdmin = OFFICIAL_ADMINS.some(a => a.id === user.id);
                
                if (isOfficialAdmin) {
                    if (!user.isVerified) {
                        user.isVerified = true;
                        user.verifiedAt = new Date().toISOString();
                        user.verifiedBadge = 'verified';
                        user.accountType = ACCOUNT_TYPES.VERIFIED;
                        user.role = 'admin';
                        adminVerifiedCount++;
                        logger.info(`👑 Administrador ${user.username} verificado automáticamente`);
                    }
                    // Asegurar que el admin tenga role: admin
                    if (user.role !== 'admin') {
                        user.role = 'admin';
                        logger.info(`👑 Rol de administrador asignado a ${user.username}`);
                    }
                    return;
                }

                // Saltar si ya está verificado
                if (user.isVerified) return;
                
                const followersCount = user.followers?.length || 0;
                
                // Verificar si tiene suficientes seguidores (solo para usuarios normales)
                if (followersCount >= VERIFIED_FOLLOWERS_THRESHOLD) {
                    user.isVerified = true;
                    user.verifiedAt = new Date().toISOString();
                    user.verifiedBadge = 'verified';
                    user.accountType = ACCOUNT_TYPES.VERIFIED;
                    verifiedCount++;
                    logger.info(`✅ Usuario ${user.username} verificado automáticamente (${followersCount} seguidores)`);
                }
                
                // Verificar si es cuenta de empresa (business)
                if (user.accountType === ACCOUNT_TYPES.BUSINESS || user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED) {
                    businessCount++;
                }
            });
            
            if (verifiedCount > 0 || businessCount > 0 || adminVerifiedCount > 0) {
                write('users.json', users);
                logger.info(`✅ Verificación completada: ${verifiedCount} nuevas cuentas verificadas, ${businessCount} cuentas de empresa, ${adminVerifiedCount} administradores verificados`);
            } else {
                logger.info('✅ No se encontraron cuentas para verificar automáticamente');
            }
            
            return { verifiedCount, businessCount, adminVerifiedCount };
        } catch (error) {
            logger.error('Error en verificación masiva:', { error: error.message });
            return { verifiedCount: 0, businessCount: 0, adminVerifiedCount: 0 };
        }
    }

    // ============================================================
    // OBTENER ESTADO DE VERIFICACIÓN
    // ============================================================
    router.get('/status/:userId', auth, (req, res) => {
        try {
            const userId = req.params.userId;
            const users = read('users.json');
            const user = users.find(u => u.id === userId);
            
            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const isOwnProfile = req.userId === userId;
            
            // Solo el propio usuario o admin puede ver detalles
            if (!isOwnProfile && req.userId !== userId) {
                return res.json({
                    isVerified: user.isVerified || false,
                    isBusiness: user.accountType === ACCOUNT_TYPES.BUSINESS || 
                               user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED,
                    hasBadge: user.isVerified || false,
                    accountType: user.accountType || ACCOUNT_TYPES.PERSONAL,
                    isAdmin: user.role === 'admin' || false
                });
            }
            
            res.json({
                userId: user.id,
                username: user.username,
                fullName: user.fullName,
                isVerified: user.isVerified || false,
                verifiedAt: user.verifiedAt || null,
                verifiedBadge: user.verifiedBadge || null,
                accountType: user.accountType || ACCOUNT_TYPES.PERSONAL,
                isBusiness: user.accountType === ACCOUNT_TYPES.BUSINESS || 
                           user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED,
                businessInfo: user.businessInfo || null,
                followersCount: user.followers?.length || 0,
                followersNeeded: Math.max(0, VERIFIED_FOLLOWERS_THRESHOLD - (user.followers?.length || 0)),
                isAdmin: user.role === 'admin' || false
            });
        } catch (error) {
            logger.error('Error obteniendo estado de verificación:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // SOLICITAR VERIFICACIÓN MANUAL (ADMIN)
    // ============================================================
    router.post('/verify/:userId', auth, async (req, res) => {
        try {
            // Verificar que el usuario actual es admin
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden verificar cuentas.' });
            }
            
            const userId = req.params.userId;
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const user = users[userIndex];
            
            // Verificar si ya está verificado
            if (user.isVerified) {
                return res.status(400).json({ error: 'El usuario ya está verificado' });
            }
            
            // 🔥 ADMINISTRADORES: VERIFICACIÓN SIN REQUISITOS
            const isOfficialAdmin = OFFICIAL_ADMINS.some(a => a.id === userId);
            
            // Solo verificar requisitos para usuarios normales
            if (!isOfficialAdmin) {
                const followersCount = user.followers?.length || 0;
                
                if (followersCount < VERIFIED_FOLLOWERS_THRESHOLD) {
                    return res.status(400).json({ 
                        error: `El usuario necesita al menos ${VERIFIED_FOLLOWERS_THRESHOLD} seguidores. Tiene ${followersCount}.`,
                        needed: VERIFIED_FOLLOWERS_THRESHOLD,
                        current: followersCount
                    });
                }
            }
            
            // Verificar cuenta
            user.isVerified = true;
            user.verifiedAt = new Date().toISOString();
            user.verifiedBadge = 'verified';
            user.verifiedBy = req.userId;
            
            if (isOfficialAdmin) {
                user.role = 'admin';
            }
            
            if (user.accountType === ACCOUNT_TYPES.BUSINESS) {
                user.accountType = ACCOUNT_TYPES.BUSINESS_VERIFIED;
            } else {
                user.accountType = ACCOUNT_TYPES.VERIFIED;
            }
            
            write('users.json', users);
            
            // Notificar al usuario
            io.to(`user_${userId}`).emit('account_verified', {
                userId: userId,
                verifiedAt: user.verifiedAt,
                isAdmin: isOfficialAdmin
            });
            
            logger.info(`👑 Usuario ${user.username} verificado${isOfficialAdmin ? ' (ADMIN)' : ''} por ${currentUser.username}`);
            
            res.json({
                success: true,
                message: `Usuario ${user.username} verificado correctamente${isOfficialAdmin ? ' como administrador' : ''}`,
                user: {
                    id: user.id,
                    username: user.username,
                    isVerified: true,
                    verifiedAt: user.verifiedAt,
                    accountType: user.accountType,
                    isAdmin: isOfficialAdmin
                }
            });
        } catch (error) {
            logger.error('Error verificando usuario:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // SOLICITAR CONVERTIR A CUENTA DE EMPRESA
    // ============================================================
    router.post('/business/request', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const { businessName, businessType, description, website, phone, address } = req.body;
            
            if (!businessName || !businessType) {
                return res.status(400).json({ error: 'Nombre y tipo de empresa son requeridos' });
            }
            
            const users = read('users.json');
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const user = users[userIndex];
            
            // Verificar si ya es cuenta de empresa
            if (user.accountType === ACCOUNT_TYPES.BUSINESS || 
                user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED) {
                return res.status(400).json({ error: 'El usuario ya es una cuenta de empresa' });
            }
            
            // Crear solicitud de empresa
            const businessRequest = {
                userId: userId,
                businessName: businessName,
                businessType: businessType,
                description: description || '',
                website: website || null,
                phone: phone || null,
                address: address || null,
                status: 'pending',
                requestedAt: new Date().toISOString(),
                trialEnd: new Date(Date.now() + BUSINESS_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
            };
            
            // Guardar solicitud en un archivo separado
            let businessRequests = read('business-requests.json');
            businessRequests.push(businessRequest);
            write('business-requests.json', businessRequests);
            
            // Actualizar usuario con cuenta de empresa en modo prueba
            user.accountType = ACCOUNT_TYPES.BUSINESS;
            user.businessInfo = {
                name: businessName,
                type: businessType,
                description: description || '',
                website: website || null,
                phone: phone || null,
                address: address || null,
                approvedAt: new Date().toISOString(),
                trialEndsAt: businessRequest.trialEnd
            };
            
            write('users.json', users);
            
            // Notificar al admin
            const admins = users.filter(u => u.role === 'admin');
            admins.forEach(admin => {
                io.to(`user_${admin.id}`).emit('new_business_request', {
                    userId: userId,
                    username: user.username,
                    businessName: businessName,
                    requestedAt: businessRequest.requestedAt
                });
            });
            
            logger.info(`📊 Solicitud de empresa de ${user.username}: ${businessName}`);
            
            res.json({
                success: true,
                message: 'Solicitud de cuenta de empresa enviada correctamente',
                accountType: user.accountType,
                trialEndsAt: businessRequest.trialEnd
            });
        } catch (error) {
            logger.error('Error solicitando cuenta de empresa:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // 🔥 DEJAR DE SER EMPRESA (DOWNGRADE) - NUEVO ENDPOINT
    // ============================================================
    router.post('/business/downgrade', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const users = read('users.json');
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const user = users[userIndex];
            
            // ❌ No permitir si es cuenta verificada o business_verified
            if (user.accountType === ACCOUNT_TYPES.VERIFIED || 
                user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED) {
                return res.status(403).json({ 
                    error: 'No puedes cambiar una cuenta verificada. Contacta al soporte.',
                    accountType: user.accountType
                });
            }
            
            // ❌ No permitir si no es business
            if (user.accountType !== ACCOUNT_TYPES.BUSINESS) {
                return res.status(400).json({ 
                    error: 'Tu cuenta no es una cuenta de empresa',
                    accountType: user.accountType
                });
            }
            
            // ✅ Cambiar a personal
            user.accountType = ACCOUNT_TYPES.PERSONAL;
            user.businessInfo = null; // Eliminar información de empresa
            
            write('users.json', users);
            
            // Notificar al usuario
            io.to(`user_${userId}`).emit('account_downgraded', {
                userId: userId,
                newAccountType: ACCOUNT_TYPES.PERSONAL,
                message: 'Tu cuenta ha sido cambiada a Personal'
            });
            
            logger.info(`📊 Usuario ${user.username} cambió de empresa a personal`);
            
            res.json({
                success: true,
                message: 'Cuenta cambiada de Empresa a Personal correctamente',
                accountType: ACCOUNT_TYPES.PERSONAL
            });
            
        } catch (error) {
            logger.error('Error cambiando de empresa a personal:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // APROBAR CUENTA DE EMPRESA (ADMIN)
    // ============================================================
    router.post('/business/approve/:userId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            const userId = req.params.userId;
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const user = users[userIndex];
            
            if (user.accountType !== ACCOUNT_TYPES.BUSINESS) {
                return res.status(400).json({ error: 'El usuario no es una cuenta de empresa' });
            }
            
            // Aprobar cuenta de empresa
            if (user.isVerified) {
                user.accountType = ACCOUNT_TYPES.BUSINESS_VERIFIED;
            } else {
                user.accountType = ACCOUNT_TYPES.BUSINESS;
            }
            
            if (user.businessInfo) {
                user.businessInfo.approvedAt = new Date().toISOString();
                user.businessInfo.approvedBy = req.userId;
                user.businessInfo.trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            }
            
            write('users.json', users);
            
            // Actualizar solicitud
            let businessRequests = read('business-requests.json');
            const requestIndex = businessRequests.findIndex(r => r.userId === userId && r.status === 'pending');
            if (requestIndex !== -1) {
                businessRequests[requestIndex].status = 'approved';
                businessRequests[requestIndex].approvedAt = new Date().toISOString();
                businessRequests[requestIndex].approvedBy = req.userId;
                write('business-requests.json', businessRequests);
            }
            
            io.to(`user_${userId}`).emit('business_account_approved', {
                userId: userId,
                accountType: user.accountType
            });
            
            logger.info(`✅ Cuenta de empresa aprobada: ${user.username}`);
            
            res.json({
                success: true,
                message: `Cuenta de empresa aprobada para ${user.username}`,
                accountType: user.accountType
            });
        } catch (error) {
            logger.error('Error aprobando cuenta de empresa:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER SOLICITUDES DE EMPRESA (ADMIN)
    // ============================================================
    router.get('/business/requests', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            const businessRequests = read('business-requests.json');
            
            // Enriquecer con datos de usuario
            const enriched = businessRequests.map(request => {
                const user = users.find(u => u.id === request.userId);
                return {
                    ...request,
                    user: user ? {
                        id: user.id,
                        username: user.username,
                        fullName: user.fullName,
                        avatar: user.avatar,
                        isVerified: user.isVerified || false
                    } : null
                };
            });
            
            res.json(enriched);
        } catch (error) {
            logger.error('Error obteniendo solicitudes de empresa:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER USUARIOS VERIFICADOS
    // ============================================================
    router.get('/verified', (req, res) => {
        try {
            const users = read('users.json');
            const limit = parseInt(req.query.limit) || 50;
            
            const verified = users
                .filter(u => u.isVerified === true)
                .map(({ password, ...user }) => ({
                    ...user,
                    followersCount: user.followers?.length || 0,
                    accountType: user.accountType || 'verified',
                    isAdmin: user.role === 'admin' || false
                }))
                .sort((a, b) => {
                    // Primero los administradores
                    if (a.isAdmin && !b.isAdmin) return -1;
                    if (!a.isAdmin && b.isAdmin) return 1;
                    return (b.followersCount || 0) - (a.followersCount || 0);
                })
                .slice(0, limit);
            
            res.json(verified);
        } catch (error) {
            logger.error('Error obteniendo usuarios verificados:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER CUENTAS DE EMPRESA
    // ============================================================
    router.get('/business', (req, res) => {
        try {
            const users = read('users.json');
            const limit = parseInt(req.query.limit) || 50;
            
            const business = users
                .filter(u => u.accountType === ACCOUNT_TYPES.BUSINESS || 
                            u.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED)
                .map(({ password, ...user }) => ({
                    ...user,
                    followersCount: user.followers?.length || 0,
                    accountType: user.accountType || 'business'
                }))
                .slice(0, limit);
            
            res.json(business);
        } catch (error) {
            logger.error('Error obteniendo cuentas de empresa:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // QUITAR VERIFICACIÓN A UN USUARIO (ADMIN)
    // ============================================================
    router.post('/unverify/:userId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            const userId = req.params.userId;
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            
            const user = users[userIndex];
            
            // No permitir quitar verificación a administradores oficiales
            const isOfficialAdmin = OFFICIAL_ADMINS.some(a => a.id === userId);
            if (isOfficialAdmin) {
                return res.status(403).json({ 
                    error: 'No se puede quitar la verificación a un administrador oficial' 
                });
            }
            
            user.isVerified = false;
            user.verifiedAt = null;
            user.verifiedBadge = null;
            
            if (user.accountType === ACCOUNT_TYPES.VERIFIED || 
                user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED) {
                user.accountType = user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED 
                    ? ACCOUNT_TYPES.BUSINESS 
                    : ACCOUNT_TYPES.PERSONAL;
            }
            
            write('users.json', users);
            
            io.to(`user_${userId}`).emit('account_unverified', {
                userId: userId
            });
            
            logger.info(`🔓 Verificación removida de ${user.username} por ${currentUser.username}`);
            
            res.json({
                success: true,
                message: `Verificación removida de ${user.username}`
            });
        } catch (error) {
            logger.error('Error removiendo verificación:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RUTA PARA EJECUTAR VERIFICACIÓN MASIVA (ADMIN)
    // ============================================================
    router.post('/run-verification', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            const result = await verifyExistingAccounts();
            
            res.json({
                success: true,
                message: 'Verificación masiva completada',
                verifiedCount: result.verifiedCount,
                businessCount: result.businessCount,
                adminVerifiedCount: result.adminVerifiedCount
            });
        } catch (error) {
            logger.error('Error ejecutando verificación masiva:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ESTADÍSTICAS (ADMIN)
    // ============================================================
    router.get('/stats', auth, (req, res) => {
        try {
            const users = read('users.json');
            const currentUser = users.find(u => u.id === req.userId);
            
            if (!currentUser || currentUser.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            
            const totalUsers = users.length;
            const verified = users.filter(u => u.isVerified === true);
            const verifiedAdmins = verified.filter(u => u.role === 'admin');
            const business = users.filter(u => u.accountType === ACCOUNT_TYPES.BUSINESS || 
                                              u.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED);
            const businessVerified = users.filter(u => u.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED);
            
            const nearVerification = users.filter(u => {
                if (u.isVerified) return false;
                if (u.role === 'admin') return false; // Admins ya están verificados
                const followers = u.followers?.length || 0;
                return followers >= VERIFIED_FOLLOWERS_THRESHOLD * 0.5;
            });
            
            const businessRequests = read('business-requests.json');
            const pendingRequests = businessRequests.filter(r => r.status === 'pending');
            
            res.json({
                totalUsers,
                verifiedCount: verified.length,
                verifiedAdmins: verifiedAdmins.length,
                businessCount: business.length,
                businessVerifiedCount: businessVerified.length,
                nearVerification: nearVerification.length,
                threshold: VERIFIED_FOLLOWERS_THRESHOLD,
                pendingBusinessRequests: pendingRequests.length,
                stats: {
                    verifiedPercentage: totalUsers > 0 ? Math.round((verified.length / totalUsers) * 100) : 0,
                    businessPercentage: totalUsers > 0 ? Math.round((business.length / totalUsers) * 100) : 0
                }
            });
        } catch (error) {
            logger.error('Error obteniendo estadísticas:', { error: error.message });
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // MIDDLEWARE PARA AGREGAR BADGE DE VERIFICACIÓN A USUARIOS
    // ============================================================
    function addVerificationBadge(user) {
        if (!user) return user;
        
        const result = { ...user };
        
        if (user.isVerified) {
            result.badge = 'verified';
            result.badgeIcon = '✅';
        }
        
        if (user.accountType === ACCOUNT_TYPES.BUSINESS || 
            user.accountType === ACCOUNT_TYPES.BUSINESS_VERIFIED) {
            result.badge = 'business';
            result.badgeIcon = '🏢';
            if (user.isVerified) {
                result.badge = 'business_verified';
                result.badgeIcon = '🏢✅';
            }
        }
        
        return result;
    }

    // ============================================================
    // FUNCIÓN PARA VERIFICAR AUTOMÁTICAMENTE AL ACTUALIZAR SEGUIDORES
    // ============================================================
    async function checkAndVerifyUser(userId) {
        try {
            const users = read('users.json');
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) return false;
            
            const user = users[userIndex];
            
            // 🔥 Administradores: siempre verificados
            const isOfficialAdmin = OFFICIAL_ADMINS.some(a => a.id === userId);
            if (isOfficialAdmin) {
                if (!user.isVerified) {
                    user.isVerified = true;
                    user.verifiedAt = new Date().toISOString();
                    user.verifiedBadge = 'verified';
                    user.accountType = ACCOUNT_TYPES.VERIFIED;
                    user.role = 'admin';
                    write('users.json', users);
                    logger.info(`👑 Administrador ${user.username} verificado automáticamente`);
                }
                return true;
            }

            if (user.isVerified) return true;
            
            const followersCount = user.followers?.length || 0;
            
            if (followersCount >= VERIFIED_FOLLOWERS_THRESHOLD) {
                user.isVerified = true;
                user.verifiedAt = new Date().toISOString();
                user.verifiedBadge = 'verified';
                
                if (user.accountType === ACCOUNT_TYPES.BUSINESS) {
                    user.accountType = ACCOUNT_TYPES.BUSINESS_VERIFIED;
                } else {
                    user.accountType = ACCOUNT_TYPES.VERIFIED;
                }
                
                write('users.json', users);
                
                io.to(`user_${userId}`).emit('account_verified', {
                    userId: userId,
                    verifiedAt: user.verifiedAt
                });
                
                logger.info(`✅ Usuario ${user.username} verificado automáticamente al alcanzar ${followersCount} seguidores`);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Error verificando usuario automáticamente:', { error: error.message });
            return false;
        }
    }

    // ============================================================
    // INICIAR VERIFICACIÓN MASIVA AL INICIAR EL SERVIDOR
    // ============================================================
    setTimeout(() => {
        verifyExistingAccounts().then(result => {
            const total = result.verifiedCount + result.adminVerifiedCount;
            if (total > 0) {
                logger.info(`✅ ${total} cuentas verificadas automáticamente (${result.adminVerifiedCount} administradores)`);
            }
            if (result.businessCount > 0) {
                logger.info(`🏢 ${result.businessCount} cuentas de empresa registradas`);
            }
        });
    }, 5000);

    // ============================================================
    // EXPORTAR
    // ============================================================
    return {
        router,
        verifyExistingAccounts,
        checkAndVerifyUser,
        addVerificationBadge,
        ACCOUNT_TYPES,
        VERIFIED_FOLLOWERS_THRESHOLD,
        OFFICIAL_ADMINS
    };
};