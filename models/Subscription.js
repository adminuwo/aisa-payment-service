import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    creditsRemaining: { type: Number, required: true },
    subscriptionStart: { type: Date, default: Date.now },
    renewalDate: { type: Date },
    subscriptionStatus: { type: String, enum: ['active', 'cancelled', 'expired', 'past_due'], default: 'active' },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    paymentId: { type: String },
    paymentMethod: { type: String }
}, { timestamps: true });

export default mongoose.model('Subscription', subscriptionSchema);
