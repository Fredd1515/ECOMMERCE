const settings = {
    uiPort: Number(process.env.PORT || 1880),
    flowFile: 'flows.json',
    userDir: '/data',
    logging: {
        console: {
            level: process.env.LOG_LEVEL || 'info',
            metrics: false,
            audit: false
        }
    },
    httpNodeMiddleware: function (req, res, next) {
        const apiKey = process.env.API_KEY;

        // Authenticate both the local HTTPS bridge and the phone panel.
        if (apiKey && req.path && req.path.startsWith('/api/')) {
            if (req.get('x-api-key') !== apiKey) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
        }

        next();
    }
};

if (process.env.NODE_RED_CREDENTIAL_SECRET) {
    settings.credentialSecret = process.env.NODE_RED_CREDENTIAL_SECRET;
}

// Do not expose the Node-RED editor without an explicit password hash.
// Generate one with: node-red admin hash-pw
if (process.env.NODE_RED_ADMIN_PASSWORD_HASH) {
    settings.adminAuth = {
        type: 'credentials',
        users: [{
            username: process.env.NODE_RED_ADMIN_USER || 'admin',
            password: process.env.NODE_RED_ADMIN_PASSWORD_HASH,
            permissions: '*'
        }]
    };
    settings.httpAdminRoot = '/red';
} else {
    settings.httpAdminRoot = false;
}

module.exports = settings;

