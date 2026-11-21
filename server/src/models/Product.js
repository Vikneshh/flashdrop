import mongoose from 'mongoose';

// A product being "dropped" — e.g. 100 pairs of limited sneakers.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    initialStock: { type: Number, required: true }, // how many we started with
    stock: { type: Number, required: true, min: 0 }, // how many are left
  },
  { timestamps: true }
);

export const Product = mongoose.model('Product', productSchema);
