const fs = require('fs');
const path = require('path');
const BaileysHandler = require('./BaileysHandler');

class SessionManager {
    constructor(io, logger, webhookSender = null, db = null) {
        this.io = io;
        this.logger = logger;
        this.webhookSender = webhookSender;
        this.db = db; // Database instance for event logging
        this.sessions = new Map(); // Store active BaileysHandler instances
        this.sessionDir = process.env.SESSION_DIR || './sessions';
        this.sessionsFile = path.join(this.sessionDir, 'sessions.json');

        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        this.loadSessions();
    }

    // Load known sessions from disk
    loadSessions() {
        if (fs.existsSync(this.sessionsFile)) {
            try {
                const data = fs.readFileSync(this.sessionsFile, 'utf8');
                const sessions = JSON.parse(data);
                this.logger.info(`Found ${sessions.length} saved sessions.`);
                // We don't auto-connect here blindly, we might want to wait or connect based on config
                // For now, let's just tracking them. Actual connection happens on 'connect' request or auto-start

                // For this implementation, we will try to restore all sessions that were active
                sessions.forEach(sessionId => {
                    this.logger.info(`Restoring session: ${sessionId} `);
                    this.createSession(sessionId, false); // Create instance but maybe connect later?
                    // Actually, usually we want to reconnect automatically
                    this.sessions.get(sessionId).start();
                });

            } catch (err) {
                this.logger.error('Failed to load sessions file', err);
            }
        }
    }

    saveSessions() {
        const sessionIds = Array.from(this.sessions.keys());
        fs.writeFileSync(this.sessionsFile, JSON.stringify(sessionIds, null, 2));
    }

    /**
     * Set database for SessionManager and all existing handlers
     * Called after database is initialized in server.js
     */
    setDatabase(db) {
        this.db = db;
        // Update all existing handlers
        for (const [sessionId, handler] of this.sessions) {
            handler.db = db;
            this.logger.info(`Database wired for session: ${sessionId}`);
        }
    }

    async createSession(sessionId, startImmediately = true) {
        if (this.sessions.has(sessionId)) {
            this.logger.info(`Session ${sessionId} already exists, restarting...`);
            const existingHandler = this.sessions.get(sessionId);
            await existingHandler.logout();
            this.sessions.delete(sessionId);
        }

        // Create new session with database for event logging
        const handler = new BaileysHandler(sessionId, this.io, this.logger, this.webhookSender, this.db);
        this.sessions.set(sessionId, handler);

        this.saveSessions();

        if (startImmediately) {
            await handler.start();
        }

        // Notify clients
        this.io.emit('session:created', { sessionId });

        return handler;
    }

    async getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getAllSessions() {
        const result = [];
        for (const [id, handler] of this.sessions) {
            result.push({
                id,
                status: handler.status, // connecting, connected, disconnected
                user: handler.user, // Info about the connected user if available
                connectedAt: handler.connectedAt // Timestamp when session connected
            });
        }
        return result;
    }

    async deleteSession(sessionId) {
        const handler = this.sessions.get(sessionId);
        if (handler) {
            await handler.logout(); // Logout and destroy
            this.sessions.delete(sessionId);
            this.saveSessions();

            // Cleanup session directory
            const sessionPath = path.join(this.sessionDir, sessionId);
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }

            this.io.emit('session:deleted', { sessionId });
            return true;
        }
        return false;
    }

    /**
     * Set webhook URL for a session (legacy method)
     */
    setWebhook(sessionId, webhookUrl) {
        if (this.webhookSender) {
            this.webhookSender.setWebhook(sessionId, webhookUrl);
        }
    }

    /**
     * Get webhook URL for a session (legacy method)
     */
    getWebhook(sessionId) {
        if (this.webhookSender) {
            return this.webhookSender.getWebhook(sessionId);
        }
        return null;
    }

    /**
     * Set webhook configuration (URL + events) for a session
     */
    setWebhookConfig(sessionId, config) {
        if (this.webhookSender) {
            this.webhookSender.setWebhookConfig(sessionId, config);
        }
    }

    /**
     * Get webhook configuration (URL + events) for a session
     */
    getWebhookConfig(sessionId) {
        if (this.webhookSender) {
            return this.webhookSender.getWebhookConfig(sessionId);
        }
        return null;
    }

    /**
     * Get QR code image for a session
     * Returns null if session not found or QR not available
     */
    getQRCode(sessionId) {
        const handler = this.sessions.get(sessionId);
        if (handler) {
            return handler.getQRCode();
        }
        return null;
    }}

module.exports = SessionManager;