// backend/services/recommendation/languages/index.js
const es = require('./es');
const en = require('./en');
const pt = require('./pt');
const fr = require('./fr');
const de = require('./de');
const it = require('./it');
const asian = require('./asian');
const eastern = require('./eastern');

// Mapeo de códigos de idioma a configuraciones
const languageConfigs = {
    // Latinos
    'spa': es,
    'eng': en,
    'por': pt,
    'fra': fr,
    'deu': de,
    'ita': it,
    
    // Asiáticos (desde asian.js)
    'cmn': asian.cmn,
    'jpn': asian.jpn,
    'kor': asian.kor,
    'vie': asian.vie,
    'tha': asian.tha,
    
    // Del Este (desde eastern.js)
    'rus': eastern.rus,
    'ara': eastern.ara,
    'hin': eastern.hin,
    'tur': eastern.tur,
};

// Mapeo de códigos franc a códigos de idioma
const francToLang = {
    'spa': 'spa',
    'eng': 'eng',
    'por': 'por',
    'fra': 'fra',
    'deu': 'deu',
    'ita': 'ita',
    'cmn': 'cmn',
    'jpn': 'jpn',
    'kor': 'kor',
    'vie': 'vie',
    'tha': 'tha',
    'rus': 'rus',
    'ara': 'ara',
    'hin': 'hin',
    'tur': 'tur',
};

module.exports = {
    languageConfigs,
    francToLang,
    getLanguageConfig: (langCode) => {
        return languageConfigs[langCode] || languageConfigs['spa'];
    },
    getFrancCode: (langCode) => {
        return francToLang[langCode] || 'spa';
    }
};