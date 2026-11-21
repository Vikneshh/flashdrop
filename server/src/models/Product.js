import mongoose from 'mongoose';

// A product being "dropped" — e.g. 100 pairs of limited sneakers.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    initialStock: { type: Number, required: true }, // how many we started with
    stock: { type: Number, required: true, min: 0 }, // how many are left (used by step-1 routes)
    holdSeconds: { type: Number, default: 120 },     // how long a buyer can hold an item before paying
  },
  { timestamps: true }
);

export const Product = mongoose.model('Product', productSchema);
