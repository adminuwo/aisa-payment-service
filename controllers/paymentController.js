import Razorpay from 'razorpay';
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mongoose Models
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import CreditPackage from '../models/CreditPackage.js';
import CreditLog from '../models/CreditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Razorpay client
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

/**
 * Helper: Environment Detection
 */
const getIsTestMode = (req) => {
    return (
        !process.env.NODE_ENV || 
        ['development', 'localhost', 'staging', 'sandbox', 'uat', 'test'].includes(process.env.NODE_ENV.toLowerCase()) ||
        (process.env.GOOGLE_PAY_ENV || 'TEST').toUpperCase() !== 'PRODUCTION' ||
        req.hostname === 'localhost' ||
        req.hostname === '127.0.0.1' ||
        (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test'))
    );
};

/**
 * ─── 1. CREATE ORDER ──────────────────────────────────────────────────────────
 * Accepts: planId or packageId, billingCycle, provider, currency
 */
export const createOrder = async (req, res) => {
    try {
        const { planId, packageId, billingCycle = 'monthly', provider = 'razorpay', currency = 'INR' } = req.body;
        const userId = req.user.id || req.user._id;

        let amount = 0;
        let itemName = '';

        // Identify plan or package details
        if (planId) {
            const plan = await Plan.findById(planId);
            if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
            amount = Number(billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly) || 0;
            itemName = plan.planName;
        } else if (packageId) {
            const creditPackage = await CreditPackage.findById(packageId);
            if (!creditPackage) return res.status(404).json({ success: false, message: "Package not found" });
            amount = Number(creditPackage.price) || 0;
            itemName = creditPackage.packageName;
        } else {
            return res.status(400).json({ success: false, message: "planId or packageId is required" });
        }

        // Free plan handling
        if (amount === 0) {
            return res.status(200).json({ success: true, isFree: true });
        }

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: `Invalid plan price: ${amount}` });
        }

        let finalAmount = amount;
        let finalCurrency = currency.toUpperCase();

        // USD Conversion for Google Pay/Apple Pay
        if (finalCurrency === 'USD') {
            finalAmount = Math.round((amount / 83.5) * 100) / 100;
        }

        finalAmount = Math.round(finalAmount * 100) / 100;
        const amountInSmallestUnit = Math.round(finalAmount * 100);

        // Create Order in Razorpay
        const order = await razorpay.orders.create({
            amount: amountInSmallestUnit,
            currency: finalCurrency === 'USD' ? 'USD' : 'INR',
            receipt: `${provider.substring(0, 4)}_${Date.now()}`,
            notes: {
                gateway: provider,
                itemName,
                planId: planId || '',
                packageId: packageId || ''
            }
        });

        console.log(`[Payment] Order created for ${provider}: ${order.id} | Amount: ${finalCurrency} ${finalAmount}`);

        // Return provider-specific configs
        if (provider === 'google-pay') {
            const isTestMode = getIsTestMode(req);
            return res.status(200).json({
                success: true,
                orderId: order.id,
                amount: finalAmount,
                currency: finalCurrency,
                amountDisplay: finalCurrency === 'INR' ? `₹${amount}` : `$${finalAmount}`,
                itemName,
                googlePayConfig: {
                    apiVersion: 2,
                    apiVersionMinor: 0,
                    allowedPaymentMethods: [{
                        type: 'CARD',
                        parameters: {
                            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                            allowedCardNetworks: ['AMEX', 'DISCOVER', 'INTERAC', 'JCB', 'MASTERCARD', 'VISA']
                        },
                        tokenizationSpecification: {
                            type: 'PAYMENT_GATEWAY',
                            parameters: {
                                gateway: 'razorpay',
                                gatewayMerchantId: process.env.RAZORPAY_KEY_ID
                            }
                        }
                    }],
                    merchantInfo: isTestMode
                        ? { merchantName: 'AISA' }
                        : {
                            merchantId: process.env.GOOGLE_PAY_MERCHANT_ID,
                            merchantName: 'AISA'
                        },
                    transactionInfo: {
                        totalPriceStatus: 'FINAL',
                        totalPriceLabel: itemName,
                        totalPrice: finalAmount.toFixed(2),
                        currencyCode: finalCurrency === 'USD' ? 'USD' : 'INR',
                        countryCode: finalCurrency === 'USD' ? 'US' : 'IN'
                    }
                }
            });
        } else if (provider === 'apple-pay') {
            const amountString = finalAmount.toFixed(2);
            const safeLabel = `AISA - ${itemName.replace(/[^\x20-\x7E]/g, '')}`;

            return res.status(200).json({
                success: true,
                orderId: order.id,
                amount: finalAmount,
                currency: finalCurrency,
                amountDisplay: finalCurrency === 'INR' ? `₹${amount}` : `$${finalAmount}`,
                itemName,
                applePayRequest: {
                    countryCode: finalCurrency === 'USD' ? 'US' : 'IN',
                    currencyCode: finalCurrency === 'USD' ? 'USD' : 'INR',
                    supportedNetworks: ['visa', 'masterCard'],
                    merchantCapabilities: ['supports3DS'],
                    total: {
                        label: safeLabel,
                        amount: amountString,
                        type: 'final'
                    }
                }
            });
        }

        // Default: Razorpay Order Config
        return res.status(200).json({
            success: true,
            order,
            key: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy'
        });

    } catch (error) {
        console.error('[Payment Error] createOrder fail:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ─── 2. VERIFY PAYMENT & FULFILL ─────────────────────────────────────────────
 * Accepts: provider, razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, packageId, billingCycle
 */
export const verifyPayment = async (req, res) => {
    try {
        const {
            provider = 'razorpay',
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            planId,
            packageId,
            billingCycle = 'monthly'
        } = req.body;

        const userId = req.user.id || req.user._id;

        // Sandbox/Test Environment bypass
        const isTestMode = getIsTestMode(req);
        if (isTestMode) {
            console.log(`[Payment Service] Test mode active. Bypassing activation checks.`);
            return res.status(200).json({
                success: true,
                isTest: true,
                message: "Test Payment Successful – running in sandbox environment."
            });
        }

        // Strict Production verification
        if (!razorpay_payment_id || !razorpay_signature || !razorpay_order_id) {
            return res.status(400).json({ success: false, message: "Payment verification failed — missing parameters." });
        }

        // Verify HMAC signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.warn('[Payment] Signature mismatch! Fraud warning.');
            return res.status(400).json({ success: false, message: "Payment verification failed — invalid signature." });
        }

        // Call Razorpay API to confirm capture status
        try {
            const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
            if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
                return res.status(400).json({ success: false, message: `Payment failed (status: ${paymentDetails.status}).` });
            }
            if (paymentDetails.order_id !== razorpay_order_id) {
                return res.status(400).json({ success: false, message: "Payment verification failed — order mismatch." });
            }
        } catch (fetchError) {
            console.error('[Payment] Razorpay fetch failed:', fetchError);
            return res.status(500).json({ success: false, message: "Failed to verify payment status with payment gateway." });
        }

        console.log(`[Payment] Production signature successfully verified: ${razorpay_payment_id} | User: ${userId}`);

        // Fulfill Purchase
        if (planId) {
            return await _activatePlan({ userId, planId, billingCycle, paymentId: razorpay_payment_id, provider, res });
        } else if (packageId) {
            return await _addCredits({ userId, packageId, paymentId: razorpay_payment_id, provider, res });
        } else {
            return res.status(400).json({ success: false, message: "planId or packageId is required" });
        }

    } catch (error) {
        console.error('[Payment Error] verifyPayment fail:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ─── 3. VALIDATE APPLE MERCHANT SESSION ──────────────────────────────────────
 */
export const validateAppleMerchant = async (req, res) => {
    try {
        const { validationURL } = req.body;

        if (!validationURL) {
            return res.status(400).json({ success: false, message: "validationURL is required" });
        }

        if (!validationURL.includes('apple.com')) {
            return res.status(400).json({ success: false, message: "Invalid validation URL" });
        }

        const merchantId = process.env.APPLE_PAY_MERCHANT_ID;
        const domain = process.env.APPLE_PAY_DOMAIN;
        const displayName = process.env.APPLE_PAY_DISPLAY_NAME || 'AISA';

        // Load certificates from path, environment, or relative folder mounts
        let certContent = null;
        let keyContent  = null;
        let certSource  = 'none';
        const loadLogs  = [];

        const { createPrivateKey, createPublicKey, X509Certificate, createHash } = crypto;

        function checkMatch(cert, key) {
            try {
                const privKey = createPrivateKey(key);
                const pubFromKey = createPublicKey(privKey).export({ type: 'spki', format: 'der' });
                const pubFromCert = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
                const keyHash = createHash('md5').update(pubFromKey).digest('hex');
                const certHash = createHash('md5').update(pubFromCert).digest('hex');
                return { valid: keyHash === certHash, certHash, keyHash };
            } catch (err) {
                return { valid: false, error: err.message };
            }
        }

        // Waterfall Method 1: Environment Variables (Base64)
        if (process.env.APPLE_PAY_CERT_B64 && process.env.APPLE_PAY_KEY_B64) {
            try {
                const cert = Buffer.from(process.env.APPLE_PAY_CERT_B64, 'base64').toString('utf8');
                const key  = Buffer.from(process.env.APPLE_PAY_KEY_B64,  'base64').toString('utf8');
                const check = checkMatch(cert, key);
                if (check.valid) {
                    certContent = cert;
                    keyContent  = key;
                    certSource  = 'environment variables (base64)';
                } else {
                    loadLogs.push(`Method 1 (Env) failed: mismatch`);
                }
            } catch (e) {
                loadLogs.push(`Method 1 (Env) failed: ${e.message}`);
            }
        }

        // Waterfall Method 2: Main backend committed files (relative fallback)
        if (!certContent) {
            const rootCerPath = path.join(__dirname, '../../Aisa_backend_beta/merchant_id.cer');
            const rootKeyPath = path.join(__dirname, '../../Aisa_backend_beta/apple-pay-merchant-NEW.key');
            if (fs.existsSync(rootCerPath) && fs.existsSync(rootKeyPath)) {
                try {
                    const derBuffer = fs.readFileSync(rootCerPath);
                    const base64 = derBuffer.toString('base64');
                    const lines = base64.match(/.{1,64}/g).join('\n');
                    const cert = `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
                    const key  = fs.readFileSync(rootKeyPath, 'utf8');
                    
                    const check = checkMatch(cert, key);
                    if (check.valid) {
                        certContent = cert;
                        keyContent  = key;
                        certSource  = `backend root files (${rootCerPath})`;
                    }
                } catch (e) {
                    loadLogs.push(`Method 2 (Backend root) failed: ${e.message}`);
                }
            }
        }

        // Waterfall Method 3: Development local folder certs fallback
        if (!certContent) {
            const certPath = path.join(__dirname, '../Aisa_backend_beta/certs/apple-pay-merchant.pem');
            const keyPath  = path.join(__dirname, '../Aisa_backend_beta/certs/apple-pay-merchant.key');
            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                try {
                    const cert = fs.readFileSync(certPath, 'utf8');
                    const key  = fs.readFileSync(keyPath, 'utf8');
                    const check = checkMatch(cert, key);
                    if (check.valid) {
                        certContent = cert;
                        keyContent  = key;
                        certSource  = `local certs folder (${certPath})`;
                    }
                } catch (e) {
                    loadLogs.push(`Method 3 (Local certs) failed: ${e.message}`);
                }
            }
        }

        if (!certContent || !keyContent) {
            console.error('[ApplePay] Certificate load failures:\n' + loadLogs.join('\n'));
            return res.status(503).json({
                success: false,
                message: 'Apple Pay merchant validation certificate configuration mismatch.',
                setupRequired: true
            });
        }

        console.log(`[ApplePay] Validation Cert Loaded from: ${certSource}`);

        // Issue validation request to Apple
        const payload = JSON.stringify({
            merchantIdentifier: merchantId,
            domainName: domain,
            displayName: displayName
        });

        const urlObj = new URL(validationURL);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            cert: certContent,
            key: keyContent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const appleReq = https.request(options, (appleRes) => {
            let data = '';
            appleRes.on('data', chunk => data += chunk);
            appleRes.on('end', () => {
                try {
                    res.status(200).json({ success: true, merchantSession: JSON.parse(data) });
                } catch (e) {
                    res.status(500).json({ success: false, message: 'Invalid response from Apple server: ' + data });
                }
            });
        });

        appleReq.on('error', (err) => {
            console.error('[ApplePay] HTTP validation request failed:', err);
            res.status(500).json({ success: false, message: err.message });
        });

        appleReq.write(payload);
        appleReq.end();

    } catch (error) {
        console.error('[ApplePay] Validation Controller Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ─── 4. WEBHOOK HANDLER ──────────────────────────────────────────────────────
 */
export const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_webhook_secret';

        // Validate webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (expectedSignature !== signature) {
            console.warn('[Payment Webhook] Signature mismatch. Event rejected.');
            return res.status(400).send('Invalid Signature');
        }

        const event = req.body.event;
        const payload = req.body.payload;

        console.log(`[Payment Webhook] Received Event: ${event}`);

        if (event === 'payment.captured' || event === 'order.paid') {
            const paymentObj = payload.payment.entity;
            const orderId = paymentObj.order_id;
            const paymentId = paymentObj.id;

            // Fetch original order details from Razorpay to lookup custom metadata
            const orderDetails = await razorpay.orders.fetch(orderId);
            const notes = orderDetails.notes || {};

            if (notes.planId || notes.packageId) {
                // Determine user
                const user = await User.findOne({ email: paymentObj.email });
                if (user) {
                    const userId = user._id;
                    const provider = notes.gateway || 'webhook';

                    // Verify if payment has not already been fulfilled
                    const isFulfilled = await Subscription.findOne({ paymentId });
                    if (!isFulfilled) {
                        if (notes.planId) {
                            await _activatePlanInternal({ userId, planId: notes.planId, billingCycle: 'monthly', paymentId, provider });
                        } else if (notes.packageId) {
                            await _addCreditsInternal({ userId, packageId: notes.packageId, paymentId, provider });
                        }
                        console.log(`[Payment Webhook] Fulfilled order: ${orderId} successfully for user: ${user.email}`);
                    }
                }
            }
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('[Payment Webhook] Fail:', error);
        res.status(500).send(error.message);
    }
};

// ─── 5. INTERNAL FULFILLMENT UTILITIES ──────────────────────────────────────────

async function _activatePlan({ userId, planId, billingCycle, paymentId, provider, res }) {
    try {
        const subscription = await _activatePlanInternal({ userId, planId, billingCycle, paymentId, provider });
        const user = await User.findById(userId);

        return res.status(200).json({
            success: true,
            subscription,
            credits: user.credits,
            message: `Plan activated successfully via ${provider}`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
}

async function _activatePlanInternal({ userId, planId, billingCycle, paymentId, provider }) {
    const plan = await Plan.findById(planId);
    if (!plan) throw new Error("Plan not found");

    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    if (plan.planName === 'Founder Plan') {
        const founderCount = await User.countDocuments({ founderStatus: true });
        if (founderCount >= 500 && !user.founderStatus) {
            throw new Error("Founder plan limit reached.");
        }
        user.founderStatus = true;
    }

    // Deactivate previous active plans
    await Subscription.updateMany({ userId, subscriptionStatus: 'active' }, { subscriptionStatus: 'cancelled' });

    // Calculate credits
    let finalCredits = billingCycle === 'yearly'
        ? (plan.creditsYearly || plan.credits * 12)
        : plan.credits;

    const isFirstPurchase = await Subscription.countDocuments({ userId }) === 0;
    if (isFirstPurchase && !plan.planName.toLowerCase().includes('founder')) {
        finalCredits += finalCredits * 0.5; // first purchase bonus
    }

    user.credits = Math.floor(finalCredits);

    // Calculate renewal date
    let renewalDate = new Date();
    if (plan.planName.toLowerCase().includes('founder')) {
        renewalDate.setFullYear(renewalDate.getFullYear() + 100);
    } else if (billingCycle === 'yearly') {
        renewalDate.setMonth(renewalDate.getMonth() + (plan.validityYearly || 12));
    } else {
        renewalDate.setMonth(renewalDate.getMonth() + (plan.validityMonthly || 1));
    }

    const newSubscription = await Subscription.create({
        userId,
        planId: plan._id,
        creditsRemaining: user.credits,
        billingCycle,
        subscriptionStart: new Date(),
        renewalDate,
        subscriptionStatus: 'active',
        paymentId: paymentId || 'mock_pay_id',
        paymentMethod: provider
    });

    await user.save();

    await CreditLog.create({
        userId,
        action: 'plan_credit',
        description: `Plan Credit — ${plan.planName} (${provider})`,
        credits: finalCredits,
        balanceAfter: user.credits
    });

    return newSubscription;
}

async function _addCredits({ userId, packageId, paymentId, provider, res }) {
    try {
        const credits = await _addCreditsInternal({ userId, packageId, paymentId, provider });
        const user = await User.findById(userId);

        return res.status(200).json({
            success: true,
            credits: user.credits,
            message: `Credits top-up completed. Added ${credits} credits.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
}

async function _addCreditsInternal({ userId, packageId, paymentId, provider }) {
    const creditPackage = await CreditPackage.findById(packageId);
    if (!creditPackage) throw new Error("Package not found");

    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    user.credits += creditPackage.credits;
    await user.save();

    await CreditLog.create({
        userId,
        action: 'purchase',
        description: `Credit Top-up — ${creditPackage.packageName} (${provider})`,
        credits: creditPackage.credits,
        balanceAfter: user.credits
    });

    return creditPackage.credits;
}
