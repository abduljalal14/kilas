const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const MediaHandler = require('./MediaHandler');

// Lazy-loaded baileys modules
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;

class BaileysHandler {
    constructor(sessionId, io, logger, webhookSender = null, eventStore = null) {
        this.sessionId = sessionId;
        this.io = io;
        this.globalLogger = logger;
        this.webhookSender = webhookSender;
        this.eventStore = eventStore;
        this.status = 'disconnected';
        this.socket = null;
        this.user = null;
        this.qr = null;
        this.qrImage = null; // Store QR image (Data URL) for API retrieval
        this.contacts = {};
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isReconnecting = false;
        this.reconnectTimer = null;
        this.connectedAt = null; // Track when session connected for uptime

        // Setup session directory
        this.sessionDir = path.join(process.env.SESSION_DIR || './sessions', sessionId);
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        // Initialize Media Handler
        this.mediaHandler = new MediaHandler(this.globalLogger);
    }

    /**
     * Log event to WebSocket (for real-time UI)
     */
    logEvent(type, message, eventData = null) {
        if (this.eventStore) {
            this.eventStore.add({
                sessionId: this.sessionId,
                eventType: type,
                message,
                data: eventData
            });
        }

        // Emit to WebSocket for real-time UI update
        this.io.emit('event:log', {
            type,
            sessionId: this.sessionId,
            text: message,
            timestamp: new Date()
        });
    }

    /**
     * Get current QR code image (Data URL format)
     * Returns null if QR code is not available
     */
    getQRCode() {
        return this.qrImage;
    }

    async start() {
        // Lazy load baileys on first use
        if (!makeWASocket) {
            const baileys = await import('@whiskeysockets/baileys');
            makeWASocket = baileys.makeWASocket;
            useMultiFileAuthState = baileys.useMultiFileAuthState;
            DisconnectReason = baileys.DisconnectReason;
            fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        }

        // Prevent multiple simultaneous start attempts
        if (this.isReconnecting) {
            this.globalLogger.info(`Session ${this.sessionId} is already reconnecting, skipping...`);
            return;
        }

        this.isReconnecting = true;
        this.updateStatus('connecting');

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
            const { version } = await fetchLatestBaileysVersion();

            this.socket = makeWASocket({
                version,
                logger: pino({ level: 'silent' }), // Suppress internal logs, use our own
                printQRInTerminal: false,
                auth: state,
                browser: ['KirimKan Gateway', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: undefined, // Keep connection alive
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                markOnlineOnConnect: true
            });

            // Handle Connection Update
            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // Send webhook for connection update (Fire-and-forget)
                if (this.webhookSender) {
                    this.globalLogger.info(`[Webhook] Attempting to send connection.update for ${this.sessionId}`);
                    this.webhookSender.send(this.sessionId, 'connection.update', update)
                        .then(result => {
                            if (result) {
                                this.globalLogger.info(`[Webhook] Sent connection.update: ${result.success ? 'SUCCESS' : 'FAILED'}`);
                                this.io.emit('webhook:sent', result);
                            } else {
                                this.globalLogger.info(`[Webhook] No result from send (likely no config or event filtered)`);
                            }
                        })
                        .catch(err => this.globalLogger.error(`[Webhook] Error sending connection.update for ${this.sessionId}`, err));
                } else {
                    this.globalLogger.warn(`[Webhook] webhookSender is NULL for ${this.sessionId}`);
                }

                if (qr) {
                    this.qr = qr;
                    // Generate QR image
                    try {
                        const qrImage = await QRCode.toDataURL(qr);
                        this.qrImage = qrImage; // Store for API retrieval
                        // Emit to subscribed room
                        this.io.to(`session:${this.sessionId}`).emit('session:qr', { sessionId: this.sessionId, qr: qrImage });
                        // Also emit globally for reliability (dashboard may not have subscribed yet)
                        this.io.emit('session:qr', { sessionId: this.sessionId, qr: qrImage });
                        // Also broadcast generally for dashboard
                        this.io.emit('session:update', { id: this.sessionId, status: 'scan_qr' });
                        this.globalLogger.info(`QR code emitted for session ${this.sessionId}`);
                    } catch (err) {
                        this.globalLogger.error(`Error generating QR: ${err}`);
                    }
                }

                if (connection === 'close') {
                    this.isReconnecting = false;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    this.globalLogger.info(`Connection closed for ${this.sessionId}. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`);
                    this.updateStatus('disconnected');

                    if (shouldReconnect && this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000); // Exponential backoff, max 10s
                        this.globalLogger.info(`Reconnecting ${this.sessionId} in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            this.start();
                        }, delay);
                    } else if (this.retryCount >= this.maxRetries) {
                        this.globalLogger.error(`Max retries reached for ${this.sessionId}`);
                        this.updateStatus('failed');
                        this.retryCount = 0; // Reset for manual retry
                    } else {
                        // Logged out - clear session folder so new QR can be generated
                        this.globalLogger.info(`Session ${this.sessionId} logged out, clearing session folder for fresh QR`);
                        this.clearSessionFolder();
                        this.updateStatus('logged_out');
                        this.retryCount = 0;
                    }
                } else if (connection === 'open') {
                    this.isReconnecting = false;
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    this.retryCount = 0; // Reset retry counter on successful connection
                    this.connectedAt = new Date(); // Set connection timestamp for uptime
                    this.globalLogger.info(`Session ${this.sessionId} connected`);
                    this.updateStatus('connected');
                    this.user = this.socket.user;
                    this.qr = null; // Clear QR

                    this.io.to(`session:${this.sessionId}`).emit('session:ready', { sessionId: this.sessionId, user: this.socket.user });
                }
            });

            // Handle Creds Update
            this.socket.ev.on('creds.update', saveCreds);

            // Cache contacts from history sync so they can be reused by routes.
            this.socket.ev.on('messaging-history.set', async ({ contacts }) => {
                if (Array.isArray(contacts)) {
                    contacts.forEach(contact => {
                        if (contact?.id) {
                            this.contacts[contact.id] = {
                                ...(this.contacts[contact.id] || {}),
                                ...contact
                            };
                        }
                    });
                }
            });

            // Handle Messages Upsert
            this.socket.ev.on('messages.upsert', async (m) => {
                if (m.type === 'notify') {
                    for (const msg of m.messages) {
                        // Determine if message is from group or private chat
                        const isGroup = msg.key.remoteJid.endsWith('@g.us');
                        const chatType = isGroup ? 'group' : 'private';

                        // Send webhook for EACH individual message (Fire-and-forget)
                        if (this.webhookSender) {
                            this.globalLogger.info(`[Webhook] Attempting to send messages.upsert for ${this.sessionId}`);
                            this.webhookSender.send(this.sessionId, 'messages.upsert', {
                                type: m.type,
                                messages: [msg], // Send only this single message
                                isGroup: isGroup,
                                chatType: chatType,
                                includeOwnMessages: true // Include webhook for messages from self
                            })
                                .then(result => {
                                    if (result) {
                                        this.globalLogger.info(`[Webhook] Sent messages.upsert: ${result.success ? 'SUCCESS' : 'FAILED'}`);
                                        this.io.emit('webhook:sent', result);
                                    } else {
                                        this.globalLogger.info(`[Webhook] No result from send (likely no config or event filtered)`);
                                    }
                                })
                                .catch(err => this.globalLogger.error(`[Webhook] Error sending messages.upsert for ${this.sessionId}`, err));
                        } else {
                            this.globalLogger.warn(`[Webhook] webhookSender is NULL for ${this.sessionId}`);
                        }

                        if (!msg.key.fromMe) {
                            // Try to save media
                            // const mediaPath = await this.mediaHandler.saveMedia(msg);

                            // Emit new message event
                            this.io.to(`session:${this.sessionId}`).emit('message:received', {
                                sessionId: this.sessionId,
                                message: msg,
                                //media: mediaPath
                            });

                            // Global event for dashboard log - save to DB too
                            const from = msg.key.remoteJid.split('@')[0];
                            const type = msg.message ? Object.keys(msg.message)[0] : 'unknown';

                            this.logEvent('message', `Msg from ${from} (${type})`, { from, type });
                        }
                    }
                }
            });

            // Handle Messages Update (read receipts, edits)
            this.socket.ev.on('messages.update', async (updates) => {
                // Emit real-time status updates for UI
                for (const update of updates) {
                    if (update.update?.status) {
                        const statusMap = {
                            1: 'pending',
                            2: 'sent',
                            3: 'delivered',
                            4: 'read'
                        };
                        const status = statusMap[update.update.status] || 'pending';

                        // Emit to frontend for real-time UI update
                        this.io.emit('message:status', {
                            sessionId: this.sessionId,
                            messageId: update.key?.id,
                            status: status,
                            timestamp: Date.now()
                        });
                    }
                }

                // Removed webhook send to prevent blocking
            });

            // Handle Message Receipt Update (read receipts when recipient has chat open)
            this.socket.ev.on('message-receipt.update', async (receipts) => {
                for (const receipt of receipts) {
                    // Check for read receipt
                    if (receipt.receipt?.readTimestamp || receipt.receipt?.receiptTimestamp) {
                        const messageId = receipt.key?.id;
                        if (messageId) {
                            // Emit read status to frontend
                            this.io.emit('message:status', {
                                sessionId: this.sessionId,
                                messageId: messageId,
                                status: 'read',
                                timestamp: Date.now()
                            });
                        }
                    }
                }

                // Removed webhook send to prevent blocking
            });

            // Removed unneeded event handlers (presence, chats) to reduce load

            // Handle Contacts Upsert
            this.socket.ev.on('contacts.upsert', async (contacts) => {
                if (Array.isArray(contacts)) {
                    contacts.forEach(contact => {
                        if (contact?.id) {
                            this.contacts[contact.id] = {
                                ...(this.contacts[contact.id] || {}),
                                ...contact
                            };
                        }
                    });
                }

                // Webhook disabled for contacts.upsert to prevent blocking
            });

            // Keep contact cache updated when contact metadata changes.
            this.socket.ev.on('contacts.update', async (contacts) => {
                if (Array.isArray(contacts)) {
                    contacts.forEach(contact => {
                        if (contact?.id) {
                            this.contacts[contact.id] = {
                                ...(this.contacts[contact.id] || {}),
                                ...contact
                            };
                        }
                    });
                }
            });

            // Removed unneeded event handlers (groups, calls) to reduce load
        } catch (err) {
            this.isReconnecting = false;
            this.globalLogger.error(`Error starting session ${this.sessionId}:`, err);
            this.updateStatus('error');
        }
    }

    updateStatus(status) {
        this.status = status;
        this.io.emit('session:status', { sessionId: this.sessionId, status });
        // Also add to event log (with DB persistence)
        this.logEvent('connection', `Status changed to ${status}`, { status });
    }

    /**
     * Clear session folder (delete credentials) to allow fresh QR code generation
     */
    clearSessionFolder() {
        try {
            if (fs.existsSync(this.sessionDir)) {
                fs.rmSync(this.sessionDir, { recursive: true, force: true });
                this.globalLogger.info(`Session folder cleared: ${this.sessionDir}`);
            }
        } catch (err) {
            this.globalLogger.error(`Failed to clear session folder: ${err.message}`);
        }
    }

    stopSocket() {
        this.isReconnecting = false;
        this.retryCount = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            if (this.socket.ev && typeof this.socket.ev.removeAllListeners === 'function') {
                this.socket.ev.removeAllListeners();
            }
            this.socket.end(undefined);
            this.socket = null;
        }
    }

    async restart() {
        this.stopSocket();
        this.updateStatus('reconnecting');
        await this.start();
    }

    async logout() {
        this.isReconnecting = false;
        this.retryCount = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            try {
                await this.socket.logout();
            } catch (err) {
                // Ignore logout errors
            }
            this.socket.end(undefined);
            this.socket = null;
        }
        this.updateStatus('disconnected');
    }
}

module.exports = BaileysHandler;
