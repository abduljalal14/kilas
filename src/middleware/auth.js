const apiKeyAuth = (req, res, next) => {
    const configuredApiKey = process.env.API_KEY;

    // If API_KEY is not set or empty, skip authentication
    if (!configuredApiKey || configuredApiKey.trim() === '') {
        return next();
    }

    // Otherwise, require API key
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== configuredApiKey) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid or missing API key'
        });
    }

    next();
};

module.exports = apiKeyAuth;
