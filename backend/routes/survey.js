// backend/routes/survey.js - RUTAS PARA ENCUESTAS, ESTADÍSTICAS Y VOTACIONES
// ============================================================

const auth = require('../middleware/auth');

module.exports = function(read, write, io, logger) {
    const router = require('express').Router();

    // ============================================================
    // FUNCIÓN AUXILIAR: VERIFICAR SI LA ENCUESTA HA EXPIRADO
    // ============================================================
    function isSurveyExpired(surveyData) {
        if (surveyData.isExpired) return true;
        const createdTime = new Date(surveyData.createdAt).getTime();
        const expiresInHours = surveyData.expiresIn || 24;
        const expiresTime = createdTime + (expiresInHours * 60 * 60 * 1000);
        return Date.now() > expiresTime;
    }

    // ============================================================
    // VOTAR EN UNA ENCUESTA
    // ============================================================
    router.post('/:storyId/vote', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            const { optionIds } = req.body; // Array de IDs de opciones
            
            if (!optionIds || optionIds.length === 0) {
                return res.status(400).json({ error: 'Selecciona al menos una opción' });
            }
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const story = stories[storyIndex];
            
            if (story.mediaType !== 'survey') {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }
            
            // Verificar si la encuesta ha expirado
            if (isSurveyExpired(story.surveyData)) {
                story.surveyData.isExpired = true;
                write('stories.json', stories);
                return res.status(400).json({ error: 'Esta encuesta ha expirado' });
            }
            
            // Verificar si el usuario ya votó
            if (!story.surveyData.anonymous) {
                if (story.surveyData.voters && story.surveyData.voters.includes(userId)) {
                    return res.status(400).json({ error: 'Ya votaste en esta encuesta' });
                }
            }
            
            // Procesar votos
            const surveyData = story.surveyData;
            const allowMultiple = surveyData.allowMultiple || false;
            
            if (!allowMultiple && optionIds.length > 1) {
                return res.status(400).json({ error: 'Esta encuesta solo permite un voto por persona' });
            }
            
            // Validar opciones
            const validOptionIds = surveyData.options.map(o => o.id);
            const invalidOptions = optionIds.filter(id => !validOptionIds.includes(id));
            
            if (invalidOptions.length > 0) {
                return res.status(400).json({ error: 'Opciones inválidas' });
            }
            
            // Registrar votos
            let totalVotes = surveyData.totalVotes || 0;
            
            optionIds.forEach(optionId => {
                const option = surveyData.options.find(o => o.id === optionId);
                if (option) {
                    option.votes = (option.votes || 0) + 1;
                    totalVotes++;
                }
            });
            
            surveyData.totalVotes = totalVotes;
            
            if (!surveyData.anonymous) {
                if (!surveyData.voters) surveyData.voters = [];
                surveyData.voters.push(userId);
            }
            
            stories[storyIndex] = story;
            write('stories.json', stories);
            
            // Calcular porcentajes
            const results = surveyData.options.map(option => ({
                id: option.id,
                label: option.label,
                votes: option.votes || 0,
                percentage: totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0
            }));
            
            // Emitir actualización en tiempo real
            io.to(`story_${storyId}`).emit('survey_vote_update', {
                storyId: storyId,
                results: results,
                totalVotes: totalVotes,
                userId: userId
            });
            
            // También emitir a la sala del dueño
            io.to(`user_${story.userId}`).emit('survey_vote_update', {
                storyId: storyId,
                results: results,
                totalVotes: totalVotes,
                userId: userId
            });
            
            if (logger) logger.info(`📊 Voto registrado en encuesta ${storyId} por usuario ${userId}`);
            
            res.json({
                success: true,
                results: results,
                totalVotes: totalVotes
            });
            
        } catch (error) {
            if (logger) logger.error('Error registrando voto:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // OBTENER RESULTADOS DE UNA ENCUESTA
    // ============================================================
    router.get('/:storyId/results', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);
            
            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            if (story.mediaType !== 'survey') {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }
            
            const surveyData = story.surveyData;
            const totalVotes = surveyData.totalVotes || 0;
            
            const results = surveyData.options.map(option => ({
                id: option.id,
                label: option.label,
                votes: option.votes || 0,
                percentage: totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0
            }));
            
            const hasVoted = surveyData.anonymous ? false : 
                           (surveyData.voters && surveyData.voters.includes(userId));
            
            const expired = isSurveyExpired(surveyData);
            
            res.json({
                success: true,
                results: results,
                totalVotes: totalVotes,
                hasVoted: hasVoted,
                allowMultiple: surveyData.allowMultiple || false,
                anonymous: surveyData.anonymous || false,
                showResults: surveyData.showResults || false,
                isExpired: expired,
                totalOptions: surveyData.options.length,
                createdAt: surveyData.createdAt,
                expiresIn: surveyData.expiresIn || 24
            });
            
        } catch (error) {
            if (logger) logger.error('Error obteniendo resultados:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // CERRAR ENCUESTA (SOLO ADMIN O DUEÑO)
    // ============================================================
    router.post('/:storyId/close', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const story = stories[storyIndex];
            
            if (story.mediaType !== 'survey') {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }
            
            // Verificar permiso (dueño o admin)
            if (story.userId !== userId) {
                const users = read('users.json');
                const user = users.find(u => u.id === userId);
                if (!user || user.role !== 'admin') {
                    return res.status(403).json({ error: 'No tienes permiso' });
                }
            }
            
            story.surveyData.isExpired = true;
            write('stories.json', stories);
            
            // Emitir evento de cierre
            io.to(`story_${storyId}`).emit('survey_closed', {
                storyId: storyId,
                closedBy: userId,
                closedAt: new Date().toISOString()
            });
            
            // También notificar al dueño
            io.to(`user_${story.userId}`).emit('survey_closed', {
                storyId: storyId,
                closedBy: userId,
                closedAt: new Date().toISOString()
            });
            
            if (logger) logger.info(`🔒 Encuesta ${storyId} cerrada por usuario ${userId}`);
            
            res.json({ 
                success: true, 
                message: 'Encuesta cerrada correctamente',
                closedAt: new Date().toISOString()
            });
            
        } catch (error) {
            if (logger) logger.error('Error cerrando encuesta:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // REABRIR ENCUESTA (SOLO ADMIN O DUEÑO)
    // ============================================================
    router.post('/:storyId/open', auth, async (req, res) => {
        try {
            const storyId = req.params.storyId;
            const userId = req.userId;
            
            const stories = read('stories.json');
            const storyIndex = stories.findIndex(s => s.id === storyId);
            
            if (storyIndex === -1) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }
            
            const story = stories[storyIndex];
            
            if (story.mediaType !== 'survey') {
                return res.status(400).json({ error: 'Esta historia no es una encuesta' });
            }
            
            // Verificar permiso (dueño o admin)
            if (story.userId !== userId) {
                const users = read('users.json');
                const user = users.find(u => u.id === userId);
                if (!user || user.role !== 'admin') {
                    return res.status(403).json({ error: 'No tienes permiso' });
                }
            }
            
            story.surveyData.isExpired = false;
            story.surveyData.createdAt = new Date().toISOString(); // Resetear tiempo
            write('stories.json', stories);
            
            io.to(`story_${storyId}`).emit('survey_opened', {
                storyId: storyId,
                openedBy: userId,
                openedAt: new Date().toISOString()
            });
            
            if (logger) logger.info(`🔓 Encuesta ${storyId} reabierta por usuario ${userId}`);
            
            res.json({ 
                success: true, 
                message: 'Encuesta reabierta correctamente'
            });
            
        } catch (error) {
            if (logger) logger.error('Error reabriendo encuesta:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    // ============================================================
    // OBTENER ESTADÍSTICAS DE ENCUESTAS DEL USUARIO
    // ============================================================
    router.get('/user/stats', auth, async (req, res) => {
        try {
            const userId = req.userId;
            
            const stories = read('stories.json');
            const userSurveys = stories.filter(s => 
                s.userId === userId && s.mediaType === 'survey'
            );
            
            const stats = {
                total: userSurveys.length,
                active: userSurveys.filter(s => !isSurveyExpired(s.surveyData)).length,
                expired: userSurveys.filter(s => isSurveyExpired(s.surveyData)).length,
                totalVotes: userSurveys.reduce((sum, s) => sum + (s.surveyData.totalVotes || 0), 0),
                byType: {
                    poll: userSurveys.filter(s => s.surveyData.surveyType === 'poll').length,
                    stats: userSurveys.filter(s => s.surveyData.surveyType === 'stats').length,
                    calculation: userSurveys.filter(s => s.surveyData.surveyType === 'calculation').length
                }
            };
            
            res.json({ success: true, stats });
            
        } catch (error) {
            if (logger) logger.error('Error obteniendo estadísticas:', { error: error.message });
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    return router;
};