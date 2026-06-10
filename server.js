import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app.js';
import dns from 'dns';

// Fix for querySrv ECONNREFUSED on some networks/Windows
dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

const PORT = process.env.PORT || 8085;
const MONGO_URI = process.env.MONGODB_ATLAS_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aisa';

// ── Database Connection ──────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 60000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 60000,
    family: 4
})
    .then(() => {
        console.log('[Payment Service] Successfully connected to MongoDB.');
        // Start Listening
        app.listen(PORT, () => {
            console.log(`[Payment Service] Listening on port ${PORT}...`);
        });
    })
    .catch((err) => {
        console.error('[Payment Service] Database connection failed:', err.message);
        process.exit(1);
    });

mongoose.connection.on('error', (err) => {
    console.error(`[Payment Service] MongoDB runtime error: ${err.message}`);
});
