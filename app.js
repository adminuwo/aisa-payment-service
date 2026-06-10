import express from 'express';
import cors from 'cors';
import paymentRoutes from './routes/paymentRoutes.js';

const app = express();

// Enable CORS
app.use(cors({
    origin: '*', // Allow all origins for the microservice endpoint
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Mount routes
app.use('/api/payment', paymentRoutes);

// Error Handler
app.use((err, req, res, next) => {
    console.error(`[Payment Service] Error: ${err.stack || err.message}`);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

export default app;
