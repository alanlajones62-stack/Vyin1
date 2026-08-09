// Servicio Principal de Recomendación
const franc = require('franc-min');
const languages = require('./languages');

class RecommendationService {
    constructor() {
        this.languageConfigs = languages.languageConfigs;
        this.francToLang = languages.francToLang;
    }

    /**
     * 🔥 DETECTA EL IDIOMA DEL TEXTO
     */
    detectLanguage(text) {
        if (!text || text.length < 10) return 'spa';
        try {
            const detected = franc(text);
            return this.francToLang[detected] || 'spa';
        } catch (error) {
            return 'spa';
        }
    }

    /**
     * 🔥 OBTIENE CONFIGURACIÓN DEL IDIOMA
     */
    getLanguageConfig(langCode) {
        return languages.getLanguageConfig(langCode);
    }

    /**
     * 🔥 EXTRAE PALABRAS CLAVE
     */
    extractKeywords(text, language = null) {
        if (!text) return [];
        const lang = language || this.detectLanguage(text);
        const config = this.getLanguageConfig(lang);
        const stopwords = config.stopwords || [];

        let cleanText = text.toLowerCase()
            .replace(/[^a-záéíóúñüäöüßçàèìòù0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = cleanText.split(' ');
        return tokens.filter(token => 
            token.length > 2 && 
            !stopwords.includes(token)
        );
    }

    /**
     * 🔥 DETECTA INTERESES
     */
    detectInterests(keywords, language = 'spa') {
        const config = this.getLanguageConfig(language);
        const categories = config.categories || {};
        const interests = {};

        for (const [category, words] of Object.entries(categories)) {
            let score = 0;
            for (const keyword of keywords) {
                for (const word of words) {
                    if (keyword.includes(word) || word.includes(keyword)) {
                        score += 1;
                    }
                }
            }
            if (score > 0) {
                interests[category] = score;
            }
        }

        return Object.entries(interests)
            .sort((a, b) => b[1] - a[1])
            .map(([key]) => key)
            .slice(0, 5);
    }

    /**
     * 🔥 ANALIZA UNA HISTORIA
     */
    analyzeStory(story) {
        const text = story.subtitles || story.caption || story.textContent || '';
        const language = story.language || this.detectLanguage(text);
        const keywords = this.extractKeywords(text, language);
        const interests = this.detectInterests(keywords, language);

        return {
            language: language,
            keywords: keywords.slice(0, 20),
            interests: interests,
            wordCount: keywords.length
        };
    }

    /**
     * 🔥 CALCULA RELEVANCIA
     */
    calculateRelevance(story, userInterests, user) {
        let score = 0;
        const analysis = this.analyzeStory(story);

        // 1. Intereses del usuario (máx 50)
        if (userInterests && userInterests.length > 0) {
            for (const interest of userInterests) {
                if (analysis.interests.includes(interest)) {
                    score += 10;
                }
            }
        }

        // 2. Engagement (máx 30)
        const likes = story.likes?.length || 0;
        const comments = story.comments?.length || 0;
        const views = story.views?.length || 0;
        score += Math.min(30, likes * 2 + comments * 3 + views * 0.2);

        // 3. Recencia (máx 20)
        const ageHours = (Date.now() - new Date(story.createdAt).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 20 - ageHours * 0.5);

        // 4. Seguidos (máx 20)
        if (user && user.following?.includes(story.userId)) {
            score += 20;
        }

        // 5. Calidad de subtítulos (máx 10)
        if (story.hasSubtitles && story.subtitles) {
            const wordCount = story.subtitles.split(/\s+/).length;
            score += Math.min(10, wordCount / 5);
        }

        // 6. Bonus por idioma (máx 10)
        if (user && user.language) {
            const userLang = user.language || 'es';
            const storyLang = story.language || 'es';
            if (userLang === storyLang) {
                score += 10;
            }
        }

        return Math.round(score);
    }

    /**
     * 🔥 OBTIENE INTERESES DEL USUARIO
     */
    async getUserInterests(userId) {
        const fs = require('fs-extra');
        const path = require('path');
        const DATA_DIR = path.join(__dirname, '../../data');
        
        try {
            const storiesPath = path.join(DATA_DIR, 'stories.json');
            if (!fs.existsSync(storiesPath)) return ['entretenimiento'];

            const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
            const userStories = stories.filter(s => s.userId === userId);
            
            const allInterests = [];
            for (const story of userStories.slice(0, 10)) {
                const analysis = this.analyzeStory(story);
                allInterests.push(...analysis.interests);
            }

            const interestCount = {};
            for (const interest of allInterests) {
                interestCount[interest] = (interestCount[interest] || 0) + 1;
            }

            const sorted = Object.entries(interestCount)
                .sort((a, b) => b[1] - a[1])
                .map(([key]) => key);

            return sorted.slice(0, 5) || ['entretenimiento'];
        } catch (error) {
            console.error('Error obteniendo intereses:', error);
            return ['entretenimiento'];
        }
    }

    /**
     * 🔥 RECOMIENDA HISTORIAS
     */
    async recommendStories(userId, limit = 30) {
        const fs = require('fs-extra');
        const path = require('path');
        const DATA_DIR = path.join(__dirname, '../../data');

        try {
            const storiesPath = path.join(DATA_DIR, 'stories.json');
            const usersPath = path.join(DATA_DIR, 'users.json');

            if (!fs.existsSync(storiesPath)) return [];

            const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
            const users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf8')) : [];

            const user = users.find(u => u.id === userId);
            const userInterests = await this.getUserInterests(userId);

            const now = Date.now();

            const candidateStories = stories.filter(s => {
                if (!s.expiresAt) return false;
                if (new Date(s.expiresAt).getTime() <= now) return false;
                if (s.hidden) return false;
                if (s.userId === userId) return false;
                return true;
            });

            const scoredStories = candidateStories.map(story => {
                const score = this.calculateRelevance(story, userInterests, user);
                const analysis = this.analyzeStory(story);
                return { ...story, score, _analysis: analysis };
            });

            scoredStories.sort((a, b) => b.score - a.score);

            return scoredStories.slice(0, limit).map(s => {
                const { _analysis, ...story } = s;
                return {
                    ...story,
                    recommendationScore: s.score,
                    topics: _analysis.interests,
                    language: _analysis.language
                };
            });

        } catch (error) {
            console.error('Error recomendando historias:', error);
            return [];
        }
    }
}

module.exports = new RecommendationService();