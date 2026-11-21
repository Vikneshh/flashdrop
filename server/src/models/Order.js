import mongoose from 'mongoose';

// One successful purchase. If we ever have more orders than initialStock,
// we have OVERSOLD — sold items that don't exist.
const orderSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    userId: { type: String, required: true },
    mode: { type: String, enum: ['naive', 'atomic', 'drop'], required: true }, // which buy route created it
  },
  { timestamps: true }
);

// Safety net in the database itself: one order per user per product.
// Even if a bug slipped past Redis, MongoDB would reject a second order.
orderSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const Order = mongoose.model('Order', orderSchema);
