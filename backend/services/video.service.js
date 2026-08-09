// backend/services/video.service.js - VERSIÓN CORREGIDA

const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const util = require('util');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');

const execPromise = util.promisify(exec);

class VideoService {
    constructor() {
        // 🔥 FFMPEG QUE FUNCIONA
        this.ffmpegPath = 'C:\\Users\\alanl\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe';
        
        this.GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';
        
        // 🔥 TIMEOUT AUMENTADO A 10 MINUTOS (600000ms)
        this.TRANSCRIPTION_TIMEOUT = parseInt(process.env.TRANSCRIPTION_TIMEOUT) || 600000;
        
        // 🔥 DIRECTORIO SIN ESPACIOS
        this.tempDir = 'C:\\temp_vyn';
        fs.ensureDirSync(this.tempDir);
        
        console.log(`🔧 FFmpeg: ${this.ffmpegPath}`);
        console.log(`📡 Gateway: ${this.GATEWAY_URL}`);
        console.log(`⏱️ Timeout: ${this.TRANSCRIPTION_TIMEOUT}ms (${this.TRANSCRIPTION_TIMEOUT/60000} minutos)`);
        console.log(`📁 Temp: ${this.tempDir}`);
    }

    async extractAudio(videoPath) {
        try {
            const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
            console.log(`🎬 Extrayendo audio...`);
            
            const command = `"${this.ffmpegPath}" -i "${videoPath}" -q:a 0 -map a "${audioPath}" -y`;
            await execPromise(command);
            
            if (!await fs.pathExists(audioPath)) {
                throw new Error('No se pudo extraer el audio');
            }
            
            console.log(`✅ Audio extraído`);
            return audioPath;
        } catch (error) {
            console.error('❌ Error extrayendo audio:', error);
            throw error;
        }
    }

    async transcribeAudio(audioPath) {
        try {
            console.log(`🎙️ Transcribiendo audio...`);
            console.log(`⏱️ Timeout: ${this.TRANSCRIPTION_TIMEOUT}ms`);

            const formData = new FormData();
            formData.append('audio', fs.createReadStream(audioPath), {
                filename: path.basename(audioPath),
                contentType: 'audio/mpeg'
            });

            // 🔥 USAR EL ENDPOINT CORRECTO DEL GATEWAY
            const response = await axios({
                method: 'POST',
                url: `${this.GATEWAY_URL}/api/transcribe`,
                data: formData,
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json',
                    'Connection': 'keep-alive'
                },
                timeout: this.TRANSCRIPTION_TIMEOUT,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                transitional: {
                    silentJSONParsing: true,
                    forcedJSONParsing: true,
                    clarifyTimeoutError: true
                }
            });

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Error en transcripción');
            }

            console.log(`✅ Transcripción completada`);
            console.log(`📝 Texto: ${response.data.text?.substring(0, 100)}...`);
            console.log(`🌐 Idioma: ${response.data.language || 'es'}`);
            
            return {
                success: true,
                text: response.data.text || '',
                segments: response.data.segments || [],
                confidence: response.data.confidence || 0,
                language: response.data.language || 'es'
            };

        } catch (error) {
            console.error('❌ Error en transcripción:', error.message);
            
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Timeout de ${this.TRANSCRIPTION_TIMEOUT/60000} minutos excedido. El audio es muy largo o el modelo está tardando demasiado.`);
            }
            
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`No se pudo conectar al Gateway en ${this.GATEWAY_URL}. Asegúrate de que el Gateway esté corriendo.`);
            }
            
            throw error;
        }
    }

    generateSRT(text, segments = []) {
        if (!text) return '';

        if (segments && segments.length > 0) {
            let srt = '';
            segments.forEach((seg, index) => {
                const start = this.formatTime(seg.start || 0);
                const end = this.formatTime(seg.end || (seg.start || 0) + 2);
                srt += `${index + 1}\n${start} --> ${end}\n${seg.text || ''}\n\n`;
            });
            return srt;
        }

        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let srt = '';
        let timeOffset = 0;
        sentences.forEach((sentence, index) => {
            const duration = Math.min(sentence.length / 3, 8);
            const start = this.formatTime(timeOffset);
            const end = this.formatTime(timeOffset + duration);
            srt += `${index + 1}\n${start} --> ${end}\n${sentence.trim()}\n\n`;
            timeOffset += duration + 0.5;
        });
        return srt;
    }

    formatTime(seconds) {
        const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const s = String(Math.floor(seconds % 60)).padStart(2, '0');
        const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0');
        return `${h}:${m}:${s},${ms}`;
    }

    /**
     * 🔥 ESTILO TIKTOK MEJORADO - CON AJUSTE DE TEXTO Y MÁRGENES
     */
    srtToAss(srtContent) {
        const lines = srtContent.split('\n');
        let ass = '[Script Info]\n';
        ass += 'ScriptType: v4.00+\n';
        ass += 'PlayResX: 1280\n';
        ass += 'PlayResY: 720\n';
        ass += 'ScaledBorderAndShadow: yes\n';
        ass += 'WrapStyle: 2\n\n';
        
        ass += '[V4+ Styles]\n';
        ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
        ass += 'Style: TikTok,Arial,44,&H00FFFFFF,&H00000000,&H00000000,&H00AA0000,-1,0,0,0,100,100,0,0,3,3,0,2,40,40,30,1\n\n';
        
        ass += '[Events]\n';
        ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
        
        let i = 0;
        while (i < lines.length) {
            if (lines[i].trim() === '') { i++; continue; }
            
            if (lines[i].match(/^\d+$/)) {
                i++;
                if (i < lines.length && lines[i].includes('-->')) {
                    const [start, end] = lines[i].split('-->').map(t => t.trim());
                    const startAss = this.srtTimeToAss(start);
                    const endAss = this.srtTimeToAss(end);
                    i++;
                    
                    let text = '';
                    while (i < lines.length && lines[i].trim() !== '') {
                        if (text) text += '\\N';
                        text += lines[i].trim();
                        i++;
                    }
                    
                    if (text) {
                        text = text.replace(/\\/g, '\\\\');
                        text = text.replace(/{/g, '\\{');
                        text = text.replace(/}/g, '\\}');
                        text = text.replace(/,/g, '\\,');
                        text = text.replace(/;/g, '\\;');
                        
                        if (text.length > 50) {
                            const words = text.split(' ');
                            let textLines = [];
                            let currentLine = '';
                            for (const word of words) {
                                if ((currentLine + ' ' + word).length > 50) {
                                    textLines.push(currentLine);
                                    currentLine = word;
                                } else {
                                    currentLine = currentLine ? currentLine + ' ' + word : word;
                                }
                            }
                            if (currentLine) textLines.push(currentLine);
                            text = textLines.join('\\N');
                        }
                        
                        ass += `Dialogue: 0,${startAss},${endAss},TikTok,,0,0,0,,${text}\n`;
                    }
                }
            } else {
                i++;
            }
        }
        return ass;
    }

    srtTimeToAss(srtTime) {
        const [time, ms] = srtTime.split(',');
        const [h, m, s] = time.split(':');
        return `${parseInt(h)}:${m}:${s}.${String(Math.round(parseInt(ms) / 10)).padStart(2, '0')}`;
    }

    /**
     * 🔥 AGREGAR SUBTÍTULOS ESTILO TIKTOK
     */
    async addSubtitles(videoPath, srtContent) {
        try {
            const outputPath = path.join(this.tempDir, `subtitled_${Date.now()}_${path.basename(videoPath)}`);
            console.log(`📝 Agregando subtítulos estilo TikTok...`);

            const workDir = this.tempDir;
            const videoName = 'video.mp4';
            const assName = 'subs.ass';
            const outputName = 'output.mp4';
            
            const videoWorkPath = path.join(workDir, videoName);
            const assWorkPath = path.join(workDir, assName);
            const outputWorkPath = path.join(workDir, outputName);

            await fs.copy(videoPath, videoWorkPath);
            
            const assContent = this.srtToAss(srtContent);
            await fs.writeFile(assWorkPath, assContent, 'utf8');
            console.log(`✅ ASS generado`);

            const originalCwd = process.cwd();
            process.chdir(workDir);
            
            try {
                const command = `"${this.ffmpegPath}" -i "${videoName}" -vf "ass=${assName}" -c:a copy "${outputName}" -y`;
                console.log(`🔄 Ejecutando: ${command}`);
                
                await execPromise(command, {
                    maxBuffer: 1024 * 1024 * 10,
                    windowsHide: true,
                    cwd: workDir
                });
                
            } finally {
                process.chdir(originalCwd);
            }

            if (!await fs.pathExists(outputWorkPath)) {
                throw new Error('No se generó el video');
            }

            await fs.copy(outputWorkPath, outputPath);
            
            await fs.remove(videoWorkPath).catch(() => {});
            await fs.remove(assWorkPath).catch(() => {});
            await fs.remove(outputWorkPath).catch(() => {});

            console.log(`✅ Video con subtítulos TikTok generado`);
            return outputPath;

        } catch (error) {
            console.error('❌ Error agregando subtítulos:', error);
            throw error;
        }
    }

    async processVideoWithSubtitles(videoPath) {
        let audioPath = null;
        let srtPath = null;
        let result = { 
            success: false, 
            error: null, 
            videoPath: null, 
            subtitles: null, 
            segments: null, 
            text: null,
            language: 'es'
        };

        try {
            console.log('🎬 PROCESANDO VIDEO CON SUBTÍTULOS TIKTOK');
            console.log(`📁 Video: ${videoPath}`);
            console.log(`⏱️ Timeout configurado: ${this.TRANSCRIPTION_TIMEOUT/60000} minutos`);

            if (!await fs.pathExists(videoPath)) {
                throw new Error(`Video no encontrado: ${videoPath}`);
            }

            // 1. Extraer audio
            audioPath = await this.extractAudio(videoPath);
            
            // 2. Transcribir
            const transcription = await this.transcribeAudio(audioPath);
            
            console.log(`📝 Texto: ${transcription.text.substring(0, 100)}...`);
            console.log(`🌐 Idioma detectado: ${transcription.language || 'es'}`);

            // 3. Generar SRT
            const srtContent = this.generateSRT(transcription.text, transcription.segments);
            srtPath = path.join(this.tempDir, `subtitles_${Date.now()}.srt`);
            await fs.writeFile(srtPath, srtContent, 'utf8');

            // 4. Agregar subtítulos
            const outputPath = await this.addSubtitles(videoPath, srtContent);

            result.success = true;
            result.videoPath = outputPath;
            result.subtitles = transcription.text;
            result.segments = transcription.segments || [];
            result.text = transcription.text;
            result.language = transcription.language || 'es';

            console.log('✅ VIDEO PROCESADO CON SUBTÍTULOS TIKTOK');
            console.log(`🌐 Idioma final: ${result.language}`);

        } catch (error) {
            console.error('❌ Error:', error);
            result.error = error.message;
        } finally {
            try {
                if (audioPath && await fs.pathExists(audioPath)) await fs.remove(audioPath);
                if (srtPath && await fs.pathExists(srtPath)) await fs.remove(srtPath);
            } catch (e) {}
        }

        return result;
    }

    async checkGatewayHealth() {
        try {
            const response = await axios.get(`${this.GATEWAY_URL}/health`, { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    async cleanupOldFiles(maxAge = 3600000) {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            let count = 0;
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    await fs.remove(filePath);
                    count++;
                }
            }
            if (count > 0) console.log(`🧹 ${count} archivos eliminados`);
        } catch (error) {
            console.warn('⚠️ Error limpiando:', error.message);
        }
    }
}

module.exports = new VideoService();