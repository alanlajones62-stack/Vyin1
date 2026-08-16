// backend/db/stories.db.js
// Base de datos SQLite para historias

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'stories.db');

// Crear directorio si no existe
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Conexión a la base de datos
const db = new sqlite3.Database(DB_PATH);

// ============================================================
// INICIALIZAR TABLAS
// ============================================================

function initDatabase() {
    db.serialize(() => {
        // Tabla de historias
        db.run(`
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                mediaType TEXT NOT NULL,
                mediaUrl TEXT,
                caption TEXT,
                textContent TEXT,
                textBgColor TEXT,
                createdAt TEXT NOT NULL,
                expiresAt TEXT NOT NULL,
                views TEXT DEFAULT '[]',
                likes TEXT DEFAULT '[]',
                comments TEXT DEFAULT '[]',
                score INTEGER DEFAULT 0,
                iaClassification TEXT,
                flagged INTEGER DEFAULT 0,
                flagReason TEXT,
                flagConfidence REAL DEFAULT 0,
                hidden INTEGER DEFAULT 0,
                hiddenAt TEXT,
                hiddenReason TEXT,
                hiddenByIA INTEGER DEFAULT 0,
                hasSubtitles INTEGER DEFAULT 0,
                subtitles TEXT,
                segments TEXT,
                language TEXT DEFAULT 'es',
                embedded INTEGER DEFAULT 0,
                embeddingVersion TEXT,
                country TEXT,
                region TEXT DEFAULT 'other',
                countryName TEXT,
                surveyType TEXT,
                surveyData TEXT,
                publicId TEXT,
                cloudinaryUrl TEXT,
                isSurvey INTEGER DEFAULT 0
            )
        `);

        // Índices para mejorar rendimiento
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_userId ON stories(userId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_expiresAt ON stories(expiresAt)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_hidden ON stories(hidden)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_createdAt ON stories(createdAt)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_language ON stories(language)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_region ON stories(region)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_country ON stories(country)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stories_mediaType ON stories(mediaType)`);

        // Tabla de comentarios (independiente para mejor rendimiento)
        db.run(`
            CREATE TABLE IF NOT EXISTS story_comments (
                id TEXT PRIMARY KEY,
                storyId TEXT NOT NULL,
                userId TEXT NOT NULL,
                content TEXT,
                createdAt TEXT NOT NULL,
                parentCommentId TEXT,
                likes TEXT DEFAULT '[]',
                hasFile INTEGER DEFAULT 0,
                fileUrl TEXT,
                filename TEXT,
                originalName TEXT,
                fileSize INTEGER,
                mimetype TEXT,
                FOREIGN KEY (storyId) REFERENCES stories(id) ON DELETE CASCADE
            )
        `);

        // Índices para comentarios
        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_storyId ON story_comments(storyId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_parentId ON story_comments(parentCommentId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_createdAt ON story_comments(createdAt)`);

        // Tabla de votos de encuestas
        db.run(`
            CREATE TABLE IF NOT EXISTS survey_votes (
                id TEXT PRIMARY KEY,
                storyId TEXT NOT NULL,
                userId TEXT NOT NULL,
                optionId TEXT NOT NULL,
                votedAt TEXT NOT NULL,
                FOREIGN KEY (storyId) REFERENCES stories(id) ON DELETE CASCADE,
                UNIQUE(storyId, userId)
            )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_survey_votes_storyId ON survey_votes(storyId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_survey_votes_userId ON survey_votes(userId)`);

        console.log('✅ Base de datos SQLite inicializada correctamente');
    });
}

// ============================================================
// FUNCIONES CRUD PARA HISTORIAS
// ============================================================

function getAllStories() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM stories', (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows.map(row => ({
                ...row,
                views: JSON.parse(row.views || '[]'),
                likes: JSON.parse(row.likes || '[]'),
                comments: JSON.parse(row.comments || '[]'),
                iaClassification: row.iaClassification ? JSON.parse(row.iaClassification) : null,
                surveyData: row.surveyData ? JSON.parse(row.surveyData) : null,
                segments: row.segments ? JSON.parse(row.segments) : null,
                flagged: row.flagged === 1,
                hidden: row.hidden === 1,
                hasSubtitles: row.hasSubtitles === 1,
                embedded: row.embedded === 1,
                hiddenByIA: row.hiddenByIA === 1,
                isSurvey: row.isSurvey === 1
            })));
        });
    });
}

function getStoryById(storyId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM stories WHERE id = ?', [storyId], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            if (!row) {
                resolve(null);
                return;
            }
            resolve({
                ...row,
                views: JSON.parse(row.views || '[]'),
                likes: JSON.parse(row.likes || '[]'),
                comments: JSON.parse(row.comments || '[]'),
                iaClassification: row.iaClassification ? JSON.parse(row.iaClassification) : null,
                surveyData: row.surveyData ? JSON.parse(row.surveyData) : null,
                segments: row.segments ? JSON.parse(row.segments) : null,
                flagged: row.flagged === 1,
                hidden: row.hidden === 1,
                hasSubtitles: row.hasSubtitles === 1,
                embedded: row.embedded === 1,
                hiddenByIA: row.hiddenByIA === 1,
                isSurvey: row.isSurvey === 1
            });
        });
    });
}

function createStory(story) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO stories (
                id, userId, mediaType, mediaUrl, caption, textContent, textBgColor,
                createdAt, expiresAt, views, likes, comments, score, iaClassification,
                flagged, flagReason, flagConfidence, hidden, hiddenAt, hiddenReason,
                hiddenByIA, hasSubtitles, subtitles, segments, language, embedded,
                embeddingVersion, country, region, countryName, surveyType, surveyData,
                publicId, cloudinaryUrl, isSurvey
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            story.id,
            story.userId,
            story.mediaType,
            story.mediaUrl || null,
            story.caption || '',
            story.textContent || null,
            story.textBgColor || '#1a1a2e',
            story.createdAt,
            story.expiresAt,
            JSON.stringify(story.views || []),
            JSON.stringify(story.likes || []),
            JSON.stringify(story.comments || []),
            story.score || 0,
            story.iaClassification ? JSON.stringify(story.iaClassification) : null,
            story.flagged ? 1 : 0,
            story.flagReason || null,
            story.flagConfidence || 0,
            story.hidden ? 1 : 0,
            story.hiddenAt || null,
            story.hiddenReason || null,
            story.hiddenByIA ? 1 : 0,
            story.hasSubtitles ? 1 : 0,
            story.subtitles || null,
            story.segments ? JSON.stringify(story.segments) : null,
            story.language || 'es',
            story.embedded ? 1 : 0,
            story.embeddingVersion || null,
            story.country || null,
            story.region || 'other',
            story.countryName || null,
            story.surveyType || null,
            story.surveyData ? JSON.stringify(story.surveyData) : null,
            story.publicId || null,
            story.cloudinaryUrl || null,
            story.isSurvey ? 1 : 0
        );

        stmt.finalize((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(story);
        });
    });
}

function updateStory(storyId, updates) {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];

        if (updates.views !== undefined) {
            fields.push('views = ?');
            values.push(JSON.stringify(updates.views));
        }
        if (updates.likes !== undefined) {
            fields.push('likes = ?');
            values.push(JSON.stringify(updates.likes));
        }
        if (updates.comments !== undefined) {
            fields.push('comments = ?');
            values.push(JSON.stringify(updates.comments));
        }
        if (updates.hidden !== undefined) {
            fields.push('hidden = ?');
            values.push(updates.hidden ? 1 : 0);
        }
        if (updates.score !== undefined) {
            fields.push('score = ?');
            values.push(updates.score);
        }
        if (updates.surveyData !== undefined) {
            fields.push('surveyData = ?');
            values.push(JSON.stringify(updates.surveyData));
        }

        if (fields.length === 0) {
            resolve(null);
            return;
        }

        values.push(storyId);
        const query = `UPDATE stories SET ${fields.join(', ')} WHERE id = ?`;

        db.run(query, values, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ changes: this.changes });
        });
    });
}

function deleteStory(storyId) {
    return new Promise((resolve, reject) => {
        // Eliminar comentarios asociados (por cascade)
        db.run('DELETE FROM stories WHERE id = ?', [storyId], function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ deleted: this.changes });
        });
    });
}

function getStoriesByUser(userId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM stories WHERE userId = ? ORDER BY createdAt DESC', [userId], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows.map(row => ({
                ...row,
                views: JSON.parse(row.views || '[]'),
                likes: JSON.parse(row.likes || '[]'),
                comments: JSON.parse(row.comments || '[]'),
                iaClassification: row.iaClassification ? JSON.parse(row.iaClassification) : null,
                surveyData: row.surveyData ? JSON.parse(row.surveyData) : null,
                segments: row.segments ? JSON.parse(row.segments) : null,
                flagged: row.flagged === 1,
                hidden: row.hidden === 1,
                hasSubtitles: row.hasSubtitles === 1,
                embedded: row.embedded === 1,
                hiddenByIA: row.hiddenByIA === 1,
                isSurvey: row.isSurvey === 1
            })));
        });
    });
}

function getActiveStories() {
    const now = new Date().toISOString();
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM stories WHERE expiresAt > ? AND hidden = 0 ORDER BY createdAt DESC', [now], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows.map(row => ({
                ...row,
                views: JSON.parse(row.views || '[]'),
                likes: JSON.parse(row.likes || '[]'),
                comments: JSON.parse(row.comments || '[]'),
                iaClassification: row.iaClassification ? JSON.parse(row.iaClassification) : null,
                surveyData: row.surveyData ? JSON.parse(row.surveyData) : null,
                segments: row.segments ? JSON.parse(row.segments) : null,
                flagged: row.flagged === 1,
                hidden: row.hidden === 1,
                hasSubtitles: row.hasSubtitles === 1,
                embedded: row.embedded === 1,
                hiddenByIA: row.hiddenByIA === 1,
                isSurvey: row.isSurvey === 1
            })));
        });
    });
}

// ============================================================
// FUNCIONES PARA COMENTARIOS
// ============================================================

function getCommentsByStory(storyId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM story_comments WHERE storyId = ? ORDER BY createdAt DESC',
            [storyId],
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows.map(row => ({
                    ...row,
                    likes: JSON.parse(row.likes || '[]'),
                    hasFile: row.hasFile === 1
                })));
            }
        );
    });
}

function createComment(comment) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO story_comments (
                id, storyId, userId, content, createdAt, parentCommentId,
                likes, hasFile, fileUrl, filename, originalName, fileSize, mimetype
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            comment.id,
            comment.storyId,
            comment.userId,
            comment.content || '',
            comment.createdAt,
            comment.parentCommentId || null,
            JSON.stringify(comment.likes || []),
            comment.hasFile ? 1 : 0,
            comment.fileUrl || null,
            comment.filename || null,
            comment.originalName || null,
            comment.fileSize || null,
            comment.mimetype || null
        );

        stmt.finalize((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(comment);
        });
    });
}

function deleteComment(commentId) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM story_comments WHERE id = ?', [commentId], function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ deleted: this.changes });
        });
    });
}

// ============================================================
// FUNCIONES PARA VOTOS DE ENCUESTAS
// ============================================================

function getSurveyVote(storyId, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM survey_votes WHERE storyId = ? AND userId = ?',
            [storyId, userId],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            }
        );
    });
}

function createSurveyVote(vote) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO survey_votes (id, storyId, userId, optionId, votedAt)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            vote.id,
            vote.storyId,
            vote.userId,
            vote.optionId,
            vote.votedAt
        );

        stmt.finalize((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(vote);
        });
    });
}

function getSurveyVotesByStory(storyId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM survey_votes WHERE storyId = ?',
            [storyId],
            (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            }
        );
    });
}

// ============================================================
// EXPORTAR MÓDULO
// ============================================================

module.exports = {
    db,
    initDatabase,
    getAllStories,
    getStoryById,
    createStory,
    updateStory,
    deleteStory,
    getStoriesByUser,
    getActiveStories,
    getCommentsByStory,
    createComment,
    deleteComment,
    getSurveyVote,
    createSurveyVote,
    getSurveyVotesByStory
};