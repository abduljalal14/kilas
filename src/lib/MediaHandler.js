const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Lazy-loaded baileys function
let downloadMediaMessage;

class MediaHandler {
    constructor(logger) {
        this.logger = logger || pino({ level: 'info' });
        this.mediaDir = process.env.MEDIA_DIR || './media';

        if (!fs.existsSync(this.mediaDir)) {
            fs.mkdirSync(this.mediaDir, { recursive: true });
        }
    }

    async saveMedia(message) {
        // Lazy load baileys on first use
        if (!downloadMediaMessage) {
            const baileys = await import('@whiskeysockets/baileys');
            downloadMediaMessage = baileys.downloadMediaMessage;
        }

        if (!message) return null;

        // Check if message has media
        if (!message.message || typeof message.message !== 'object') {
            return null; // Skip messages without content (e.g., protocol messages, deleted messages)
        }

        const messageType = Object.keys(message.message)[0];
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

        if (!mediaTypes.includes(messageType)) {
            return null;
        }

        try {
            // download stream
            const buffer = await downloadMediaMessage(
                message,
                'buffer',
                {},
                {
                    logger: this.logger,
                    reuploadRequest: message.update
                }
            );

            // generate filename
            const ext = this.getExtension(messageType, message.message[messageType].mimetype);
            const filename = `${message.key.id}.${ext}`;
            const fileDir = path.join(this.mediaDir, new Date().toISOString().split('T')[0]); // Organize by date

            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }

            const filePath = path.join(fileDir, filename);
            fs.writeFileSync(filePath, buffer);

            return filePath;
        } catch (err) {
            this.logger.error('Failed to download media', err);
            return null;
        }
    }

    getExtension(type, mimetype) {
        if (mimetype) {
            const ext = mimetype.split('/')[1].split(';')[0];
            if (ext) return ext;
        }

        switch (type) {
            case 'imageMessage': return 'jpg';
            case 'videoMessage': return 'mp4';
            case 'audioMessage': return 'mp3';
            case 'documentMessage': return 'bin'; // default
            case 'stickerMessage': return 'webp';
            default: return 'bin';
        }
    }
}

module.exports = MediaHandler;
