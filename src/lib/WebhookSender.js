const axios = require('axios');
const fs = require('fs');
const path = require('path');

class WebhookSender {
    constructor(logger) {
        this.logger = logger;
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
     * Set webhook configuration (URL + events)
     */
    setWebhookConfig(sessionId, config) {
        if (config && config.webhookUrl) {
            this.webhookConfigs.set(sessionId, {
                webhookUrl: config.webhookUrl,
                events: config.events || []
            });
            // Also set legacy webhook for backward compatibility
            this.webhooks.set(sessionId, config.webhookUrl);
            this.logger.info(`Webhook config set for ${sessionId}: ${config.webhookUrl} with ${config.events?.length || 0} events`);
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
            return; // No webhook configured
        }

        // Check if this event is in the selected events list
        if (config.events && config.events.length > 0) {
            // If events array is not empty, only send if event is selected
            if (!config.events.includes(eventType)) {
                // Event not selected, skip sending
                return;
            }
        }
        // If events array is empty, send all events (backward compatible)

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

            return {
                success: true,
                status: response.status,
                url: config.webhookUrl,
                event: eventType,
                payload: payload
            };
        } catch (error) {
            this.logger.error(`Webhook failed for ${sessionId} (${eventType}):`, error.message);

            return {
                success: false,
                error: error.message,
                url: config.webhookUrl,
                event: eventType,
                payload: payload
            };
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
