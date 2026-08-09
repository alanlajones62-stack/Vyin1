// backend/reports.js - SISTEMA DE DENUNCIAS COMPLETO CON ASIGNACIÓN Y MODERACIÓN

const auth = require('./middleware/auth');
const iaClassifier = require('./ia_classifier');
const fs = require('fs');
const path = require('path');

// ============================================================
// IMPORTAR MÓDULOS DE ASIGNACIÓN Y MODERACIÓN
// ============================================================

const ReportAssignment = require('./modules/assignments/report-assignment');
const StoryModeration = require('./modules/moderation/story-moderation');
const UserNotifications = require('./modules/notifications/user-notifications');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const REPORTS_DIR = path.join(__dirname, 'data', 'reports');
const REPORT_LIMIT_PER_USER = 5;
const REPORT_LIMIT_PER_STORY = 3;

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// ============================================================
// CLASIFICADOR DE CONTENIDO OFENSIVO (TEXTO)
// ============================================================

class ContentAnalyzer {
    constructor() {
        this.bannedWords = {
            1: ['tonto', 'estúpido', 'idiota', 'imbécil', 'burro', 'bruto', 'pendejo', 'pelotudo', 'boludo', 'weon', 'gilipollas', 'subnormal', 'retrasado', 'tontolaba', 'ignorante', 'zopenco', 'memo', 'baboso', 'lelo', 'cabeza hueca', 'cerebro de mosquito'],
            2: ['puta', 'puto', 'zorra', 'marica', 'maricon', 'joto', 'trola', 'ramera', 'prostituta', 'pendaja', 'perra', 'zorrón', 'bacán', 'cagada', 'mierda', 'estúpida', 'estúpido', 'imbécil', 'idiota', 'hijo de puta', 'hija de puta'],
            3: ['nazi', 'fascista', 'terrorista', 'pedófilo', 'violador', 'violación', 'pedofilia', 'narcotráfico', 'asesino', 'genocidio', 'homicida', 'terrorismo', 'esclavitud', 'pornografía infantil', 'grooming', 'pederastia', 'violación infantil', 'abuso sexual'],
            4: ['puto negro', 'sudaca', 'indio', 'negro de mierda', 'maricon de mierda', 'joto de mierda', 'puta lesbiana', 'puto judío', 'negro puto', 'indio puto', 'sudaca de mierda', 'marica', 'trolo', 'travesti', 'degenerado', 'aborto', 'zurdo de mierda', 'derechista de mierda']
        };

        this.spamPatterns = [
            /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|info|xyz|top|club|online|site|tech|space|cloud|store|shop|ml|tk|cf|ga|xyz)\b/gi,
            /gana dinero/i, /hazte rico/i, /inversión garantizada/i, /click aquí/i,
            /visita mi perfil/i, /sigue mi canal/i, /suscríbete/i, /descarga gratis/i,
            /oferta limitada/i, /trabajo desde casa/i, /haz clic aquí/i, /regístrate ahora/i,
            /oferta exclusiva/i
        ];
    }

    analyzeText(text) {
        if (!text || text.trim().length === 0) {
            return { 
                score: 0, 
                level: 0, 
                matches: [], 
                flags: { hasText: false },
                details: ['Sin texto para analizar']
            };
        }

        const results = [];
        let totalScore = 0;
        let maxLevel = 0;
        const details = [];

        for (const [level, words] of Object.entries(this.bannedWords)) {
            const levelNum = parseInt(level);
            for (const word of words) {
                const regex = new RegExp(`\\b${word.replace(/\*/g, '.*')}\\b`, 'gi');
                const matches = text.match(regex) || [];
                if (matches.length > 0) {
                    results.push({
                        word: word,
                        level: levelNum,
                        count: matches.length,
                        context: matches
                    });
                    totalScore += levelNum * matches.length * 15;
                    maxLevel = Math.max(maxLevel, levelNum);
                    details.push(`Palabra ofensiva "${word}" (nivel ${levelNum})`);
                }
            }
        }

        let spamScore = 0;
        const spamMatches = [];
        for (const pattern of this.spamPatterns) {
            const matches = text.match(pattern) || [];
            if (matches.length > 0) {
                spamMatches.push({
                    pattern: pattern.toString(),
                    count: matches.length,
                    context: matches
                });
                spamScore += matches.length * 8;
                details.push(`Spam detectado: ${matches.length} coincidencias`);
            }
        }

        const urlCount = (text.match(/https?:\/\/[^\s]+/gi) || []).length;
        if (urlCount > 3) {
            spamScore += urlCount * 3;
            results.push({
                type: 'excess_urls',
                count: urlCount,
                message: 'Demasiadas URLs en el contenido'
            });
            details.push(`URLs excesivas: ${urlCount}`);
        }

        const upperCount = (text.match(/[A-ZÁÉÍÓÚÜÑ]{4,}/g) || []).length;
        if (upperCount > 5) {
            spamScore += upperCount * 2;
            results.push({
                type: 'excess_uppercase',
                count: upperCount,
                message: 'Uso excesivo de mayúsculas'
            });
            details.push(`Mayúsculas excesivas: ${upperCount}`);
        }

        const repeatedChars = (text.match(/(.)\1{5,}/g) || []).length;
        if (repeatedChars > 0) {
            spamScore += repeatedChars * 2;
            details.push(`Caracteres repetidos: ${repeatedChars}`);
        }

        const finalScore = totalScore + spamScore;

        let severityLevel = 0;
        if (finalScore > 120) severityLevel = 4;
        else if (finalScore > 70) severityLevel = 3;
        else if (finalScore > 35) severityLevel = 2;
        else if (finalScore > 10) severityLevel = 1;

        return {
            score: Math.min(100, Math.round(finalScore * 0.8)),
            level: severityLevel,
            maxLevel: maxLevel,
            matches: results,
            spam: spamMatches,
            details: details,
            flags: {
                hasText: true,
                hasHateSpeech: maxLevel >= 4,
                hasSevereOffense: maxLevel >= 3,
                hasModerateOffense: maxLevel >= 2,
                hasSpam: spamScore > 25,
                hasExcessUrls: urlCount > 3,
                hasExcessUppercase: upperCount > 5
            }
        };
    }
}

// ============================================================
// MÓDULO PRINCIPAL DE DENUNCIAS
// ============================================================

module.exports = function(read, write, io, logger) {
    const router = require('express').Router();
    const analyzer = new ContentAnalyzer();

    // ============================================================
    // CREAR UNA DENUNCIA (CON ANÁLISIS DE IA Y ASIGNACIÓN)
    // ============================================================
    router.post('/', auth, async (req, res) => {
        try {
            const userId = req.userId;
            const { storyId, reason, description, category } = req.body;

            console.log(`📢 [REPORT] Nueva denuncia de usuario ${userId}`);

            if (!storyId) {
                return res.status(400).json({ error: 'ID de historia requerido' });
            }

            const validCategories = [
                'spam', 'harassment', 'inappropriate', 'violence', 
                'illegal', 'hate_speech', 'adult_content', 'other'
            ];
            
            if (!validCategories.includes(category)) {
                return res.status(400).json({ error: 'Categoría inválida' });
            }

            if (!reason || reason.trim().length < 5) {
                return res.status(400).json({ error: 'La razón debe tener al menos 5 caracteres' });
            }

            if (reason.length > 500) {
                return res.status(400).json({ error: 'La razón no puede tener más de 500 caracteres' });
            }

            const reports = read('reports.json');
            const today = new Date().toISOString().split('T')[0];

            const userReportsToday = reports.filter(r => 
                r.userId === userId && 
                r.createdAt.startsWith(today)
            );

            if (userReportsToday.length >= REPORT_LIMIT_PER_USER) {
                return res.status(429).json({ 
                    error: `Has alcanzado el límite de ${REPORT_LIMIT_PER_USER} denuncias por día` 
                });
            }

            const storyReports = reports.filter(r => r.storyId === storyId);
            if (storyReports.length >= REPORT_LIMIT_PER_STORY) {
                return res.status(429).json({ 
                    error: `Esta historia ya tiene ${REPORT_LIMIT_PER_STORY} denuncias` 
                });
            }

            const stories = read('stories.json');
            const story = stories.find(s => s.id === storyId);
            if (!story) {
                return res.status(404).json({ error: 'Historia no encontrada' });
            }

            const users = read('users.json');
            const reporter = users.find(u => u.id === userId);
            const storyOwner = users.find(u => u.id === story.userId);

            // ============================================================
            // ANÁLISIS CON IA (IMAGEN + TEXTO)
            // ============================================================
            
            let iaResult = null;
            let textAnalysis = null;

            // 1. Analizar texto
            const textToAnalyze = story.caption || story.textContent || '';
            if (textToAnalyze) {
                textAnalysis = analyzer.analyzeText(textToAnalyze);
                console.log(`📝 [IA] Análisis de texto: nivel ${textAnalysis.level}`);
            }

            // 2. Analizar imagen (si existe)
            if (story.mediaType === 'image' && story.mediaUrl) {
                try {
                    const isLocalImage = story.mediaUrl.startsWith('/uploads/') || 
                                        story.mediaUrl.startsWith('http://localhost') ||
                                        story.mediaUrl.includes('/uploads/');

                    if (isLocalImage) {
                        const imagePath = path.join(__dirname, '..', 'frontend', story.mediaUrl);
                        if (fs.existsSync(imagePath)) {
                            iaResult = await iaClassifier.classifyImageFile(imagePath);
                            console.log(`🖼️ [IA] Imagen clasificada: ${iaResult.label} (${iaResult.percentage}%)`);
                        } else {
                            console.warn(`⚠️ [IA] Imagen no encontrada: ${imagePath}`);
                        }
                    } else {
                        console.log(`🔗 [IA] URL externa, no analizada: ${story.mediaUrl.substring(0, 50)}...`);
                    }
                } catch (error) {
                    console.error('❌ [IA] Error analizando imagen:', error.message);
                }
            }

            // ============================================================
            // DETERMINAR ACCIONES AUTOMÁTICAS
            // ============================================================
            
            let autoFlagged = false;
            let autoAction = null;
            let reportStatus = 'pending';
            let severity = 'normal';
            let iaLabel = 'unknown';

            // Combinar puntuaciones
            let totalScore = 0;
            let maxLevel = 0;

            // 1. Análisis de texto
            if (textAnalysis) {
                totalScore += textAnalysis.score * 0.6;
                maxLevel = Math.max(maxLevel, textAnalysis.level);
                
                if (textAnalysis.level >= 4) {
                    severity = 'critical';
                    autoFlagged = true;
                } else if (textAnalysis.level >= 3) {
                    severity = 'high';
                }
            }

            // 2. Análisis de imagen
            if (iaResult && iaResult.success) {
                iaLabel = iaResult.label;
                
                if (iaResult.label === 'nsfw') {
                    totalScore += 100 * 0.4;
                    
                    if (iaResult.percentage > 90) {
                        severity = 'high';
                        autoFlagged = true;
                    } else if (iaResult.percentage > 70) {
                        severity = 'medium';
                    }
                    
                } else if (iaResult.label === 'unknown') {
                    totalScore += 5 * 0.4;
                    
                } else if (iaResult.label === 'safe') {
                    totalScore += 0;
                }
            }

            // Determinar acción automática
            if (severity === 'critical') {
                reportStatus = 'auto_hidden';
                autoAction = {
                    type: 'hide_story',
                    reason: 'Contenido ofensivo grave detectado automáticamente',
                    confidence: 0.85,
                    timestamp: new Date().toISOString(),
                    details: {
                        textLevel: textAnalysis?.level || 0,
                        iaLabel: iaResult?.label || 'unknown',
                        iaConfidence: iaResult?.percentage || 0
                    }
                };
            } else if (severity === 'high') {
                reportStatus = 'pending';
                autoAction = {
                    type: 'flag_for_review',
                    reason: 'Contenido sospechoso requiere revisión',
                    confidence: 0.7,
                    timestamp: new Date().toISOString(),
                    details: {
                        textLevel: textAnalysis?.level || 0,
                        iaLabel: iaResult?.label || 'unknown',
                        iaConfidence: iaResult?.percentage || 0
                    }
                };
            }

            // ============================================================
            // CREAR REPORTE
            // ============================================================

            const report = {
                id: Date.now().toString(),
                userId: userId,
                storyId: storyId,
                storyOwnerId: story.userId, // 🔥 NUEVO: ID del dueño de la historia
                category: category,
                reason: reason.trim(),
                description: description ? description.trim() : '',
                status: reportStatus,
                priority: severity === 'critical' ? 'high' : severity === 'high' ? 'medium' : 'normal',
                createdAt: new Date().toISOString(),
                analysis: {
                    text: textAnalysis ? {
                        score: textAnalysis.score,
                        level: textAnalysis.level,
                        flags: textAnalysis.flags,
                        details: textAnalysis.details,
                        matches: textAnalysis.matches
                    } : null,
                    image: iaResult ? {
                        label: iaResult.label,
                        confidence: iaResult.confidence,
                        percentage: iaResult.percentage,
                        is_safe: iaResult.label === 'safe',
                        is_nsfw: iaResult.label === 'nsfw',
                        is_unknown: iaResult.label === 'unknown',
                        success: iaResult.success
                    } : null,
                    combined: {
                        score: Math.round(totalScore),
                        autoFlagged: autoFlagged,
                        severity: severity,
                        iaLabel: iaLabel
                    }
                },
                autoAction: autoAction,
                metadata: {
                    userAgent: req.headers['user-agent'] || 'unknown',
                    ip: req.ip || req.connection.remoteAddress || 'unknown',
                    mediaType: story.mediaType || 'unknown'
                },
                storyData: {
                    caption: story.caption || '',
                    mediaType: story.mediaType || 'unknown',
                    mediaUrl: story.mediaUrl || null,
                    createdAt: story.createdAt || new Date().toISOString(),
                    textContent: story.textContent || null,
                    textBgColor: story.textBgColor || '#1a1a2e'
                },
                reporterData: {
                    username: reporter?.username || 'unknown',
                    fullName: reporter?.fullName || 'Usuario'
                },
                ownerData: {
                    username: storyOwner?.username || 'unknown',
                    fullName: storyOwner?.fullName || 'Usuario'
                },
                assignedTo: null,
                assignmentId: null
            };

            // ============================================================
            // 🔥 ASIGNAR LA DENUNCIA A UN ADMINISTRADOR
            // ============================================================
            
            const assignmentSystem = new ReportAssignment(read, write, logger);
            const assignment = assignmentSystem.autoAssign(report);
            
            if (assignment) {
                report.assignedTo = assignment.adminId;
                report.assignmentId = assignment.id;
                console.log(`📢 Denuncia ${report.id} asignada al admin ${assignment.adminId}`);
            } else {
                console.warn(`⚠️ No se pudo asignar denuncia ${report.id}`);
            }

            // ============================================================
            // 🔥 ELIMINACIÓN AUTOMÁTICA POR NSFW (si aplica)
            // ============================================================
            
            let autoDeleted = false;
            let deletionInfo = null;

            if (iaResult && iaResult.label === 'nsfw' && iaResult.percentage > 85) {
                try {
                    const moderation = new StoryModeration(read, write, io, logger);
                    const deletionResult = await moderation.deleteNSFWStory(
                        storyId,
                        'Contenido NSFW detectado automáticamente por VYIN IA',
                        iaResult.percentage,
                        null // null = automático, no admin
                    );
                    
                    if (deletionResult.success) {
                        autoDeleted = true;
                        deletionInfo = deletionResult;
                        report.status = 'resolved';
                        report.resolvedBy = 'VYIN_IA';
                        report.resolvedAt = new Date().toISOString();
                        report.autoDeleted = true;
                        report.deletionInfo = deletionResult;
                        
                        logger?.info(`🤖 Historia ${storyId} eliminada automáticamente por NSFW (${iaResult.percentage}%)`);
                        
                        // 🔥 Notificar al usuario
                        const notifier = new UserNotifications(read, write, io, logger);
                        notifier.notifyStoryDeletedNSFW(
                            story.userId,
                            storyId,
                            'Contenido NSFW detectado automáticamente por VYIN IA',
                            iaResult.percentage
                        );
                    }
                } catch (error) {
                    logger?.error('❌ Error eliminando historia automáticamente:', error);
                }
            }

            // ============================================================
            // GUARDAR REPORTE
            // ============================================================

            reports.push(report);
            write('reports.json', reports);

            // ============================================================
            // NOTIFICACIONES
            // ============================================================

            io.to(`user_${userId}`).emit('report_created', {
                reportId: report.id,
                storyId: storyId,
                status: report.status,
                assignedTo: report.assignedTo,
                autoFlagged: autoFlagged,
                autoAction: autoAction,
                autoDeleted: autoDeleted,
                iaResult: iaResult,
                timestamp: report.createdAt
            });

            if (severity === 'critical') {
                io.emit('critical_report', {
                    reportId: report.id,
                    storyId: storyId,
                    userId: userId,
                    iaLabel: iaResult?.label || 'unknown',
                    iaConfidence: iaResult?.percentage || 0,
                    textLevel: textAnalysis?.level || 0,
                    autoAction: autoAction,
                    assignedTo: report.assignedTo
                });
                logger?.info(`🔴 DENUNCIA CRÍTICA: ${report.id}`);
            }

            // Notificar al admin asignado
            if (report.assignedTo) {
                io.to(`user_${report.assignedTo}`).emit('new_report_assigned', {
                    reportId: report.id,
                    storyId: storyId,
                    priority: report.priority,
                    assignedAt: new Date().toISOString()
                });
            }

            console.log(`✅ Denuncia creada: ${report.id} (Severidad: ${severity}, IA: ${iaLabel}, Admin: ${report.assignedTo || 'sin asignar'})`);
            logger?.info(`📢 Denuncia ${report.id} creada por usuario ${userId}`);

            // ============================================================
            // RESPUESTA
            // ============================================================

            let message = 'Denuncia enviada correctamente. Será revisada por el equipo de moderación.';
            
            if (autoDeleted) {
                message = '✅ Denuncia enviada. El contenido NSFW ha sido eliminado automáticamente.';
            } else if (autoAction?.type === 'hide_story') {
                message = 'Denuncia enviada. El contenido ha sido ocultado automáticamente por ser inapropiado.';
            } else if (autoAction?.type === 'flag_for_review') {
                message = 'Denuncia enviada. El contenido será revisado por el equipo de moderación.';
            }

            if (iaResult && iaResult.success) {
                if (iaResult.label === 'safe') {
                    message += ` La imagen fue clasificada como SEGURA (${iaResult.percentage}%).`;
                } else if (iaResult.label === 'nsfw') {
                    message += ` La imagen fue clasificada como NO SEGURA (${iaResult.percentage}%).`;
                } else {
                    message += ` La imagen fue clasificada como NO IDENTIFICADA (${iaResult.percentage}%).`;
                }
            }

            res.status(201).json({
                success: true,
                reportId: report.id,
                status: report.status,
                assignedTo: report.assignedTo,
                autoFlagged: autoFlagged,
                autoAction: autoAction,
                autoDeleted: autoDeleted,
                iaResult: iaResult,
                message: message,
                analysis: {
                    textLevel: textAnalysis?.level || 0,
                    iaLabel: iaResult?.label || 'unknown',
                    severity: severity
                }
            });

        } catch (error) {
            console.error('❌ Error creando denuncia:', error);
            logger?.error('Error creando denuncia:', { error: error.message, stack: error.stack });
            res.status(500).json({ 
                error: 'Error interno del servidor',
                message: error.message
            });
        }
    });

    // ============================================================
    // OBTENER DENUNCIAS ASIGNADAS A UN ADMIN
    // ============================================================
    router.get('/my-assigned', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const assignmentSystem = new ReportAssignment(read, write, logger);
            const assignedReports = assignmentSystem.getAdminReports(req.userId);
            
            const reports = read('reports.json');
            const reportIds = assignedReports.map(a => a.reportId);
            const userReports = reports.filter(r => reportIds.includes(r.id));
            
            // Enriquecer con datos de asignación
            const enriched = userReports.map(r => {
                const assignment = assignedReports.find(a => a.reportId === r.id);
                return {
                    ...r,
                    assignment: {
                        assignedAt: assignment?.assignedAt || null,
                        status: assignment?.status || 'unknown',
                        lastActivity: assignment?.lastActivity || null
                    }
                };
            });
            
            res.json({
                reports: enriched,
                count: enriched.length
            });
            
        } catch (error) {
            console.error('❌ Error obteniendo denuncias asignadas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER ESTADÍSTICAS DE ASIGNACIÓN
    // ============================================================
    router.get('/assignment-stats', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const assignmentSystem = new ReportAssignment(read, write, logger);
            const stats = assignmentSystem.getStats();
            
            res.json(stats);
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de asignación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER ESTADÍSTICAS DE MODERACIÓN
    // ============================================================
    router.get('/moderation-stats', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const moderation = new StoryModeration(read, write, io, logger);
            const stats = moderation.getStats();
            
            res.json(stats);
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de moderación:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // RESTAURAR HISTORIA (SOLO ADMIN)
    // ============================================================
    router.post('/restore-story/:storyId', auth, async (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const moderation = new StoryModeration(read, write, io, logger);
            const result = await moderation.restoreStory(req.params.storyId, req.userId);
            
            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }
            
            res.json({
                success: true,
                message: 'Historia restaurada correctamente',
                story: result.story
            });
            
        } catch (error) {
            console.error('❌ Error restaurando historia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER ESTADÍSTICAS DE IA
    // ============================================================
    router.get('/ia-stats', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const reports = read('reports.json');
            
            const stats = {
                totalAnalyzed: reports.filter(r => r.analysis?.image).length,
                byLabel: {
                    safe: reports.filter(r => r.analysis?.image?.label === 'safe').length,
                    nsfw: reports.filter(r => r.analysis?.image?.label === 'nsfw').length,
                    unknown: reports.filter(r => !r.analysis?.image || r.analysis.image.label === 'unknown').length
                },
                autoHidden: reports.filter(r => r.status === 'auto_hidden').length,
                autoDeleted: reports.filter(r => r.autoDeleted === true).length,
                averageConfidence: 0
            };

            const reportsWithConfidence = reports.filter(r => r.analysis?.image?.confidence);
            if (reportsWithConfidence.length > 0) {
                const totalConfidence = reportsWithConfidence.reduce((sum, r) => sum + r.analysis.image.confidence, 0);
                stats.averageConfidence = Math.round((totalConfidence / reportsWithConfidence.length) * 100);
            }

            res.json(stats);
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de IA:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER MIS DENUNCIAS
    // ============================================================
    router.get('/my-reports', auth, (req, res) => {
        try {
            const userId = req.userId;
            const reports = read('reports.json');
            
            const userReports = reports
                .filter(r => r.userId === userId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json({
                reports: userReports,
                count: userReports.length
            });
        } catch (error) {
            console.error('❌ Error obteniendo denuncias del usuario:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER DENUNCIAS DE UNA HISTORIA
    // ============================================================
    router.get('/story/:storyId', auth, (req, res) => {
        try {
            const { storyId } = req.params;
            const reports = read('reports.json');
            
            const storyReports = reports
                .filter(r => r.storyId === storyId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json({
                reports: storyReports,
                count: storyReports.length
            });
        } catch (error) {
            console.error('❌ Error obteniendo denuncias de historia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // OBTENER TODAS LAS DENUNCIAS (SOLO ADMIN)
    // ============================================================
    router.get('/all', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const reports = read('reports.json');
            const status = req.query.status || 'all';
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            let filteredReports = reports;
            if (status !== 'all') {
                filteredReports = reports.filter(r => r.status === status);
            }

            filteredReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            const paginated = filteredReports.slice(offset, offset + limit);

            // Enriquecer con datos de asignación
            const assignmentSystem = new ReportAssignment(read, write, logger);
            const enriched = paginated.map(r => {
                const assignment = assignmentSystem.getAdminReports(req.userId).find(a => a.reportId === r.id);
                return {
                    ...r,
                    assignment: assignment || null
                };
            });

            res.json({
                reports: enriched,
                total: filteredReports.length,
                limit: limit,
                offset: offset,
                hasMore: offset + limit < filteredReports.length
            });
        } catch (error) {
            console.error('❌ Error obteniendo todas las denuncias:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ACTUALIZAR ESTADO DE DENUNCIA
    // ============================================================
    router.put('/:reportId/status', auth, (req, res) => {
        try {
            const { reportId } = req.params;
            const { status, adminNote, action } = req.body;

            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const validStatuses = ['pending', 'reviewing', 'resolved', 'dismissed', 'auto_hidden'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Estado inválido' });
            }

            let reports = read('reports.json');
            const reportIndex = reports.findIndex(r => r.id === reportId);
            
            if (reportIndex === -1) {
                return res.status(404).json({ error: 'Denuncia no encontrada' });
            }

            const report = reports[reportIndex];
            const oldStatus = report.status;
            
            report.status = status;
            report.adminNote = adminNote || report.adminNote || '';
            report.adminId = req.userId;
            report.updatedAt = new Date().toISOString();
            
            if (action) {
                report.adminAction = {
                    type: action,
                    timestamp: new Date().toISOString()
                };
            }

            // ============================================================
            // ELIMINAR HISTORIA (si se solicita)
            // ============================================================
            if (status === 'resolved' && action === 'delete_story') {
                const stories = read('stories.json');
                const storyIndex = stories.findIndex(s => s.id === report.storyId);
                if (storyIndex !== -1) {
                    const deletedStory = stories[storyIndex];
                    stories.splice(storyIndex, 1);
                    write('stories.json', stories);
                    
                    // 🔥 Notificar al usuario
                    const notifier = new UserNotifications(read, write, io, logger);
                    notifier.notifyStoryDeletedNSFW(
                        deletedStory.userId,
                        report.storyId,
                        adminNote || 'Contenido inapropiado eliminado por moderación',
                        100 // Confianza manual
                    );
                    
                    io.to(`user_${deletedStory.userId}`).emit('story_deleted_by_moderator', {
                        storyId: report.storyId,
                        reason: adminNote || 'Contenido inapropiado',
                        byAdmin: true,
                        adminName: user.fullName || user.username
                    });
                    
                    logger?.info(`🗑️ Historia ${report.storyId} eliminada por moderador ${req.userId}`);
                }
            }

            // ============================================================
            // LIBERAR ASIGNACIÓN
            // ============================================================
            if (status === 'resolved' || status === 'dismissed') {
                try {
                    const assignmentSystem = new ReportAssignment(read, write, logger);
                    assignmentSystem.releaseReport(reportId);
                } catch (error) {
                    logger?.warn('Error liberando asignación:', error);
                }
            }

            write('reports.json', reports);

            // ============================================================
            // NOTIFICACIONES
            // ============================================================
            io.to(`user_${report.userId}`).emit('report_status_updated', {
                reportId: reportId,
                status: status,
                note: adminNote || '',
                updatedAt: report.updatedAt
            });

            logger?.info(`📢 Denuncia ${reportId} actualizada de ${oldStatus} a ${status} por admin ${req.userId}`);

            res.json({
                success: true,
                report: report,
                message: `Denuncia actualizada a ${status}`
            });

        } catch (error) {
            console.error('❌ Error actualizando estado de denuncia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    // ============================================================
    // ESTADÍSTICAS DE DENUNCIAS
    // ============================================================
    router.get('/stats', auth, (req, res) => {
        try {
            const users = read('users.json');
            const user = users.find(u => u.id === req.userId);
            if (!user || user.role !== 'admin') {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            const reports = read('reports.json');
            const today = new Date().toISOString().split('T')[0];
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const stats = {
                total: reports.length,
                pending: reports.filter(r => r.status === 'pending').length,
                reviewing: reports.filter(r => r.status === 'reviewing').length,
                resolved: reports.filter(r => r.status === 'resolved').length,
                dismissed: reports.filter(r => r.status === 'dismissed').length,
                autoHidden: reports.filter(r => r.status === 'auto_hidden').length,
                autoDeleted: reports.filter(r => r.autoDeleted === true).length,
                today: reports.filter(r => r.createdAt.startsWith(today)).length,
                thisWeek: reports.filter(r => r.createdAt >= weekAgo).length,
                byCategory: {},
                byPriority: {
                    high: reports.filter(r => r.priority === 'high').length,
                    medium: reports.filter(r => r.priority === 'medium').length,
                    normal: reports.filter(r => r.priority === 'normal').length
                },
                autoFlagged: reports.filter(r => r.analysis?.combined?.autoFlagged).length,
                assigned: reports.filter(r => r.assignedTo !== null && r.assignedTo !== undefined).length,
                unassigned: reports.filter(r => !r.assignedTo || r.assignedTo === null).length,
                severityLevels: {
                    level1: reports.filter(r => r.analysis?.text?.level === 1).length,
                    level2: reports.filter(r => r.analysis?.text?.level === 2).length,
                    level3: reports.filter(r => r.analysis?.text?.level === 3).length,
                    level4: reports.filter(r => r.analysis?.text?.level === 4).length
                },
                iaStats: {
                    analyzed: reports.filter(r => r.analysis?.image).length,
                    safe: reports.filter(r => r.analysis?.image?.label === 'safe').length,
                    nsfw: reports.filter(r => r.analysis?.image?.label === 'nsfw').length,
                    unknown: reports.filter(r => r.analysis?.image?.label === 'unknown' || !r.analysis?.image).length
                }
            };

            const categories = ['spam', 'harassment', 'inappropriate', 'violence', 'illegal', 'hate_speech', 'adult_content', 'other'];
            categories.forEach(cat => {
                stats.byCategory[cat] = reports.filter(r => r.category === cat).length;
            });

            res.json(stats);
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    });

    return router;
};