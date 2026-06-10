import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/authorization.js';

const router = express.Router();

// Order creation route (Razorpay, Google Pay, Apple Pay orders consolidated)
router.post('/create-order', verifyToken, paymentController.createOrder);

// Payment verification route
router.post('/verify', verifyToken, paymentController.verifyPayment);

// Apple Pay merchant validation session
router.post('/apple-pay/validate-merchant', verifyToken, paymentController.validateAppleMerchant);

// Webhook for gateway lifecycle processing
router.post('/webhook', paymentController.handleWebhook);

export default router;
