import mongoose from 'mongoose';

const creditPackageSchema = new mongoose.Schema({
    packageId: { type: String, required: true, unique: true },
    packageName: { type: String, required: true },
    credits: { type: Number, required: true },
    price: { type: Number, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('CreditPackage', creditPackageSchema);
