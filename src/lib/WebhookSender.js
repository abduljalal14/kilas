const axios = require('axios');
const fs = require('fs');
const path = require('path');

class WebhookSender {
    constructor(logger, db = null) {
        this.logger = logger;
        this.db = db; // Database instance for persistence
        this.webhooks = new Map(); // sessionId -> webhookUrl (legacy)
        this.webhookConfigs = new Map(); // sessionId -> { webhookUrl, events: [] }

        // File persistence
        this.sessionDir = process.env.SESSION_DIR || './sessions';
        this.webhookConfigFile = path.join(this.sessionDir, 'webhook-configs.json');

        // Ensure session directory exists
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        // Load saved configs
        this.loadConfigs();
    }

    /**
     * Load webhook configs from file
     */
    loadConfigs() {
        if (fs.existsSync(this.webhookConfigFile)) {
            try {
                const data = fs.readFileSync(this.webhookConfigFile, 'utf8');
                const configs = JSON.parse(data);

                // Restore to Maps
                Object.entries(configs).forEach(([sessionId, config]) => {
                    this.webhookConfigs.set(sessionId, config);
                    this.webhooks.set(sessionId, config.webhookUrl);
                });

                this.logger.info(`Loaded ${Object.keys(configs).length} webhook configurations`);
            } catch (err) {
                this.logger.error('Failed to load webhook configs:', err);
            }
        }
    }

    /**
     * Save webhook configs to file
     */
    saveConfigs() {
        try {
            const configs = {};
            this.webhookConfigs.forEach((config, sessionId) => {
                configs[sessionId] = config;
            });

            fs.writeFileSync(this.webhookConfigFile, JSON.stringify(configs, null, 2));
            this.logger.info(`Saved ${Object.keys(configs).length} webhook configurations`);
        } catch (err) {
            this.logger.error('Failed to save webhook configs:', err);
        }
    }

    /**
     * Set webhook URL for a session (legacy method)
     */
    setWebhook(sessionId, webhookUrl) {
        if (webhookUrl && webhookUrl.trim() !== '') {
            this.webhooks.set(sessionId, webhookUrl.trim());
            // Also update config for backward compatibility
            this.webhookConfigs.set(sessionId, {
                webhookUrl: webhookUrl.trim(),
                events: [] // Empty means all events (backward compatible)
            });
            this.logger.info(`Webhook configured for session ${sessionId}: ${webhookUrl}`);
        } else {
            this.webhooks.delete(sessionId);
            this.webhookConfigs.delete(sessionId);
            this.logger.info(`Webhook removed for session ${sessionId}`);
        }
        this.saveConfigs(); // Save to file
    }

    /**
     * Get webhook URL for a session (legacy method)
     */
    getWebhook(sessionId) {
        return this.webhooks.get(sessionId);
    }

    /**
     * Set webhook configuration (URL + events + timezone)
     */
    setWebhookConfig(sessionId, config) {
        if (config && config.webhookUrl) {
            this.webhookConfigs.set(sessionId, {
                webhookUrl: config.webhookUrl,
                events: config.events || [],
                chatTypes: config.chatTypes || ['private', 'group'],
                timezone: config.timezone || 'Asia/Jakarta'
            });
            // Also set legacy webhook for backward compatibility
            this.webhooks.set(sessionId, config.webhookUrl);
            this.logger.info(`Webhook config set for ${sessionId}: ${config.webhookUrl} with ${config.events?.length || 0} events, chatTypes: ${(config.chatTypes || ['private', 'group']).join(', ')}, timezone: ${config.timezone || 'Asia/Jakarta'}`);
        } else {
            this.webhookConfigs.delete(sessionId);
            this.webhooks.delete(sessionId);
            this.logger.info(`Webhook config removed for ${sessionId}`);
        }
        this.saveConfigs(); // Save to file
    }

    /**
     * Get webhook configuration (URL + events)
     */
    getWebhookConfig(sessionId) {
        return this.webhookConfigs.get(sessionId);
    }

    /**
     * Send webhook event (with event filtering)
     */
    async send(sessionId, eventType, data) {
        const config = this.webhookConfigs.get(sessionId);

        if (!config || !config.webhookUrl) {
            this.logger.debug(`No webhook configured for session ${sessionId}`);
            return; // No webhook configured
        }

        // Skip sending webhook if any message has broadcast flag set to true
        if (data && data.messages && Array.isArray(data.messages)) {
            const hasBroadcast = data.messages.some(msg => msg.broadcast === true);
            if (hasBroadcast) {
                this.logger.debug(`Webhook skipped for ${sessionId} (${eventType}): contains broadcast message`);
                return;
            }
        }

        // Check if this event is in the selected events list
        if (config.events && config.events.length > 0) {
            // If events array is not empty, only send if event is selected
            if (!config.events.includes(eventType)) {
                // Event not selected, skip sending
                this.logger.debug(`Event ${eventType} not in selected events for ${sessionId}. Selected: [${config.events.join(', ')}]`);
                return;
            }
        }
        // If events array is empty, send all events (backward compatible)

        if (eventType === 'messages.upsert' && data?.chatType) {
            const allowedChatTypes = Array.isArray(config.chatTypes) && config.chatTypes.length > 0
                ? config.chatTypes
                : ['private', 'group'];

            if (!allowedChatTypes.includes(data.chatType)) {
                this.logger.debug(`messages.upsert skipped for ${sessionId}. chatType=${data.chatType}, allowed=[${allowedChatTypes.join(', ')}]`);
                return;
            }
        }

        const payload = {
            event: eventType,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            data: data
        };

        try {
            const response = await axios.post(config.webhookUrl, payload, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'KirimKan-Webhook/1.0'
                }
            });

            this.logger.info(`Webhook sent successfully for ${sessionId} (${eventType}): ${response.status}`);

            // Debug: Log response data
            console.log('[WebhookSender] Response status:', response.status);
            console.log('[WebhookSender] Response data:', response.data);
            console.log('[WebhookSender] Response data type:', typeof response.data);

            const result = {
                success: true,
                status: response.status,
                url: config.webhookUrl,
                event: eventType,
                sessionId: sessionId,
                timestamp: payload.timestamp,
                payload: payload,
                response: response.data // Include response body
            };

            // Log to SQLite if database is available
            if (this.db) {
                this.db.logWebhook({
                    sessionId: sessionId,
                    eventType: eventType,
                    webhookUrl: config.webhookUrl,
                    success: true,
                    statusCode: response.status,
                    payload: payload,
                    response: response.data,
                    error: null
                }).catch(err => this.logger.error('Failed to log webhook:', err));
            }

            return result;
        } catch (error) {
            this.logger.error(`Webhook failed for ${sessionId} (${eventType}):`, error.message);

            const result = {
                success: false,
                error: error.message,
                url: config.webhookUrl,
                event: eventType,
                sessionId: sessionId,
                timestamp: payload.timestamp,
                payload: payload,
                response: error.response?.data || null // Include error response if available
            };

            // Log to SQLite if database is available
            if (this.db) {
                this.db.logWebhook({
                    sessionId: sessionId,
                    eventType: eventType,
                    webhookUrl: config.webhookUrl,
                    success: false,
                    statusCode: error.response?.status || null,
                    payload: payload,
                    response: error.response?.data || null,
                    error: error.message
                }).catch(err => this.logger.error('Failed to log webhook:', err));
            }

            return result;
        }
    }

    /**
     * Send with retry logic
     */
    async sendWithRetry(sessionId, eventType, data, maxRetries = 3) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const result = await this.send(sessionId, eventType, data);

            if (result && result.success) {
                return result;
            }

            lastError = result;

            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return lastError;
    }

    /**
     * Get all configured webhooks
     */
    getAllWebhooks() {
        return Array.from(this.webhooks.entries()).map(([sessionId, url]) => ({
            sessionId,
            url
        }));
    }
}

module.exports = WebhookSender;
