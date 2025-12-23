const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

const CONFIG_FILE = path.join(__dirname, '../../webhook-config.json');

// Ensure config file exists
async function ensureConfigFile() {
    try {
        await fs.access(CONFIG_FILE);
    } catch {
        // Create default config as empty object (will store per-session configs)
        const defaultConfig = {};
        await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    }
}

// GET /api/webhook/config - Get webhook configuration for a session
router.get('/config', async (req, res) => {
    try {
        const { sessionId } = req.query;

        await ensureConfigFile();
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const allConfigs = JSON.parse(data);

        // If sessionId provided, return that session's config
        if (sessionId && allConfigs[sessionId]) {
            res.json({ success: true, data: allConfigs[sessionId] });
        } else if (sessionId) {
            // Return default config for new session
            res.json({
                success: true,
                data: {
                    sessionId,
                    callbackUrls: [],
                    retry: true,
                    domainWhitelist: ['*'],
                    events: []
                }
            });
        } else {
            // No sessionId, return all configs
            res.json({ success: true, data: allConfigs });
        }
    } catch (err) {
        req.logger.error('Error reading webhook config:', err);
        res.status(500).json({ success: false, error: 'Failed to read configuration' });
    }
});

// POST /api/webhook/config - Save webhook configuration for a session
router.post('/config', async (req, res) => {
    try {
        const { sessionId, callbackUrls, retry, domainWhitelist, events } = req.body;

        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'Session ID is required' });
        }

        if (!Array.isArray(callbackUrls) || callbackUrls.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one callback URL is required' });
        }

        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one event must be selected' });
        }

        // Load existing configs
        await ensureConfigFile();
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const allConfigs = JSON.parse(data);

        // Save config for this session
        allConfigs[sessionId] = {
            sessionId,
            callbackUrls,
            retry: retry !== false,
            domainWhitelist: Array.isArray(domainWhitelist) ? domainWhitelist : ['*'],
            events,
            updatedAt: new Date().toISOString()
        };

        await fs.writeFile(CONFIG_FILE, JSON.stringify(allConfigs, null, 2));

        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (err) {
        req.logger.error('Error saving webhook config:', err);
        res.status(500).json({ success: false, error: 'Failed to save configuration' });
    }
});

// Get webhook configuration for a session
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const config = req.sessionManager.getWebhookConfig(sessionId);

        res.json({
            success: true,
            sessionId,
            webhookUrl: config?.webhookUrl || null,
            events: config?.events || [],
            enabled: !!config?.webhookUrl
        });
    } catch (error) {
        req.logger.error('Error getting webhook config:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Set webhook URL for a session
router.post('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { webhookUrl, events } = req.body;

        if (!webhookUrl || typeof webhookUrl !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'webhookUrl is required and must be a string'
            });
        }

        // Validate URL format
        try {
            new URL(webhookUrl);
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: 'Invalid webhook URL format'
            });
        }

        // Validate events array
        const validEvents = [
            'connection.update', 'messages.upsert', 'messages.update',
            'messages.delete', 'presence.update', 'chats.upsert',
            'chats.update', 'contacts.upsert', 'groups.upsert',
            'group-participants.update', 'call'
        ];

        const selectedEvents = Array.isArray(events)
            ? events.filter(e => validEvents.includes(e))
            : [];

        req.sessionManager.setWebhookConfig(sessionId, {
            webhookUrl,
            events: selectedEvents
        });

        res.json({
            success: true,
            message: 'Webhook configured successfully',
            sessionId,
            webhookUrl,
            events: selectedEvents
        });
    } catch (error) {
        req.logger.error('Error setting webhook:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete webhook configuration
router.delete('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        req.sessionManager.setWebhookConfig(sessionId, null);

        res.json({
            success: true,
            message: 'Webhook removed successfully',
            sessionId
        });
    } catch (error) {
        req.logger.error('Error deleting webhook:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test webhook with sample data
router.post('/:sessionId/test', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const config = req.sessionManager.getWebhookConfig(sessionId);

        if (!config || !config.webhookUrl) {
            return res.status(400).json({
                success: false,
                message: 'No webhook configured for this session'
            });
        }

        // Send test webhook
        const testData = {
            test: true,
            message: 'This is a test webhook from KirimKan',
            timestamp: new Date().toISOString()
        };

        const axios = require('axios');
        try {
            const response = await axios.post(config.webhookUrl, {
                event: 'test',
                sessionId: sessionId,
                timestamp: new Date().toISOString(),
                data: testData
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'KirimKan-Webhook/1.0'
                }
            });

            // Emit to dashboard
            req.io.emit('webhook:sent', {
                success: true,
                status: response.status,
                url: config.webhookUrl,
                event: 'test',
                payload: testData
            });

            res.json({
                success: true,
                message: 'Test webhook sent successfully',
                status: response.status
            });
        } catch (error) {
            // Emit failure to dashboard
            req.io.emit('webhook:sent', {
                success: false,
                error: error.message,
                url: config.webhookUrl,
                event: 'test',
                payload: testData
            });

            res.status(500).json({
                success: false,
                message: 'Webhook test failed: ' + error.message
            });
        }
    } catch (error) {
        req.logger.error('Error testing webhook:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
