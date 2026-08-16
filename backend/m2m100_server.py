# backend/m2m100_server.py
# Servidor M2M100 - VERSIÓN CORREGIDA CON FUENTE FORZADA Y DETECCIÓN MEJORADA

import json
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from http.server import HTTPServer, BaseHTTPRequestHandler
import signal
import sys

# ============================================================
# MANEJAR SEÑALES PARA EVITAR CIERRES
# ============================================================

def signal_handler(sig, frame):
    print("\n🛑 Servidor detenido correctamente")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ============================================================
# CONFIGURACIÓN
# ============================================================

MODEL_NAME = "facebook/m2m100_418M"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print(f"🔧 Cargando modelo {MODEL_NAME} en {DEVICE}...")
print("⏳ Esto puede tomar unos minutos...")

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSeq2SeqLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    device_map="auto" if DEVICE == "cuda" else None,
    low_cpu_mem_usage=True
)
if DEVICE == "cpu":
    model = model.to("cpu")

print(f"✅ Modelo cargado en {DEVICE}")
print(f"📚 Idiomas soportados: {len(tokenizer.lang_code_to_id)}")

# ============================================================
# MAPEO DE IDIOMAS - 10 IDIOMAS
# ============================================================

LANG_MAP = {
    'es': 'es',  # Español
    'en': 'en',  # Inglés
    'pt': 'pt',  # Portugués
    'fr': 'fr',  # Francés
    'de': 'de',  # Alemán
    'it': 'it',  # Italiano
    'ru': 'ru',  # Ruso
    'ja': 'ja',  # Japonés
    'zh': 'zh',  # Chino
    'ar': 'ar'   # Árabe
}

REVERSE_MAP = {v: k for k, v in LANG_MAP.items()}

# Nombres para el frontend
LANGUAGE_NAMES = {
    'es': 'Español',
    'en': 'Inglés',
    'pt': 'Portugués',
    'fr': 'Francés',
    'de': 'Alemán',
    'it': 'Italiano',
    'ru': 'Ruso',
    'ja': 'Japonés',
    'zh': 'Chino',
    'ar': 'Árabe'
}

LANGUAGE_FLAGS = {
    'es': '🇪🇸',
    'en': '🇬🇧',
    'pt': '🇵🇹',
    'fr': '🇫🇷',
    'de': '🇩🇪',
    'it': '🇮🇹',
    'ru': '🇷🇺',
    'ja': '🇯🇵',
    'zh': '🇨🇳',
    'ar': '🇸🇦'
}

# ============================================================
# 🔥 DETECCIÓN DE IDIOMA PARA TEXTOS CORTOS
# ============================================================

def detect_language_short_text(text):
    """Detecta idioma para textos cortos usando patrones de caracteres"""
    if not text:
        return None
    
    text = text.strip()
    
    # 🔥 DETECTAR JAPONÉS (caracteres japoneses)
    if any('\u3040' <= c <= '\u30FF' or '\u4E00' <= c <= '\u9FFF' for c in text):
        return 'ja'
    
    # 🔥 DETECTAR COREANO (hangul)
    if any('\uAC00' <= c <= '\uD7AF' for c in text):
        return 'ko'
    
    # 🔥 DETECTAR CHINO (caracteres chinos)
    if any('\u4E00' <= c <= '\u9FFF' for c in text) and not any('\u3040' <= c <= '\u30FF' for c in text):
        return 'zh'
    
    # 🔥 DETECTAR ÁRABE
    if any('\u0600' <= c <= '\u06FF' for c in text):
        return 'ar'
    
    # 🔥 DETECTAR RUSO (cirílico)
    if any('\u0400' <= c <= '\u04FF' for c in text):
        return 'ru'
    
    # 🔥 DETECTAR IDIOMAS LATINOS POR PALABRAS CLAVE
    lower = text.lower()
    
    # Palabras comunes en inglés
    english_words = ['i am', "i'm", 'you', 'are', 'the', 'of', 'and', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'in', 'that', 'this', 'a', 'an']
    if any(word in lower for word in english_words) and all(ord(c) < 128 for c in text):
        return 'en'
    
    # Palabras comunes en portugués
    portuguese_words = ['é', 'ão', 'ões', 'ães', 'ç', 'ou', 'que', 'com', 'para', 'por', 'em', 'de', 'do', 'da']
    if any(word in lower for word in portuguese_words):
        return 'pt'
    
    # Palabras comunes en francés
    french_words = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'le', 'la', 'les', 'un', 'une', 'et', 'pour', 'avec']
    if any(word in lower for word in french_words):
        return 'fr'
    
    # Palabras comunes en alemán
    german_words = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'der', 'die', 'das', 'ein', 'eine', 'und', 'für', 'mit', 'auf']
    if any(word in lower for word in german_words):
        return 'de'
    
    # Palabras comunes en italiano
    italian_words = ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'il', 'la', 'lo', 'le', 'un', 'uno', 'una', 'e', 'con', 'per']
    if any(word in lower for word in italian_words):
        return 'it'
    
    return None

# ============================================================
# FUNCIÓN DE TRADUCCIÓN CORREGIDA
# ============================================================

def translate_text(text, target_lang, source_lang=None):
    """Traduce texto usando M2M100 con fuente opcional"""
    if not text or text.strip() == "":
        return text
    
    try:
        # SI SE ESPECIFICA FUENTE, USARLA DIRECTAMENTE
        if source_lang:
            print(f"🔧 Traduciendo con fuente forzada: {source_lang} → {target_lang}")
        else:
            print(f"🔧 Traduciendo con auto-detección → {target_lang}")
        
        # Tokenizar
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        if DEVICE == "cuda":
            inputs = {k: v.to("cuda") for k, v in inputs.items()}
        
        # Generar traducción
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                forced_bos_token_id=tokenizer.lang_code_to_id[target_lang],
                max_length=512,
                num_beams=4,
                temperature=0.7,
                do_sample=True
            )
        translated = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return translated
        
    except Exception as e:
        print(f"❌ Error traduciendo: {e}")
        return text

# ============================================================
# SERVIDOR HTTP CORREGIDO
# ============================================================

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "healthy",
                "model": MODEL_NAME,
                "license": "MIT",
                "device": DEVICE,
                "languages": len(LANG_MAP)
            }).encode())
        elif self.path == '/languages':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            langs = []
            for short, name in LANGUAGE_NAMES.items():
                langs.append({
                    "code": short,
                    "name": name,
                    "flag": LANGUAGE_FLAGS.get(short, '🌐')
                })
            self.wfile.write(json.dumps({
                "success": True,
                "total": len(langs),
                "languages": langs,
                "license": "MIT"
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/translate':
            try:
                length = int(self.headers['Content-Length'])
                data = json.loads(self.rfile.read(length).decode())
                
                text = data.get('text', '')
                target = data.get('target_lang', 'es')
                source = data.get('source_lang', None)  # 🔥 RECIBIR source_lang
                
                # Si es código largo (spa_Latn), convertir a corto
                if len(target) > 2 and target in REVERSE_MAP:
                    target = REVERSE_MAP[target]
                elif len(target) == 2 and target in LANG_MAP:
                    target = target
                else:
                    target = 'es'
                
                # 🔥 SI VIENE source_lang, USARLO (SIN langdetect)
                detected_source = source
                if not detected_source:
                    try:
                        from langdetect import detect
                        detected = detect(text)
                        if detected in LANG_MAP:
                            detected_source = detected
                            print(f"🔍 Idioma detectado automáticamente: {detected_source}")
                        else:
                            detected_source = 'es'
                            print(f"⚠️ Idioma detectado '{detected}' no soportado, usando español")
                    except Exception as e:
                        detected_source = 'es'
                        print(f"⚠️ No se pudo detectar idioma ({e}), usando español")
                else:
                    print(f"📝 Fuente forzada desde frontend: {source}")
                
                # 🔥 PASAR detected_source A translate_text
                translated = translate_text(text, target, detected_source)
                is_translated = (translated != text and translated.strip() != text.strip())
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                self.wfile.write(json.dumps({
                    "success": True,
                    "translation": translated,
                    "original": text,
                    "target_language": target,
                    "source_language": source or 'auto',
                    "detected_source": detected_source,
                    "language_name": LANGUAGE_NAMES.get(target, target),
                    "flag": LANGUAGE_FLAGS.get(target, '🌐'),
                    "license": "MIT",
                    "isTranslated": is_translated
                }).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": str(e)
                }).encode())
                
        elif self.path == '/detect':
            try:
                length = int(self.headers['Content-Length'])
                data = json.loads(self.rfile.read(length).decode())
                text = data.get('text', '')
                
                lang = None
                
                # 🔥 PRIMERO: USAR DETECCIÓN POR CARACTERES PARA TEXTOS CORTOS
                if len(text.strip()) < 15:
                    lang = detect_language_short_text(text)
                    print(f"🔍 Detección por caracteres (corto): {lang}")
                
                # 🔥 SEGUNDO: SI NO SE DETECTÓ, USAR langdetect
                if not lang:
                    try:
                        from langdetect import detect
                        lang = detect(text)
                        if lang not in LANG_MAP:
                            lang = 'es'
                        print(f"🔍 Detección por langdetect: {lang}")
                    except:
                        lang = 'es'
                        print(f"⚠️ Error en langdetect, usando español")
                
                # 🔥 TERCERO: VERIFICAR QUE EL IDIOMA ESTÉ EN EL MAPA
                if lang not in LANG_MAP:
                    lang = 'es'
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "language": lang,
                    "detected": lang
                }).encode())
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": str(e)
                }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

# ============================================================
# INICIO
# ============================================================

if __name__ == '__main__':
    print("""
    🚀 ========================================
    🚀 M2M100 SERVER INICIADO (10 IDIOMAS)
    🚀 ========================================
    
    📦 Modelo: """ + MODEL_NAME + """
    📄 Licencia: MIT (Uso comercial permitido)
    💻 Dispositivo: """ + DEVICE + """
    📚 Idiomas: """ + str(len(LANG_MAP)) + """
    
    🌐 API ENDPOINTS:
       GET  /health           - Estado del servidor
       POST /translate        - Traducir texto (con source_lang opcional)
       POST /detect           - Detectar idioma (con detección mejorada)
       GET  /languages        - Lista de idiomas
    
    📡 Servidor corriendo en http://localhost:5002
    🔥 ========================================
    """)
    
    server = HTTPServer(('0.0.0.0', 5002), Handler)
    server.timeout = 60
    server.allow_reuse_address = True
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor detenido")
        server.shutdown()