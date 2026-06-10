import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
    planId: { type: String, required: true, unique: true },
    planName: { type: String, required: true },
    priceMonthly: { type: Number, required: true },
    priceYearly: { type: Number, required: true },
    priceYearlyPerMonth: { type: Number },
    credits: { type: Number, required: true },
    creditsYearly: { type: Number },
    validityMonthly: { type: Number, default: 1 }, // in months
    validityYearly: { type: Number, default: 12 }, // in months
    features: [{ type: String }],
    badge: { type: String, default: "" },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Plan', planSchema);
