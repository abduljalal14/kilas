/**
 * Test File: QR Code API Endpoints
 * Demonstrasi cara menggunakan endpoint baru untuk retrieve QR code via API
 */

const API_KEY = 'test123'; // Ganti dengan API key yang valid
const BASE_URL = 'http://localhost:3000';
const SESSION_ID = 'TestSession';

/**
 * Test 1: Create Session + Get QR via API with Polling
 */
async function testCreateAndPollQR() {
    console.log('\n=== TEST 1: Create Session + Poll for QR ===\n');

    try {
        // Step 1: Create session
        console.log('Creating session...');
        const createRes = await fetch(`${BASE_URL}/api/sessions/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({ sessionId: SESSION_ID })
        });

        const createData = await createRes.json();
        console.log('✓ Session created:', createData);

        // Step 2: Poll untuk QR code dengan max 20 attempts (20 detik)
        console.log('\nPolling for QR code...');
        let qrImage = null;
        let attempts = 0;
        const maxAttempts = 20;

        while (!qrImage && attempts < maxAttempts) {
            const qrRes = await fetch(
                `${BASE_URL}/api/sessions/${SESSION_ID}/qr`,
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`
                    }
                }
            );

            if (qrRes.ok) {
                const qrData = await qrRes.json();
                qrImage = qrData.data.qr;
                console.log(`✓ QR Code received on attempt ${attempts + 1}`);
                console.log(`  QR Data Length: ${qrImage.length} chars`);
                console.log(`  QR Preview: ${qrImage.substring(0, 80)}...`);
                return qrImage;
            } else {
                attempts++;
                console.log(`  Waiting... (${attempts}/${maxAttempts})`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!qrImage) {
            console.log('✗ QR Code not available after 20 seconds');
            console.log('  Possible causes:');
            console.log('  - Server belum selesai initialize');
            console.log('  - WhatsApp connection timeout');
            console.log('  - API key tidak valid');
        }

    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

/**
 * Test 2: Get QR Code Immediately (untuk session yang sudah ada)
 */
async function testGetExistingQR() {
    console.log('\n=== TEST 2: Get QR from Existing Session ===\n');

    try {
        const qrRes = await fetch(
            `${BASE_URL}/api/sessions/${SESSION_ID}/qr`,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            }
        );

        if (qrRes.ok) {
            const qrData = await qrRes.json();
            console.log('✓ QR Code retrieved');
            console.log(`  Session ID: ${qrData.data.sessionId}`);
            console.log(`  QR Data (${qrData.data.qr.length} chars)`);
        } else {
            const errorData = await qrRes.json();
            console.log('✗ QR Code not available');
            console.log(`  Status: ${qrRes.status}`);
            console.log(`  Message: ${errorData.message}`);
        }

    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

/**
 * Test 3: Get Session Status + QR Code
 */
async function testGetSessionStatus() {
    console.log('\n=== TEST 3: Get Session Status ===\n');

    try {
        const sessionRes = await fetch(
            `${BASE_URL}/api/sessions/${SESSION_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            }
        );

        if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            console.log('✓ Session info retrieved');
            console.log(`  ID: ${sessionData.data.id}`);
            console.log(`  Status: ${sessionData.data.status}`);
            console.log(`  User: ${JSON.stringify(sessionData.data.user)}`);

            // If status is scan_qr or connecting, try to get QR
            if (sessionData.data.status === 'scan_qr' || sessionData.data.status === 'connecting') {
                const qrRes = await fetch(
                    `${BASE_URL}/api/sessions/${SESSION_ID}/qr`,
                    {
                        headers: {
                            'Authorization': `Bearer ${API_KEY}`
                        }
                    }
                );

                if (qrRes.ok) {
                    const qrData = await qrRes.json();
                    console.log('\n✓ QR Code available for this session');
                    console.log(`  QR Data (${qrData.data.qr.length} chars)`);
                }
            }
        } else {
            console.log('✗ Session not found');
        }

    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

/**
 * Test 4: List All Sessions
 */
async function testListSessions() {
    console.log('\n=== TEST 4: List All Sessions ===\n');

    try {
        const sessionsRes = await fetch(
            `${BASE_URL}/api/sessions`,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            }
        );

        const sessionsData = await sessionsRes.json();
        console.log(`✓ Found ${sessionsData.data.length} sessions`);

        sessionsData.data.forEach((session, idx) => {
            console.log(`  ${idx + 1}. ${session.sessionId} - ${session.status}`);
        });

    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

/**
 * Run semua tests
 */
async function runAllTests() {
    console.log('╔═════════════════════════════════════════════════════════╗');
    console.log('║       QR Code API Endpoint Tests                        ║');
    console.log('╚═════════════════════════════════════════════════════════╝');
    console.log(`\nAPI Base URL: ${BASE_URL}`);
    console.log(`API Key: ${API_KEY}`);
    console.log(`Session ID: ${SESSION_ID}`);

    // Run tests
    await testListSessions();
    await testCreateAndPollQR();
    await testGetExistingQR();
    await testGetSessionStatus();

    console.log('\n╔═════════════════════════════════════════════════════════╗');
    console.log('║       Tests Complete                                    ║');
    console.log('╚═════════════════════════════════════════════════════════╝\n');
}

// Export untuk digunakan di browser console juga
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testCreateAndPollQR,
        testGetExistingQR,
        testGetSessionStatus,
        testListSessions,
        runAllTests
    };
}

// Run tests jika dijalankan langsung
if (typeof window === 'undefined') {
    runAllTests().catch(console.error);
}
