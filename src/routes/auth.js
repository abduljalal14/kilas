const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        res.json({
            success: true,
            token: process.env.ADMIN_PASSWORD, // Using password as simple token/API key
            user: { username }
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out' });
});

router.get('/check', (req, res) => {
    // blocked by middleware if invalid
    res.json({ authenticated: true });
});

module.exports = router;
