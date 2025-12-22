const express = require('express');
const router = express.Router();

const getSocket = async (req, sessionId) => {
    const session = await req.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
        throw new Error('Session not found or not connected');
    }
    return session.socket;
};

// Get All Groups
router.get('/:sessionId', async (req, res) => {
    try {
        const socket = await getSocket(req, req.params.sessionId);
        const groups = await socket.groupFetchAllParticipating();
        res.json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create Group
router.post('/create', async (req, res) => {
    const { sessionId, subject, participants } = req.body;

    try {
        const socket = await getSocket(req, sessionId);
        // Participants should be an array of numbers
        const pIds = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);

        const group = await socket.groupCreate(subject, pIds);
        res.json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
