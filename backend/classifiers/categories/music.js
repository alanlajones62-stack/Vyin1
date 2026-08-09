// backend/classifiers/categories/music.js
// CATEGORÍA - SOLO PALABRAS CLAVE EN ESPAÑOL

module.exports = {
    name: 'Música',
    emoji: '🎵',
    weight: 1.0,
    description: 'Contenido relacionado con música y artistas',
    keywords: [
        // Géneros
        'música', 'musica', 'canción', 'cancion', 'melodía', 'ritmo',
        'rock', 'pop', 'rap', 'reggaeton', 'trap', 'urbano',
        'bachata', 'salsa', 'merengue', 'cumbia', 'vallenato',
        'reggae', 'ska', 'punk', 'metal', 'jazz', 'blues',
        'electrónica', 'electrónico', 'house', 'techno', 'edm',
        'indie', 'alternativo', 'folk', 'country', 'clásica',
        
        // Artistas (latino)
        'badbunny', 'bad bunny', 'karolg', 'karol g', 'rosalia', 'rosalía',
        'shakira', 'jbalvin', 'j balvin', 'maluma', 'feid', 'quevedo',
        'bizarrap', 'daddy yankee', 'don omar', 'wisin', 'yandel',
        'ozuna', 'anuel', 'farruko', 'arcangel', 'dalmata',
        'jhayco', 'myke towers', 'lunay', 'rauw alejandro', 'camilo',
        'sebastian yatra', 'mau y ricky', 'piso 21', 'morat',
        
        // Artistas (internacional)
        'taylor swift', 'ariana grande', 'justin bieber', 'billie eilish',
        'drake', 'kendrick lamar', 'post malone', 'the weeknd',
        'harry styles', 'dua lipa', 'olivia rodrigo', 'ed sheeran',
        'adele', 'beyoncé', 'rihanna', 'bruno mars',
        
        // Bandas
        'queen', 'beatles', 'rolling stones', 'pink floyd', 'nirvana',
        'metallica', 'guns n roses', 'acdc', 'linkin park', 'coldplay',
        'imagina dragons', 'maroon 5', 'one direction', 'blackpink',
        'bts', 'maná', 'soda stereo', 'caifanes', 'enjambre',
        
        // Instrumentos
        'guitarra', 'piano', 'batería', 'bajo', 'violín', 'violín',
        'flauta', 'saxofón', 'trompeta', 'trombón', 'clarinete',
        'arpa', 'acordeón', 'charango', 'bandoneón', 'marimba',
        
        // Actividades
        'concierto', 'festival', 'banda', 'orquesta', 'coro',
        'grabación', 'estudio', 'productor', 'dj', 'playlist',
        'spotify', 'youtube', 'tiktok', 'soundcloud', 'apple music'
    ],
    aliases: ['música', 'musica', 'artistas', 'conciertos']
};