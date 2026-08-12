// backend/fix-messages.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function safeDecryptMessage(encryptedContent) {
    if (!encryptedContent) return null;
    if (typeof encryptedContent !== 'string') return null;
    if (!encryptedContent.startsWith('U2FsdGVkX1')) return encryptedContent;
    return null;
}

function fixMessages() {
    try {
        console.log('🔧 Reparando mensajes...');
        
        if (!fs.existsSync(MESSAGES_FILE)) {
            console.log('📄 No se encontró messages.json');
            return;
        }
        
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        let messages = JSON.parse(data);
        let fixedCount = 0;
        let removedCount = 0;
        
        const fixedMessages = messages.map(msg => {
            // Verificar si el mensaje está cifrado y es válido
            if (msg.encrypted && msg.content) {
                // Si parece cifrado pero no es válido UTF-8, marcarlo como no cifrado
                try {
                    const test = Buffer.from(msg.content, 'utf8');
                    // Si no se puede decodificar, limpiar
                    if (test.toString('utf8').includes('�')) {
                        msg.content = '[Mensaje corrupto]';
                        msg.encrypted = false;
                        fixedCount++;
                    }
                } catch (e) {
                    msg.content = '[Mensaje corrupto]';
                    msg.encrypted = false;
                    fixedCount++;
                }
            }
            return msg;
        }).filter(msg => {
            // Eliminar mensajes completamente vacíos
            if (!msg.content || msg.content.trim() === '') {
                removedCount++;
                return false;
            }
            return true;
        });
        
        // Guardar cambios
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(fixedMessages, null, 2));
        
        console.log(`✅ Mensajes reparados: ${fixedCount}`);
        console.log(`🗑️ Mensajes eliminados: ${removedCount}`);
        console.log(`📊 Total de mensajes: ${fixedMessages.length}`);
        console.log('✅ Reparación completada');
        
    } catch (error) {
        console.error('❌ Error reparando mensajes:', error);
    }
}

// Ejecutar
fixMessages();