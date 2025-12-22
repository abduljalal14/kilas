const express = require('express');
const router = express.Router();

const getSocket = async (req, sessionId) => {
    const session = await req.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
        throw new Error('Session not found or not connected');
    }
    return session.socket;
};

// Post Text Status
router.post('/post/text', async (req, res) => {
    const { sessionId, text, backgroundColor, font } = req.body;
    try {
        const socket = await getSocket(req, sessionId);
        await socket.sendMessage('status@broadcast', {
            text,
            backgroundArgb: backgroundColor || 0xffffffff,
            font: font || 1
        });
        res.json({ success: true, message: 'Status posted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
