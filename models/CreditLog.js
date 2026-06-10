import mongoose from 'mongoose';

const creditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, default: '' },
    credits: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    category: { type: String, default: 'General' },
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

export default mongoose.model('CreditLog', creditLogSchema);
