const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './media/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper to get session socket
const getSocket = async (req, sessionId) => {
    const session = await req.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
        throw new Error('Session not found or not connected');
    }
    return session.socket;
};

// Send Text Message
router.post('/send-text', async (req, res) => {
    const { sessionId, chatId, text, quotedMessageId } = req.body;

    // Validate required parameters
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required' });
    }
    if (!chatId) {
        return res.status(400).json({ success: false, error: 'Chat ID is required' });
    }
    if (!text) {
        return res.status(400).json({ success: false, error: 'Message text is required' });
    }

    const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

    try {
        const socket = await getSocket(req, sessionId);

        const messageOptions = {};

        // Add quoted message if provided
        if (quotedMessageId) {
            messageOptions.quoted = {
                key: {
                    remoteJid: jid,
                    id: quotedMessageId,
                    fromMe: false
                }
            };
        }

        const result = await socket.sendMessage(jid, { text }, messageOptions);

        // Emit for real-time UI update
        req.io.emit('outgoing:message', {
            session_id: sessionId,
            recipient: jid,
            message_type: 'text',
            content: text,
            message_id: result?.key?.id,
            api_endpoint: '/api/messages/send-text',
            api_status: 200,
            status: 'sent',
            created_at: new Date().toISOString()
        });

        res.json({ success: true, message: 'Message sent', messageId: result?.key?.id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send Image
router.post('/send-image', upload.single('image'), async (req, res) => {
    try {
        const { sessionId, chatId, caption } = req.body;

        if (!sessionId || !chatId) {
            return res.status(400).json({ success: false, message: 'sessionId and chatId required' });
        }

        const session = await req.sessionManager.getSession(sessionId);
        if (!session || !session.socket) {
            return res.status(404).json({ success: false, message: 'Session not found or not connected' });
        }

        let imageSource;

        // Check if file was uploaded
        if (req.file) {
            imageSource = { url: req.file.path };
        }
        // Check if base64 image provided
        else if (req.body.image) {
            // Support both data URL and raw base64
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageSource = Buffer.from(base64Data, 'base64');
        }
        // Check if URL provided (Baileys native support)
        else if (req.body.imageUrl) {
            imageSource = { url: req.body.imageUrl };
        } else {
            return res.status(400).json({ success: false, message: 'No image provided (file, base64, or imageUrl)' });
        }

        const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

        const result = await session.socket.sendMessage(jid, {
            image: imageSource,
            caption: caption || ''
        });

        // Cleanup file after sending if it was an uploaded file
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({ success: true, message: 'Image sent', messageId: result?.key?.id });
    } catch (err) {
        // Ensure uploaded file is cleaned up even on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        req.logger.error('Error sending image:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Send Document
router.post('/send-document', upload.single('document'), async (req, res) => {
    try {
        const { sessionId, chatId, filename, mimetype, caption } = req.body;

        if (!sessionId || !chatId) {
            return res.status(400).json({ success: false, message: 'sessionId and chatId required' });
        }

        const session = await req.sessionManager.getSession(sessionId);
        if (!session || !session.socket) {
            return res.status(404).json({ success: false, message: 'Session not found or not connected' });
        }

        let documentSource;
        let docFilename;
        let docMimetype;

        // Check if file was uploaded
        if (req.file) {
            documentSource = fs.readFileSync(req.file.path); // Read file from disk into buffer
            docFilename = req.file.originalname;
            docMimetype = req.file.mimetype;
        }
        // Check if base64 document provided
        else if (req.body.document) {
            // Support data URL or raw base64
            const base64Data = req.body.document.replace(/^data:.+;base64,/, '');
            documentSource = Buffer.from(base64Data, 'base64');
            docFilename = filename || 'document.pdf'; // Use provided filename or default
            docMimetype = mimetype || 'application/pdf'; // Use provided mimetype or default
        }
        // Check if URL provided (Baileys native support)
        else if (req.body.documentUrl) {
            documentSource = { url: req.body.documentUrl };
            docFilename = filename || 'document.pdf';
            docMimetype = mimetype || 'application/pdf';
        } else {
            return res.status(400).json({ success: false, message: 'No document provided (file, base64, or documentUrl)' });
        }

        const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

        const messageContent = {
            document: documentSource,
            mimetype: docMimetype,
            fileName: docFilename
        };

        // Add caption if provided
        if (caption) {
            messageContent.caption = caption;
        }

        const result = await session.socket.sendMessage(jid, messageContent);

        // Cleanup uploaded file from disk if it was a file upload
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({ success: true, message: 'Document sent', messageId: result?.key?.id });
    } catch (err) {
        // Ensure uploaded file is cleaned up even on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        req.logger.error('Error sending document:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Send Location
router.post('/send-location', async (req, res) => {
    const { sessionId, chatId, latitude, longitude, address } = req.body;

    try {
        const socket = await getSocket(req, sessionId);
        const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

        await socket.sendMessage(jid, {
            location: { degreesLatitude: latitude, degreesLongitude: longitude, address: address }
        });
        res.json({ success: true, message: 'Location sent' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start Typing Indicator
router.post('/typing/start', async (req, res) => {
    const { sessionId, chatId } = req.body;

    try {
        const socket = await getSocket(req, sessionId);
        const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

        await socket.sendPresenceUpdate('composing', jid);
        res.json({ success: true, message: 'Typing indicator started' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Stop Typing Indicator
router.post('/typing/stop', async (req, res) => {
    const { sessionId, chatId } = req.body;

    try {
        const socket = await getSocket(req, sessionId);
        const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

        await socket.sendPresenceUpdate('paused', jid);
        res.json({ success: true, message: 'Typing indicator stopped' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Message Status (check if sent/delivered/read)
router.get('/status/:messageId', async (req, res) => {
    const { messageId } = req.params;

    try {
        if (!messageId) {
            return res.status(400).json({ success: false, message: 'messageId is required' });
        }

        // Database query removed. Status not available.
        return res.status(404).json({
            success: false,
            message: 'Status tracking is not available without database',
            messageId: messageId
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
