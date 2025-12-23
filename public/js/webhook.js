// Webhook Configuration Manager

const WebhookManager = {
    init: function () {
        this.bindEvents();
        this.loadConfig();
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
                document.querySelectorAll('.webhook-event').forEach(cb => cb.checked = false);
                return;
            }

            const res = await window.app.apiCall(`/api/webhook/config?sessionId=${sessionId}`, 'GET');
            if (res && res.success && res.data) {
                const config = res.data;

                // Populate callback URLs
                const urlsTextarea = document.getElementById('webhookUrls');
                if (urlsTextarea && config.callbackUrls) {
                    urlsTextarea.value = config.callbackUrls.join('\n');
                }

                // Populate retry checkbox
                const retryCheckbox = document.getElementById('webhookRetry');
                if (retryCheckbox) {
                    retryCheckbox.checked = config.retry !== false;
                }

                // Populate domain whitelist
                const domainsInput = document.getElementById('webhookDomains');
                if (domainsInput && config.domainWhitelist) {
                    domainsInput.value = config.domainWhitelist.join(', ');
                }

                // Populate event checkboxes
                if (config.events && Array.isArray(config.events)) {
                    const checkboxes = document.querySelectorAll('.webhook-event');
                    checkboxes.forEach(cb => {
                        cb.checked = config.events.includes(cb.value);
                    });

                    // Update Select All checkbox state
                    const selectAllCheckbox = document.getElementById('selectAllEvents');
                    if (selectAllCheckbox) {
                        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                        selectAllCheckbox.checked = allChecked;
                    }
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

            // Validate
            if (!sessionId) {
                return Toast.warning('Please select a session');
            }

            if (callbackUrls.length === 0) {
                return Toast.warning('Please enter at least one callback URL');
            }

            if (events.length === 0) {
                return Toast.warning('Please select at least one event');
            }

            const config = {
                sessionId,
                callbackUrls,
                retry,
                domainWhitelist,
                events
            };

            const btn = document.getElementById('btnSaveWebhook');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;

            const res = await window.app.apiCall('/api/webhook/config', 'POST', config);

            btn.innerHTML = originalHTML;
            btn.disabled = false;

            if (res && res.success) {
                Toast.success('Webhook configuration saved successfully!');
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
