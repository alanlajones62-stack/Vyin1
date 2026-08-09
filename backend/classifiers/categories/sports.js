// backend/classifiers/categories/sports.js
// CATEGORÍA - SOLO PALABRAS CLAVE EN ESPAÑOL

module.exports = {
    name: 'Deportes',
    emoji: '⚽',
    weight: 1.0,
    description: 'Contenido relacionado con deportes',
    keywords: [
        // Fútbol
        'fútbol', 'futbol', 'balón', 'gol', 'goles', 'penalti', 'penal',
        'partido', 'liga', 'campeón', 'campeonato', 'torneo', 'mundial',
        'selección', 'seleccion', 'jugador', 'jugadora', 'entrenador',
        'árbitro', 'estadio', 'cancha', 'pelota', 'tarjeta', 'roja', 'amarilla',
        'champions', 'libertadores', 'sudamericana', 'premier', 'laliga',
        'serie', 'bundesliga', 'messi', 'cristiano', 'ronaldo', 'neymar',
        'mbappé', 'haaland', 'vinicius', 'bellingham', 'modric', 'kroos',
        
        // Baloncesto
        'baloncesto', 'basket', 'basketball', 'nba', 'lebron', 'curry',
        'durant', 'doncic', 'jokic', 'giannis', 'tatum', 'butler',
        'canasta', 'triple', 'mate', 'rebote', 'asistencia',
        
        // Tenis
        'tenis', 'nadal', 'djokovic', 'federer', 'alcaraz', 'medvedev',
        'sinner', 'ruud', 'raqueta', 'pelota', 'wimbledon', 'roland garros',
        'us open', 'australian open', 'master 1000', 'grand slam',
        
        // Voleibol
        'voleibol', 'vóley', 'voley', 'beach', 'playa', 'cancha',
        
        // Automovilismo
        'fórmula', 'formula', 'f1', 'verstappen', 'hamilton', 'perez',
        'leclerc', 'sainz', 'norris', 'pit stop', 'carrera', 'monaco',
        
        // Moto GP
        'motogp', 'moto', 'marquez', 'bagnaia', 'quartararo', 'bastianini',
        
        // Otros deportes
        'rugby', 'golf', 'boxeo', 'artes marciales', 'mma', 'ufc',
        'atletismo', 'natación', 'ciclismo', 'triatlón', 'maratón',
        'esquí', 'snowboard', 'surf', 'skate', 'parkour',
        'deporte', 'deportes', 'olimpiada', 'olimpico'
    ],
    aliases: ['deportes', 'sports', 'futbol', 'baloncesto']
};