// Webhook Configuration Manager

// Global timezone setting (default: Asia/Jakarta)
window.appTimezone = localStorage.getItem('app_timezone') || 'Asia/Jakarta';

// Global formatTime utility function
window.formatTime = function (dateString) {
    if (!dateString) return '-';
    try {
        let date;
        // Handle SQLite format: "YYYY-MM-DD HH:MM:SS" (stored as UTC)
        if (typeof dateString === 'string' && !dateString.includes('T') && !dateString.includes('Z') && !dateString.includes('+')) {
            // SQLite format without timezone - treat as UTC
            date = new Date(dateString.replace(' ', 'T') + 'Z');
        } else {
            date = new Date(dateString);
        }

        return date.toLocaleString('id-ID', {
            timeZone: window.appTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (e) {
        console.error('Failed to format time:', e);
        return dateString;
    }
};

const WebhookManager = {
    defaultMessageUpsertChatTypes: ['private', 'group'],

    init: function () {
        this.bindEvents();
        this.loadConfig();
    },

    getMessagesUpsertCheckbox: function () {
        return document.querySelector('.webhook-event[value="messages.upsert"]');
    },

    syncMessagesUpsertChatTypeVisibility: function () {
        const container = document.getElementById('messagesUpsertChatTypeSettings');
        const messagesUpsertCheckbox = this.getMessagesUpsertCheckbox();

        if (!container || !messagesUpsertCheckbox) return;

        container.style.display = messagesUpsertCheckbox.checked ? 'block' : 'none';
    },

    getSelectedChatTypes: function () {
        const selected = Array.from(document.querySelectorAll('.webhook-chat-type:checked'))
            .map(cb => cb.value);

        return selected.length > 0
            ? selected
            : [...this.defaultMessageUpsertChatTypes];
    },

    setSelectedChatTypes: function (chatTypes) {
        const selectedChatTypes = Array.isArray(chatTypes) && chatTypes.length > 0
            ? chatTypes
            : this.defaultMessageUpsertChatTypes;

        document.querySelectorAll('.webhook-chat-type').forEach(cb => {
            cb.checked = selectedChatTypes.includes(cb.value);
        });
    },

    bindEvents: function () {
        const btnSave = document.getElementById('btnSaveWebhook');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.saveConfig());
        }

        // Select All Events checkbox
        const selectAllCheckbox = document.getElementById('selectAllEvents');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.webhook-event');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                this.syncMessagesUpsertChatTypeVisibility();
            });
        }

        // Update Select All state when individual checkboxes change
        const eventCheckboxes = document.querySelectorAll('.webhook-event');
        eventCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(eventCheckboxes).every(checkbox => checkbox.checked);
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = allChecked;
                }

                if (cb.value === 'messages.upsert') {
                    this.syncMessagesUpsertChatTypeVisibility();
                }
            });
        });

        const chatTypeCheckboxes = document.querySelectorAll('.webhook-chat-type');
        chatTypeCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const checkedCount = document.querySelectorAll('.webhook-chat-type:checked').length;
                if (checkedCount === 0) {
                    cb.checked = true;
                    Toast.warning('Pilih minimal satu chat type untuk messages.upsert');
                }
            });
        });

        // Load config when session changes
        const sessionSelect = document.getElementById('webhookSession');
        if (sessionSelect) {
            sessionSelect.addEventListener('change', () => {
                this.loadConfig();
            });
        }

        // Hover effect for event checkboxes (already handled by CSS)
    },

    populateSessions: function (sessions) {
        const select = document.getElementById('webhookSession');
        if (!select) return;

        const connected = sessions.filter(s => s.status === 'connected');
        select.innerHTML = '<option value="">Select connected session...</option>' +
            connected.map(s => `<option value="${s.id}">${s.id}</option>`).join('');
    },

    loadConfig: async function () {
        try {
            const sessionSelect = document.getElementById('webhookSession');
            const sessionId = sessionSelect ? sessionSelect.value : '';

            if (!sessionId) {
                // Clear form if no session selected
                document.getElementById('webhookUrls').value = '';
                document.getElementById('webhookRetry').checked = true;
                document.getElementById('webhookDomains').value = '*';
                document.getElementById('webhookTimezone').value = 'Asia/Jakarta';
                document.querySelectorAll('.webhook-event').forEach(cb => cb.checked = false);
                const selectAllCheckbox = document.getElementById('selectAllEvents');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
                this.setSelectedChatTypes(this.defaultMessageUpsertChatTypes);
                this.syncMessagesUpsertChatTypeVisibility();
                return;
            }

            const res = await window.app.apiCall(`/api/webhook/${sessionId}`, 'GET');
            if (res && res.success) {
                // Populate callback URLs (use webhookUrl as single URL)
                const urlsTextarea = document.getElementById('webhookUrls');
                if (urlsTextarea) {
                    urlsTextarea.value = res.webhookUrl || '';
                }

                // Populate retry checkbox (always true for now)
                const retryCheckbox = document.getElementById('webhookRetry');
                if (retryCheckbox) {
                    retryCheckbox.checked = true;
                }

                // Populate domain whitelist (default to *)
                const domainsInput = document.getElementById('webhookDomains');
                if (domainsInput) {
                    domainsInput.value = '*';
                }

                // Populate event checkboxes
                if (res.events && Array.isArray(res.events)) {
                    const checkboxes = document.querySelectorAll('.webhook-event');
                    checkboxes.forEach(cb => {
                        cb.checked = res.events.includes(cb.value);
                    });

                    // Update Select All checkbox state
                    const selectAllCheckbox = document.getElementById('selectAllEvents');
                    if (selectAllCheckbox) {
                        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                        selectAllCheckbox.checked = allChecked;
                    }
                }

                this.setSelectedChatTypes(res.chatTypes);
                this.syncMessagesUpsertChatTypeVisibility();

                // Populate timezone (from config or default)
                const timezoneSelect = document.getElementById('webhookTimezone');
                if (timezoneSelect) {
                    const tz = res.timezone || 'Asia/Jakarta';
                    timezoneSelect.value = tz;
                    window.appTimezone = tz;
                    localStorage.setItem('app_timezone', tz);
                }
            }
        } catch (err) {
            console.error('Failed to load webhook config:', err);
        }
    },

    saveConfig: async function () {
        try {
            const sessionId = document.getElementById('webhookSession').value;
            const urlsText = document.getElementById('webhookUrls').value;
            const retry = document.getElementById('webhookRetry').checked;
            const domainsText = document.getElementById('webhookDomains').value;
            const timezone = document.getElementById('webhookTimezone').value;

            // Parse URLs (one per line)
            const callbackUrls = urlsText
                .split('\n')
                .map(url => url.trim())
                .filter(url => url.length > 0);

            // Parse domains (comma-separated)
            const domainWhitelist = domainsText
                .split(',')
                .map(d => d.trim())
                .filter(d => d.length > 0);

            // Get selected events
            const events = Array.from(document.querySelectorAll('.webhook-event:checked'))
                .map(cb => cb.value);
            const chatTypes = this.getSelectedChatTypes();

            // Validate
            if (!sessionId) {
                return Toast.warning('Please select a session');
            }

            const config = {
                webhookUrl: callbackUrls[0] || '',
                events,
                chatTypes,
                timezone
            };

            // Save timezone globally
            window.appTimezone = timezone;
            localStorage.setItem('app_timezone', timezone);

            const btn = document.getElementById('btnSaveWebhook');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;

            const res = await window.app.apiCall(`/api/webhook/${sessionId}`, 'POST', config);

            btn.innerHTML = originalHTML;
            btn.disabled = false;

            if (res && res.success) {
                Toast.success(callbackUrls.length > 0
                    ? 'Webhook configuration saved successfully!'
                    : 'Webhook disabled for this session!');
            } else {
                Toast.error('Failed to save webhook configuration');
            }
        } catch (err) {
            console.error('Failed to save webhook config:', err);
            Toast.error('Error: ' + err.message);

            const btn = document.getElementById('btnSaveWebhook');
            btn.innerHTML = '<i class="fas fa-save"></i> Save Webhook Configuration';
            btn.disabled = false;
        }
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WebhookManager.init());
} else {
    WebhookManager.init();
}

// Export for use in dashboard.js
if (typeof window !== 'undefined') {
    window.WebhookManager = WebhookManager;
}
