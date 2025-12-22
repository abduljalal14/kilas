const express = require('express');
const router = express.Router();

const getSocket = async (req, sessionId) => {
    const session = await req.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
        throw new Error('Session not found or not connected');
    }
    return session.socket;
};

// Get All Contacts
router.get('/:sessionId', async (req, res) => {
    try {
        const socket = await getSocket(req, req.params.sessionId);
        // Baileys doesn't have a direct "getAllContacts" that returns everything nicely formatted always
        // But we can check store if we had one, or just return what's in memory/state
        // For now, let's try to get from internal store if available or just return empty with message
        // A simple way is to fetch from current state if using store, but we haven't implemented store yet.
        // We will return a placeholder or try to fetch from socket event cache if possible.

        // Actually, Baileys standard way is to sync contacts on connect. 
        // We'll just return success for now as placeholder for future enhancement
        res.json({ success: true, message: 'Contacts sync not fully implemented yet', data: [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Check specific number
router.get('/:sessionId/:number', async (req, res) => {
    try {
        const socket = await getSocket(req, req.params.sessionId);
        const jid = req.params.number.includes('@') ? req.params.number : `${req.params.number}@s.whatsapp.net`;
        const status = await socket.onWhatsApp(jid);
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
