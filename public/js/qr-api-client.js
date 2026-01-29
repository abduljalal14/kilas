/**
 * QR Code API Client
 * Helper class untuk mendapatkan QR code via API dengan berbagai strategi
 */

class QRCodeClient {
    constructor(apiBaseUrl = 'http://localhost:3000', apiKey = '') {
        this.apiBaseUrl = apiBaseUrl;
        this.apiKey = apiKey;
        this.headers = {
            'Content-Type': 'application/json',
            ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
        };
    }

    /**
     * Set API Key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.headers['Authorization'] = `Bearer ${apiKey}`;
    }

    /**
     * Make API request
     */
    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: this.headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${data.message || 'Unknown error'}`);
        }

        return data;
    }

    /**
     * Create new session
     */
    async createSession(sessionId) {
        return this.request('POST', '/api/sessions/create', { sessionId });
    }

    /**
     * Get QR code (immediate, no retry)
     */
    async getQRCode(sessionId) {
        const data = await this.request('GET', `/api/sessions/${sessionId}/qr`);
        return data.data.qr;
    }

    /**
     * Get QR code with polling (recommended)
     *
     * @param {string} sessionId - Session identifier
     * @param {object} options - Configuration
     * @param {number} options.maxAttempts - Max retry attempts (default: 30)
     * @param {number} options.interval - Wait interval between retries in ms (default: 1000)
     * @param {function} options.onAttempt - Callback for each attempt
     * @returns {Promise<string>} Data URL of QR code image
     */
    async getQRCodeWithPolling(sessionId, options = {}) {
        const {
            maxAttempts = 30,
            interval = 1000,
            onAttempt = null
        } = options;

        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const qrImage = await this.getQRCode(sessionId);
                if (onAttempt) {
                    onAttempt({ attempt: attempt + 1, success: true, message: 'QR code received' });
                }
                return qrImage;
            } catch (error) {
                lastError = error;
                if (onAttempt) {
                    onAttempt({
                        attempt: attempt + 1,
                        success: false,
                        message: `Waiting for QR code... (${attempt + 1}/${maxAttempts})`,
                        error: error.message
                    });
                }

                // Wait before retry
                if (attempt < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, interval));
                }
            }
        }

        throw new Error(`QR code not available after ${maxAttempts} attempts. ${lastError?.message}`);
    }

    /**
     * Create session and get QR code (full flow)
     *
     * @param {string} sessionId - Session identifier
     * @param {object} options - Configuration
     * @returns {Promise<string>} Data URL of QR code image
     */
    async setupSessionWithQR(sessionId, options = {}) {
        // Create session
        await this.createSession(sessionId);

        // Wait a bit for server to initialize
        await new Promise(r => setTimeout(r, 1500));

        // Get QR code with polling
        return this.getQRCodeWithPolling(sessionId, options);
    }

    /**
     * Get session status
     */
    async getSessionStatus(sessionId) {
        const data = await this.request('GET', `/api/sessions/${sessionId}`);
        return data.data;
    }

    /**
     * List all sessions
     */
    async listSessions() {
        const data = await this.request('GET', '/api/sessions');
        return data.data;
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        return this.request('DELETE', `/api/sessions/${sessionId}`);
    }
}

/**
 * Example Usage
 */

// Initialize client
const client = new QRCodeClient('http://localhost:3000', 'YOUR_API_KEY');

/**
 * Example 1: Simple setup with QR
 */
async function example1_SimpleSetup() {
    console.log('\n=== Example 1: Simple Setup ===');

    try {
        const qrImage = await client.setupSessionWithQR('MySession', {
            maxAttempts: 30,
            interval: 1000,
            onAttempt: (info) => {
                if (info.success) {
                    console.log(`✓ ${info.message}`);
                } else {
                    console.log(`  ${info.message}`);
                }
            }
        });

        console.log('✓ QR Code ready! Data length:', qrImage.length);
        // Display in HTML
        document.getElementById('qrImage').src = qrImage;

    } catch (error) {
        console.error('✗ Failed:', error.message);
    }
}

/**
 * Example 2: Get QR from existing session
 */
async function example2_GetExistingQR() {
    console.log('\n=== Example 2: Get Existing QR ===');

    try {
        // First check session status
        const status = await client.getSessionStatus('MySession');
        console.log(`Session status: ${status.status}`);

        // If scanning, get QR
        if (status.status === 'scan_qr' || status.status === 'connecting') {
            const qrImage = await client.getQRCode('MySession');
            console.log('✓ QR Code retrieved');
            document.getElementById('qrImage').src = qrImage;
        } else {
            console.log('Session not in scan mode');
        }

    } catch (error) {
        console.error('✗ Failed:', error.message);
    }
}

/**
 * Example 3: Create multiple sessions and collect QR codes
 */
async function example3_MultipleSessionsWithQR() {
    console.log('\n=== Example 3: Multiple Sessions ===');

    const sessionIds = ['Sales', 'Support', 'Marketing'];
    const results = {};

    for (const sessionId of sessionIds) {
        try {
            console.log(`Creating ${sessionId}...`);
            const qrImage = await client.setupSessionWithQR(sessionId, {
                maxAttempts: 20,
                interval: 800
            });
            results[sessionId] = {
                success: true,
                qr: qrImage
            };
            console.log(`✓ ${sessionId} - QR ready`);
        } catch (error) {
            results[sessionId] = {
                success: false,
                error: error.message
            };
            console.error(`✗ ${sessionId} - ${error.message}`);
        }
    }

    console.log('\nResults:', results);
    return results;
}

/**
 * Example 4: List all sessions and get status
 */
async function example4_ListAllSessions() {
    console.log('\n=== Example 4: List Sessions ===');

    try {
        const sessions = await client.listSessions();
        console.log(`Found ${sessions.length} sessions:\n`);

        for (const session of sessions) {
            console.log(`  📱 ${session.sessionId} - ${session.status}`);

            if (session.status === 'scan_qr' || session.status === 'connecting') {
                try {
                    const qrImage = await client.getQRCode(session.sessionId);
                    console.log(`     ✓ QR available (${qrImage.length} chars)`);
                } catch {
                    console.log('     ✗ QR not available');
                }
            }
        }

    } catch (error) {
        console.error('✗ Failed:', error.message);
    }
}

/**
 * Example 5: Custom polling with progress
 */
async function example5_CustomPolling() {
    console.log('\n=== Example 5: Custom Polling ===');

    const sessionId = 'CustomSession';
    let qrImage = null;
    let attempt = 0;
    const maxAttempts = 15;

    // Create session first
    await client.createSession(sessionId);
    console.log(`Created session: ${sessionId}`);
    console.log('Waiting for WhatsApp QR code...\n');

    // Custom polling loop
    while (!qrImage && attempt < maxAttempts) {
        try {
            qrImage = await client.getQRCode(sessionId);
            console.log(`✓ QR received on attempt ${attempt + 1}`);
        } catch (error) {
            attempt++;
            const percentage = Math.round((attempt / maxAttempts) * 100);
            console.log(`[${percentage}%] ${Array(10).fill('█').join('')}  Attempt ${attempt}/${maxAttempts}`);

            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    if (qrImage) {
        console.log('\n✓ Success!');
        return qrImage;
    } else {
        console.log('\n✗ QR code not available');
        throw new Error('Timeout waiting for QR code');
    }
}

/**
 * Example 6: Error handling
 */
async function example6_ErrorHandling() {
    console.log('\n=== Example 6: Error Handling ===');

    try {
        // Wrong session ID
        await client.getQRCode('NonExistentSession');
    } catch (error) {
        console.log('✓ Caught error for non-existent session:');
        console.log(`  ${error.message}`);
    }

    try {
        // Invalid API key (if enabled)
        const wrongClient = new QRCodeClient('http://localhost:3000', 'wrong_key');
        await wrongClient.getQRCode('MySession');
    } catch (error) {
        console.log('\n✓ Caught error for invalid API key:');
        console.log(`  ${error.message}`);
    }
}

// Export untuk module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRCodeClient;
}

// Run examples jika dijalankan di browser console
window.QRCodeClient = QRCodeClient;
window.qrExamples = {
    example1_SimpleSetup,
    example2_GetExistingQR,
    example3_MultipleSessionsWithQR,
    example4_ListAllSessions,
    example5_CustomPolling,
    example6_ErrorHandling
};

console.log('QRCodeClient available as window.QRCodeClient');
console.log('Examples available as window.qrExamples');
console.log('\nUsage: qrExamples.example1_SimpleSetup()');
