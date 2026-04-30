const fs = require('fs');
const path = require('path');

class EventStore {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.maxEvents = options.maxEvents || 500;
        this.sessionDir = process.env.SESSION_DIR || './sessions';
        this.filePath = options.filePath || path.join(this.sessionDir, 'live-events.json');
        this.events = [];
        this.nextId = 1;

        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        this.load();
    }

    load() {
        if (!fs.existsSync(this.filePath)) return;

        try {
            const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            this.events = Array.isArray(data) ? data : [];
            this.nextId = this.events.reduce((max, event) => Math.max(max, event.id || 0), 0) + 1;
        } catch (err) {
            this.logger?.error('Failed to load live events:', err);
            this.events = [];
            this.nextId = 1;
        }
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.events, null, 2));
        } catch (err) {
            this.logger?.error('Failed to save live events:', err);
        }
    }

    add({ sessionId, eventType, message, data = null }) {
        const event = {
            id: this.nextId++,
            session_id: sessionId || 'System',
            event_type: eventType || 'info',
            message: message || '',
            event_data: data,
            created_at: new Date().toISOString()
        };

        this.events.unshift(event);
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }
        this.save();

        return event;
    }

    list({ sessionId, eventType, limit = 100, offset = 0 } = {}) {
        let result = this.events;

        if (sessionId) {
            result = result.filter(event => event.session_id === sessionId);
        }

        if (eventType) {
            result = result.filter(event => event.event_type === eventType);
        }

        const total = result.length;
        const parsedLimit = Math.max(parseInt(limit, 10) || 100, 0);
        const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

        return {
            data: result.slice(parsedOffset, parsedOffset + parsedLimit),
            total
        };
    }

    clear({ sessionId } = {}) {
        const before = this.events.length;

        if (sessionId) {
            this.events = this.events.filter(event => event.session_id !== sessionId);
        } else {
            this.events = [];
        }

        const deleted = before - this.events.length;
        this.save();

        return { deleted };
    }
}

module.exports = EventStore;
