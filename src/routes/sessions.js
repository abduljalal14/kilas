const express = require('express');
const router = express.Router();

// List all sessions
router.get('/', (req, res) => {
    const sessions = req.sessionManager.getAllSessions();
    res.json({ success: true, data: sessions });
});

// Get specific session
router.get('/:id', async (req, res) => {
    const session = await req.sessionManager.getSession(req.params.id);
    if (session) {
        res.json({
            success: true,
            data: {
                id: session.sessionId,
                status: session.status,
                user: session.user
            }
        });
    } else {
        res.status(404).json({ success: false, message: 'Session not found' });
    }
});

// Create new session
router.post('/create', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    try {
        const session = await req.sessionManager.createSession(sessionId);
        res.json({ success: true, message: 'Session created', data: { id: sessionId } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete session
router.delete('/:id', async (req, res) => {
    const success = await req.sessionManager.deleteSession(req.params.id);
    if (success) {
        res.json({ success: true, message: 'Session deleted' });
    } else {
        res.status(404).json({ success: false, message: 'Session not found' });
    }
});

module.exports = router;
