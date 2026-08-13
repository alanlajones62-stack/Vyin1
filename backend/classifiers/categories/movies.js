// backend/classifiers/categories/movies.js
module.exports = {
    name: 'Cine y Series',
    emoji: '🎬',
    weight: 1.0,
    description: 'Contenido relacionado con películas, series, streaming, actores y directores',
    keywords: [
        // Películas
        'película', 'pelicula', 'cine', 'estreno', 'taquilla', 'oscar',
        'actor', 'actriz', 'director', 'guión', 'escena', 'film', 'cinematográfico',
        'rodaje', 'producción', 'postproducción', 'efectos especiales', 'vfx',
        'banda sonora', 'bso', 'musical', 'remake', 'precuela', 'secuela',
        'trilogía', 'saga', 'blockbuster', 'indie', 'film noir',
        
        // ============================================================
        // 🎭 ACTORES INTERNACIONALES (ACTUALES Y CLÁSICOS)
        // ============================================================
        
        // ★ GRANDES ESTRELLAS (ACTUALES)
        'leonardo dicaprio', 'brad pitt', 'johnny depp', 'tom hanks',
        'robert de niro', 'al pacino', 'morgan freeman', 'denzel washington',
        'will smith', 'tom cruise', 'harrison ford', 'keanu reeves',
        'ryan gosling', 'chris evans', 'chris hemsworth', 'scarlett johansson',
        'jennifer lawrence', 'emma stone', 'meryl streep', 'angelina jolie',
        'julia roberts', 'sandra bullock', 'cate blanchett', 'nicole kidman',
        
        // ★ NUEVAS ESTRELLAS (GEN Z Y MILLENNIAL)
        'timothée chalamet', 'zendaya', 'tom holland', 'florence pugh',
        'anya taylor-joy', 'paul mescal', 'saoirse ronan', 'barry keoghan',
        'margot robbie', 'austin butler', 'jacob elordi', 'jenna ortega',
        'sydney sweeney', 'glen powell', 'anya chalotra', 'mike faist',
        'lucas hedges', 'kaitlyn dever', 'maya hawke', 'dylan o\'brien',
        'thomas doherty', 'madelyn cline', 'mason gooding', 'rachel zegler',
        'anthony ramos', 'ariana debose', 'kit connor', 'joe locke',
        
        // ★ ACTORES DE CINE DE ACCIÓN
        'the rock', 'dwayne johnson', 'vin diesel', 'jason statham',
        'john wick', 'keanu reeves', 'charlize theron', 'gal gadot',
        'brie larson', 'scarlett johansson', 'chris pine', 'jeremy renner',
        'idris elba', 'michael b jordan', 'ryan reynolds', 'samuel l jackson',
        'dave bautista', 'john cena', 'alan ritchson', 'sonoya mizuno',
        
        // ★ ACTORES DE CINE DE COMEDIA
        'adam sandler', 'jim carrey', 'will ferrell', 'ben stiller',
        'jack black', 'kevin hart', 'jason segel', 'jonah hill',
        'seth rogen', 'james franco', 'zach galifianakis', 'steve carell',
        'melissa mccarthy', 'tina fey', 'amy poehler', 'kristen wiig',
        'leslie jones', 'rebel wilson', 'pete davidson', 'john mulaney',
        
        // ★ ACTORES DE CINE DE TERROR
        'jamie lee curtis', 'mike myers', 'robert englund', 'doug bradley',
        'tony todd', 'bruce campbell', 'katharine isabelle', 'neve campbell',
        'daniel radcliffe', 'ethan hawke', 'patrick wilson', 'ross lynch',
        
        // ★ ACTORES DE CINE DE ROMANCE
        'jennifer aniston', 'jennifer lopez', 'matthew mcconaughey', 'hugh grant',
        'richard gere', 'tom hanks', 'meg ryan', 'kate hudson',
        'drew barrymore', 'adam sandler', 'channing tatum', 'ryan gosling',
        'rachel mcadams', 'emma watson', 'josh o\'connor', 'glen powell',
        
        // ★ ACTORES ICÓNICOS (CLÁSICOS)
        'marilyn monroe', 'audrey hepburn', 'cary grant', 'james dean',
        'humphrey bogart', 'katharine hepburn', 'alexander fleming',
        'marlon brando', 'sophia loren', 'helen mirren', 'anthony hopkins',
        'maggie smith', 'peter o\'toole', 'sean connery', 'roger moore',
        
        // ★ ACTORES DE CINE INDEPENDIENTE Y DE AUTOR
        'adrien brody', 'zac efron', 'demi moore', 'pamela anderson',
        'mikey madison', 'mark eydelshteyn', 'karren karagulian', 'michael stuhlbarg',
        'nathan fielder', 'emma stone', 'margot robbie', 'barry keoghan',
        'jacob elordi', 'cailee spaeny', 'anya taylor-joy', 'mike faist',
        
        // ============================================================
        // 🇪🇸 ACTORES Y ACTRICES ESPAÑOLES
        // ============================================================
        
        // ★ GRANDES ESTRELLAS ESPAÑOLAS
        'javier bardem', 'penélope cruz', 'antonio banderas', 'pedro almodóvar',
        'javier camara', 'carmen maura', 'victoria abril', 'ana belén',
        'miguel bosé', 'santiago segura', 'jose corona', 'silvia abascal',
        'adriana ugarte', 'maribel verdú', 'jordi mollà', 'unax ugalde',
        'blanca suárez', 'mario casas', 'natalia ortega', 'aina quiot',
        
        // ★ NUEVAS ESTRELLAS ESPAÑOLAS
        'miguel bernardeau', 'arantxa acevedo', 'peter pardo', 'anna maria vidal',
        'ivan sanchez', 'hugo silva', 'maxi iglesias', 'pablo schreiber',
        'mayra gomez', 'ana de armas', 'penélope cruz', 'javier bardem',
        'belen rueda', 'nora navas', 'candela peña', 'marta etura',
        'lara álamo', 'ana wagener', 'susana abaitua', 'miren ibarguren',
        
        // ★ ACTORES ESPAÑOLES DE COMEDIA
        'santi millán', 'dani rovira', 'jose mota', 'arturo valls',
        'jose juan', 'jesus castro', 'kike cuesta', 'leo harley',
        'david perales', 'jorge calvillo', 'jose luis gil', 'roman reyes',
        
        // ★ ACTORES ESPAÑOLES DE DRAMA
        'luis tosar', 'carlos huesca', 'barbara lennie', 'juan margallo',
        'ramón barea', 'isabel ordaz', 'jose maria yazpik', 'marta milans',
        'elena anaya', 'laura plaper', 'angela molina', 'blanca portillo',
        
        // ★ ACTORES ESPAÑOLES INTERNACIONALES
        'antonio banderas', 'javier bardem', 'penélope cruz', 'ana de armas',
        'paloma bloyd', 'jordi mollà', 'oscar jaenada', 'blanca suárez',
        'miguel ángel silvestre', 'belén rueda', 'mario casas', 'unax ugalde',
        
        // ============================================================
        // 🎬 DIRECTORES INTERNACIONALES
        // ============================================================
        
        // ★ LEYENDAS DEL CINE
        'steven spielberg', 'christopher nolan', 'quentin tarantino',
        'martin scorsese', 'alfred hitchcock', 'stanley kubrick',
        'francis ford coppola', 'james cameron', 'peter jackson',
        'george lucas', 'ridley scott', 'david fincher',
        'tim burton', 'guy ritchie', 'wes anderson', 'paul thomas anderson',
        'coen brothers', 'joel coen', 'ethan coen', 'oliver stone',
        'brian de palma', 'john carpenter', 'david cronenberg', 'john landis',
        
        // ★ DIRECTORES CONTEMPORÁNEOS (ACTIVOS)
        'christopher nolan', 'denis villeneuve', 'greta gerwig', 'bong joon-ho',
        'jordan peele', 'ari aster', 'robert eggers', 'safdie brothers',
        'ria aronofsky', 'guillermo del toro', 'alejandro gonzález iñárritu',
        'alfonso cuarón', 'chloé zhao', 'emerald fennell', 'celine sciamma',
        'ryusuke hamaguchi', 'park chan-wook', 'hiroshi kurosawa', 'wong kar-wai',
        'edgar wright', 'matthew vaughn', 'james gunn', 'ryan coogler',
        'taika waititi', 'josh safdie', 'benny safdie', 'robert eggers',
        
        // ★ DIRECTORES DE CINE DE ACCIÓN
        'michael bay', 'james cameron', 'ridley scott', 'john mctiernan',
        'john woo', 'stephen sommers', 'len wiseman', 'paul greengrass',
        'doug liman', 'john faverau', 'francis lawrence', 'neill blomkamp',
        
        // ★ DIRECTORES DE CINE DE COMEDIA
        'judd apatow', 'adam mckay', 'seth rogen', 'evan goldberg',
        'south park', 'trey parker', 'matt stone', 'jason reitman',
        'adam sandler', 'peter segal', 'denis dugan', 'mark hoskins',
        
        // ★ DIRECTORES DE CINE DE TERROR
        'jordan peele', 'ari aster', 'robert eggers', 'james wan',
        'mike flanagan', 'john carpenters', 'david cronenberg', 'james gunn',
        'scott derrickson', 'andrés muschietti', 'ti west', 'alex garland',
        
        // ★ DIRECTORAS DE CINE
        'greta gerwig', 'chloé zhao', 'emerald fennell', 'celine sciamma',
        'ava duvernay', 'patty jenkins', 'kathryn bigelow', 'sophia coppola',
        'lana wachowski', 'lilly wachowski', 'nora ephron', 'penny marshall',
        'amelia martínez', 'marta alvarado', 'tati huesen', 'claudia llosa',
        
        // ============================================================
        // 🇪🇸 DIRECTORES ESPAÑOLES
        // ============================================================
        
        // ★ GRANDES DIRECTORES ESPAÑOLES
        'pedro almodóvar', 'luis buñuel', 'julio medem', 'fernando trueba',
        'borja cobo', 'gracia querejeta', 'isabel coixet', 'carlos saura',
        'víctor erice', 'josé luis garci', 'fernando león de aranoa',
        'juan antonio bayona', 'james franco', 'pablo agüero', 'rodrigo sorogoyen',
        
        // ★ NUEVOS DIRECTORES ESPAÑOLES
        'carlos marques-marcet', 'aitor arregi', 'jon garaño', 'josé maría goenaga',
        'carla simón', 'arantxa echevarría', 'manuela muro', 'nuria gago',
        'dani de la ordeña', 'paco león', 'mikele laboa', 'jorge fernández',
        
        // ★ DIRECTORES DE CINE ESPAÑOL CONTEMPORÁNEO
        'javier fesser', 'alex de la iglesia', 'santiago segura', 'jose luis cues',
        'daniel arroyo', 'david traves', 'pilar palomero', 'maría jose rivas',
        
        // ============================================================
        // 📺 PLATAFORMAS Y SERVICIOS
        // ============================================================
        'netflix', 'prime video', 'hbo', 'disney plus', 'streaming', 'marvel',
        'dc comics', 'star wars', 'harry potter', 'señor de los anillos',
        'playstation', 'xbox', 'videojuego', 'película animada', 'pixar',
        'dreamworks', 'studio ghibli', 'hayao miyazaki', 'stop motion',
        'filmin', 'movistar plus', 'sky', 'apple tv', 'mubi', 'criterion',
        'youtube', 'vimeo', 'tiktok', 'instagram', 'twitch', 'kick',
        
        // ============================================================
        // 📺 SERIES (INTERNACIONALES Y ESPAÑOLAS)
        // ============================================================
        
        // ★ SERIES INTERNACIONALES
        'serie', 'capítulo', 'temporada', 'episodio', 'binge', 'maratón',
        'breaking bad', 'game of thrones', 'friends', 'the office',
        'stranger things', 'the walking dead', 'squid game', 'loki',
        'suits', 'bridgerton', 'the crown', 'the witcher', 'the last of us',
        'our flag means death', 'succession', 'house of the dragon', 'euphoria',
        
        // ★ SERIES ESPAÑOLAS
        'la casa de papel', 'elite', 'vis a vis', 'merlí', 'cable girls',
        'la casa de las flores', 'club de cuervos', 'monarca', 'quién mató a sara?',
        'el marginal', 'la reina del flow', 'súper cerdas', 'los simpson',
        'south park', 'family guy', 'american dad', 'rick and morty',
        'the simpsons', 'futurama', 'bojack horseman', 'archer',
        'ana y los 7', 'aguila roja', 'el internado', 'los hombres de paco',
        'el barco', 'el cielo', 'las chicas del cable', 'la casa de papel',
        'elite', 'vis a vis', 'merlí', 'la reina del flow',
        
        // ============================================================
        // 🎭 GÉNEROS Y ESTILOS
        // ============================================================
        'acción', 'comedia', 'drama', 'terror', 'suspenso', 'romance',
        'ciencia ficción', 'fantasía', 'animación', 'documental',
        'aventura', 'thriller', 'misterio', 'musical', 'western',
        'crimen', 'guerra', 'histórico', 'biografía', 'deportes',
        'neonoir', 'cyberpunk', 'steampunk', 'postapocalíptico', 'distopía',
        'psicólogico', 'experimental', 'slasher', 'found footage', 'mocumentary',
        'coming of age', 'road movie', 'buddy comedy', 'bromance', 'vampire',
        'zombie', 'apocalíptico', 'del oeste', 'de época', 'romántico',
        'comedia romántica', 'drama musical', 'bailar', 'cultura pop',
        
        // ============================================================
        // 🏆 PREMIOS Y FESTIVALES
        // ============================================================
        'oscar', 'golden globe', 'emmy', 'festival', 'cannes',
        'goya', 'berlinale', 'venecia', 'sundance', 'bafta',
        'tribeca', 'sxsw', 'toronto', 'san sebastián', 'malaga',
        'sag', 'globo de oro', 'premio de la crítica', 'saturno',
        'premio del público', 'mejor actor', 'mejor actriz', 'mejor película',
        'mejor director', 'mejor guión', 'mejor fotografía', 'mejor montaje',
        
        // ============================================================
        // 🎬 ACTIVIDADES Y TÉRMINOS RELACIONADOS
        // ============================================================
        'cine en casa', 'ver película', 'series recomendadas', 'crítica',
        'reseña', 'review', 'temporada nueva', 'estreno', 'premiere',
        'maratón de series', 'película favorita', 'recomendar película',
        'cine de autor', 'película de culto', 'maratón', 'movie night',
        'cinefobia', 'cinéfilo', 'cineclub', 'cineforum', 'discusión de cine',
        'análisis cinematográfico', 'videoensayo', 'cine de terror', 'película de miedo',
        
        // ============================================================
        // 🇪🇸 CINE ESPAÑOL
        // ============================================================
        'cine español', 'película española', 'serie española',
        'actores españoles', 'director español', 'film español',
        'cortometraje', 'largometraje', 'documental español',
        'animación española', 'cine independiente', 'cine de autor',
        'cine de terror español', 'comedia española', 'drama español',
        'cine de género español', 'nuevo cine español', 'juventud española',
        
        // ============================================================
        // 🎵 BANDAS SONORAS Y MÚSICA DE CINE
        // ============================================================
        'banda sonora', 'bso', 'música de cine', 'compositor', 'partitura',
        'john williams', 'hans zimmer', 'enio morricone', 'danny elfman',
        'james horner', 'howard shore', 'trent reznor', 'atticus ross',
        'alberto iglesias', 'carlos nuñez', 'juan carlos lara', 'cristóbal de corral',
        'música de serie', 'canción de película', 'soundtrack', 'score'
    ],
    aliases: ['peliculas', 'series', 'cine', 'streaming', 'actores', 'directores', 'netflix', 'hbo']
};