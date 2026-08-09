// backend/routes/storyMedia.js
module.exports = () => {
    const router = require('express').Router();
    const auth = require('./middleware/auth');

    // Validar URL de imagen
    const isValidImageUrl = (url) => {
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i;
        return imageExtensions.test(url);
    };

    // Validar URL de video (archivos directos)
    const isValidDirectVideoUrl = (url) => {
        const videoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i;
        return videoExtensions.test(url);
    };

    // Detectar y obtener embed URL de YouTube
    const getYouTubeEmbedUrl = (url) => {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
            }
        }
        return null;
    };

    // Detectar y obtener embed URL de Vimeo
    const getVimeoEmbedUrl = (url) => {
        const patterns = [
            /vimeo\.com\/(\d+)/,
            /player\.vimeo\.com\/video\/(\d+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
            }
        }
        return null;
    };

    // Detectar y obtener embed URL de Dailymotion
    const getDailymotionEmbedUrl = (url) => {
        const patterns = [
            /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
            /dai\.ly\/([a-zA-Z0-9]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return `https://www.dailymotion.com/embed/video/${match[1]}?autoplay=1`;
            }
        }
        return null;
    };

    // Detectar y obtener embed URL de Twitch
    const getTwitchEmbedUrl = (url) => {
        const patterns = [
            /twitch\.tv\/videos\/(\d+)/,
            /twitch\.tv\/([a-zA-Z0-9_]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                if (match[1].match(/^\d+$/)) {
                    return `https://player.twitch.tv/?video=${match[1]}&autoplay=true`;
                } else {
                    return `https://player.twitch.tv/?channel=${match[1]}&autoplay=true`;
                }
            }
        }
        return null;
    };

    // Detectar y obtener embed URL de Facebook
    const getFacebookEmbedUrl = (url) => {
        const patterns = [
            /facebook\.com\/(?:[^\/]+\/videos\/|video\.php\?v=)(\d+)/,
            /fb\.watch\/([a-zA-Z0-9]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=1`;
            }
        }
        return null;
    };

    // Procesar URL de video (soporta múltiples plataformas)
    const processVideoUrl = (url) => {
        // Verificar si es un archivo directo
        if (isValidDirectVideoUrl(url)) {
            return { type: 'direct', url: url };
        }
        
        // Verificar YouTube
        const youtubeEmbed = getYouTubeEmbedUrl(url);
        if (youtubeEmbed) {
            return { type: 'youtube', url: youtubeEmbed, originalUrl: url };
        }
        
        // Verificar Vimeo
        const vimeoEmbed = getVimeoEmbedUrl(url);
        if (vimeoEmbed) {
            return { type: 'vimeo', url: vimeoEmbed, originalUrl: url };
        }
        
        // Verificar Dailymotion
        const dailymotionEmbed = getDailymotionEmbedUrl(url);
        if (dailymotionEmbed) {
            return { type: 'dailymotion', url: dailymotionEmbed, originalUrl: url };
        }
        
        // Verificar Twitch
        const twitchEmbed = getTwitchEmbedUrl(url);
        if (twitchEmbed) {
            return { type: 'twitch', url: twitchEmbed, originalUrl: url };
        }
        
        // Verificar Facebook
        const facebookEmbed = getFacebookEmbedUrl(url);
        if (facebookEmbed) {
            return { type: 'facebook', url: facebookEmbed, originalUrl: url };
        }
        
        return null;
    };

    // Procesar URL de audio
    const processAudioUrl = (url) => {
        // Spotify
        const spotifyPattern = /spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
        const spotifyMatch = url.match(spotifyPattern);
        if (spotifyMatch) {
            return { type: 'spotify', embedType: spotifyMatch[1], id: spotifyMatch[2], url: url };
        }
        
        // SoundCloud
        const soundcloudPattern = /soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
        const soundcloudMatch = url.match(soundcloudPattern);
        if (soundcloudMatch) {
            return { type: 'soundcloud', url: url };
        }
        
        // Archivo directo
        const audioExtensions = /\.(mp3|wav|ogg|m4a)(\?.*)?$/i;
        if (audioExtensions.test(url)) {
            return { type: 'direct', url: url };
        }
        
        return null;
    };

    // Generar HTML para mostrar el video según el tipo
    const generateVideoHtml = (videoData) => {
        switch(videoData.type) {
            case 'youtube':
                return `
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${videoData.url}" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                `;
            case 'vimeo':
                return `
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${videoData.url}" 
                        frameborder="0" 
                        allow="autoplay; fullscreen; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                `;
            case 'dailymotion':
                return `
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${videoData.url}" 
                        frameborder="0" 
                        allow="autoplay; fullscreen" 
                        allowfullscreen>
                    </iframe>
                `;
            case 'twitch':
                return `
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${videoData.url}" 
                        frameborder="0" 
                        allow="autoplay; fullscreen" 
                        allowfullscreen>
                    </iframe>
                `;
            case 'facebook':
                return `
                    <iframe 
                        width="100%" 
                        height="100%" 
                        src="${videoData.url}" 
                        frameborder="0" 
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" 
                        allowfullscreen>
                    </iframe>
                `;
            case 'direct':
            default:
                return `<video controls autoplay style="width:100%; height:100%; object-fit:contain;"><source src="${videoData.url}"></video>`;
        }
    };

    // Validar URL de medios (mejorado)
    router.post('/validate', auth, (req, res) => {
        const { mediaType, mediaUrl } = req.body;
        
        let isValid = false;
        let message = '';
        let processedData = null;
        
        switch(mediaType) {
            case 'image':
                isValid = isValidImageUrl(mediaUrl);
                message = isValid ? '✅ URL de imagen válida' : '❌ URL de imagen inválida. Debe terminar en .jpg, .png, .gif, etc.';
                break;
            case 'video':
                const videoData = processVideoUrl(mediaUrl);
                isValid = videoData !== null;
                message = isValid ? '✅ URL de video válida' : '❌ URL de video inválida. Soporta: YouTube, Vimeo, Dailymotion, Twitch, Facebook, o archivos .mp4';
                if (isValid) {
                    processedData = videoData;
                }
                break;
            case 'audio':
                const audioData = processAudioUrl(mediaUrl);
                isValid = audioData !== null;
                message = isValid ? '✅ URL de audio válida' : '❌ URL de audio inválida. Soporta: Spotify, SoundCloud, o archivos .mp3';
                if (isValid) {
                    processedData = audioData;
                }
                break;
            default:
                isValid = true;
        }
        
        res.json({ isValid, message, processedData });
    });

    // Sugerencias de medios (para el banner)
    router.get('/suggestions', auth, (req, res) => {
        const suggestions = {
            images: [
                'https://picsum.photos/800/600',
                'https://picsum.photos/800/800',
                'https://picsum.photos/1000/600'
            ],
            videos: [
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://vimeo.com/76979871',
                'https://www.dailymotion.com/video/x3s2m2',
                'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
            ],
            audio: [
                'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
            ]
        };
        res.json(suggestions);
    });

    // Obtener HTML para embed (útil para el frontend)
    router.post('/get-embed', auth, (req, res) => {
        const { mediaType, mediaUrl } = req.body;
        
        let embedHtml = null;
        
        switch(mediaType) {
            case 'video':
                const videoData = processVideoUrl(mediaUrl);
                if (videoData) {
                    embedHtml = generateVideoHtml(videoData);
                }
                break;
            case 'audio':
                const audioData = processAudioUrl(mediaUrl);
                if (audioData) {
                    if (audioData.type === 'spotify') {
                        embedHtml = `
                            <iframe 
                                src="https://open.spotify.com/embed/${audioData.embedType}/${audioData.id}" 
                                width="100%" 
                                height="80" 
                                frameborder="0" 
                                allow="encrypted-media">
                            </iframe>
                        `;
                    } else if (audioData.type === 'soundcloud') {
                        embedHtml = `
                            <iframe 
                                width="100%" 
                                height="166" 
                                scrolling="no" 
                                frameborder="no" 
                                allow="autoplay" 
                                src="https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaUrl)}&auto_play=true">
                            </iframe>
                        `;
                    } else {
                        embedHtml = `<audio controls autoplay style="width:100%;"><source src="${mediaUrl}"></audio>`;
                    }
                }
                break;
        }
        
        res.json({ embedHtml });
    });

    return router;
};