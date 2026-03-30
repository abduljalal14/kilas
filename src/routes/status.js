const express = require('express');
const router = express.Router();

const getSession = async (req, sessionId) => {
    const session = await req.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
        throw new Error('Session not found or not connected');
    }
    return session;
};

const normalizeStatusJidList = (statusJidList = []) => {
    if (!Array.isArray(statusJidList)) {
        return [];
    }

    return statusJidList
        .map(jid => typeof jid === 'string' ? jid.trim() : '')
        .filter(Boolean);
};

const getDefaultStatusJidList = (session) => {
    const selfJid = session?.user?.id ? session.user.id.split(':')[0] : null;
    const contacts = Object.values(session?.contacts || {});

    return contacts
        .map(contact => typeof contact?.id === 'string' ? contact.id.trim() : '')
        .filter(jid => jid.endsWith('@s.whatsapp.net'))
        .filter(jid => jid !== 'status@broadcast')
        .filter(jid => !jid.endsWith('@lid'))
        .filter(jid => jid !== selfJid);
};

// Post Text Status
router.post('/post/text', async (req, res) => {
    const { sessionId, text, backgroundColor, font, statusJidList } = req.body;
    try {
        const session = await getSession(req, sessionId);
        const normalizedStatusJidList = normalizeStatusJidList(statusJidList);

        if (session.status !== 'connected') {
            return res.status(409).json({
                success: false,
                accepted: false,
                message: 'Session is not connected. WhatsApp status was not posted.',
                details: {
                    sessionId,
                    sessionStatus: session.status
                }
            });
        }

        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({
                success: false,
                accepted: false,
                message: 'Text status is required. Request received, but nothing was posted to WhatsApp.'
            });
        }

        const finalStatusJidList = normalizedStatusJidList.length > 0
            ? normalizedStatusJidList
            : getDefaultStatusJidList(session);

        if (finalStatusJidList.length === 0) {
            return res.status(400).json({
                success: false,
                accepted: false,
                message: 'No valid status audience was found. Request received, but status was not sent.',
                details: {
                    hint: 'Send statusJidList explicitly or make sure contacts have been synced for this session.',
                    requiredFormat: ['628123456789@s.whatsapp.net']
                }
            });
        }

        await session.socket.sendMessage(
            'status@broadcast',
            {
                text: text.trim()
            },
            {
                backgroundColor: backgroundColor || 0xffffffff,
                font: font || 1,
                broadcast: true,
                statusJidList: finalStatusJidList
            }
        );

        res.json({
            success: true,
            accepted: true,
            message: 'Status post request was sent to WhatsApp.',
            data: {
                sessionId,
                sessionStatus: session.status,
                statusJidCount: finalStatusJidList.length,
                audienceSource: normalizedStatusJidList.length > 0 ? 'request' : 'session_contacts',
                broadcast: true
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            accepted: false,
            message: 'Failed to send WhatsApp status.',
            error: error.message
        });
    }
});

module.exports = router;
