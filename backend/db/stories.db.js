// backend/db/supabase.js
// Base de datos Supabase para historias

const { createClient } = require('@supabase/supabase-js');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase no configurado. Asegúrate de tener SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase cliente inicializado');

// ============================================================
// FUNCIONES CRUD PARA HISTORIAS
// ============================================================

async function getAllStories() {
    try {
        const { data, error } = await supabase
            .from('stories')
            .select('*')
            .order('createdAt', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error en getAllStories:', error.message);
        return [];
    }
}

async function getStoryById(storyId) {
    try {
        const { data, error } = await supabase
            .from('stories')
            .select('*')
            .eq('id', storyId)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.error('❌ Error en getStoryById:', error.message);
        return null;
    }
}

async function getActiveStories() {
    try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('stories')
            .select('*')
            .gt('expiresAt', now)
            .eq('hidden', false)
            .order('createdAt', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error en getActiveStories:', error.message);
        return [];
    }
}

async function getStoriesByUser(userId) {
    try {
        const { data, error } = await supabase
            .from('stories')
            .select('*')
            .eq('userId', userId)
            .order('createdAt', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error en getStoriesByUser:', error.message);
        return [];
    }
}

async function createStory(story) {
    try {
        // Convertir objetos a JSON string para campos JSONB
        const storyData = {
            ...story,
            views: JSON.stringify(story.views || []),
            likes: JSON.stringify(story.likes || []),
            comments: JSON.stringify(story.comments || []),
            iaClassification: story.iaClassification ? JSON.stringify(story.iaClassification) : null,
            surveyData: story.surveyData ? JSON.stringify(story.surveyData) : null,
            segments: story.segments ? JSON.stringify(story.segments) : null,
            flagged: story.flagged ? true : false,
            hidden: story.hidden ? true : false,
            hasSubtitles: story.hasSubtitles ? true : false,
            embedded: story.embedded ? true : false,
            hiddenByIA: story.hiddenByIA ? true : false,
            isSurvey: story.isSurvey ? true : false
        };

        const { data, error } = await supabase
            .from('stories')
            .insert([storyData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error en createStory:', error.message);
        throw error;
    }
}

async function updateStory(storyId, updates) {
    try {
        // Convertir objetos a JSON string para campos JSONB
        const updateData = {};
        
        if (updates.views !== undefined) {
            updateData.views = JSON.stringify(updates.views);
        }
        if (updates.likes !== undefined) {
            updateData.likes = JSON.stringify(updates.likes);
        }
        if (updates.comments !== undefined) {
            updateData.comments = JSON.stringify(updates.comments);
        }
        if (updates.hidden !== undefined) {
            updateData.hidden = updates.hidden ? true : false;
        }
        if (updates.score !== undefined) {
            updateData.score = updates.score;
        }
        if (updates.surveyData !== undefined) {
            updateData.surveyData = JSON.stringify(updates.surveyData);
        }
        if (updates.flagged !== undefined) {
            updateData.flagged = updates.flagged ? true : false;
        }
        if (updates.flagReason !== undefined) {
            updateData.flagReason = updates.flagReason;
        }
        if (updates.flagConfidence !== undefined) {
            updateData.flagConfidence = updates.flagConfidence;
        }
        if (updates.embedded !== undefined) {
            updateData.embedded = updates.embedded ? true : false;
        }
        if (updates.embeddingVersion !== undefined) {
            updateData.embeddingVersion = updates.embeddingVersion;
        }

        if (Object.keys(updateData).length === 0) {
            return null;
        }

        const { data, error } = await supabase
            .from('stories')
            .update(updateData)
            .eq('id', storyId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error en updateStory:', error.message);
        throw error;
    }
}

async function deleteStory(storyId) {
    try {
        const { error } = await supabase
            .from('stories')
            .delete()
            .eq('id', storyId);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('❌ Error en deleteStory:', error.message);
        throw error;
    }
}

// ============================================================
// FUNCIONES PARA COMENTARIOS
// ============================================================

async function getCommentsByStory(storyId) {
    try {
        const { data, error } = await supabase
            .from('story_comments')
            .select('*')
            .eq('storyId', storyId)
            .order('createdAt', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error en getCommentsByStory:', error.message);
        return [];
    }
}

async function createComment(comment) {
    try {
        const commentData = {
            ...comment,
            likes: JSON.stringify(comment.likes || []),
            hasFile: comment.hasFile ? true : false
        };

        const { data, error } = await supabase
            .from('story_comments')
            .insert([commentData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error en createComment:', error.message);
        throw error;
    }
}

async function deleteComment(commentId) {
    try {
        const { error } = await supabase
            .from('story_comments')
            .delete()
            .eq('id', commentId);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('❌ Error en deleteComment:', error.message);
        throw error;
    }
}

// ============================================================
// FUNCIONES PARA VOTOS DE ENCUESTAS
// ============================================================

async function getSurveyVote(storyId, userId) {
    try {
        const { data, error } = await supabase
            .from('survey_votes')
            .select('*')
            .eq('storyId', storyId)
            .eq('userId', userId)
            .maybeSingle();
        
        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('❌ Error en getSurveyVote:', error.message);
        return null;
    }
}

async function createSurveyVote(vote) {
    try {
        const { data, error } = await supabase
            .from('survey_votes')
            .insert([vote])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error en createSurveyVote:', error.message);
        throw error;
    }
}

async function getSurveyVotesByStory(storyId) {
    try {
        const { data, error } = await supabase
            .from('survey_votes')
            .select('*')
            .eq('storyId', storyId);
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error en getSurveyVotesByStory:', error.message);
        return [];
    }
}

// ============================================================
// EXPORTAR MÓDULO
// ============================================================

module.exports = {
    supabase,
    getAllStories,
    getStoryById,
    getActiveStories,
    getStoriesByUser,
    createStory,
    updateStory,
    deleteStory,
    getCommentsByStory,
    createComment,
    deleteComment,
    getSurveyVote,
    createSurveyVote,
    getSurveyVotesByStory
};