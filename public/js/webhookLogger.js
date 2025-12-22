// Webhook Logger - Displays live webhook events
window.webhookLogger = {
    maxLogs: 50,
    storageKey: 'kirimkan_webhook_logs',

    init: function () {
        this.loadFromStorage();
        this.bindEvents();
    },

    bindEvents: function () {
        // Clear button
        const clearBtn = document.getElementById('btnClearWebhookLogs');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearLogs();
            });
        }
    },

    addLog: function (data) {
        const container = document.getElementById('webhookLog');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = `webhook-entry ${data.success ? 'success' : 'failed'}`;

        const time = new Date().toLocaleTimeString();
        const status = data.success ? `✓ ${data.status || 200}` : `✗ Error`;

        entry.innerHTML = `
            <div class="webhook-header">
                <span class="webhook-time">${time}</span>
                <span class="webhook-status ${data.success ? 'status-success' : 'status-error'}">${status}</span>
                <span class="webhook-event">${data.event}</span>
            </div>
            <div class="webhook-url">${data.url}</div>
            <div class="webhook-payload">
                <div class="payload-label">Payload:</div>
                <pre>${JSON.stringify(data.payload, null, 2)}</pre>
            </div>
        `;

        container.prepend(entry);

        // Keep only last N entries in DOM
        while (container.children.length > this.maxLogs) {
            container.removeChild(container.lastChild);
        }

        // Save to sessionStorage
        this.saveToStorage();
    },

    saveToStorage: function () {
        const container = document.getElementById('webhookLog');
        if (!container) return;

        const logs = [];
        Array.from(container.children).forEach(entry => {
            logs.push(entry.outerHTML);
        });

        sessionStorage.setItem(this.storageKey, JSON.stringify(logs.slice(0, this.maxLogs)));
    },

    loadFromStorage: function () {
        const stored = sessionStorage.getItem(this.storageKey);
        if (!stored) return;

        try {
            const logs = JSON.parse(stored);
            const container = document.getElementById('webhookLog');
            if (!container) return;

            container.innerHTML = logs.join('');
        } catch (e) {
            console.error('Failed to load webhook logs from storage:', e);
        }
    },

    clearLogs: function () {
        const container = document.getElementById('webhookLog');
        if (container) {
            container.innerHTML = '';
        }
        sessionStorage.removeItem(this.storageKey);
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.webhookLogger.init();
    });
} else {
    window.webhookLogger.init();
}
