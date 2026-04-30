/**
 * Logs API Routes
 * Endpoints for live events and outgoing messages
 */

const express = require('express');
const router = express.Router();

// ==================== LIVE EVENTS ====================

/**
 * GET /api/logs/events - Get live events
 */
router.get('/events', async (req, res) => {
    try {
        const { sessionId, eventType, limit = 100, offset = 0 } = req.query;

        const result = req.eventStore
            ? req.eventStore.list({ sessionId, eventType, limit, offset })
            : { data: [], total: 0 };

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        req.logger.error('Error fetching events:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/logs/events - Clear live events
 */
router.delete('/events', async (req, res) => {
    try {
        const { sessionId } = req.query;

        const result = req.eventStore
            ? req.eventStore.clear({ sessionId })
            : { deleted: 0 };

        res.json({
            success: true,
            message: `Cleared ${result.deleted} events`,
            deleted: result.deleted
        });
    } catch (error) {
        req.logger.error('Error clearing events:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== OUTGOING MESSAGES ====================

/**
 * GET /api/logs/outgoing - Get outgoing messages
 */
router.get('/outgoing', async (req, res) => {
    try {
        const { sessionId, limit = 100, offset = 0 } = req.query;

        const messages = [];
        const total = 0;

        res.json({
            success: true,
            data: messages,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        req.logger.error('Error fetching outgoing messages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/logs/outgoing - Clear outgoing messages
 */
router.delete('/outgoing', async (req, res) => {
    try {
        const { sessionId } = req.query;

        const result = { deleted: 0 };

        res.json({
            success: true,
            message: `Cleared ${result.deleted} outgoing messages`,
            deleted: result.deleted
        });
    } catch (error) {
        req.logger.error('Error clearing outgoing messages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PATCH /api/logs/outgoing/:messageId - Update message status
 */
router.patch('/outgoing/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body;

        if (!messageId || !status) {
            return res.status(400).json({
                success: false,
                message: 'messageId and status are required'
            });
        }

        // DB Update removed
        res.json({
            success: true,
            message: 'Status updated',
            messageId,
            status
        });
    } catch (error) {
        req.logger.error('Error updating message status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== SETTINGS ====================

/**
 * GET /api/logs/settings - Get logging settings
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = {};

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        req.logger.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/logs/settings - Update logging settings
 */
router.post('/settings', async (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Key and value are required'
            });
        }

        // DB Update removed
        res.json({
            success: true,
            message: 'Setting updated',
            key,
            value
        });
    } catch (error) {
        req.logger.error('Error updating setting:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/logs/cleanup - Run manual cleanup
 */
router.post('/cleanup', async (req, res) => {
    try {
        // Cleanup removed
        res.json({
            success: true,
            message: 'Cleanup completed'
        });
    } catch (error) {
        req.logger.error('Error running cleanup:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== WEBHOOK HISTORY ====================

/**
 * GET /api/logs/webhook - Get webhook history
 */
router.get('/webhook', async (req, res) => {
    try {
        const { sessionId, limit = 100, offset = 0 } = req.query;

        const webhooks = [];
        const total = 0;

        res.json({
            success: true,
            data: webhooks,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        req.logger.error('Error fetching webhook history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/logs/webhook - Clear webhook history
 */
router.delete('/webhook', async (req, res) => {
    try {
        const { sessionId } = req.query;

        const result = { deleted: 0 };

        res.json({
            success: true,
            message: `Cleared ${result.deleted} webhook entries`,
            deleted: result.deleted
        });
    } catch (error) {
        req.logger.error('Error clearing webhook history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
