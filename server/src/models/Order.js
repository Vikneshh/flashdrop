import mongoose from 'mongoose';

// One successful purchase. If we ever have more orders than initialStock,
// we have OVERSOLD — sold items that don't exist.
const orderSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    userId: { type: String, required: true },
    mode: { type: String, enum: ['naive', 'atomic'], required: true }, // which buy route created it
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', orderSchema);
